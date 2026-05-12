# SyncroMSP MCP Server

A fully-featured [Model Context Protocol](https://modelcontextprotocol.io) server for the [SyncroMSP](https://syncromsp.com) IT/MSP platform. Gives AI assistants full access to tickets, customers, assets, invoices, and 30+ resource types.

## Features

- **170 API endpoints** across 15 domains
- **Full CRUD** for tickets, customers, invoices, estimates, appointments, contracts, products, and more
- **Ticket comments** — email replies, public notes, and private/internal notes
- **Line items** — add products from catalog or manual entries to tickets, invoices, estimates, schedules
- **RMM alerts** — create, read, mute, resolve alerts on assets
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

Deploy as a Docker container for remote access from Claude.ai, shared team usage, or running on a server. Includes built-in OAuth 2.1 authentication so only authorized users can connect.

### Step 1: Clone and Configure

```bash
git clone https://github.com/advenimus/syncromsp-mcp.git
cd syncromsp-mcp
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Required: Syncro credentials
SYNCRO_API_KEY=your-api-key
SYNCRO_SUBDOMAIN=your-subdomain

# Required: The public URL where this server will be reachable
# Must be HTTPS for production (put behind Traefik, Caddy, nginx, etc.)
MCP_BASE_URL=https://mcp.yourcompany.com

# Required: Access key that users must enter to authorize connections.
# Minimum 32 characters; the server refuses to start on weak/default values.
# Generate with: openssl rand -hex 32
MCP_AUTH_SECRET=
```

### Step 2: Deploy

```bash
docker compose up -d
```

The container runs on port 8080 by default. You need a reverse proxy (Traefik, Caddy, nginx) in front to provide HTTPS.

### Step 3: Connect from Claude.ai

1. In Claude.ai, go to **Settings** > **MCP Servers** > **Add Remote Server**
2. Enter your MCP URL: `https://mcp.yourcompany.com/mcp`
3. Claude.ai will auto-discover the OAuth endpoints
4. A login page appears — enter the `MCP_AUTH_SECRET` you configured in Step 1
5. Once authenticated, Claude.ai connects and all 170 tools become available

### How Authentication Works

The server implements the [MCP OAuth 2.1 + PKCE](https://spec.modelcontextprotocol.io) spec with an access key gate:

```
Client connects → 401 Unauthorized
  → Client discovers /.well-known/oauth-authorization-server
  → Client dynamically registers (RFC 7591)
  → Client redirects user to /authorize
  → User sees login page, enters MCP_AUTH_SECRET
  → Correct key: auth code issued → token granted → MCP access
  → Wrong key: 403 Access Denied, connection rejected
```

- Tokens are validated on every MCP request via bearer auth
- Access tokens expire after 24 hours; refresh tokens rotate on every use and last 30 days
- Access tokens and refresh tokens carry a type discriminator — a refresh token cannot be used as a bearer, and an access token cannot be exchanged at the token endpoint
- Timing-safe secret comparison prevents side-channel attacks
- Server **refuses to start** if `MCP_AUTH_SECRET` is missing, shorter than 32 characters, or matches a known weak default (`change-me`, `password`, `secret`, etc.)
- Consent page displays the registered `redirect_uri` so users can verify the destination before authorizing (anti-phishing)

For the full threat model, defense layers, and operator responsibilities, see [SECURITY.md](SECURITY.md).

### Example: Docker with Traefik

```yaml
services:
  syncro-mcp:
    image: ghcr.io/advenimus/syncromsp-mcp:latest
    container_name: syncromsp-mcp
    restart: unless-stopped
    environment:
      - SYNCRO_API_KEY=${SYNCRO_API_KEY}
      - SYNCRO_SUBDOMAIN=${SYNCRO_SUBDOMAIN}
      - MCP_TRANSPORT=http
      - MCP_PORT=8080
      - MCP_BASE_URL=https://mcp.yourcompany.com
      - MCP_AUTH_SECRET=${MCP_AUTH_SECRET}
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
      - SYNCRO_API_KEY=${SYNCRO_API_KEY}
      - SYNCRO_SUBDOMAIN=${SYNCRO_SUBDOMAIN}
      - MCP_TRANSPORT=http
      - MCP_BASE_URL=https://mcp.yourcompany.com
      - MCP_AUTH_SECRET=${MCP_AUTH_SECRET}
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

```bash
MCP_AUTH=false MCP_I_UNDERSTAND_INSECURE=true docker compose up -d
```

**Warning:** Without auth, anyone who can reach the URL gets full access to your Syncro account. Never disable auth on a publicly-reachable deployment, even briefly.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SYNCRO_API_KEY` | Yes | — | Your Syncro API token |
| `SYNCRO_SUBDOMAIN` | Yes | — | Your Syncro subdomain |
| `MCP_TRANSPORT` | No | `stdio` | `stdio` (local) or `http` (Docker/remote) |
| `MCP_PORT` | No | `8080` | HTTP listen port |
| `MCP_BASE_URL` | For Docker | — | Public HTTPS URL (e.g., `https://mcp.yourcompany.com`) |
| `MCP_AUTH` | No | `true` | `true` or `false` to disable OAuth (see foot-gun guard below) |
| `MCP_AUTH_SECRET` | For Docker | — | Access key users enter to authorize. Minimum 32 chars; weak/default values rejected at startup. |
| `MCP_I_UNDERSTAND_INSECURE` | If `MCP_AUTH=false` | — | Must be `true` to start the server with auth disabled. Foot-gun guard. |
| `MCP_TOOL_MODE` | No | `flat` | `flat` (all tools) or `navigation` (lazy domains) |

---

## Available Domains

| Domain | Description | Key Operations |
|--------|-------------|---------------|
| **tickets** | Service tickets | CRUD, comments (email/public/private), line items, timers, attachments |
| **customers** | Customer records | CRUD, phone numbers, autocomplete |
| **assets** | Customer assets | CRUD, patches, properties (OS, RAM, HDD, etc.) |
| **contacts** | Customer contacts | CRUD |
| **invoices** | Invoices | CRUD, line items (manual + product catalog), print, email |
| **estimates** | Estimates/quotes | CRUD, line items, print, email, convert to invoice |
| **appointments** | Calendar appointments | CRUD, appointment types, ticket linking |
| **products** | Inventory/products | CRUD, serials, SKUs, categories, images |
| **payments** | Payment records | Create, read, multi-invoice distribution |
| **leads** | Leads/opportunities | Create, read, update |
| **contracts** | Service contracts | CRUD |
| **rmm** | RMM alerts | Create, read, mute, resolve |
| **scheduling** | Recurring invoices | CRUD, schedule line items |
| **time** | Timers and time logs | List, update |
| **admin** | Search, users, vendors, wiki, portal, settings, purchase orders, and more | Various |

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
- **Rate limit**: 180 requests per minute per IP (enforced by Syncro, managed by built-in rate limiter)

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
