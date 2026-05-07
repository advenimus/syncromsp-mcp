# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities by opening a draft GitHub Security Advisory at https://github.com/advenimus/syncromsp-mcp/security/advisories/new. Do NOT open a public issue for security reports.

We aim to respond within 72 hours.

## Threat Model

This MCP server is designed to be exposed to the public internet to allow connections from Claude.ai connectors, Claude Desktop, and other remote MCP clients. Security guarantees rest on:

1. **OAuth 2.1 with PKCE** at the HTTP edge — all `/mcp` requests require a bearer token issued via the OAuth flow.
2. **MCP_AUTH_SECRET-gated consent** — the OAuth authorize page requires a shared secret known only to the operator. Without it, no client can complete the OAuth handshake.
3. **Open Dynamic Client Registration with anti-phishing UI** — the consent page displays the client name (HTML-escaped) and the full `redirect_uri` so users can verify the destination before entering the secret.
4. **Container hardening** — the published Docker image runs as a non-root user with `read_only: true`, `cap_drop: ALL`, and `no-new-privileges:true` in the recommended compose configuration.

## Operator Responsibilities

When deploying the HTTP transport publicly, you MUST:

- Set `MCP_AUTH_SECRET` to a strong value (≥32 chars, generated with `openssl rand -hex 32`). The server refuses to start with weak or default values.
- Front the container with a TLS-terminating reverse proxy (Caddy, Traefik, nginx). The container should NOT be reachable directly without TLS.
- Pin the Docker image to a specific version tag. Never use `:latest` in production.
- Rotate `MCP_AUTH_SECRET` periodically and after any suspected compromise. Restarting the container clears all in-memory tokens.
- Monitor logs for unexpected `/authorize`, `/register`, and `/token` activity. Brute-force attempts will be rate-limited (100 authorize / 15 min, 20 register / hr) by the MCP SDK.

You SHOULD:

- Set `MCP_BASE_URL` to your public HTTPS URL so OAuth metadata and redirects use the correct origin.
- Disable open client registration if you control all clients (currently requires patching the SDK provider — open an issue if needed).
- Run on a host that supports `read_only`, `cap_drop`, `tmpfs`, and `no-new-privileges` (Linux with a modern kernel).

You MUST NEVER:

- Disable OAuth (`MCP_AUTH=false`) on a public-facing deployment. The server requires `MCP_I_UNDERSTAND_INSECURE=true` as an explicit foot-gun guard for non-public deployments.
- Commit `.env` or any file containing `SYNCRO_API_KEY` or `MCP_AUTH_SECRET`.
- Share your `MCP_AUTH_SECRET` in screenshots, logs, or chat — it is equivalent to root credentials for your SyncroMSP tenant.

## Defense Layers

| Layer | Mechanism |
|-------|-----------|
| Network | Reverse proxy + TLS + bind to 127.0.0.1 (compose default in this repo) |
| Authentication | OAuth 2.1 + PKCE + MCP_AUTH_SECRET gate |
| Authorization | Bearer-token-required on `/mcp`; per-token expiry (24h access / 30d refresh w/ rotation) |
| Anti-phishing | Consent page displays client name + redirect_uri; HTML-escaped; CSP `default-src 'none'` |
| Rate limiting | 100/15min on `/authorize`; 20/hr on `/register` (provided by MCP SDK) |
| Container | non-root, read-only rootfs, all capabilities dropped, no-new-privileges, tmpfs `/tmp` |
| Supply chain | Pinned image versions; npm ci against committed lockfile |

## Known Acceptable Risks

After updating to `@modelcontextprotocol/sdk@1.29.0` and running `npm audit --omit=dev`, four moderate-severity advisories remain. All are transitive dependencies pulled in by the MCP SDK and cannot be resolved in this project until the SDK author updates them upstream:

| Package | Advisory | Why this server is not affected |
|---------|----------|---------------------------------|
| `@hono/node-server` <1.19.13 | Middleware bypass via repeated slashes in `serveStatic` ([GHSA-92pp-h63x-v22m](https://github.com/advisories/GHSA-92pp-h63x-v22m)) | This server uses **Express + StreamableHTTPServerTransport**, not Hono's HTTP server. The vulnerable `serveStatic` middleware is never instantiated. |
| `hono` <=4.12.15 | Multiple — `setCookie`/`getCookie` validation, path traversal in `toSSG`, `serveStatic` slash bypass, JSX SSR HTML injection, IPv4-mapped IPv6 in `ipRestriction`, `bodyLimit` chunked-encoding bypass | None of Hono's cookie helpers, static-site generator, JSX SSR, IP-restriction middleware, or body-limit middleware are reachable from this server's request path. The Hono package is loaded only as a transitive dep of the SDK. |
| `express-rate-limit` 8.0.1–8.5.0 | Depends on vulnerable `ip-address` versions | This server does not invoke `express-rate-limit` directly. Where rate limiting applies (`/authorize`, `/register`), it is provided by the MCP SDK and does not pass user-controlled input through `Address6` HTML emitters. |
| `ip-address` <=10.1.0 | XSS in `Address6` HTML-emitting methods ([GHSA-v2v4-37r5-5v8g](https://github.com/advisories/GHSA-v2v4-37r5-5v8g)) | Exploitation requires calling `Address6.prototype.to6to4()` / `inspectTeredo()`-style HTML emitters with attacker-controlled data and rendering the result. This server never calls those methods. |

These advisories will clear automatically once the MCP SDK publishes a release that updates Hono and its dependents. We re-run `npm audit --omit=dev` on every release and will revisit this section as upstream fixes land.

## Versioning

Security patches are released as patch versions (e.g., `0.1.x`). The CHANGELOG and release notes call out security-relevant changes explicitly. Subscribe to GitHub releases for notifications.
