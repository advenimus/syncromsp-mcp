import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Response } from "express";

interface CodeData {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

type TokenType = "access" | "refresh";

interface TokenData {
  token: string;
  type: TokenType;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const MIN_SECRET_LENGTH = 32;
const MIN_UNIQUE_CHARS = 8;
const WEAK_SECRET_NEEDLES = [
  "change-me",
  "changeme",
  "password",
  "secret",
  "admin",
  "your-strong-secret",
  "your-secret-here",
  "test",
];

function safeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * HTML-escape attacker-controllable values before interpolating into
 * the rendered HTML response. Escapes &, <, >, ", ', `, /
 * to defeat stored XSS via the open OAuth Dynamic Client Registration
 * endpoint (e.g. malicious client_name).
 */
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"'`/]/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "`": "&#96;",
      "/": "&#47;",
    };
    return map[c]!;
  });
}

/**
 * Apply restrictive security headers to OAuth UI responses (login, deny).
 * - CSP forbids all script execution and external resource loads.
 * - X-Frame-Options + frame-ancestors block clickjacking.
 * - Cache-Control: no-store keeps the form/error out of disk cache.
 */
function applySecurityHeaders(res: Response): void {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
}

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    clientMetadata: OAuthClientInformationFull
  ): Promise<OAuthClientInformationFull> {
    this.clients.set(clientMetadata.client_id, clientMetadata);
    return clientMetadata;
  }
}

/**
 * Secure OAuth provider for MCP server authentication.
 *
 * When MCP_AUTH_SECRET is set, the authorize flow presents a login page
 * requiring the secret before granting access. This prevents unauthorized
 * clients from completing the OAuth flow even if they discover the server URL.
 *
 * Without MCP_AUTH_SECRET, the server refuses to start in auth mode.
 */
export class McpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore();
  private readonly codes = new Map<string, CodeData>();
  private readonly tokens = new Map<string, TokenData>();
  private readonly pendingAuths = new Map<string, PendingAuth>();
  private readonly tokenLifetimeMs: number;
  private readonly authSecret: string;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(authSecret: string, tokenLifetimeHours: number = 24) {
    this.validateSecret(authSecret);
    this.authSecret = authSecret;
    this.tokenLifetimeMs = tokenLifetimeHours * 60 * 60 * 1000;

    // Periodic sweep prevents unbounded memory growth under abuse
    // (e.g. attacker hammering /authorize to fill pendingAuths).
    this.sweepInterval = setInterval(
      this._sweepExpired.bind(this),
      SWEEP_INTERVAL_MS
    );
    if (typeof this.sweepInterval.unref === "function") {
      this.sweepInterval.unref();
    }
  }

  /**
   * Enforce strong MCP_AUTH_SECRET requirements. The HTTP server is
   * publicly exposed and a leaked/brute-forceable secret allows full
   * takeover of the MSP business via the OAuth flow.
   */
  private validateSecret(authSecret: string): void {
    if (typeof authSecret !== "string" || authSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `MCP_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters. ` +
          `Generate one with: openssl rand -hex 32`
      );
    }
    const lowered = authSecret.toLowerCase();
    for (const needle of WEAK_SECRET_NEEDLES) {
      if (lowered === needle || lowered.includes(needle)) {
        throw new Error(
          "MCP_AUTH_SECRET appears to contain a weak or default value. " +
            "Generate a strong random secret with: openssl rand -hex 32"
        );
      }
    }
    const uniqueChars = new Set(authSecret).size;
    if (uniqueChars < MIN_UNIQUE_CHARS) {
      throw new Error(
        `MCP_AUTH_SECRET has too little entropy (only ${uniqueChars} distinct ` +
          `characters; minimum is ${MIN_UNIQUE_CHARS}). ` +
          "Generate a strong random secret with: openssl rand -hex 32"
      );
    }
  }

  /**
   * Prune expired entries from codes / tokens / pendingAuths.
   * Idempotent. Safe to call repeatedly.
   */
  _sweepExpired(now: number = Date.now()): void {
    const codeCutoff = now - CODE_TTL_MS;
    for (const [key, value] of this.codes) {
      if (value.createdAt < codeCutoff) this.codes.delete(key);
    }
    const pendingCutoff = now - PENDING_AUTH_TTL_MS;
    for (const [key, value] of this.pendingAuths) {
      if (value.createdAt < pendingCutoff) this.pendingAuths.delete(key);
    }
    for (const [key, value] of this.tokens) {
      if (value.expiresAt < now) this.tokens.delete(key);
    }
  }

  /**
   * Stop the periodic sweep. Idempotent — safe to call multiple times.
   * Primarily used by tests to allow the process to exit cleanly.
   */
  dispose(): void {
    if (this.sweepInterval !== null) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Store the pending auth and show login page
    const pendingId = randomUUID();
    this.pendingAuths.set(pendingId, {
      client,
      params,
      createdAt: Date.now(),
    });

    // Opportunistic cleanup of expired pending auths
    this._sweepExpired();

    // CRITICAL: every interpolation below uses escHtml to defeat stored
    // XSS via attacker-controlled client_name from open DCR.
    const safePendingId = escHtml(pendingId);
    const safeClientLabel = escHtml(client.client_name || client.client_id);
    const safeRedirectUri = escHtml(params.redirectUri);

    applySecurityHeaders(res);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>SyncroMSP MCP - Authorize</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { background: #1e293b; padding: 2rem; border-radius: 12px; max-width: 420px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: #f8fafc; }
    p { font-size: 0.875rem; color: #94a3b8; margin: 0 0 1.5rem; }
    label { display: block; font-size: 0.875rem; margin-bottom: 0.5rem; color: #cbd5e1; }
    input[type="password"] { width: 100%; padding: 0.75rem; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #f8fafc; font-size: 1rem; box-sizing: border-box; }
    input[type="password"]:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
    button { width: 100%; padding: 0.75rem; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; margin-top: 1rem; }
    button:hover { background: #2563eb; }
    .error { color: #f87171; font-size: 0.875rem; margin-top: 0.5rem; display: none; }
    .client-info { font-size: 0.75rem; color: #64748b; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #334155; word-break: break-all; }
    .redirect-info { border: 1px solid #334155; border-radius: 8px; padding: 0.75rem 1rem; margin: 0 0 1.25rem; background: #0b1220; }
    .redirect-info strong { display: block; font-size: 0.8125rem; color: #cbd5e1; margin-bottom: 0.5rem; font-weight: 600; }
    .redirect-info code { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem; color: #f8fafc; background: #020617; padding: 0.5rem 0.625rem; border-radius: 6px; word-break: break-all; }
    .redirect-info .warning { font-size: 0.75rem; color: #fbbf24; margin: 0.625rem 0 0; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>SyncroMSP MCP Server</h1>
    <p>Enter the server access key to authorize this connection.</p>
    <div class="redirect-info">
      <strong>After authorization, you will be redirected to:</strong>
      <code>${safeRedirectUri}</code>
      <p class="warning">Only proceed if this destination is expected. If you don't recognize this address, close this page.</p>
    </div>
    <form method="POST" action="/authorize/callback">
      <input type="hidden" name="pending_id" value="${safePendingId}">
      <label for="secret">Access Key</label>
      <input type="password" id="secret" name="secret" placeholder="Enter MCP_AUTH_SECRET" required autofocus>
      <div class="error" id="error">Invalid access key. Please try again.</div>
      <button type="submit">Authorize</button>
    </form>
    <div class="client-info">Client: ${safeClientLabel}</div>
  </div>
</body>
</html>`);
  }

  /**
   * Called from the /authorize/callback POST handler.
   * Validates the secret and either redirects with an auth code or shows an error.
   */
  async handleAuthCallback(
    pendingId: string,
    secret: string,
    res: Response
  ): Promise<void> {
    const pending = this.pendingAuths.get(pendingId);
    if (!pending) {
      applySecurityHeaders(res);
      res.status(400).send("Authorization request expired. Please try again.");
      return;
    }

    // Timing-safe comparison of the secret
    if (!safeCompare(secret, this.authSecret)) {
      // Burn the pending entry on first failed attempt — single-attempt per pending.
      this.pendingAuths.delete(pendingId);
      applySecurityHeaders(res);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(403).send(`<!DOCTYPE html>
<html>
<head>
  <title>Access Denied</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { background: #1e293b; padding: 2rem; border-radius: 12px; max-width: 400px; width: 90%; text-align: center; }
    h1 { color: #f87171; font-size: 1.25rem; }
    p { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Access Denied</h1>
    <p>Invalid access key. Connection rejected.</p>
  </div>
</body>
</html>`);
      return;
    }

    // Secret valid — issue auth code
    this.pendingAuths.delete(pendingId);
    const code = randomUUID();
    this.codes.set(code, {
      client: pending.client,
      params: pending.params,
      createdAt: Date.now(),
    });

    const redirectUrl = new URL(pending.params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (pending.params.state !== undefined) {
      redirectUrl.searchParams.set("state", pending.params.state);
    }

    res.redirect(redirectUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error("Invalid authorization code");
    }
    return codeData.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string
  ): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error("Invalid authorization code");
    }

    // Burn the code on the FIRST use attempt regardless of outcome.
    // Per OAuth 2.0 best practice (RFC 6749 §10.5), an auth code MUST be
    // single-use; deleting before the client_id check prevents an attacker
    // from probing whether a stolen code belongs to a given client.
    this.codes.delete(authorizationCode);

    if (codeData.client.client_id !== client.client_id) {
      throw new Error("Invalid authorization code");
    }

    // Auth codes expire after 10 minutes
    if (Date.now() - codeData.createdAt > CODE_TTL_MS) {
      throw new Error("Invalid authorization code");
    }

    const accessToken = randomUUID();
    const refreshToken = randomUUID();

    this.tokens.set(accessToken, {
      token: accessToken,
      type: "access",
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt: Date.now() + this.tokenLifetimeMs,
      resource: codeData.params.resource,
    });

    this.tokens.set(refreshToken, {
      token: refreshToken,
      type: "refresh",
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
      resource: codeData.params.resource,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: Math.floor(this.tokenLifetimeMs / 1000),
      refresh_token: refreshToken,
      scope: (codeData.params.scopes || []).join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const tokenData = this.tokens.get(refreshToken);
    // Reject if missing, expired, wrong type (access token used as refresh),
    // or issued to a different client. Use a single uniform error message
    // to avoid leaking which condition failed.
    if (
      !tokenData ||
      tokenData.type !== "refresh" ||
      tokenData.expiresAt < Date.now() ||
      tokenData.clientId !== client.client_id
    ) {
      throw new Error("Invalid or expired refresh token");
    }

    // Refresh token rotation: invalidate the old refresh token and mint a
    // new one. Limits blast radius of a leaked refresh token to a single use.
    this.tokens.delete(refreshToken);

    const newAccessToken = randomUUID();
    this.tokens.set(newAccessToken, {
      token: newAccessToken,
      type: "access",
      clientId: client.client_id,
      scopes: tokenData.scopes,
      expiresAt: Date.now() + this.tokenLifetimeMs,
      resource: tokenData.resource,
    });

    const newRefreshToken = randomUUID();
    this.tokens.set(newRefreshToken, {
      token: newRefreshToken,
      type: "refresh",
      clientId: client.client_id,
      scopes: tokenData.scopes,
      expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
      resource: tokenData.resource,
    });

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: Math.floor(this.tokenLifetimeMs / 1000),
      refresh_token: newRefreshToken,
      scope: tokenData.scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenData = this.tokens.get(token);
    // Reject if missing, expired, or NOT an access token (refresh token
    // presented as bearer). Uniform error to avoid info leak.
    if (
      !tokenData ||
      tokenData.type !== "access" ||
      tokenData.expiresAt < Date.now()
    ) {
      throw new Error("Invalid or expired token");
    }
    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes,
      expiresAt: Math.floor(tokenData.expiresAt / 1000),
      resource: tokenData.resource,
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string }
  ): Promise<void> {
    this.tokens.delete(request.token);
  }
}
