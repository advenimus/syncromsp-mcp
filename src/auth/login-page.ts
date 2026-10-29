import type { Response } from "express";
import type { SubdomainPolicy } from "./subdomain.js";

export const GENERIC_SIGN_IN_ERROR =
  "Sign-in failed. Check your Syncro subdomain and API key, then try again.";

/**
 * HTML-escape attacker-controllable values before interpolating into
 * the rendered HTML response. Escapes &, <, >, ", ', `, /
 * to defeat stored XSS via the open OAuth Dynamic Client Registration
 * endpoint (e.g. malicious client_name).
 */
export function escHtml(s: unknown): string {
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
 * CSP forbids all script execution and external loads; frame-ancestors and
 * X-Frame-Options block clickjacking; no-store keeps the form out of caches.
 */
export function applySecurityHeaders(res: Response): void {
  // Deliberately no `form-action`: it also governs the 302 that follows the
  // form post, and would block the cross-origin redirect to the client's
  // registered redirect_uri.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
}

const STYLES = `
    body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { background: #1e293b; padding: 2rem; border-radius: 12px; max-width: 440px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: #f8fafc; }
    p { font-size: 0.875rem; color: #94a3b8; margin: 0 0 1.25rem; }
    label { display: block; font-size: 0.875rem; margin: 0 0 0.5rem; color: #cbd5e1; }
    .field { margin-bottom: 1rem; }
    .host { display: flex; align-items: center; gap: 0.375rem; }
    .host span { font-size: 0.875rem; color: #94a3b8; white-space: nowrap; }
    input[type="text"], input[type="password"] { width: 100%; padding: 0.75rem; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #f8fafc; font-size: 1rem; box-sizing: border-box; }
    input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
    button { width: 100%; padding: 0.75rem; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; margin-top: 0.5rem; }
    button:hover { background: #2563eb; }
    .error { color: #fca5a5; background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 0.625rem 0.75rem; font-size: 0.875rem; margin: 0 0 1rem; }
    .tenant { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #f8fafc; }
    .hint { font-size: 0.75rem; color: #64748b; margin: 0.5rem 0 0; line-height: 1.4; }
    .client-info { font-size: 0.75rem; color: #64748b; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #334155; word-break: break-all; }
    .redirect-info { border: 1px solid #334155; border-radius: 8px; padding: 0.75rem 1rem; margin: 0 0 1.25rem; background: #0b1220; }
    .redirect-info strong { display: block; font-size: 0.8125rem; color: #cbd5e1; margin-bottom: 0.5rem; font-weight: 600; }
    .redirect-info code { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem; color: #f8fafc; background: #020617; padding: 0.5rem 0.625rem; border-radius: 6px; word-break: break-all; }
    .redirect-info .warning { font-size: 0.75rem; color: #fbbf24; margin: 0.625rem 0 0; line-height: 1.4; }
    .center { text-align: center; }
    .center h1 { color: #f87171; }`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>${escHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${STYLES}
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function subdomainField(policy: SubdomainPolicy): string {
  if (policy.kind === "locked") {
    return `<p>Signing in to <span class="tenant">${escHtml(policy.subdomain)}.syncromsp.com</span></p>`;
  }
  return `<div class="field">
        <label for="subdomain">Syncro subdomain</label>
        <div class="host">
          <input type="text" id="subdomain" name="subdomain" required maxlength="63" pattern="[a-z0-9]([a-z0-9\\-]{0,61}[a-z0-9])?" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="yourcompany" autofocus>
          <span>.syncromsp.com</span>
        </div>
      </div>`;
}

export interface LoginPageInput {
  pendingId: string;
  clientLabel: string;
  redirectUri: string;
  policy: SubdomainPolicy;
  error?: string;
}

export function renderLoginPage(input: LoginPageInput): string {
  const errorBlock = input.error
    ? `<div class="error" role="alert">${escHtml(input.error)}</div>`
    : "";
  const keyAutofocus = input.policy.kind === "locked" ? " autofocus" : "";
  return page(
    "SyncroMSP MCP - Sign in",
    `  <div class="card">
    <h1>Sign in with your Syncro API key</h1>
    <p>Your key is checked with Syncro, then kept only inside your encrypted sign-in token. This server does not store it.</p>
    <div class="redirect-info">
      <strong>After sign-in, you will be redirected to:</strong>
      <code>${escHtml(input.redirectUri)}</code>
      <p class="warning">Only proceed if this destination is expected. If you don't recognize this address, close this page.</p>
    </div>
    ${errorBlock}
    <form method="POST" action="/authorize/callback" autocomplete="off">
      <input type="hidden" name="pending_id" value="${escHtml(input.pendingId)}">
      ${subdomainField(input.policy)}
      <div class="field">
        <label for="api_key">Syncro API key</label>
        <input type="password" id="api_key" name="api_key" required maxlength="512" autocomplete="off" spellcheck="false"${keyAutofocus}>
        <p class="hint">Create one in Syncro under Admin &gt; API Tokens. Its permissions decide what you can do here.</p>
      </div>
      <button type="submit">Sign in</button>
    </form>
    <div class="client-info">Client: ${escHtml(input.clientLabel)}</div>
  </div>`
  );
}

export function renderMessagePage(title: string, message: string): string {
  return page(
    title,
    `  <div class="card center">
    <h1>${escHtml(title)}</h1>
    <p>${escHtml(message)}</p>
  </div>`
  );
}

export function sendHtml(res: Response, status: number, html: string): void {
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(status).send(html);
}
