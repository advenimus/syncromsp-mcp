import { randomBytes } from "node:crypto";
import type { RequestHandler, Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidTokenError,
  InvalidGrantError,
  InvalidScopeError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { createSealer, type Sealer } from "./token-crypto.js";
import { StatelessClientsStore } from "./client-store.js";
import {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  Denylist,
  clientRef,
  grantFromPayload,
  issueToken,
  openToken,
  randomId,
  type TokenGrant,
  type TokenPayload,
} from "./tokens.js";
import { AttemptLimiter } from "./login-limiter.js";
import { isSubdomainAllowed, type SubdomainPolicy, type SyncroCredentials } from "./subdomain.js";
import { verifySyncroCredentials, isPlausibleApiKey } from "./verify-credentials.js";
import {
  GENERIC_SIGN_IN_ERROR,
  renderLoginPage,
  renderMessagePage,
  sendHtml,
} from "./login-page.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PENDING_AUTHS = 10_000;
const MAX_CODES = 10_000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

interface CodeData {
  clientRef: string;
  params: AuthorizationParams;
  creds: SyncroCredentials;
  createdAt: number;
}

export interface McpOAuthProviderOptions {
  encryptionKey: Buffer;
  previousEncryptionKeys?: readonly Buffer[];
  subdomainPolicy: SubdomainPolicy;
  now?: () => number;
  verifyTimeoutMs?: number;
}

export interface AuthCallbackInput {
  pendingId: unknown;
  subdomain: unknown;
  apiKey: unknown;
  ip: string;
}

function newPendingId(): string {
  return randomBytes(24).toString("base64url");
}

function insertCapped<V>(map: Map<string, V>, key: string, value: V, cap: number): void {
  map.set(key, value);
  while (map.size > cap) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/**
 * OAuth provider where each user signs in with their own Syncro subdomain
 * and API key. Nothing is persisted: client registrations and tokens are
 * AES-GCM sealed blobs, so they survive restarts; only short-lived pending
 * sign-ins, auth codes, and the revocation denylist live in memory.
 */
export class McpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: StatelessClientsStore;
  private readonly tokenSealer: Sealer;
  private readonly policy: SubdomainPolicy;
  private readonly now: () => number;
  private readonly verifyTimeoutMs: number | undefined;
  private readonly pendingAuths = new Map<string, PendingAuth>();
  private readonly codes = new Map<string, CodeData>();
  private readonly denylist = new Denylist();
  private readonly loginLimiter = new AttemptLimiter({
    max: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
  });
  private sweepInterval: ReturnType<typeof setInterval> | null;

  constructor(options: McpOAuthProviderOptions) {
    const keys = [options.encryptionKey, ...(options.previousEncryptionKeys ?? [])];
    this.tokenSealer = createSealer("token", keys);
    this.clientsStore = new StatelessClientsStore(createSealer("client", keys));
    this.policy = options.subdomainPolicy;
    this.now = options.now ?? Date.now;
    this.verifyTimeoutMs = options.verifyTimeoutMs;

    this.sweepInterval = setInterval(() => this._sweepExpired(), SWEEP_INTERVAL_MS);
    this.sweepInterval.unref?.();
  }

  _sweepExpired(now: number = this.now()): void {
    for (const [key, value] of [...this.codes]) {
      if (now - value.createdAt > CODE_TTL_MS) this.codes.delete(key);
    }
    for (const [key, value] of [...this.pendingAuths]) {
      if (now - value.createdAt > PENDING_AUTH_TTL_MS) this.pendingAuths.delete(key);
    }
    this.denylist.sweep(now);
    this.loginLimiter.sweep(now);
  }

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
    this._sweepExpired();
    const pendingId = this.createPending(client, params);
    sendHtml(res, 200, this.loginPage(pendingId, client, params));
  }

  async handleAuthCallback(input: AuthCallbackInput, res: Response): Promise<void> {
    const pendingId = typeof input.pendingId === "string" ? input.pendingId : "";
    const pending = this.takePending(pendingId);
    if (!pending) {
      sendHtml(
        res,
        400,
        renderMessagePage(
          "Sign-in expired",
          "This sign-in request has expired or was already used. Start the connection again from your app."
        )
      );
      return;
    }

    // Taken before the Syncro check so parallel guesses can't all slip past
    // the limit; refunded on success so a team behind one NAT isn't locked
    // out by its own sign-ins.
    const attemptAt = this.now();
    if (!this.loginLimiter.tryConsume(input.ip, attemptAt)) {
      console.error("Sign-in rejected: too many attempts from one address");
      sendHtml(
        res,
        429,
        renderMessagePage(
          "Too many attempts",
          "Too many sign-in attempts. Wait 15 minutes, then start the connection again from your app."
        )
      );
      return;
    }

    const creds = await this.checkCredentials(input.subdomain, input.apiKey);
    if (!creds) {
      console.error("Sign-in rejected: credentials did not verify");
      const retryId = this.createPending(pending.client, pending.params);
      sendHtml(
        res,
        403,
        this.loginPage(retryId, pending.client, pending.params, GENERIC_SIGN_IN_ERROR)
      );
      return;
    }

    this.loginLimiter.refund(input.ip, attemptAt);
    res.redirect(this.issueCode(pending, creds));
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) throw new InvalidGrantError("Invalid authorization code");
    return codeData.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string
  ): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    // Burn on first use, before any other check, so a stolen code can't be probed.
    this.codes.delete(authorizationCode);
    if (
      !codeData ||
      codeData.clientRef !== clientRef(client.client_id) ||
      this.now() - codeData.createdAt > CODE_TTL_MS ||
      (redirectUri !== undefined && redirectUri !== codeData.params.redirectUri)
    ) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    return this.mintTokens({
      creds: codeData.creds,
      clientRef: codeData.clientRef,
      scopes: codeData.params.scopes ?? [],
      family: randomId(),
      ...(codeData.params.resource ? { resource: codeData.params.resource.href } : {}),
    });
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[]
  ): Promise<OAuthTokens> {
    const payload = openToken(this.tokenSealer, "refresh", refreshToken, this.now());
    if (!payload || payload.cid !== clientRef(client.client_id)) {
      throw new InvalidGrantError("Invalid or expired refresh token");
    }
    if (this.denylist.has(`fam:${payload.fam}`)) {
      throw new InvalidGrantError("Invalid or expired refresh token");
    }
    if (this.denylist.has(`jti:${payload.jti}`)) {
      // A spent refresh token came back: assume it was stolen and kill the chain.
      this.revokeFamily(payload);
      throw new InvalidGrantError("Invalid or expired refresh token");
    }
    if (scopes && scopes.some((s) => !payload.scp.includes(s))) {
      throw new InvalidScopeError("Requested scope exceeds the original grant");
    }
    this.denylist.add(`jti:${payload.jti}`, payload.exp);
    // RFC 6749 section 6: the access token may be narrowed, the refresh token keeps the original scope.
    return this.mintTokens(grantFromPayload(payload), scopes);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const payload = openToken(this.tokenSealer, "access", token, this.now());
    if (
      !payload ||
      this.denylist.has(`jti:${payload.jti}`) ||
      this.denylist.has(`fam:${payload.fam}`)
    ) {
      throw new InvalidTokenError("Invalid or expired token");
    }
    return {
      token,
      clientId: payload.cid,
      scopes: payload.scp,
      expiresAt: Math.floor(payload.exp / 1000),
      ...(payload.res ? { resource: new URL(payload.res) } : {}),
      extra: { syncro: { subdomain: payload.sub, apiKey: payload.key } },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const now = this.now();
    const ref = clientRef(client.client_id);
    const refresh = openToken(this.tokenSealer, "refresh", request.token, now);
    if (refresh && refresh.cid === ref) {
      this.revokeFamily(refresh);
      return;
    }
    const access = openToken(this.tokenSealer, "access", request.token, now);
    if (access && access.cid === ref) {
      this.denylist.add(`jti:${access.jti}`, access.exp);
    }
  }

  private revokeFamily(payload: TokenPayload): void {
    this.denylist.add(`fam:${payload.fam}`, this.now() + REFRESH_TOKEN_TTL_MS);
  }

  private mintTokens(grant: TokenGrant, accessScopes: string[] = grant.scopes): OAuthTokens {
    const now = this.now();
    const access = issueToken(this.tokenSealer, "access", { ...grant, scopes: accessScopes }, now);
    const refresh = issueToken(this.tokenSealer, "refresh", grant, now);
    return {
      access_token: access.token,
      token_type: "bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refresh.token,
      scope: accessScopes.join(" "),
    };
  }

  private createPending(client: OAuthClientInformationFull, params: AuthorizationParams): string {
    const pendingId = newPendingId();
    insertCapped(
      this.pendingAuths,
      pendingId,
      { client, params, createdAt: this.now() },
      MAX_PENDING_AUTHS
    );
    return pendingId;
  }

  /** Single use: the pending entry is removed whatever happens next. */
  private takePending(pendingId: string): PendingAuth | undefined {
    const pending = this.pendingAuths.get(pendingId);
    this.pendingAuths.delete(pendingId);
    if (!pending || this.now() - pending.createdAt > PENDING_AUTH_TTL_MS) return undefined;
    return pending;
  }

  private async checkCredentials(
    rawSubdomain: unknown,
    rawApiKey: unknown
  ): Promise<SyncroCredentials | undefined> {
    const subdomain =
      this.policy.kind === "locked"
        ? this.policy.subdomain
        : typeof rawSubdomain === "string"
          ? rawSubdomain.trim().toLowerCase()
          : undefined;
    if (typeof subdomain !== "string" || !isSubdomainAllowed(this.policy, subdomain)) {
      return undefined;
    }
    const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";
    if (!isPlausibleApiKey(apiKey)) return undefined;
    const creds = { subdomain, apiKey };
    const ok = await verifySyncroCredentials(creds, { timeoutMs: this.verifyTimeoutMs });
    return ok ? creds : undefined;
  }

  private issueCode(pending: PendingAuth, creds: SyncroCredentials): string {
    const code = randomBytes(32).toString("base64url");
    insertCapped(
      this.codes,
      code,
      {
        clientRef: clientRef(pending.client.client_id),
        params: pending.params,
        creds,
        createdAt: this.now(),
      },
      MAX_CODES
    );
    const redirectUrl = new URL(pending.params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (pending.params.state !== undefined) {
      redirectUrl.searchParams.set("state", pending.params.state);
    }
    return redirectUrl.toString();
  }

  private loginPage(
    pendingId: string,
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    error?: string
  ): string {
    return renderLoginPage({
      pendingId,
      clientLabel: client.client_name || "Unnamed client",
      redirectUri: params.redirectUri,
      policy: this.policy,
      ...(error ? { error } : {}),
    });
  }
}

/** Express handler for the login form post. Reads only the fields it needs. */
export function createAuthCallbackHandler(provider: McpOAuthProvider): RequestHandler {
  return async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    await provider.handleAuthCallback(
      {
        pendingId: body.pending_id,
        subdomain: body.subdomain,
        apiKey: body.api_key,
        ip: req.ip ?? "unknown",
      },
      res
    );
  };
}
