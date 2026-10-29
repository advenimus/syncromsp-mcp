import { createHash, randomBytes } from "node:crypto";
import type { Sealer } from "./token-crypto.js";
import { isValidSubdomain, type SyncroCredentials } from "./subdomain.js";
import { isPlausibleApiKey } from "./verify-credentials.js";

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_VERSION = 1;

export type TokenType = "access" | "refresh";

export interface TokenPayload {
  v: typeof TOKEN_VERSION;
  typ: TokenType;
  sub: string;
  key: string;
  cid: string;
  scp: string[];
  iat: number;
  exp: number;
  jti: string;
  /** Shared by every token descended from one sign-in, so a whole chain can be revoked. */
  fam: string;
  res?: string;
}

export interface TokenGrant {
  creds: SyncroCredentials;
  clientRef: string;
  scopes: string[];
  family: string;
  resource?: string;
}

export function randomId(): string {
  return randomBytes(16).toString("base64url");
}

/** client_ids are large sealed blobs; tokens carry a short digest instead. */
export function clientRef(clientId: string): string {
  return createHash("sha256").update(clientId).digest("base64url").slice(0, 22);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((s) => typeof s === "string");
}

function isTokenPayload(value: unknown, typ: TokenType): value is TokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.v === TOKEN_VERSION &&
    p.typ === typ &&
    isValidSubdomain(p.sub) &&
    isPlausibleApiKey(p.key) &&
    typeof p.cid === "string" &&
    isStringArray(p.scp) &&
    typeof p.iat === "number" &&
    typeof p.exp === "number" &&
    typeof p.jti === "string" &&
    typeof p.fam === "string" &&
    (p.res === undefined || typeof p.res === "string")
  );
}

export function issueToken(
  sealer: Sealer,
  typ: TokenType,
  grant: TokenGrant,
  now: number
): { token: string; payload: TokenPayload } {
  const ttl = typ === "access" ? ACCESS_TOKEN_TTL_MS : REFRESH_TOKEN_TTL_MS;
  const payload: TokenPayload = {
    v: TOKEN_VERSION,
    typ,
    sub: grant.creds.subdomain,
    key: grant.creds.apiKey,
    cid: grant.clientRef,
    scp: [...grant.scopes],
    iat: now,
    exp: now + ttl,
    jti: randomId(),
    fam: grant.family,
    ...(grant.resource ? { res: grant.resource } : {}),
  };
  return { token: sealer.seal(typ, payload), payload };
}

/** Returns the payload only if it decrypts, has the right type, and is unexpired. */
export function openToken(
  sealer: Sealer,
  typ: TokenType,
  token: string,
  now: number
): TokenPayload | undefined {
  const payload = sealer.unseal(typ, token);
  if (!isTokenPayload(payload, typ)) return undefined;
  return payload.exp > now ? payload : undefined;
}

export function grantFromPayload(payload: TokenPayload): TokenGrant {
  return {
    creds: { subdomain: payload.sub, apiKey: payload.key },
    clientRef: payload.cid,
    scopes: payload.scp,
    family: payload.fam,
    ...(payload.res ? { resource: payload.res } : {}),
  };
}

/**
 * Revoked or spent token ids, kept until the tokens would have expired
 * anyway. In memory, so it resets on restart.
 */
export class Denylist {
  private readonly entries = new Map<string, number>();

  add(id: string, expiresAt: number): void {
    const current = this.entries.get(id) ?? 0;
    this.entries.set(id, Math.max(current, expiresAt));
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get size(): number {
    return this.entries.size;
  }

  sweep(now: number): void {
    for (const [id, expiresAt] of [...this.entries]) {
      if (expiresAt <= now) this.entries.delete(id);
    }
  }
}
