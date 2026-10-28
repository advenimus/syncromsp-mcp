import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import type { Response } from "express";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  InvalidTokenError,
  InvalidGrantError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { McpOAuthProvider, type McpOAuthProviderOptions } from "../src/auth/index.js";
import type { SubdomainPolicy } from "../src/auth/subdomain.js";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
const API_KEY = "T0pS3cretSyncroKey1234567890";
const ANY: SubdomainPolicy = { kind: "any" };
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface MockResponse {
  res: Response;
  headers: Record<string, string>;
  body: string | undefined;
  statusCode: number;
  redirectUrl: string | undefined;
}

function createMockResponse(): MockResponse {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  let statusCode = 200;
  let redirectUrl: string | undefined;
  const res = {
    setHeader(name: string, value: string | number | readonly string[]): Response {
      headers[name] = String(value);
      return res as Response;
    },
    send(payload: string): Response {
      body = payload;
      return res as Response;
    },
    status(code: number): Response {
      statusCode = code;
      return res as Response;
    },
    redirect(url: string): void {
      redirectUrl = url;
    },
  } as unknown as Response;
  return {
    res,
    headers,
    get body() {
      return body;
    },
    get statusCode() {
      return statusCode;
    },
    get redirectUrl() {
      return redirectUrl;
    },
  } as MockResponse;
}

function makeAuthParams(overrides: Partial<AuthorizationParams> = {}): AuthorizationParams {
  return {
    redirectUri: "https://example.com/callback",
    codeChallenge: "challenge-abc",
    scopes: ["mcp:tools"],
    state: "state-xyz",
    ...overrides,
  } as AuthorizationParams;
}

function pendingIdFrom(body: string | undefined): string {
  const id = /name="pending_id" value="([^"]+)"/.exec(body ?? "")?.[1];
  expect(id).toBeTruthy();
  return id!;
}

const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function syncroReplies(status: number) {
  fetchMock.mockImplementation(async () => new Response("{}", { status }));
}

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

class Harness {
  readonly provider: McpOAuthProvider;
  clock = 1_800_000_000_000;

  constructor(overrides: Partial<McpOAuthProviderOptions> = {}) {
    this.provider = new McpOAuthProvider({
      encryptionKey: KEY,
      subdomainPolicy: ANY,
      now: () => this.clock,
      ...overrides,
    });
  }

  async register(
    overrides: Partial<OAuthClientInformationFull> = {}
  ): Promise<OAuthClientInformationFull> {
    return this.provider.clientsStore.registerClient!({
      client_id: "ignored",
      client_name: "Test Client",
      redirect_uris: ["https://example.com/callback"],
      token_endpoint_auth_method: "none",
      ...overrides,
    } as OAuthClientInformationFull);
  }

  async openLogin(client: OAuthClientInformationFull, params = makeAuthParams()) {
    const mock = createMockResponse();
    await this.provider.authorize(client, params, mock.res);
    return mock;
  }

  async submit(
    pendingId: string,
    fields: { subdomain?: string; apiKey?: string; ip?: string } = {}
  ) {
    const mock = createMockResponse();
    await this.provider.handleAuthCallback(
      {
        pendingId,
        subdomain: fields.subdomain ?? "acme",
        apiKey: fields.apiKey ?? API_KEY,
        ip: fields.ip ?? "203.0.113.7",
      },
      mock.res
    );
    return mock;
  }

  async getCode(client: OAuthClientInformationFull, params = makeAuthParams()) {
    const login = await this.openLogin(client, params);
    const cb = await this.submit(pendingIdFrom(login.body));
    expect(cb.redirectUrl).toBeDefined();
    return new URL(cb.redirectUrl!).searchParams.get("code")!;
  }

  async getTokens(client?: OAuthClientInformationFull) {
    const c = client ?? (await this.register());
    const code = await this.getCode(c);
    const tokens = await this.provider.exchangeAuthorizationCode(c, code);
    return { client: c, tokens };
  }

  dispose() {
    this.provider.dispose();
  }
}

let h: Harness;

afterEach(() => {
  h?.dispose();
});

describe("login page", () => {
  beforeEach(() => {
    h = new Harness();
  });

  it("asks for subdomain and API key, with the key as a non-autocompleted password field", async () => {
    const page = await h.openLogin(await h.register());
    const body = page.body ?? "";
    expect(body).toMatch(/<input[^>]*name="subdomain"/);
    const keyInput = /<input[^>]*name="api_key"[^>]*>/.exec(body)?.[0] ?? "";
    expect(keyInput).toContain('type="password"');
    expect(keyInput).toContain('autocomplete="off"');
    expect(body).not.toMatch(/MCP_AUTH_SECRET|access key/i);
  });

  it("shows the locked subdomain and only asks for the key when SYNCRO_SUBDOMAIN is set", async () => {
    h.dispose();
    h = new Harness({ subdomainPolicy: { kind: "locked", subdomain: "acme" } });
    const body = (await h.openLogin(await h.register())).body ?? "";
    expect(body).not.toMatch(/<input[^>]*name="subdomain"/);
    expect(body).toContain("acme.syncromsp.com");
    expect(body).toMatch(/<input[^>]*name="api_key"/);
  });

  it("does not reveal the allowlist", async () => {
    h.dispose();
    h = new Harness({
      subdomainPolicy: { kind: "allowlist", subdomains: new Set(["secretcustomer"]) },
    });
    const body = (await h.openLogin(await h.register())).body ?? "";
    expect(body).not.toContain("secretcustomer");
  });

  it("sets a restrictive CSP and no form-action", async () => {
    const page = await h.openLogin(await h.register());
    const csp = page.headers["Content-Security-Policy"];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/form-action/);
    expect(page.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(page.headers["X-Frame-Options"]).toBe("DENY");
    expect(page.headers["Referrer-Policy"]).toBe("no-referrer");
    expect(page.headers["Cache-Control"]).toBe("no-store");
  });

  it("escapes a malicious client_name", async () => {
    const client = await h.register({ client_name: "<script>alert('xss')</script>" });
    const body = (await h.openLogin(client)).body ?? "";
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;");
    expect(body).toContain("&#39;");
  });

  it("escapes every special character", async () => {
    const cases: Array<[string, string]> = [
      ["&", "&amp;"],
      ["<", "&lt;"],
      [">", "&gt;"],
      ['"', "&quot;"],
      ["'", "&#39;"],
      ["`", "&#96;"],
      ["/", "&#47;"],
    ];
    for (const [input, expected] of cases) {
      const client = await h.register({ client_name: `pre${input}post` });
      expect((await h.openLogin(client)).body).toContain(`pre${expected}post`);
    }
  });

  it("renders the escaped redirect_uri prominently", async () => {
    const body =
      (
        await h.openLogin(
          await h.register(),
          makeAuthParams({ redirectUri: "https://evil.example.com/cb?x=<script>" })
        )
      ).body ?? "";
    expect(body).toContain("redirect-info");
    expect(body).toContain("https:&#47;&#47;evil.example.com");
    expect(body).not.toContain("<script>");
  });
});

describe("sign-in callback", () => {
  beforeEach(() => {
    h = new Harness();
  });

  it("verifies the key against the Syncro me endpoint and redirects with a code", async () => {
    const login = await h.openLogin(await h.register());
    const cb = await h.submit(pendingIdFrom(login.body));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://acme.syncromsp.com/api/v1/me");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${API_KEY}` });

    const redirect = new URL(cb.redirectUrl!);
    expect(redirect.origin + redirect.pathname).toBe("https://example.com/callback");
    expect(redirect.searchParams.get("code")).toBeTruthy();
    expect(redirect.searchParams.get("state")).toBe("state-xyz");
    expect(cb.redirectUrl).not.toContain(API_KEY);
  });

  it("shows one generic error when Syncro rejects the key (401)", async () => {
    syncroReplies(401);
    const login = await h.openLogin(await h.register());
    const cb = await h.submit(pendingIdFrom(login.body));
    expect(cb.redirectUrl).toBeUndefined();
    expect(cb.statusCode).toBe(403);
    expect(cb.body).toContain("Sign-in failed");
    expect(cb.body).not.toContain(API_KEY);
    expect(cb.headers["Content-Security-Policy"]).toContain("default-src 'none'");
  });

  it("shows the same generic error on a Syncro timeout", async () => {
    h.dispose();
    h = new Harness({ verifyTimeoutMs: 20 });
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "TimeoutError"))
          );
        })
    );
    const login = await h.openLogin(await h.register());
    const timedOut = await h.submit(pendingIdFrom(login.body));

    syncroReplies(401);
    const login2 = await h.openLogin(await h.register());
    const rejected = await h.submit(pendingIdFrom(login2.body));

    expect(timedOut.statusCode).toBe(rejected.statusCode);
    expect(stripIds(timedOut.body)).toBe(stripIds(rejected.body));
  });

  it("shows the same generic error for an invalid subdomain, without calling out", async () => {
    syncroReplies(401);
    const login = await h.openLogin(await h.register());
    const rejected = await h.submit(pendingIdFrom(login.body));
    fetchMock.mockClear();

    for (const subdomain of ["evil.com/", "a.b", "-x", "ACME", "ãcme", "@", ""]) {
      const page = await h.openLogin(await h.register());
      const cb = await h.submit(pendingIdFrom(page.body), {
        subdomain,
        ip: `198.51.100.${subdomain.length}`,
      });
      expect(cb.redirectUrl).toBeUndefined();
      expect(stripIds(cb.body)).toBe(stripIds(rejected.body));
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a subdomain outside the allowlist without calling out", async () => {
    h.dispose();
    h = new Harness({ subdomainPolicy: { kind: "allowlist", subdomains: new Set(["acme"]) } });
    const page = await h.openLogin(await h.register());
    const cb = await h.submit(pendingIdFrom(page.body), { subdomain: "other" });
    expect(cb.redirectUrl).toBeUndefined();
    expect(cb.body).toContain("Sign-in failed");
    expect(fetchMock).not.toHaveBeenCalled();

    const page2 = await h.openLogin(await h.register());
    const ok = await h.submit(pendingIdFrom(page2.body), { subdomain: "acme" });
    expect(ok.redirectUrl).toBeDefined();
  });

  it("ignores a posted subdomain when locked and always calls the locked tenant", async () => {
    h.dispose();
    h = new Harness({ subdomainPolicy: { kind: "locked", subdomain: "acme" } });
    const page = await h.openLogin(await h.register());
    const cb = await h.submit(pendingIdFrom(page.body), { subdomain: "evil" });
    expect(cb.redirectUrl).toBeDefined();
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://acme.syncromsp.com/api/v1/me");
  });

  it("allows only one attempt per pending id", async () => {
    syncroReplies(401);
    const login = await h.openLogin(await h.register());
    const pendingId = pendingIdFrom(login.body);
    await h.submit(pendingId);

    syncroReplies(200);
    const retry = await h.submit(pendingId);
    expect(retry.redirectUrl).toBeUndefined();
    expect(retry.statusCode).toBe(400);
  });

  it("offers a fresh form after a failure so the user can retry", async () => {
    syncroReplies(401);
    const login = await h.openLogin(await h.register());
    const first = await h.submit(pendingIdFrom(login.body));
    const freshId = pendingIdFrom(first.body);

    syncroReplies(200);
    const second = await h.submit(freshId);
    expect(second.redirectUrl).toBeDefined();
  });

  it("rate-limits sign-in attempts per IP and stops calling Syncro", async () => {
    syncroReplies(401);
    const client = await h.register();
    for (let i = 0; i < 5; i++) {
      const page = await h.openLogin(client);
      await h.submit(pendingIdFrom(page.body), { ip: "192.0.2.1" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);

    syncroReplies(200);
    const page = await h.openLogin(client);
    const limited = await h.submit(pendingIdFrom(page.body), { ip: "192.0.2.1" });
    expect(limited.statusCode).toBe(429);
    expect(limited.redirectUrl).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const other = await h.openLogin(client);
    const fromElsewhere = await h.submit(pendingIdFrom(other.body), { ip: "192.0.2.2" });
    expect(fromElsewhere.redirectUrl).toBeDefined();
  });

  it("lets the IP try again after the window passes", async () => {
    syncroReplies(401);
    const client = await h.register();
    for (let i = 0; i < 6; i++) {
      const page = await h.openLogin(client);
      await h.submit(pendingIdFrom(page.body), { ip: "192.0.2.9" });
    }
    h.clock += 16 * 60 * 1000;
    syncroReplies(200);
    const page = await h.openLogin(client);
    const cb = await h.submit(pendingIdFrom(page.body), { ip: "192.0.2.9" });
    expect(cb.redirectUrl).toBeDefined();
  });

  it("returns 400 for an unknown pending id", async () => {
    const cb = await h.submit("not-a-pending-id");
    expect(cb.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function stripIds(body: string | undefined): string {
  return (body ?? "").replace(/name="pending_id" value="[^"]+"/g, "");
}

describe("authorization code exchange", () => {
  beforeEach(() => {
    h = new Harness();
  });

  it("issues a 1 hour access token and a refresh token that carry the credentials sealed", async () => {
    const { tokens } = await h.getTokens();
    expect(tokens.token_type).toBe("bearer");
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope).toBe("mcp:tools");
    for (const t of [tokens.access_token, tokens.refresh_token!]) {
      expect(t.startsWith("v1.")).toBe(true);
      expect(t).not.toContain(API_KEY);
      expect(Buffer.from(t.slice(3), "base64url").toString("latin1")).not.toContain(API_KEY);
    }
  });

  it("verifyAccessToken returns the user's Syncro credentials in extra", async () => {
    const { tokens } = await h.getTokens();
    const info = await h.provider.verifyAccessToken(tokens.access_token);
    expect(info.token).toBe(tokens.access_token);
    expect(info.scopes).toEqual(["mcp:tools"]);
    expect(info.expiresAt).toBe(Math.floor((h.clock + HOUR) / 1000));
    expect(info.extra).toEqual({ syncro: { subdomain: "acme", apiKey: API_KEY } });
  });

  it("is single use", async () => {
    const client = await h.register();
    const code = await h.getCode(client);
    await h.provider.exchangeAuthorizationCode(client, code);
    await expect(h.provider.exchangeAuthorizationCode(client, code)).rejects.toBeInstanceOf(
      InvalidGrantError
    );
  });

  it("burns the code when the wrong client presents it", async () => {
    const issuing = await h.register();
    const attacker = await h.register({ client_name: "Attacker" });
    const code = await h.getCode(issuing);
    await expect(h.provider.exchangeAuthorizationCode(attacker, code)).rejects.toThrow(
      /invalid authorization code/i
    );
    await expect(h.provider.exchangeAuthorizationCode(issuing, code)).rejects.toThrow(
      /invalid authorization code/i
    );
  });

  it("rejects a redirect_uri that differs from the one authorized", async () => {
    const client = await h.register();
    const code = await h.getCode(client);
    await expect(
      h.provider.exchangeAuthorizationCode(client, code, undefined, "https://evil.example/cb")
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects an expired code", async () => {
    const client = await h.register();
    const code = await h.getCode(client);
    h.clock += 11 * 60 * 1000;
    await expect(h.provider.exchangeAuthorizationCode(client, code)).rejects.toBeInstanceOf(
      InvalidGrantError
    );
  });

  it("challengeForAuthorizationCode returns the PKCE challenge, and rejects unknown codes", async () => {
    const client = await h.register();
    const code = await h.getCode(client);
    await expect(h.provider.challengeForAuthorizationCode(client, code)).resolves.toBe(
      "challenge-abc"
    );
    await expect(
      h.provider.challengeForAuthorizationCode(client, "nope")
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });
});

describe("token validation", () => {
  beforeEach(() => {
    h = new Harness();
  });

  it("rejects a refresh token used as a bearer token", async () => {
    const { tokens } = await h.getTokens();
    await expect(h.provider.verifyAccessToken(tokens.refresh_token!)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("rejects an access token used as a refresh token", async () => {
    const { client, tokens } = await h.getTokens();
    await expect(
      h.provider.exchangeRefreshToken(client, tokens.access_token)
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects an expired access token", async () => {
    const { tokens } = await h.getTokens();
    h.clock += HOUR + 1000;
    await expect(h.provider.verifyAccessToken(tokens.access_token)).rejects.toThrow(
      /invalid or expired token/i
    );
  });

  it("rejects an expired refresh token", async () => {
    const { client, tokens } = await h.getTokens();
    h.clock += 31 * DAY;
    await expect(
      h.provider.exchangeRefreshToken(client, tokens.refresh_token!)
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects tampered and garbage tokens with InvalidTokenError", async () => {
    const { tokens } = await h.getTokens();
    const raw = Buffer.from(tokens.access_token.slice(3), "base64url");
    raw[20] = raw[20]! ^ 0xff;
    await expect(
      h.provider.verifyAccessToken(`v1.${raw.toString("base64url")}`)
    ).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(h.provider.verifyAccessToken("not-a-real-token")).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("rejects tokens minted with a different encryption key", async () => {
    const { tokens } = await h.getTokens();
    const stranger = new McpOAuthProvider({ encryptionKey: OTHER_KEY, subdomainPolicy: ANY });
    try {
      await expect(stranger.verifyAccessToken(tokens.access_token)).rejects.toBeInstanceOf(
        InvalidTokenError
      );
    } finally {
      stranger.dispose();
    }
  });

  it("rejects a refresh token presented by another client", async () => {
    const { tokens } = await h.getTokens();
    const other = await h.register({ client_name: "Other" });
    await expect(
      h.provider.exchangeRefreshToken(other, tokens.refresh_token!)
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });
});

describe("restart and key rotation", () => {
  it("tokens and client_id survive a new provider instance with the same key", async () => {
    h = new Harness();
    const { client, tokens } = await h.getTokens();
    h.dispose();

    const restarted = new Harness();
    restarted.clock = h.clock;
    h = restarted;
    const reloaded = await h.provider.clientsStore.getClient(client.client_id);
    expect(reloaded?.redirect_uris).toEqual(client.redirect_uris);
    await expect(h.provider.verifyAccessToken(tokens.access_token)).resolves.toMatchObject({
      extra: { syncro: { subdomain: "acme", apiKey: API_KEY } },
    });
    const refreshed = await h.provider.exchangeRefreshToken(reloaded!, tokens.refresh_token!);
    expect(refreshed.access_token).toBeTruthy();
  });

  it("accepts tokens and clients sealed with the previous key, and seals new ones with the current key", async () => {
    h = new Harness({ encryptionKey: OTHER_KEY });
    const { client, tokens } = await h.getTokens();
    const clock = h.clock;
    h.dispose();

    h = new Harness({ encryptionKey: KEY, previousEncryptionKeys: [OTHER_KEY] });
    h.clock = clock;
    await expect(h.provider.verifyAccessToken(tokens.access_token)).resolves.toBeDefined();
    const reloaded = await h.provider.clientsStore.getClient(client.client_id);
    expect(reloaded).toBeDefined();
    const refreshed = await h.provider.exchangeRefreshToken(reloaded!, tokens.refresh_token!);

    const currentOnly = new McpOAuthProvider({
      encryptionKey: KEY,
      subdomainPolicy: ANY,
      now: () => clock,
    });
    const oldOnly = new McpOAuthProvider({
      encryptionKey: OTHER_KEY,
      subdomainPolicy: ANY,
      now: () => clock,
    });
    try {
      await expect(currentOnly.verifyAccessToken(refreshed.access_token)).resolves.toBeDefined();
      await expect(oldOnly.verifyAccessToken(refreshed.access_token)).rejects.toBeInstanceOf(
        InvalidTokenError
      );
    } finally {
      currentOnly.dispose();
      oldOnly.dispose();
    }
  });
});

describe("refresh rotation and revocation", () => {
  beforeEach(() => {
    h = new Harness();
  });

  it("rotates the refresh token and rejects the old one after use", async () => {
    const { client, tokens } = await h.getTokens();
    const old = tokens.refresh_token!;
    const refreshed = await h.provider.exchangeRefreshToken(client, old);
    expect(refreshed.refresh_token).toBeTruthy();
    expect(refreshed.refresh_token).not.toBe(old);
    expect(refreshed.expires_in).toBe(3600);

    await expect(h.provider.exchangeRefreshToken(client, old)).rejects.toThrow(
      /invalid or expired refresh token/i
    );
  });

  it("keeps the credentials across a refresh", async () => {
    const { client, tokens } = await h.getTokens();
    const refreshed = await h.provider.exchangeRefreshToken(client, tokens.refresh_token!);
    const info = await h.provider.verifyAccessToken(refreshed.access_token);
    expect(info.extra).toEqual({ syncro: { subdomain: "acme", apiKey: API_KEY } });
  });

  it("treats reuse of a spent refresh token as theft and revokes the whole family", async () => {
    const { client, tokens } = await h.getTokens();
    const refreshed = await h.provider.exchangeRefreshToken(client, tokens.refresh_token!);
    await expect(
      h.provider.exchangeRefreshToken(client, tokens.refresh_token!)
    ).rejects.toBeInstanceOf(InvalidGrantError);

    await expect(
      h.provider.exchangeRefreshToken(client, refreshed.refresh_token!)
    ).rejects.toBeInstanceOf(InvalidGrantError);
    await expect(h.provider.verifyAccessToken(refreshed.access_token)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("refuses to widen scopes on refresh", async () => {
    const { client, tokens } = await h.getTokens();
    await expect(
      h.provider.exchangeRefreshToken(client, tokens.refresh_token!, ["mcp:tools", "admin"])
    ).rejects.toThrow();
  });

  it("revoking an access token makes it unusable", async () => {
    const { client, tokens } = await h.getTokens();
    await h.provider.revokeToken(client, { token: tokens.access_token });
    await expect(h.provider.verifyAccessToken(tokens.access_token)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("revoking a refresh token kills it and the access tokens issued with it", async () => {
    const { client, tokens } = await h.getTokens();
    await h.provider.revokeToken(client, { token: tokens.refresh_token! });
    await expect(
      h.provider.exchangeRefreshToken(client, tokens.refresh_token!)
    ).rejects.toBeInstanceOf(InvalidGrantError);
    await expect(h.provider.verifyAccessToken(tokens.access_token)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("ignores revocation requests from a different client", async () => {
    const { tokens } = await h.getTokens();
    const other = await h.register({ client_name: "Other" });
    await h.provider.revokeToken(other, { token: tokens.access_token });
    await expect(h.provider.verifyAccessToken(tokens.access_token)).resolves.toBeDefined();
  });

  it("silently ignores unknown tokens", async () => {
    const client = await h.register();
    await expect(h.provider.revokeToken(client, { token: "garbage" })).resolves.toBeUndefined();
  });
});

describe("housekeeping", () => {
  it("sweep forgets expired pending sign-ins and codes", async () => {
    h = new Harness();
    const client = await h.register();
    const login = await h.openLogin(client);
    const code = await h.getCode(client);

    h.provider._sweepExpired(h.clock + 11 * 60 * 1000);

    const cb = await h.submit(pendingIdFrom(login.body));
    expect(cb.statusCode).toBe(400);
    await expect(h.provider.exchangeAuthorizationCode(client, code)).rejects.toBeInstanceOf(
      InvalidGrantError
    );
  });

  it("dispose is idempotent and clears its timer once", () => {
    const real = globalThis.clearInterval;
    const spy = vi.fn(real);
    globalThis.clearInterval = spy as typeof globalThis.clearInterval;
    try {
      const provider = new McpOAuthProvider({ encryptionKey: KEY, subdomainPolicy: ANY });
      provider.dispose();
      provider.dispose();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.clearInterval = real;
    }
  });
});
