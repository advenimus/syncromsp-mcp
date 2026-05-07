#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SyncroApiClient } from "./api-client.js";
import { createServer, type ToolMode } from "./server.js";
import { checkForUpdates } from "./utils/version-check.js";

// Non-blocking update check on startup
checkForUpdates();

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
  const port = parseInt(process.env.MCP_PORT || "8080", 10);
  const useAuth = process.env.MCP_AUTH !== "false";
  const authSecret = process.env.MCP_AUTH_SECRET;
  const baseUrl = process.env.MCP_BASE_URL || `http://localhost:${port}`;
  const mcpServerUrl = new URL(baseUrl);

  // Hard-fail when auth is disabled unless the operator has explicitly
  // acknowledged the risk. Stops accidental exposure of an unauthenticated
  // MCP endpoint to the public internet.
  if (!useAuth && process.env.MCP_I_UNDERSTAND_INSECURE !== "true") {
    console.error(
      "ERROR: MCP_AUTH=false disables OAuth on the HTTP endpoint, leaving the server unauthenticated.\n" +
        "  This is dangerous on any network that is not strictly isolated.\n" +
        "  If you understand the risk and intend to disable auth, set:\n" +
        "    MCP_I_UNDERSTAND_INSECURE=true\n" +
        "  Otherwise, set MCP_AUTH=true and provide MCP_AUTH_SECRET."
    );
    process.exit(1);
  }

  if (useAuth && !authSecret) {
    console.error(
      "ERROR: MCP_AUTH_SECRET is required when auth is enabled.\n" +
        "  Set MCP_AUTH_SECRET to a strong secret (min 8 chars) in your environment.\n" +
        "  Or set MCP_AUTH=false to disable auth (not recommended for public deployments)."
    );
    process.exit(1);
  }

  const { createHttpApp } = await import("./http-app.js");

  let authMiddleware: ((req: any, res: any, next: any) => void) | undefined;
  let oauthInstaller: ((app: import("express").Express) => void) | undefined;

  if (useAuth && authSecret) {
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

    const oauthProvider = new McpOAuthProvider(authSecret);

    oauthInstaller = (app) => {
      // Install OAuth routes (/.well-known/*, /authorize, /token, /register, /revoke)
      app.use(
        mcpAuthRouter({
          provider: oauthProvider,
          issuerUrl: mcpServerUrl,
          scopesSupported: ["mcp:tools"],
        })
      );

      // Handle the auth secret validation callback
      app.post("/authorize/callback", async (req, res) => {
        const { pending_id, secret } = req.body;
        if (!pending_id || !secret) {
          res.status(400).send("Missing required fields");
          return;
        }
        await oauthProvider.handleAuthCallback(pending_id, secret, res);
      });
    };

    authMiddleware = requireBearerAuth({
      verifier: oauthProvider,
      requiredScopes: [],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
    });

    console.error(`OAuth enabled with access key. Issuer: ${mcpServerUrl}`);
  } else {
    console.error(
      "Auth disabled (MCP_AUTH=false, MCP_I_UNDERSTAND_INSECURE=true). WARNING: Server is unprotected."
    );
  }

  const { app, shutdown: shutdownApp } = createHttpApp(client, {
    toolMode,
    authMiddleware,
    preMcpRouteInstaller: oauthInstaller,
  });

  app.listen(port, () => {
    console.error(`SyncroMSP MCP server listening on http://0.0.0.0:${port}`);
    console.error(`Health: http://0.0.0.0:${port}/health`);
    console.error(`MCP: ${baseUrl}/mcp`);
    if (useAuth) {
      console.error(`OAuth metadata: ${baseUrl}/.well-known/oauth-authorization-server`);
    }
  });

  const shutdown = () => {
    shutdownApp();
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
