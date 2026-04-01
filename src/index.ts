#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SyncroApiClient } from "./api-client.js";
import { createServer, type ToolMode } from "./server.js";

const apiKey = process.env.SYNCRO_API_KEY;
const subdomain = process.env.SYNCRO_SUBDOMAIN;

if (!apiKey || !subdomain) {
  console.error(
    "Missing required environment variables:\n" +
      "  SYNCRO_API_KEY    - Your Syncro API key (Admin > API Tokens)\n" +
      "  SYNCRO_SUBDOMAIN  - Your Syncro subdomain (e.g., 'mycompany' from mycompany.syncromsp.com)"
  );
  process.exit(1);
}

// Tool mode: "flat" registers all 170 tools at startup (works everywhere).
// "navigation" uses lazy-loaded domains (lower token usage, requires client
// support for notifications/tools/list_changed).
// Default: "flat" for maximum compatibility.
const toolMode = (process.env.MCP_TOOL_MODE || "flat") as ToolMode;

const client = new SyncroApiClient({ apiKey, subdomain });
const mcpServer = createServer(client, toolMode);

const transport = process.env.MCP_TRANSPORT || "stdio";

if (transport === "http") {
  const { default: express } = await import("express");
  const { randomUUID } = await import("node:crypto");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const { isInitializeRequest } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  const port = parseInt(process.env.MCP_PORT || "8080", 10);
  const useAuth = process.env.MCP_AUTH !== "false";
  const baseUrl = process.env.MCP_BASE_URL || `http://localhost:${port}`;
  const mcpServerUrl = new URL(baseUrl);

  const app = express();
  app.use(express.json());

  // Health check (always unauthenticated)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", transport: "http", auth: useAuth });
  });

  let authMiddleware: ((req: any, res: any, next: any) => void) | undefined;

  if (useAuth) {
    const { McpOAuthProvider } = await import("./auth.js");
    const { mcpAuthRouter } = await import(
      "@modelcontextprotocol/sdk/server/auth/router.js"
    );
    const { requireBearerAuth } = await import(
      "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js"
    );
    const { getOAuthProtectedResourceMetadataUrl } = await import(
      "@modelcontextprotocol/sdk/server/auth/router.js"
    );

    const oauthProvider = new McpOAuthProvider();

    // Install OAuth routes (/.well-known/*, /authorize, /token, /register, /revoke)
    app.use(
      mcpAuthRouter({
        provider: oauthProvider,
        issuerUrl: mcpServerUrl,
        scopesSupported: ["mcp:tools"],
      })
    );

    authMiddleware = requireBearerAuth({
      verifier: oauthProvider,
      requiredScopes: [],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
    });

    console.error(`OAuth enabled. Issuer: ${mcpServerUrl}`);
  } else {
    console.error("Auth disabled (MCP_AUTH=false)");
  }

  // Session management
  const transports: Record<string, InstanceType<typeof StreamableHTTPServerTransport>> = {};

  const mcpHandler = async (req: any, res: any) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let sessionTransport: InstanceType<typeof StreamableHTTPServerTransport>;

      if (sessionId && transports[sessionId]) {
        sessionTransport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        sessionTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = sessionTransport;
          },
        });
        sessionTransport.onclose = () => {
          const sid = sessionTransport.sessionId;
          if (sid) delete transports[sid];
        };
        await mcpServer.connect(sessionTransport);
      } else {
        res.status(400).json({ error: "Bad request: missing session ID or not an init request" });
        return;
      }

      await sessionTransport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP handler error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };

  // Wire up MCP endpoints with optional auth
  if (authMiddleware) {
    app.post("/mcp", authMiddleware, mcpHandler);
    app.get("/mcp", authMiddleware, mcpHandler);
    app.delete("/mcp", authMiddleware, mcpHandler);
  } else {
    app.post("/mcp", mcpHandler);
    app.get("/mcp", mcpHandler);
    app.delete("/mcp", mcpHandler);
  }

  app.listen(port, () => {
    console.error(`SyncroMSP MCP server listening on http://0.0.0.0:${port}`);
    console.error(`Health: http://0.0.0.0:${port}/health`);
    console.error(`MCP: ${baseUrl}/mcp`);
    if (useAuth) {
      console.error(`OAuth metadata: ${baseUrl}/.well-known/oauth-authorization-server`);
    }
  });

  const shutdown = () => {
    for (const t of Object.values(transports)) {
      t.close();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else {
  // Default: stdio transport
  const stdioTransport = new StdioServerTransport();
  await mcpServer.connect(stdioTransport);

  const shutdown = async () => {
    await mcpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
