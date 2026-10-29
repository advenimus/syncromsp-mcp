import { isValidSubdomain, syncroBaseUrl, type SyncroCredentials } from "./subdomain.js";

export const DEFAULT_VERIFY_TIMEOUT_MS = 5000;
export const MAX_API_KEY_LENGTH = 512;
const API_KEY_RE = /^[\x21-\x7e]+$/;

export interface VerifyOptions {
  timeoutMs?: number;
}

export function isPlausibleApiKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_API_KEY_LENGTH &&
    API_KEY_RE.test(value)
  );
}

/**
 * Checks the key with a live call to Syncro's "me" endpoint. Resolves to
 * true only for a 2xx; never throws and never surfaces why it failed, so
 * callers can't leak the reason (or the key) to the browser.
 */
export async function verifySyncroCredentials(
  creds: SyncroCredentials,
  options: VerifyOptions = {}
): Promise<boolean> {
  if (!isValidSubdomain(creds.subdomain) || !isPlausibleApiKey(creds.apiKey)) {
    return false;
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
  try {
    const res = await fetch(`${syncroBaseUrl(creds.subdomain)}/api/v1/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: "application/json" },
      // A redirect could point the key at another host.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}
