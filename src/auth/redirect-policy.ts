export interface RedirectRule {
  protocol: string;
  hostname: string;
  port: string | null;
  pathPrefix: string;
}

function toRule(entry: string): RedirectRule {
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    throw new Error(`MCP_ALLOWED_REDIRECT_URIS has an entry that is not a URL: ${entry}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`MCP_ALLOWED_REDIRECT_URIS entries must be http(s) URLs: ${entry}`);
  }
  // An entry without a port (e.g. http://localhost) allows any port, which is
  // what native clients need: they pick a random loopback port per sign-in.
  const explicitPort = /^[a-z]+:\/\/[^/]*:\d+/i.test(entry);
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: explicitPort ? url.port : null,
    pathPrefix: url.pathname === "/" && !entry.endsWith("/") ? "" : url.pathname,
  };
}

export function parseRedirectAllowlist(raw: string): RedirectRule[] {
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) {
    throw new Error("MCP_ALLOWED_REDIRECT_URIS is set but lists no URLs.");
  }
  return entries.map(toRule);
}

export function isRedirectAllowed(uri: string, rules: readonly RedirectRule[]): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  return rules.some(
    (rule) =>
      url.protocol === rule.protocol &&
      url.hostname === rule.hostname &&
      (rule.port === null || url.port === rule.port) &&
      (rule.pathPrefix === "" ? true : url.pathname === rule.pathPrefix || isPathUnder(url.pathname, rule.pathPrefix))
  );
}

function isPathUnder(path: string, prefix: string): boolean {
  return prefix.endsWith("/") && path.startsWith(prefix);
}
