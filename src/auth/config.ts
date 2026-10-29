import { EncryptionKeyError, parseEncryptionKey } from "./token-crypto.js";
import { isValidSubdomain, type SubdomainPolicy } from "./subdomain.js";

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export interface HttpAuthConfig {
  encryptionKey: Buffer;
  previousEncryptionKeys: Buffer[];
  subdomainPolicy: SubdomainPolicy;
  warnings: string[];
}

function parseKey(raw: string | undefined, name: string): Buffer {
  try {
    return parseEncryptionKey(raw, name);
  } catch (error) {
    if (error instanceof EncryptionKeyError) throw new AuthConfigError(error.message);
    throw error;
  }
}

function parsePreviousKeys(env: NodeJS.ProcessEnv, current: Buffer): Buffer[] {
  const raw = env.MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  if (raw === undefined || raw.trim() === "") return [];
  const previous = parseKey(raw, "MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS");
  if (previous.equals(current)) {
    throw new AuthConfigError(
      "MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS is the same as MCP_TOKEN_ENCRYPTION_KEY. Set it to the old key, or remove it."
    );
  }
  return [previous];
}

function parseAllowlist(raw: string): Set<string> {
  const entries = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (entries.length === 0) {
    throw new AuthConfigError("MCP_ALLOWED_SUBDOMAINS is set but lists no subdomains.");
  }
  const invalid = entries.filter((s) => !isValidSubdomain(s));
  if (invalid.length > 0) {
    throw new AuthConfigError(
      `MCP_ALLOWED_SUBDOMAINS has ${invalid.length} invalid entr${invalid.length === 1 ? "y" : "ies"}. ` +
        "Use bare subdomains like 'mycompany' (lowercase letters, digits, hyphens), separated by commas."
    );
  }
  return new Set(entries);
}

function parseSubdomainPolicy(env: NodeJS.ProcessEnv, warnings: string[]): SubdomainPolicy {
  const locked = env.SYNCRO_SUBDOMAIN?.trim();
  const allowlist = env.MCP_ALLOWED_SUBDOMAINS?.trim();

  if (locked) {
    if (!isValidSubdomain(locked)) {
      throw new AuthConfigError(
        "SYNCRO_SUBDOMAIN must be a bare lowercase subdomain like 'mycompany' (from mycompany.syncromsp.com)."
      );
    }
    if (allowlist) {
      warnings.push(
        "MCP_ALLOWED_SUBDOMAINS is ignored because SYNCRO_SUBDOMAIN locks sign-in to one subdomain."
      );
    }
    return { kind: "locked", subdomain: locked };
  }
  if (allowlist) return { kind: "allowlist", subdomains: parseAllowlist(allowlist) };
  if (env.MCP_ALLOW_ANY_SUBDOMAIN === "true") return { kind: "any" };

  throw new AuthConfigError(
    "HTTP sign-in needs to know which Syncro accounts may sign in. Set ONE of:\n" +
      "  SYNCRO_SUBDOMAIN=mycompany            (lock sign-in to one subdomain)\n" +
      "  MCP_ALLOWED_SUBDOMAINS=acme,beta      (allow a list of subdomains)\n" +
      "  MCP_ALLOW_ANY_SUBDOMAIN=true          (allow any Syncro subdomain)"
  );
}

function legacyWarnings(env: NodeJS.ProcessEnv): string[] {
  const warnings: string[] = [];
  if (env.MCP_AUTH_SECRET) {
    warnings.push(
      "WARNING: MCP_AUTH_SECRET is no longer used and is ignored. Users now sign in with their own Syncro API key. Remove it from your environment."
    );
  }
  if (env.SYNCRO_API_KEY) {
    warnings.push(
      "WARNING: SYNCRO_API_KEY is ignored in HTTP auth mode. Each user signs in with their own key. Remove it from your environment."
    );
  }
  return warnings;
}

/** Reads and validates everything HTTP auth mode needs. Throws AuthConfigError on bad config. */
export function loadHttpAuthConfig(env: NodeJS.ProcessEnv): HttpAuthConfig {
  const encryptionKey = parseKey(env.MCP_TOKEN_ENCRYPTION_KEY, "MCP_TOKEN_ENCRYPTION_KEY");
  const previousEncryptionKeys = parsePreviousKeys(env, encryptionKey);
  const warnings = legacyWarnings(env);
  const subdomainPolicy = parseSubdomainPolicy(env, warnings);
  return { encryptionKey, previousEncryptionKeys, subdomainPolicy, warnings };
}
