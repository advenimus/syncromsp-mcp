import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { StatelessClientsStore } from "../../../src/auth/client-store.js";
import { createSealer } from "../../../src/auth/token-crypto.js";

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);

function registration(
  overrides: Partial<OAuthClientInformationFull> = {}
): OAuthClientInformationFull {
  return {
    client_id: "sdk-generated-uuid",
    client_id_issued_at: 1_700_000_000,
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    ...overrides,
  } as OAuthClientInformationFull;
}

describe("StatelessClientsStore", () => {
  it("returns a sealed client_id and resolves it back to the registered metadata", async () => {
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    const registered = await store.registerClient(registration());

    expect(registered.client_id).not.toBe("sdk-generated-uuid");
    expect(registered.client_id.startsWith("v1.")).toBe(true);

    const fetched = await store.getClient(registered.client_id);
    expect(fetched).toBeDefined();
    expect(fetched!.client_id).toBe(registered.client_id);
    expect(fetched!.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    expect(fetched!.client_name).toBe("Claude");
  });

  it("survives a new store instance with the same key (server restart)", async () => {
    const first = new StatelessClientsStore(createSealer("client", [KEY_A]));
    const registered = await first.registerClient(registration());
    const second = new StatelessClientsStore(createSealer("client", [KEY_A]));
    expect((await second.getClient(registered.client_id))?.redirect_uris).toEqual(
      registered.redirect_uris
    );
  });

  it("keeps a confidential client's secret inside the sealed id", async () => {
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    const registered = await store.registerClient(
      registration({
        token_endpoint_auth_method: "client_secret_post",
        client_secret: "s3cr3t-value",
        client_secret_expires_at: 1_800_000_000,
      })
    );
    expect(registered.client_id).not.toContain("s3cr3t");
    const fetched = await store.getClient(registered.client_id);
    expect(fetched!.client_secret).toBe("s3cr3t-value");
    expect(fetched!.client_secret_expires_at).toBe(1_800_000_000);
  });

  it("returns undefined for an unknown, forged, or tampered client_id", async () => {
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    const registered = await store.registerClient(registration());
    const raw = Buffer.from(registered.client_id.slice(3), "base64url");
    raw[20] = raw[20]! ^ 0x01;
    const tampered = `v1.${raw.toString("base64url")}`;

    await expect(store.getClient("random-uuid")).resolves.toBeUndefined();
    await expect(store.getClient("")).resolves.toBeUndefined();
    await expect(store.getClient(tampered)).resolves.toBeUndefined();
    await expect(
      new StatelessClientsStore(createSealer("client", [KEY_B])).getClient(registered.client_id)
    ).resolves.toBeUndefined();
  });

  it("rejects a client_id that is really a sealed token from another domain", async () => {
    const tokenSealer = createSealer("token", [KEY_A]);
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    const forged = tokenSealer.seal("client", { redirect_uris: ["https://evil.example/cb"] });
    await expect(store.getClient(forged)).resolves.toBeUndefined();
  });

  it("drops fields the server does not need", async () => {
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    const registered = await store.registerClient(
      registration({
        software_statement: "x".repeat(200),
        jwks: { keys: [] },
        contacts: ["a@example.com"],
      } as Partial<OAuthClientInformationFull>)
    );
    const fetched = (await store.getClient(registered.client_id)) as Record<string, unknown>;
    expect(fetched.software_statement).toBeUndefined();
    expect(fetched.jwks).toBeUndefined();
    expect(fetched.contacts).toBeUndefined();
  });

  it("rejects oversized metadata with InvalidClientMetadataError", async () => {
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    const manyUris = Array.from({ length: 200 }, (_, i) => `https://example.com/cb/${i}`);
    await expect(
      store.registerClient(registration({ redirect_uris: manyUris }))
    ).rejects.toBeInstanceOf(InvalidClientMetadataError);
    await expect(
      store.registerClient(registration({ client_name: "n".repeat(5000) }))
    ).rejects.toBeInstanceOf(InvalidClientMetadataError);
  });

  it("rejects registration with no redirect_uris", async () => {
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    await expect(
      store.registerClient(registration({ redirect_uris: [] }))
    ).rejects.toBeInstanceOf(InvalidClientMetadataError);
  });

  it("returns undefined for an absurdly long client_id without trying to decrypt", async () => {
    const store = new StatelessClientsStore(createSealer("client", [KEY_A]));
    await expect(store.getClient(`v1.${"A".repeat(100_000)}`)).resolves.toBeUndefined();
  });
});
