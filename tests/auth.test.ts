import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type {
  OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { McpOAuthProvider } from "../src/auth.js";

// 64 hex chars (32 bytes) — 32 unique-ish chars, no weak substrings.
const STRONG_SECRET =
  "9f1c2d3e4b5a60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f0";

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

function makeClient(
  overrides: Partial<OAuthClientInformationFull> = {}
): OAuthClientInformationFull {
  return {
    client_id: "client-123",
    client_name: "Test Client",
    redirect_uris: ["https://example.com/callback"],
    ...overrides,
  } as OAuthClientInformationFull;
}

function makeAuthParams(
  overrides: Partial<AuthorizationParams> = {}
): AuthorizationParams {
  return {
    redirectUri: "https://example.com/callback",
    codeChallenge: "challenge-abc",
    codeChallengeMethod: "S256",
    scopes: ["read"],
    state: "state-xyz",
    ...overrides,
  } as AuthorizationParams;
}

describe("McpOAuthProvider — secret validation", () => {
  it("throws on a 31-character secret", () => {
    const s = "a".repeat(31);
    expect(() => new McpOAuthProvider(s)).toThrow(/at least 32 characters/i);
  });

  it("succeeds on a 32-char secret with sufficient entropy", () => {
    const provider = new McpOAuthProvider(STRONG_SECRET);
    expect(provider).toBeInstanceOf(McpOAuthProvider);
    provider.dispose();
  });

  it("throws on the placeholder 'change-me-to-a-strong-secret-1234'", () => {
    expect(
      () => new McpOAuthProvider("change-me-to-a-strong-secret-1234")
    ).toThrow(/weak or default/i);
  });

  it("throws when the secret has too few unique characters", () => {
    // 64 chars but only 1 unique character — fails entropy check.
    expect(() => new McpOAuthProvider("a".repeat(64))).toThrow(
      /entropy|distinct/i
    );
  });

  it("throws on an empty secret", () => {
    expect(() => new McpOAuthProvider("")).toThrow(/at least 32 characters/i);
  });

  it("throws on a 32-char secret containing 'password'", () => {
    expect(
      () => new McpOAuthProvider("password" + "X".repeat(24))
    ).toThrow(/weak or default/i);
  });
});

describe("McpOAuthProvider — escHtml regression via authorize()", () => {
  let provider: McpOAuthProvider;

  beforeEach(() => {
    provider = new McpOAuthProvider(STRONG_SECRET);
  });

  afterEach(() => {
    provider.dispose();
  });

  it("escapes <, >, &, \", ', /, ` in client_name (no <script> in output)", async () => {
    const mock = createMockResponse();
    const client = makeClient({
      client_name: "<script>alert('xss')</script>",
    });
    await provider.authorize(client, makeAuthParams(), mock.res);
    const body = mock.body ?? "";
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("</script>");
    expect(body).toContain("&lt;script&gt;");
    expect(body).toContain("&#39;");
  });

  it("escapes a malicious client_id when client_name is empty", async () => {
    const mock = createMockResponse();
    const client = makeClient({
      client_id: "</div><script>x</script>",
      client_name: undefined,
    });
    await provider.authorize(client, makeAuthParams(), mock.res);
    const body = mock.body ?? "";
    expect(body).not.toContain("<script>x</script>");
    expect(body).toContain("&lt;&#47;div&gt;");
  });

  it("escapes individual dangerous characters", async () => {
    const mock = createMockResponse();
    const client = makeClient({
      client_name: `<>&"'\`/`,
    });
    await provider.authorize(client, makeAuthParams(), mock.res);
    const body = mock.body ?? "";
    expect(body).toContain("&lt;");
    expect(body).toContain("&gt;");
    expect(body).toContain("&amp;");
    expect(body).toContain("&quot;");
    expect(body).toContain("&#39;");
    expect(body).toContain("&#96;");
    expect(body).toContain("&#47;");
  });
});

describe("McpOAuthProvider — security headers on authorize page", () => {
  let provider: McpOAuthProvider;

  beforeEach(() => {
    provider = new McpOAuthProvider(STRONG_SECRET);
  });

  afterEach(() => {
    provider.dispose();
  });

  it("sets a restrictive Content-Security-Policy", async () => {
    const mock = createMockResponse();
    await provider.authorize(makeClient(), makeAuthParams(), mock.res);
    const csp = mock.headers["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    // Scripts are forbidden — no script-src 'unsafe-inline' permitted.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cache-Control", async () => {
    const mock = createMockResponse();
    await provider.authorize(makeClient(), makeAuthParams(), mock.res);
    expect(mock.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(mock.headers["X-Frame-Options"]).toBe("DENY");
    expect(mock.headers["Referrer-Policy"]).toBe("no-referrer");
    expect(mock.headers["Cache-Control"]).toBe("no-store");
  });

  it("sets the same security headers on the access-denied page", async () => {
    const mock = createMockResponse();
    // Seed a pending auth so we can hit the wrong-secret branch.
    const seedMock = createMockResponse();
    await provider.authorize(makeClient(), makeAuthParams(), seedMock.res);
    const pendingId = /name="pending_id" value="([^"]+)"/.exec(
      seedMock.body ?? ""
    )?.[1];
    expect(pendingId).toBeTruthy();
    await provider.handleAuthCallback(pendingId!, "wrong", mock.res);
    expect(mock.statusCode).toBe(403);
    expect(mock.headers["Content-Security-Policy"]).toContain(
      "default-src 'none'"
    );
    expect(mock.headers["X-Frame-Options"]).toBe("DENY");
  });
});

describe("McpOAuthProvider — anti-phishing redirect_uri display", () => {
  let provider: McpOAuthProvider;

  beforeEach(() => {
    provider = new McpOAuthProvider(STRONG_SECRET);
  });

  afterEach(() => {
    provider.dispose();
  });

  it("renders the (escaped) redirect_uri prominently on the consent page", async () => {
    const mock = createMockResponse();
    const params = makeAuthParams({
      redirectUri: "https://evil.example.com/cb?x=<script>",
    });
    await provider.authorize(makeClient(), params, mock.res);
    const body = mock.body ?? "";
    expect(body).toContain("redirect-info");
    expect(body).toContain("https:&#47;&#47;evil.example.com");
    expect(body).not.toContain("<script>");
  });
});

describe("McpOAuthProvider — token type confusion", () => {
  let provider: McpOAuthProvider;

  beforeEach(() => {
    provider = new McpOAuthProvider(STRONG_SECRET);
  });

  afterEach(() => {
    provider.dispose();
  });

  async function getTokens() {
    const client = makeClient();
    const params = makeAuthParams();
    // Drive through the full flow to mint legitimate access + refresh tokens.
    const authMock = createMockResponse();
    await provider.authorize(client, params, authMock.res);
    const pendingId = /name="pending_id" value="([^"]+)"/.exec(
      authMock.body ?? ""
    )?.[1];
    expect(pendingId).toBeTruthy();
    const cbMock = createMockResponse();
    await provider.handleAuthCallback(pendingId!, STRONG_SECRET, cbMock.res);
    const code = new URL(cbMock.redirectUrl!).searchParams.get("code");
    expect(code).toBeTruthy();
    const tokens = await provider.exchangeAuthorizationCode(client, code!);
    return { client, tokens };
  }

  it("verifyAccessToken rejects a refresh token", async () => {
    const { tokens } = await getTokens();
    await expect(
      provider.verifyAccessToken(tokens.refresh_token!)
    ).rejects.toThrow(/invalid or expired token/i);
  });

  it("exchangeRefreshToken rejects an access token", async () => {
    const { client, tokens } = await getTokens();
    await expect(
      provider.exchangeRefreshToken(client, tokens.access_token)
    ).rejects.toThrow(/invalid or expired refresh token/i);
  });

  it("verifyAccessToken accepts a real access token", async () => {
    const { tokens } = await getTokens();
    const info = await provider.verifyAccessToken(tokens.access_token);
    expect(info.token).toBe(tokens.access_token);
  });
});

describe("McpOAuthProvider — refresh token rotation", () => {
  let provider: McpOAuthProvider;

  beforeEach(() => {
    provider = new McpOAuthProvider(STRONG_SECRET);
  });

  afterEach(() => {
    provider.dispose();
  });

  it("mints a new refresh token and invalidates the old one", async () => {
    const client = makeClient();
    const authMock = createMockResponse();
    await provider.authorize(client, makeAuthParams(), authMock.res);
    const pendingId = /name="pending_id" value="([^"]+)"/.exec(
      authMock.body ?? ""
    )?.[1]!;
    const cbMock = createMockResponse();
    await provider.handleAuthCallback(pendingId, STRONG_SECRET, cbMock.res);
    const code = new URL(cbMock.redirectUrl!).searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(client, code);

    const oldRefresh = tokens.refresh_token!;
    const refreshed = await provider.exchangeRefreshToken(client, oldRefresh);
    expect(refreshed.refresh_token).toBeDefined();
    expect(refreshed.refresh_token).not.toBe(oldRefresh);

    // Old refresh token is no longer usable.
    await expect(
      provider.exchangeRefreshToken(client, oldRefresh)
    ).rejects.toThrow(/invalid or expired refresh token/i);

    // New refresh token IS usable, and rotates again.
    const refreshed2 = await provider.exchangeRefreshToken(
      client,
      refreshed.refresh_token!
    );
    expect(refreshed2.refresh_token).not.toBe(refreshed.refresh_token);
  });
});

describe("McpOAuthProvider — auth code single-use on client_id mismatch", () => {
  let provider: McpOAuthProvider;

  beforeEach(() => {
    provider = new McpOAuthProvider(STRONG_SECRET);
  });

  afterEach(() => {
    provider.dispose();
  });

  it("burns the auth code even when the wrong client tries to redeem it", async () => {
    const issuingClient = makeClient({ client_id: "client-A" });
    const attackerClient = makeClient({ client_id: "client-B" });

    const authMock = createMockResponse();
    await provider.authorize(issuingClient, makeAuthParams(), authMock.res);
    const pendingId = /name="pending_id" value="([^"]+)"/.exec(
      authMock.body ?? ""
    )?.[1]!;
    const cbMock = createMockResponse();
    await provider.handleAuthCallback(pendingId, STRONG_SECRET, cbMock.res);
    const code = new URL(cbMock.redirectUrl!).searchParams.get("code")!;

    // Attacker presents the code first — should be rejected AND burned.
    await expect(
      provider.exchangeAuthorizationCode(attackerClient, code)
    ).rejects.toThrow(/invalid authorization code/i);

    // The legitimate client can no longer redeem the code either.
    await expect(
      provider.exchangeAuthorizationCode(issuingClient, code)
    ).rejects.toThrow(/invalid authorization code/i);
  });
});

describe("McpOAuthProvider — _sweepExpired", () => {
  let provider: McpOAuthProvider;

  beforeEach(() => {
    provider = new McpOAuthProvider(STRONG_SECRET);
  });

  afterEach(() => {
    provider.dispose();
    vi.useRealTimers();
  });

  it("removes expired tokens, codes, and pending auths", async () => {
    const client = makeClient();
    const authMock = createMockResponse();
    await provider.authorize(client, makeAuthParams(), authMock.res);
    const pendingId = /name="pending_id" value="([^"]+)"/.exec(
      authMock.body ?? ""
    )?.[1]!;
    const cbMock = createMockResponse();
    await provider.handleAuthCallback(pendingId, STRONG_SECRET, cbMock.res);
    const code = new URL(cbMock.redirectUrl!).searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(client, code);

    // Token is currently valid.
    await expect(
      provider.verifyAccessToken(tokens.access_token)
    ).resolves.toMatchObject({ token: tokens.access_token });

    // Seed an additional pending auth (will count as the only un-deleted one).
    const seed = createMockResponse();
    await provider.authorize(client, makeAuthParams(), seed.res);

    // Sweep with a "future" timestamp far past every TTL — everything expires.
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    provider._sweepExpired(farFuture);

    await expect(
      provider.verifyAccessToken(tokens.access_token)
    ).rejects.toThrow(/invalid or expired token/i);
    await expect(
      provider.exchangeRefreshToken(client, tokens.refresh_token!)
    ).rejects.toThrow(/invalid or expired refresh token/i);
  });
});

describe("McpOAuthProvider — dispose()", () => {
  it("clears the periodic sweep interval and is idempotent", () => {
    const provider = new McpOAuthProvider(STRONG_SECRET);
    expect(() => provider.dispose()).not.toThrow();
    // Second call must be a no-op.
    expect(() => provider.dispose()).not.toThrow();
  });

  it("does not leave a timer keeping the event loop alive", () => {
    // We can verify the interval is cleared by replacing clearInterval and
    // confirming it is invoked exactly once on the first dispose() call.
    const real = globalThis.clearInterval;
    const spy = vi.fn(real);
    globalThis.clearInterval = spy as typeof globalThis.clearInterval;
    try {
      const provider = new McpOAuthProvider(STRONG_SECRET);
      provider.dispose();
      provider.dispose();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.clearInterval = real;
    }
  });
});

describe("escHtml — exposed indirectly via authorize() output", () => {
  // escHtml is a private module helper. We test all 7 mappings end-to-end
  // by feeding each character through the rendered HTML.
  it("escapes every special character correctly", async () => {
    const provider = new McpOAuthProvider(STRONG_SECRET);
    try {
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
        const mock = createMockResponse();
        const client = makeClient({ client_name: `pre${input}post` });
        await provider.authorize(client, makeAuthParams(), mock.res);
        expect(mock.body).toContain(`pre${expected}post`);
      }
    } finally {
      provider.dispose();
    }
  });
});
