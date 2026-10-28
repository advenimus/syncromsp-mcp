const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type SubdomainPolicy =
  | { kind: "locked"; subdomain: string }
  | { kind: "allowlist"; subdomains: ReadonlySet<string> }
  | { kind: "any" };

export interface SyncroCredentials {
  subdomain: string;
  apiKey: string;
}

export function isValidSubdomain(value: unknown): value is string {
  return typeof value === "string" && SUBDOMAIN_RE.test(value);
}

export function isSubdomainAllowed(policy: SubdomainPolicy, subdomain: string): boolean {
  if (!isValidSubdomain(subdomain)) return false;
  switch (policy.kind) {
    case "locked":
      return subdomain === policy.subdomain;
    case "allowlist":
      return policy.subdomains.has(subdomain);
    case "any":
      return true;
  }
}

/**
 * The only place a Syncro host is built from user input. The strict
 * single-label regex is what keeps it pinned to *.syncromsp.com.
 */
export function syncroBaseUrl(subdomain: string): string {
  if (!isValidSubdomain(subdomain)) {
    throw new Error("Invalid Syncro subdomain");
  }
  return `https://${subdomain}.syncromsp.com`;
}
