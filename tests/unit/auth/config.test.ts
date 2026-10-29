import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { AuthConfigError, loadHttpAuthConfig } from "../../../src/auth/config.js";

const KEY = randomBytes(32).toString("hex");
const OLD_KEY = randomBytes(32).toString("hex");

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { MCP_TOKEN_ENCRYPTION_KEY: KEY, MCP_ALLOW_ANY_SUBDOMAIN: "true", ...overrides };
}

describe("loadHttpAuthConfig — encryption key", () => {
  it("fails hard when MCP_TOKEN_ENCRYPTION_KEY is missing", () => {
    expect(() => loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY: undefined }))).toThrow(
      AuthConfigError
    );
    expect(() => loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY: undefined }))).toThrow(
      /MCP_TOKEN_ENCRYPTION_KEY[\s\S]*openssl rand -hex 32/
    );
  });

  it("fails hard on a weak or malformed key", () => {
    expect(() => loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY: "change-me" }))).toThrow(
      /openssl rand -hex 32/
    );
    expect(() =>
      loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY: "0".repeat(64) }))
    ).toThrow(/entropy/i);
  });

  it("parses a valid key", () => {
    const config = loadHttpAuthConfig(env({}));
    expect(config.encryptionKey.equals(Buffer.from(KEY, "hex"))).toBe(true);
    expect(config.previousEncryptionKeys).toEqual([]);
  });

  it("parses MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS for decrypt-only rotation", () => {
    const config = loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS: OLD_KEY }));
    expect(config.previousEncryptionKeys).toHaveLength(1);
    expect(config.previousEncryptionKeys[0]!.equals(Buffer.from(OLD_KEY, "hex"))).toBe(true);
  });

  it("rejects a malformed previous key", () => {
    expect(() =>
      loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS: "short" }))
    ).toThrow(/MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS/);
  });

  it("rejects a previous key equal to the current key", () => {
    expect(() =>
      loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS: KEY }))
    ).toThrow(/same/i);
  });

  it("never echoes the key value in the error", () => {
    const bad = "zz" + randomBytes(31).toString("hex");
    try {
      loadHttpAuthConfig(env({ MCP_TOKEN_ENCRYPTION_KEY: bad }));
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(bad);
    }
  });
});

describe("loadHttpAuthConfig — subdomain policy", () => {
  it("locks to SYNCRO_SUBDOMAIN when set", () => {
    const config = loadHttpAuthConfig(
      env({ MCP_ALLOW_ANY_SUBDOMAIN: undefined, SYNCRO_SUBDOMAIN: "acme" })
    );
    expect(config.subdomainPolicy).toEqual({ kind: "locked", subdomain: "acme" });
  });

  it("rejects an invalid SYNCRO_SUBDOMAIN", () => {
    expect(() =>
      loadHttpAuthConfig(env({ MCP_ALLOW_ANY_SUBDOMAIN: undefined, SYNCRO_SUBDOMAIN: "a.b" }))
    ).toThrow(AuthConfigError);
  });

  it("builds an allowlist from MCP_ALLOWED_SUBDOMAINS", () => {
    const config = loadHttpAuthConfig(
      env({ MCP_ALLOW_ANY_SUBDOMAIN: undefined, MCP_ALLOWED_SUBDOMAINS: " Acme, beta ,," })
    );
    expect(config.subdomainPolicy.kind).toBe("allowlist");
    if (config.subdomainPolicy.kind === "allowlist") {
      expect([...config.subdomainPolicy.subdomains].sort()).toEqual(["acme", "beta"]);
    }
  });

  it("rejects an allowlist entry that is not a valid subdomain", () => {
    expect(() =>
      loadHttpAuthConfig(
        env({ MCP_ALLOW_ANY_SUBDOMAIN: undefined, MCP_ALLOWED_SUBDOMAINS: "acme,evil.com/" })
      )
    ).toThrow(/MCP_ALLOWED_SUBDOMAINS/);
  });

  it("rejects an allowlist with no entries", () => {
    expect(() =>
      loadHttpAuthConfig(env({ MCP_ALLOW_ANY_SUBDOMAIN: undefined, MCP_ALLOWED_SUBDOMAINS: " , " }))
    ).toThrow(/MCP_ALLOWED_SUBDOMAINS/);
  });

  it("allows any subdomain only with an explicit MCP_ALLOW_ANY_SUBDOMAIN=true", () => {
    expect(loadHttpAuthConfig(env({})).subdomainPolicy).toEqual({ kind: "any" });
  });

  it("refuses to start without any subdomain restriction", () => {
    expect(() => loadHttpAuthConfig(env({ MCP_ALLOW_ANY_SUBDOMAIN: undefined }))).toThrow(
      /SYNCRO_SUBDOMAIN[\s\S]*MCP_ALLOWED_SUBDOMAINS[\s\S]*MCP_ALLOW_ANY_SUBDOMAIN/
    );
    expect(() => loadHttpAuthConfig(env({ MCP_ALLOW_ANY_SUBDOMAIN: "yes" }))).toThrow(
      AuthConfigError
    );
  });

  it("prefers the locked subdomain over an allowlist and warns", () => {
    const config = loadHttpAuthConfig(
      env({ SYNCRO_SUBDOMAIN: "acme", MCP_ALLOWED_SUBDOMAINS: "beta" })
    );
    expect(config.subdomainPolicy).toEqual({ kind: "locked", subdomain: "acme" });
    expect(config.warnings.join("\n")).toMatch(/MCP_ALLOWED_SUBDOMAINS/);
  });
});

describe("loadHttpAuthConfig — legacy settings", () => {
  it("warns that MCP_AUTH_SECRET is ignored", () => {
    const config = loadHttpAuthConfig(env({ MCP_AUTH_SECRET: "x".repeat(40) }));
    expect(config.warnings.some((w) => /MCP_AUTH_SECRET/.test(w) && /ignored/i.test(w))).toBe(
      true
    );
    expect(config.warnings.join("\n")).not.toContain("x".repeat(40));
  });

  it("warns that SYNCRO_API_KEY is ignored in HTTP auth mode", () => {
    const config = loadHttpAuthConfig(env({ SYNCRO_API_KEY: "secret-key-value" }));
    expect(config.warnings.some((w) => /SYNCRO_API_KEY/.test(w) && /ignored/i.test(w))).toBe(
      true
    );
    expect(config.warnings.join("\n")).not.toContain("secret-key-value");
  });

  it("emits no warnings for a clean config", () => {
    expect(loadHttpAuthConfig(env({})).warnings).toEqual([]);
  });
});

describe("loadHttpAuthConfig — redirect allowlist", () => {
  it("is off unless MCP_ALLOWED_REDIRECT_URIS is set", () => {
    expect(loadHttpAuthConfig(env({})).redirectRules).toBeUndefined();
  });

  it("parses the list", () => {
    const config = loadHttpAuthConfig(
      env({ MCP_ALLOWED_REDIRECT_URIS: "https://claude.ai/api/mcp/auth_callback, http://localhost" })
    );
    expect(config.redirectRules).toHaveLength(2);
  });

  it("fails hard on a bad entry", () => {
    expect(() =>
      loadHttpAuthConfig(env({ MCP_ALLOWED_REDIRECT_URIS: "ftp://nope" }))
    ).toThrow(AuthConfigError);
  });
});
