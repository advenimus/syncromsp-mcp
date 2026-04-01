# SyncroMSP MCP Server

A fully-featured [Model Context Protocol](https://modelcontextprotocol.io) server for the [SyncroMSP](https://syncromsp.com) IT/MSP platform. Provides AI assistants with access to tickets, customers, assets, invoices, and 30+ resource types through a domain-navigation architecture that keeps token usage efficient.

## Features

- **170 API endpoints** across 15 lazy-loaded domains
- **Domain navigation** — only 3-8 tools visible at a time, not 170
- **Full CRUD** for tickets, customers, invoices, estimates, appointments, contracts, products, and more
- **Ticket comments** — email replies, public notes, and private/internal notes
- **Line items** — add products from catalog or manual entries to tickets, invoices, estimates, schedules
- **RMM alerts** — create, read, mute, resolve alerts on assets
- **Rate limiting** — built-in 180 req/min token bucket (Syncro API limit)
- **Confirmation required** for all destructive operations (DELETE, etc.)
- **Docker deployment** with OAuth2 proxy for remote/team access

## Quick Start

### Claude Code

```bash
claude mcp add syncromsp \
  --env SYNCRO_API_KEY=your-api-key \
  --env SYNCRO_SUBDOMAIN=your-subdomain \
  -- npx @advenimus/syncromsp-mcp
```

### Claude Desktop

#### Option 1: MCPB Extension (Recommended)

Download the latest `.mcpb` file from [Releases](https://github.com/advenimus/syncromsp-mcp/releases) and double-click to install. Claude Desktop will prompt you for your API key and subdomain.

#### Option 2: Manual Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "syncromsp": {
      "command": "npx",
      "args": ["@advenimus/syncromsp-mcp"],
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

### From Source

```bash
git clone https://github.com/advenimus/syncromsp-mcp.git
cd syncromsp-mcp
npm install
npm run build

# Set environment variables
export SYNCRO_API_KEY=your-api-key
export SYNCRO_SUBDOMAIN=your-subdomain

# Run
npm start
```

## Getting Your API Key

1. Log in to your Syncro account
2. Go to **Admin** > **API Tokens**
3. Click **+ New Token**
4. Select the **Custom Permissions** tab
5. Name your token and set permissions for the resources you need
6. Click **Create** and copy the token (it cannot be retrieved later)

Your subdomain is the part before `.syncromsp.com` in your Syncro URL (e.g., `mycompany` from `mycompany.syncromsp.com`).

## How It Works

### Domain Navigation

Instead of loading 170+ tools at once (which would overwhelm any AI), the server uses a **navigation pattern**:

```
Startup → 3 tools visible:
  syncro_navigate("tickets")  → loads ticket tools
  syncro_status()             → shows current domain
  syncro_back()               → returns to root

After navigating to "tickets" → domain tools visible:
  tickets_list, tickets_get, tickets_create, tickets_update,
  tickets_delete, tickets_comment, tickets_add_line_item, ...
  syncro_back()
```

### Available Domains

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

## Docker Deployment (Remote MCP with OAuth)

For connecting Claude.ai or other remote MCP clients with built-in OAuth 2.1 authentication:

```bash
cp .env.example .env
# Edit .env with your Syncro credentials and base URL
```

Set `MCP_BASE_URL` to your public HTTPS URL (required for OAuth):

```bash
SYNCRO_API_KEY=your-api-key
SYNCRO_SUBDOMAIN=your-subdomain
MCP_BASE_URL=https://mcp.yourcompany.com
```

Then deploy:

```bash
docker compose up -d
```

### Connecting Claude.ai

1. Deploy the server with HTTPS (via reverse proxy like Traefik, Caddy, or nginx)
2. In Claude.ai, go to **Settings** > **MCP Servers** > **Add Remote Server**
3. Enter your MCP URL: `https://mcp.yourcompany.com/mcp`
4. Claude.ai will auto-discover the OAuth endpoints and authenticate

The server implements the full MCP OAuth 2.1 + PKCE spec:
- `/.well-known/oauth-authorization-server` — discovery metadata
- `/authorize` — authorization endpoint (auto-approves since you control the server)
- `/token` — token endpoint with PKCE S256 validation
- `/register` — dynamic client registration (RFC 7591)
- Bearer token validation on all MCP requests

### Disabling Auth

For testing or private networks, disable OAuth:

```bash
MCP_AUTH=false docker compose up -d
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SYNCRO_API_KEY` | Yes | Your Syncro API token |
| `SYNCRO_SUBDOMAIN` | Yes | Your Syncro subdomain |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `MCP_PORT` | No | HTTP port (default: `8080`) |
| `MCP_BASE_URL` | For OAuth | Public HTTPS URL (e.g., `https://mcp.yourcompany.com`) |
| `MCP_AUTH` | No | `true` (default) or `false` to disable OAuth |
| `MCP_TOOL_MODE` | No | `flat` (default, all tools) or `navigation` (lazy domains) |

## API Rate Limits

Syncro enforces a rate limit of **180 requests per minute per IP**. The server includes a built-in token bucket rate limiter that automatically queues requests when approaching the limit.

## Important Notes

- **Destructive operations** (DELETE, remove line item, etc.) require explicit confirmation
- **Line items** cannot be added inline during resource creation — always add them via separate API calls after creating the parent resource
- **Ticket comments** have 3 modes: email reply, public note, and private/internal note
- Some resources have no DELETE endpoint (vendors, leads, products, assets) — use `disabled: true` via update instead

## Staying Up to Date

The server checks for updates on startup and logs a warning if a newer version is available.

### npx

Always uses the latest published version automatically:
```bash
npx @advenimus/syncromsp-mcp@latest
```

### Claude Desktop (MCPB)

Download the latest `.mcpb` from [Releases](https://github.com/advenimus/syncromsp-mcp/releases) and reinstall.

### Docker

```bash
docker compose pull
docker compose up -d
```

For **automatic updates**, add [Watchtower](https://containrrr.dev/watchtower/):

```yaml
services:
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_POLL_INTERVAL=86400  # Check daily
      - WATCHTOWER_CLEANUP=true
```

### From Source

```bash
git pull
npm install
npm run build
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
