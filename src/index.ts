#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SyncroApiClient } from "./api-client.js";
import { createServer } from "./server.js";

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

const client = new SyncroApiClient({ apiKey, subdomain });
const mcpServer = createServer(client);

const transport = process.env.MCP_TRANSPORT || "stdio";

if (transport === "http") {
  const { createServer: createHttpServer } = await import("node:http");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const { randomUUID } = await import("node:crypto");

  const httpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await mcpServer.connect(httpTransport);

  const port = parseInt(process.env.MCP_PORT || "8080", 10);

  const httpServer = createHttpServer(async (req, res) => {
    // Health check endpoint
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "http" }));
      return;
    }

    // MCP endpoint
    if (req.url === "/mcp" || req.url === "/") {
      await httpTransport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(port, () => {
    console.error(`SyncroMSP MCP server listening on http://0.0.0.0:${port}`);
    console.error(`Health: http://0.0.0.0:${port}/health`);
    console.error(`MCP: http://0.0.0.0:${port}/mcp`);
  });

  const shutdown = async () => {
    await mcpServer.close();
    httpServer.close();
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
