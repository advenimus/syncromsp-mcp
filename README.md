# SyncroMSP MCP Server

A fully-featured [Model Context Protocol](https://modelcontextprotocol.io) server for the [SyncroMSP](https://syncromsp.com) IT/MSP platform. Gives AI assistants full access to tickets, customers, assets, invoices, and 30+ resource types.

## Features

- **190 tools** across 16 domains, covering every current endpoint in Syncro's API docs
- **Full CRUD** for tickets, customers, invoices, estimates, appointments, contracts, products, and more
- **Ticket comments** — email replies, public notes, and private/internal notes
- **Line items** — add products from catalog or manual entries to tickets, invoices, estimates, schedules
- **RMM** — create, read, mute, resolve alerts on assets; run scripts on an asset now or once later
- **Rate limiting** — built-in 180 req/min token bucket (Syncro API limit)
- **Confirmation required** for all destructive operations (DELETE, etc.)
- **Auto-update check** — warns on startup if a newer version is available

### Deployment Options

| Method | Best For | Auto-Updates |
|--------|----------|-------------|
| [**Claude Code Plugin**](#bundled-skill) | One-command install of MCP + Skill in Claude Code | **Yes (marketplace)** |
| [**Claude Code (MCP only)**](#claude-code) | Developers wiring up the MCP without the bundled skill | Yes (npx) |
| [**Claude Desktop**](#claude-desktop) | Local desktop app users | Yes (npx) |
| [**Docker + Claude.ai**](#docker-deployment-remote-mcp) | Teams, remote access, Claude.ai web | Yes (Watchtower) |
| [**From Source**](#from-source) | Development and customization | Manual |

### Bundled Skill

This repo also ships a [Claude Skill](plugins/syncromsp/skills/syncromsp/) that gives Claude operating context for the MCP — workflows, API quirks (e.g. `line_items` ignored on `*_create`), the two-step labor logging pattern, ticket status transitions, ticket comment subject conventions, and a hyperlink rule that renders every Syncro record as a clickable link. It's company-agnostic; user-specific values are discovered at runtime via API calls and cached locally.

**Recommended — Claude Code plugin (auto-updating, bundles skill + MCP, prompts for credentials on install):**

```
/plugin marketplace add advenimus/syncromsp-mcp
/plugin install syncromsp@syncromsp
```

On enable, Claude Code prompts for your Syncro subdomain and API key. The subdomain is stored in `settings.json`; the API key goes to your system keychain. Both are passed to the bundled MCP server as `SYNCRO_SUBDOMAIN` and `SYNCRO_API_KEY` automatically — no shell exports or manual `claude mcp add` needed.

New commits to `main` propagate to installed users on the next marketplace refresh — no manual re-install needed.

**Claude Desktop / claude.ai (no public plugin marketplace yet):** download `syncromsp-skill.zip` from [Releases](https://github.com/advenimus/syncromsp-mcp/releases) and upload via *Settings → Capabilities → Skills* (paid plan, preview feature). It syncs across that account automatically. For Team/Enterprise plans, an org admin can upload via *Organization settings* and every member gets auto-updates when the admin re-uploads a revised zip. Full instructions in [plugins/syncromsp/skills/syncromsp/README.md](plugins/syncromsp/skills/syncromsp/README.md).

The release zip is always published at:

```
https://github.com/advenimus/syncromsp-mcp/releases/latest/download/syncromsp-skill.zip
```

---

## Prerequisites

### Getting Your Syncro API Key

1. Log in to your Syncro account
2. Go to **Admin** > **API Tokens**
3. Click **+ New Token**
4. Select the **Custom Permissions** tab
5. Name your token and set permissions for the resources you need
6. Click **Create** and copy the token (it cannot be retrieved later)

Your **subdomain** is the part before `.syncromsp.com` in your Syncro URL (e.g., `mycompany` from `mycompany.syncromsp.com`).

---

## Claude Code

```bash
claude mcp add syncromsp \
  --env SYNCRO_API_KEY=your-api-key \
  --env SYNCRO_SUBDOMAIN=your-subdomain \
  -- npx syncromsp-mcp
```

That's it. Claude Code will download and run the latest version automatically.

---

## Claude Desktop

### Option 1: MCPB Extension

Download the latest `.mcpb` file from [Releases](https://github.com/advenimus/syncromsp-mcp/releases) and double-click to install. Claude Desktop will prompt you for your API key and subdomain.

### Option 2: Manual Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "syncromsp": {
      "command": "npx",
      "args": ["-y", "syncromsp-mcp"],
      "env": {
        "SYNCRO_API_KEY": "your-api-key",
        "SYNCRO_SUBDOMAIN": "your-subdomain"
      }
    }
  }
}
```

Config file location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Restart Claude Desktop after saving. The server updates automatically via npx on each restart.

---

## Docker Deployment (Remote MCP)

Deploy as a Docker container for remote access from Claude.ai, shared team usage, or running on a server. Each person signs in with **their own Syncro API key**, so every action in Syncro is made as that person, with that key's permissions. There is no shared password and no server-wide Syncro key.

### Step 1: Clone and Configure

```bash
git clone https://github.com/advenimus/syncromsp-mcp.git
cd syncromsp-mcp
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Required: The public URL where this server will be reachable
# Must be HTTPS for production (put behind Traefik, Caddy, nginx, etc.)
MCP_BASE_URL=https://mcp.yourcompany.com

# Required: 32 random bytes that encrypt every sign-in token.
# Generate with: openssl rand -hex 32
# Keep it secret and keep it stable: changing it signs everyone out.
MCP_TOKEN_ENCRYPTION_KEY=

# Required: which Syncro accounts may sign in. Set ONE of these three.
SYNCRO_SUBDOMAIN=yourcompany              # lock sign-in to one account
# MCP_ALLOWED_SUBDOMAINS=acme,beta         # or allow a list of accounts
# MCP_ALLOW_ANY_SUBDOMAIN=true             # or allow any Syncro account
```

Do **not** set `SYNCRO_API_KEY` for this setup. It is ignored in HTTP sign-in mode.

**Hosting for any Syncro account:** set `MCP_ALLOW_ANY_SUBDOMAIN=true` and leave `SYNCRO_SUBDOMAIN` unset. The sign-in page then asks for both the subdomain and the API key, so any Syncro tenant can connect with its own credentials. Each tenant only ever reaches its own Syncro account, gets its own outbound rate budget, and each user is limited to `MCP_MAX_SESSIONS_PER_USER` open sessions.

### Step 2: Deploy

```bash
docker compose up -d
```

The container runs on port 8080 by default. You need a reverse proxy (Traefik, Caddy, nginx) in front to provide HTTPS.

### Step 3: Connect from Claude.ai

1. In Syncro, create an API token for yourself under **Admin** > **API Tokens**. Its permissions decide what Claude can do.
2. In Claude.ai, go to **Settings** > **MCP Servers** > **Add Remote Server**
3. Enter your MCP URL: `https://mcp.yourcompany.com/mcp`
4. Claude.ai will auto-discover the OAuth endpoints
5. A sign-in page appears. Enter your Syncro subdomain (unless the server is locked to one) and your API key.
6. The server checks the key with Syncro. If Syncro accepts it, Claude.ai connects and all tools become available.

Each teammate repeats steps 1 to 6 with their own key.

### How Sign-in Works

The server implements the [MCP OAuth 2.1 + PKCE](https://spec.modelcontextprotocol.io) spec. The login step is your own Syncro key:

```
Client connects → 401 Unauthorized
  → Client discovers /.well-known/oauth-authorization-server
  → Client dynamically registers (RFC 7591)
  → Client redirects user to /authorize
  → User enters Syncro subdomain + API key
  → Server calls https://<subdomain>.syncromsp.com/api/v1/me with that key (5 second timeout)
  → Syncro says OK: auth code issued → tokens granted → MCP access
  → Anything else: one generic "Sign-in failed" message, nothing issued
```

- **No credential database.** Your subdomain and key live only inside your tokens, which are encrypted and signed with AES-256-GCM using `MCP_TOKEN_ENCRYPTION_KEY`. The server stores nothing on disk.
- **Sign-ins survive restarts.** Tokens and client registrations are self-contained encrypted blobs, so a restart or redeploy does not sign anyone out (as long as `MCP_TOKEN_ENCRYPTION_KEY` stays the same).
- **Each session uses its owner's key.** A session is bound to the key that opened it. Another user presenting that session id gets a 404.
- Access tokens last 1 hour. Refresh tokens last 30 days and are replaced on every use. Reusing an old refresh token cancels that whole sign-in.
- The subdomain must be a plain name like `mycompany`. The server always builds `https://<subdomain>.syncromsp.com` itself, so it cannot be pointed at another host.
- Failed sign-in attempts are limited to 5 per IP address per 15 minutes. Successful sign-ins do not count.
- The key is never put in a URL, a log line, or an error message.
- The sign-in page shows the `redirect_uri` so users can check where they will be sent (anti-phishing).

### Signing out and revoking access

- **To cut off a key for sure, delete it in Syncro** (Admin > API Tokens). Every token that carries it stops working at Syncro right away. This is the real kill switch.
- Claude.ai's "disconnect" calls the revoke endpoint. Revoked tokens are remembered in memory until they expire. That memory resets when the server restarts, so a restart re-enables a revoked token that has not expired yet. If that matters, delete the key in Syncro.

### Rotating the encryption key

1. Generate a new key: `openssl rand -hex 32`
2. Move the current value to `MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS` and put the new one in `MCP_TOKEN_ENCRYPTION_KEY`. Restart.
3. Existing sign-ins keep working. New and refreshed tokens use the new key.
4. After 30 days (the refresh token lifetime), remove `MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS` and restart. Client registrations are sealed with the key too, so a client that registered before the rotation (for example a Claude.ai connector) may then need to be removed and re-added.

If the key may have leaked, do not keep it as the previous key: just replace it. Everyone has to sign in again, and Claude.ai may need the connector removed and re-added. Also ask users to delete and re-create their Syncro API keys, because a leaked encryption key plus a captured token reveals the Syncro key inside.

For the full threat model, defense layers, and operator responsibilities, see [SECURITY.md](SECURITY.md).

### Example: Docker with Traefik

```yaml
services:
  syncro-mcp:
    image: ghcr.io/advenimus/syncromsp-mcp:latest
    container_name: syncromsp-mcp
    restart: unless-stopped
    environment:
      - MCP_TRANSPORT=http
      - MCP_PORT=8080
      - MCP_BASE_URL=https://mcp.yourcompany.com
      - MCP_TOKEN_ENCRYPTION_KEY=${MCP_TOKEN_ENCRYPTION_KEY}
      - SYNCRO_SUBDOMAIN=${SYNCRO_SUBDOMAIN}
    # Container hardening — recommended for any public-facing deployment
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:size=10m,mode=1777
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mcp.rule=Host(`mcp.yourcompany.com`)"
      - "traefik.http.routers.mcp.entrypoints=websecure"
      - "traefik.http.routers.mcp.tls.certresolver=letsencrypt"
      - "traefik.http.services.mcp.loadbalancer.server.port=8080"
```

### Example: Docker with Caddy

```yaml
services:
  syncro-mcp:
    image: ghcr.io/advenimus/syncromsp-mcp:latest
    container_name: syncromsp-mcp
    restart: unless-stopped
    environment:
      - MCP_TRANSPORT=http
      - MCP_BASE_URL=https://mcp.yourcompany.com
      - MCP_TOKEN_ENCRYPTION_KEY=${MCP_TOKEN_ENCRYPTION_KEY}
      - SYNCRO_SUBDOMAIN=${SYNCRO_SUBDOMAIN}
    expose:
      - "8080"
    # Container hardening — recommended for any public-facing deployment
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:size=10m,mode=1777

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  caddy_data:
```

`Caddyfile`:
```
mcp.yourcompany.com {
    reverse_proxy syncro-mcp:8080
}
```

### Disabling Auth (Not Recommended)

For testing on private networks only. The server **refuses to start** with `MCP_AUTH=false` unless you also set `MCP_I_UNDERSTAND_INSECURE=true` as an explicit foot-gun guard:

In this mode there is no sign-in page, and every session uses one server-wide `SYNCRO_API_KEY`. The default `docker-compose.yml` does not pass that variable in, so add these lines under `environment:` first:

```yaml
      - SYNCRO_API_KEY=${SYNCRO_API_KEY}
      - MCP_I_UNDERSTAND_INSECURE=${MCP_I_UNDERSTAND_INSECURE}
```

Then start it:

```bash
MCP_AUTH=false MCP_I_UNDERSTAND_INSECURE=true SYNCRO_API_KEY=your-key SYNCRO_SUBDOMAIN=yourcompany docker compose up -d
```

**Warning:** Without auth, anyone who can reach the URL gets full access to your Syncro account. Never disable auth on a publicly-reachable deployment, even briefly.

### Upgrading from the shared-password setup

Older versions used one shared password (`MCP_AUTH_SECRET`) and one server-wide `SYNCRO_API_KEY`. To upgrade:

1. Add `MCP_TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`).
2. Keep `SYNCRO_SUBDOMAIN` to lock sign-in to your account, or set `MCP_ALLOWED_SUBDOMAINS` / `MCP_ALLOW_ANY_SUBDOMAIN=true`.
3. Remove `MCP_AUTH_SECRET` and `SYNCRO_API_KEY`. (If left in place they are ignored, with a warning in the log.)
4. Restart. Everyone signs in once with their own Syncro API key. In Claude.ai you may need to remove and re-add the connector, because old client registrations were kept in memory and are gone.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SYNCRO_API_KEY` | stdio, or HTTP with `MCP_AUTH=false` | — | Your Syncro API token. Ignored (with a warning) in HTTP sign-in mode, where each user brings their own. |
| `SYNCRO_SUBDOMAIN` | stdio, or HTTP with `MCP_AUTH=false` | — | Your Syncro subdomain. In HTTP sign-in mode, setting it locks sign-in to that one subdomain. |
| `MCP_TRANSPORT` | No | `stdio` | `stdio` (local) or `http` (Docker/remote) |
| `MCP_PORT` | No | `8080` | HTTP listen port |
| `MCP_BASE_URL` | For Docker | — | Public HTTPS URL (e.g., `https://mcp.yourcompany.com`) |
| `MCP_AUTH` | No | `true` | `true` or `false` to disable OAuth (see foot-gun guard below) |
| `MCP_TOKEN_ENCRYPTION_KEY` | HTTP sign-in mode | — | 32 random bytes as 64 hex chars or base64. Encrypts every token and client registration. Generate with `openssl rand -hex 32`. The server refuses to start without a valid one. |
| `MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS` | No | — | The old key during a rotation. Used only to read existing tokens, never to create new ones. |
| `MCP_ALLOWED_SUBDOMAINS` | One of these three in HTTP sign-in mode | — | Comma list of subdomains allowed to sign in, e.g. `acme,beta`. Ignored if `SYNCRO_SUBDOMAIN` is set. |
| `MCP_ALLOW_ANY_SUBDOMAIN` | One of these three in HTTP sign-in mode | — | Set to `true` to let any Syncro subdomain sign in. |
| `MCP_I_UNDERSTAND_INSECURE` | If `MCP_AUTH=false` | — | Must be `true` to start the server with auth disabled. Foot-gun guard. |
| `MCP_TOOL_MODE` | No | `flat` | `flat` (all tools) or `navigation` (lazy domains) |
| `MCP_SESSION_IDLE_MINUTES` | No | `60` | HTTP sessions unused this long are closed (checked every 5 minutes). Clients reconnect automatically. |
| `MCP_MAX_SESSIONS_PER_USER` | No | `25` | Open HTTP sessions one signed-in user may hold. Past it, that user's least recently used idle session is closed; if all are busy, the new one gets a 429. |

---

## Available Domains

| Domain | Description | Key Operations |
|--------|-------------|---------------|
| **tickets** | Service tickets | CRUD, comments (email/public/private), cross-ticket comment feed, line items, timers, attachments, blueprints |
| **customers** | Customer records | CRUD, phone numbers, autocomplete |
| **assets** | Customer assets | CRUD, list by contact, patches, installed applications, policy folder assignment, properties (OS, RAM, HDD, etc.) |
| **contacts** | Customer contacts | CRUD |
| **invoices** | Invoices | CRUD, line items (manual + product catalog), print, email, publish draft / convert to draft |
| **estimates** | Estimates/quotes | CRUD, line items, print, email, convert to invoice |
| **appointments** | Calendar appointments | CRUD, appointment types, ticket linking |
| **products** | Inventory/products | CRUD, serials, SKUs (incl. delete), categories, images |
| **payments** | Payment records | Create, read, multi-invoice distribution |
| **leads** | Leads/opportunities | Create, read, update |
| **contracts** | Service contracts | CRUD |
| **rmm** | RMM alerts and scripts | Create, read, mute, resolve alerts; run a script on an asset (confirmation required) |
| **scheduling** | Recurring invoices | CRUD, schedule line items (incl. asset, contact, policy folder, vendor, and backup line types) |
| **time** | Timers and time logs | Start, pause, resume, stop live ticket timers; set billable; list and edit time logs |
| **admin** | Search, users, vendors, wiki, portal, settings, purchase orders, and more | Various, incl. PO update and file attachments |
| **policies** | Policy folders (Syncro accounts only) | List, get, create, update, delete folders; assign assets via `assets_update` |

---

## Staying Up to Date

The server checks for updates on startup and logs a warning if a newer version is available.

| Method | How to Update |
|--------|--------------|
| **npx / Claude Desktop** | Automatic — npx pulls latest on each run |
| **Docker** | `docker compose pull && docker compose up -d` |
| **Docker (auto)** | Add [Watchtower](https://containrrr.dev/watchtower/) for automatic daily updates |
| **MCPB** | Download latest `.mcpb` from [Releases](https://github.com/advenimus/syncromsp-mcp/releases) |
| **From Source** | `git pull && npm install && npm run build` |

### Auto-Update with Watchtower

Recommended: run Watchtower in **label-enable** mode so it only auto-updates the containers that opt in. This is much safer than letting it auto-update every container on the host.

Watchtower stack (`/root/docker/watchtower/docker-compose.yml`):

```yaml
services:
  watchtower:
    image: containrrr/watchtower:1.7.1
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_LABEL_ENABLE=true       # only watch opted-in containers
      - WATCHTOWER_POLL_INTERVAL=300       # check every 5 minutes
      - WATCHTOWER_CLEANUP=true
      # On hosts running modern Docker (29.x with MinAPI 1.40), Watchtower's
      # bundled SDK can default to an older API version. Pin to 1.40 to avoid
      # `client version 1.25 is too old` errors at runtime.
      - DOCKER_API_VERSION=1.40
```

Then opt the syncromsp-mcp service in via a label in its compose:

```yaml
labels:
  - "com.centurylinklabs.watchtower.enable=true"
```

Bring both up: `docker compose up -d` in each directory. New releases on `:latest` will be pulled and the container recreated within 5 minutes of publish.

---

## Important Notes

- **Destructive operations** (DELETE, remove line item, etc.) require explicit confirmation
- **Line items** cannot be added inline during resource creation — always add them via separate API calls after creating the parent resource
- **Ticket comments** have 3 modes: email reply (`do_not_email: false`), public note (`do_not_email: true, hidden: false`), and private note (`hidden: true`)
- Some resources have no DELETE endpoint (vendors, leads, products, assets) — use `disabled: true` via update instead
- **Rate limit**: 180 requests per minute per IP (enforced by Syncro, managed by built-in rate limiter). In HTTP mode the budget is kept per Syncro tenant, shared by all of that tenant's users.

---

## From Source

```bash
git clone https://github.com/advenimus/syncromsp-mcp.git
cd syncromsp-mcp
npm install
npm run build

export SYNCRO_API_KEY=your-api-key
export SYNCRO_SUBDOMAIN=your-subdomain
npm start
```

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm test         # Run tests
npm run lint     # Lint source
```

## License

MIT
