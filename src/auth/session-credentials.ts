import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { isValidSubdomain, type SyncroCredentials } from "./subdomain.js";
import { isPlausibleApiKey } from "./verify-credentials.js";

/** Pulls the Syncro credentials that verifyAccessToken placed in AuthInfo.extra. */
export function credentialsFromAuth(auth: AuthInfo | undefined): SyncroCredentials | undefined {
  const syncro = auth?.extra?.syncro as Partial<SyncroCredentials> | undefined;
  if (!syncro || !isValidSubdomain(syncro.subdomain) || !isPlausibleApiKey(syncro.apiKey)) {
    return undefined;
  }
  return { subdomain: syncro.subdomain, apiKey: syncro.apiKey };
}

export type Fingerprinter = (creds: SyncroCredentials) => string;

/**
 * Keyed with a per-process random secret: sessions live in memory, so the
 * fingerprint never needs to outlive the process, and it is never derived
 * from anything an attacker could compute offline.
 */
export function createFingerprinter(): Fingerprinter {
  const key = randomBytes(32);
  return (creds) =>
    createHmac("sha256", key).update(`${creds.subdomain}\n${creds.apiKey}`).digest("base64url");
}

export function sameFingerprint(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
