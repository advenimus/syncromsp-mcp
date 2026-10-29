# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities by opening a draft GitHub Security Advisory at https://github.com/advenimus/syncromsp-mcp/security/advisories/new. Do NOT open a public issue for security reports.

We aim to respond within 72 hours.

## Threat Model

This MCP server is designed to be exposed to the public internet to allow connections from Claude.ai connectors, Claude Desktop, and other remote MCP clients. Security guarantees rest on:

1. **OAuth 2.1 with PKCE** at the HTTP edge. All `/mcp` requests require a bearer token issued via the OAuth flow.
2. **Bring your own Syncro key.** The sign-in page asks each user for their Syncro subdomain and API key. The server checks the key with a live call to `https://<subdomain>.syncromsp.com/api/v1/me` and issues tokens only if Syncro answers OK. Each MCP session then calls Syncro with that user's key, so Syncro's own per-key permissions apply.
3. **Credentials live only inside encrypted tokens.** There is no credential database. The subdomain and key are sealed inside the access and refresh tokens with AES-256-GCM, keyed from `MCP_TOKEN_ENCRYPTION_KEY`.
4. **Open Dynamic Client Registration with anti-phishing UI.** The sign-in page displays the client name (HTML-escaped) and the full `redirect_uri` so users can verify the destination before entering their key.
5. **Container hardening.** The published Docker image runs as a non-root user with `read_only: true`, `cap_drop: ALL`, and `no-new-privileges:true` in the recommended compose configuration.

### How tokens are built

- Access tokens (1 hour) and refresh tokens (30 days) are `v1.` + base64url(IV ‖ ciphertext ‖ GCM tag). The plaintext is a small JSON payload: version, type, subdomain, API key, client reference, scopes, issued/expiry times, a random token id, and a sign-in "family" id.
- Every token gets a fresh random 96-bit IV. The token type and format version are bound into the GCM additional data, so a refresh token can't be replayed as an access token or the other way round, and any tampering fails authentication.
- Separate subkeys are derived with HKDF-SHA256 for tokens and for client registrations, so one kind of blob can't be passed off as the other.
- OAuth client registrations are stateless too: the `client_id` is the sealed registration metadata (capped at 4 KB). `redirect_uris` are read back from that authenticated blob, so they can't be changed by the client.
- Session ids are bound to their owner with an HMAC fingerprint of the subdomain and key (random per-process HMAC key). A request whose token doesn't match the session owner gets the same 404 as an unknown session.

### What a stolen token gives an attacker

- **A stolen access token** lets the holder use this MCP server as that user, with that user's Syncro permissions, until it expires (at most 1 hour) or is revoked.
- **A stolen refresh token** lets the holder keep minting access tokens for up to 30 days. Refresh tokens rotate on every use, and presenting a spent one revokes the whole sign-in family, so a thief and the real user collide quickly.
- **A token alone does not reveal the Syncro API key.** It is encrypted. An attacker needs both a token and `MCP_TOKEN_ENCRYPTION_KEY` to read the key out and use it against Syncro directly.
- **`MCP_TOKEN_ENCRYPTION_KEY` alone** lets an attacker forge tokens for any subdomain and key they already know, and decrypt any token they capture. Treat it as the most sensitive secret in the deployment.

### Revocation

- **The real kill switch is deleting the API key in Syncro** (Admin > API Tokens). Every token that carries it stops working at Syncro immediately, whatever this server remembers.
- `/revoke` and refresh-token reuse detection use an in-memory denylist of token ids and sign-in families, kept until the tokens would expire and swept every 5 minutes. **The denylist resets on restart.** After a restart, a revoked but unexpired token, or a spent refresh token, is accepted again until it expires.
- Changing `MCP_TOKEN_ENCRYPTION_KEY` (without keeping the old one as `MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS`) invalidates every token and client registration at once.

### Sign-in hardening

- The subdomain must match `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`. The server always builds `https://<subdomain>.syncromsp.com` itself and does not follow redirects, so the sign-in check can't be turned into a request to another host (SSRF).
- `SYNCRO_SUBDOMAIN` locks sign-in to one subdomain; otherwise `MCP_ALLOWED_SUBDOMAINS` or an explicit `MCP_ALLOW_ANY_SUBDOMAIN=true` is required. The server refuses to start without one of them.
- The verification call has a 5 second timeout. Only a 2xx passes. Every failure (bad subdomain, not allowed, 401, timeout, network error) shows the same generic message.
- Failed sign-in attempts are limited to 5 per IP per 15 minutes (in memory). Successful sign-ins do not count. Each pending sign-in accepts exactly one attempt.
- The key is never placed in a URL, a log line, or an error page. Errors from Syncro calls are scrubbed of the key before they reach the MCP client. Auth codes hold the verified credentials in memory for at most 10 minutes, until they are exchanged.

## Operator Responsibilities

When deploying the HTTP transport publicly, you MUST:

- Set `MCP_TOKEN_ENCRYPTION_KEY` to 32 random bytes (`openssl rand -hex 32`). The server refuses to start without a valid, high-entropy key.
- Store `MCP_TOKEN_ENCRYPTION_KEY` like a root credential: in a secret manager or an `.env` file readable only by the deploy user. Never in git, images, screenshots, or chat.
- Restrict who may sign in with `SYNCRO_SUBDOMAIN` or `MCP_ALLOWED_SUBDOMAINS`. Use `MCP_ALLOW_ANY_SUBDOMAIN=true` only if you really mean to serve any Syncro tenant.
- Front the container with a TLS-terminating reverse proxy (Caddy, Traefik, nginx). The container should NOT be reachable directly without TLS. The app trusts exactly one proxy hop for the client IP (`trust proxy = 1`); if the container is reachable without a proxy, callers can spoof `X-Forwarded-For` and dodge the per-IP sign-in limit.
- Pin the Docker image to a specific version tag. Never use `:latest` in production.
- Monitor logs for unexpected `/authorize`, `/register`, `/token`, and "Sign-in rejected" activity. Besides the sign-in limit above, the MCP SDK rate-limits `/authorize` (100 / 15 min) and `/register` (20 / hr).

You SHOULD:

- Set `MCP_BASE_URL` to your public HTTPS URL so OAuth metadata and redirects use the correct origin.
- Ask users to create a dedicated Syncro API token for MCP use, with only the permissions they need, so it can be deleted without affecting anything else.
- Rotate `MCP_TOKEN_ENCRYPTION_KEY` periodically using `MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS` (see README). After a suspected leak, replace it outright and have users re-create their Syncro API keys.
- Run on a host that supports `read_only`, `cap_drop`, `tmpfs`, and `no-new-privileges` (Linux with a modern kernel).

You MUST NEVER:

- Disable OAuth (`MCP_AUTH=false`) on a public-facing deployment. The server requires `MCP_I_UNDERSTAND_INSECURE=true` as an explicit foot-gun guard for non-public deployments. In that mode every session shares one `SYNCRO_API_KEY` from the environment.
- Commit `.env` or any file containing `MCP_TOKEN_ENCRYPTION_KEY` or a `SYNCRO_API_KEY`.

### Phishing through open registration

Registration is open, so anyone can register a client with their own `redirect_uri` and send a user a sign-in link. If the user enters their Syncro key on that page, the attacker's client receives tokens for the user's account (the attacker still never sees the raw key). The sign-in page shows the destination `redirect_uri` for exactly this reason.

Close this gap by setting `MCP_ALLOWED_REDIRECT_URIS` to the clients you actually use, for example `https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback,http://localhost,http://127.0.0.1`. Registration is then refused for any other destination, and clients registered earlier with another destination stop working. An entry without a port (like `http://localhost`) allows any port, which native clients need.

## Defense Layers

| Layer | Mechanism |
|-------|-----------|
| Network | Reverse proxy + TLS + bind to 127.0.0.1 (compose default in this repo) |
| Authentication | OAuth 2.1 + PKCE; each user's own Syncro key, verified live against Syncro |
| Credential storage | None on disk; subdomain + key sealed in AES-256-GCM tokens (HKDF subkeys, random IV, type-bound AAD) |
| Authorization | Bearer token required on `/mcp`; 1h access / 30d refresh with rotation and reuse detection; sessions bound to their owner; Syncro per-key permissions |
| Anti-phishing | Sign-in page displays client name + redirect_uri; HTML-escaped; CSP `default-src 'none'`; optional `MCP_ALLOWED_REDIRECT_URIS` allowlist |
| DNS rebinding | Requests whose `Host` isn't the `MCP_BASE_URL` host (or `MCP_ALLOWED_HOSTS`) get 421; `/health` exempt |
| SSRF | Strict single-label subdomain; host always `*.syncromsp.com`; redirects not followed. `file_url` downloads are https-only and refuse private, loopback, link-local, and IPv4-embedding IPv6 ranges, checked at connect time; `file_path` is refused on a hosted server |
| Rate limiting | 5 failed sign-in attempts / 15 min / IP; 100/15min on `/authorize`; 20/hr on `/register` (MCP SDK); outbound Syncro calls 180/min per tenant and 180/min server-wide (`MCP_SERVER_RATE_LIMIT_PER_MINUTE`) |
| Session limits | 1000 sessions total; `MCP_MAX_SESSIONS_PER_USER` (default 25) per signed-in user, so one user can't fill the server |
| Container | non-root, read-only rootfs, all capabilities dropped, no-new-privileges, tmpfs `/tmp` |
| Supply chain | npm ci against committed lockfile; GitHub Actions pinned to commit SHAs with least-privilege per-job permissions; release tooling pinned to exact versions; npm packages published with provenance |

## Known Acceptable Risks

`npm audit` reports no known vulnerabilities in runtime or development dependencies as of `@modelcontextprotocol/sdk@1.32.2` and `zod@4.6.7`. We re-run `npm audit` on every release.

## Versioning

Security patches are released as patch versions (e.g., `0.1.x`). The CHANGELOG and release notes call out security-relevant changes explicitly. Subscribe to GitHub releases for notifications.
