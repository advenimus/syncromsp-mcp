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

## Docker Deployment

For team/remote access with OAuth2 authentication:

```bash
cp .env.example .env
# Edit .env with your Syncro credentials and OAuth2 settings

docker compose up -d
```

This starts the MCP server with an [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) sidecar for secure access. See `.env.example` for all configuration options.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SYNCRO_API_KEY` | Yes | Your Syncro API token |
| `SYNCRO_SUBDOMAIN` | Yes | Your Syncro subdomain |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `MCP_PORT` | No | HTTP port (default: `8080`) |

## API Rate Limits

Syncro enforces a rate limit of **180 requests per minute per IP**. The server includes a built-in token bucket rate limiter that automatically queues requests when approaching the limit.

## Important Notes

- **Destructive operations** (DELETE, remove line item, etc.) require explicit confirmation
- **Line items** cannot be added inline during resource creation — always add them via separate API calls after creating the parent resource
- **Ticket comments** have 3 modes: email reply, public note, and private/internal note
- Some resources have no DELETE endpoint (vendors, leads, products, assets) — use `disabled: true` via update instead

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm test         # Run tests
npm run lint     # Lint source
```

## License

MIT
