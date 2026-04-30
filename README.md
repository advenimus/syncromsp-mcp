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
| [**Claude Code**](#claude-code) | Developers using Claude Code CLI | Yes (npx) |
| [**Claude Desktop**](#claude-desktop) | Local desktop app users | Yes (npx) |
| [**Docker + Claude.ai**](#docker-deployment-remote-mcp) | Teams, remote access, Claude.ai web | Yes (Watchtower) |
| [**From Source**](#from-source) | Development and customization | Manual |

### Bundled Skill

This repo also ships a [Claude Skill](skills/syncromsp/) that gives Claude operating context for the MCP — workflows, API quirks (e.g. `line_items` ignored on `*_create`), the two-step labor logging pattern, ticket status transitions, and a hyperlink rule that renders every Syncro record as a clickable link. It's company-agnostic; user-specific values are discovered at runtime via API calls and cached locally.

A zipped, version-tagged copy is published to every release as `syncromsp-skill.zip`. Latest:

```
https://github.com/advenimus/syncromsp-mcp/releases/latest/download/syncromsp-skill.zip
```

**Claude Code:**

```bash
cp -r skills/syncromsp ~/.claude/skills/syncromsp
```

**Claude Desktop / claude.ai:** download `syncromsp-skill.zip` from [Releases](https://github.com/advenimus/syncromsp-mcp/releases) and upload via *Settings → Capabilities → Skills* (paid plan, preview feature). It then syncs to Claude Desktop automatically. Full instructions in [skills/syncromsp/README.md](skills/syncromsp/README.md).

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

# Required: Access key that users must enter to authorize connections
# Generate one with: openssl rand -hex 32
MCP_AUTH_SECRET=your-strong-secret-here
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
- Access tokens expire after 24 hours (refresh tokens last 30 days)
- Timing-safe secret comparison prevents side-channel attacks
- Server **refuses to start** if `MCP_AUTH_SECRET` is not set

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

For testing on private networks only:

```bash
MCP_AUTH=false docker compose up -d
```

**Warning:** Without auth, anyone who can reach the URL gets full access to your Syncro account.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SYNCRO_API_KEY` | Yes | — | Your Syncro API token |
| `SYNCRO_SUBDOMAIN` | Yes | — | Your Syncro subdomain |
| `MCP_TRANSPORT` | No | `stdio` | `stdio` (local) or `http` (Docker/remote) |
| `MCP_PORT` | No | `8080` | HTTP listen port |
| `MCP_BASE_URL` | For Docker | — | Public HTTPS URL (e.g., `https://mcp.yourcompany.com`) |
| `MCP_AUTH` | No | `true` | `true` or `false` to disable OAuth |
| `MCP_AUTH_SECRET` | For Docker | — | Access key users enter to authorize (min 8 chars) |
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

Add to your `docker-compose.yml`:

```yaml
services:
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_POLL_INTERVAL=86400  # Check every 24 hours
      - WATCHTOWER_CLEANUP=true
```

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
