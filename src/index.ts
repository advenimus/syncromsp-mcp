#!/usr/bin/env node

import type { Express, RequestHandler } from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SyncroApiClient } from "./api-client.js";
import { createServer, type ToolMode } from "./server.js";
import { checkForUpdates } from "./utils/version-check.js";

// Non-blocking update check on startup
checkForUpdates();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** stdio and no-auth HTTP mode use one server-wide key from the environment. */
function clientFromEnv(): SyncroApiClient {
  const apiKey = process.env.SYNCRO_API_KEY;
  const subdomain = process.env.SYNCRO_SUBDOMAIN;
  if (!apiKey || !subdomain) {
    fail(
      "Missing required environment variables:\n" +
        "  SYNCRO_API_KEY    - Your Syncro API key (Admin > API Tokens)\n" +
        "  SYNCRO_SUBDOMAIN  - Your Syncro subdomain (e.g., 'mycompany' from mycompany.syncromsp.com)"
    );
  }
  return new SyncroApiClient({ apiKey, subdomain });
}

// Tool mode: "flat" registers all 170 tools at startup (works everywhere).
// "navigation" uses lazy-loaded domains (lower token usage, requires client
// support for notifications/tools/list_changed).
// Default: "flat" for maximum compatibility.
const toolMode = (process.env.MCP_TOOL_MODE || "flat") as ToolMode;

interface AuthWiring {
  authMiddleware: RequestHandler;
  installer: (app: Express) => void;
}

async function setUpOAuth(mcpServerUrl: URL): Promise<AuthWiring> {
  const { McpOAuthProvider, createOAuthWiring, loadHttpAuthConfig, AuthConfigError } =
    await import("./auth/index.js");

  let config;
  try {
    config = loadHttpAuthConfig(process.env);
  } catch (error) {
    if (error instanceof AuthConfigError) fail(`ERROR: ${error.message}`);
    throw error;
  }
  config.warnings.forEach((w) => console.error(w));

  const provider = new McpOAuthProvider({
    encryptionKey: config.encryptionKey,
    previousEncryptionKeys: config.previousEncryptionKeys,
    subdomainPolicy: config.subdomainPolicy,
  });

  const { authMiddleware, installRoutes } = createOAuthWiring(provider, mcpServerUrl);

  const policy = config.subdomainPolicy;
  const scope =
    policy.kind === "locked"
      ? `locked to ${policy.subdomain}`
      : policy.kind === "allowlist"
        ? `${policy.subdomains.size} allowed subdomain(s)`
        : "any subdomain";
  console.error(`OAuth enabled: users sign in with their own Syncro API key (${scope}).`);
  console.error(`Issuer: ${mcpServerUrl}`);
  return { authMiddleware, installer: installRoutes };
}

async function startHttp(): Promise<void> {
  const port = parseInt(process.env.MCP_PORT || "8080", 10);
  const useAuth = process.env.MCP_AUTH !== "false";
  const baseUrl = process.env.MCP_BASE_URL || `http://localhost:${port}`;
  const mcpServerUrl = new URL(baseUrl);

  // Hard-fail when auth is disabled unless the operator has explicitly
  // acknowledged the risk. Stops accidental exposure of an unauthenticated
  // MCP endpoint to the public internet.
  if (!useAuth && process.env.MCP_I_UNDERSTAND_INSECURE !== "true") {
    fail(
      "ERROR: MCP_AUTH=false disables OAuth on the HTTP endpoint, leaving the server unauthenticated.\n" +
        "  This is dangerous on any network that is not strictly isolated.\n" +
        "  If you understand the risk and intend to disable auth, set:\n" +
        "    MCP_I_UNDERSTAND_INSECURE=true\n" +
        "  Otherwise, set MCP_AUTH=true and provide MCP_TOKEN_ENCRYPTION_KEY."
    );
  }

  const idleMinutesRaw = process.env.MCP_SESSION_IDLE_MINUTES;
  const idleMinutes = idleMinutesRaw ? Number(idleMinutesRaw) : undefined;
  if (idleMinutes !== undefined && !(Number.isFinite(idleMinutes) && idleMinutes > 0)) {
    fail("ERROR: MCP_SESSION_IDLE_MINUTES must be a positive number.");
  }

  const perUserRaw = process.env.MCP_MAX_SESSIONS_PER_USER;
  const maxSessionsPerUser = perUserRaw ? Number(perUserRaw) : undefined;
  if (
    maxSessionsPerUser !== undefined &&
    !(Number.isInteger(maxSessionsPerUser) && maxSessionsPerUser > 0)
  ) {
    fail("ERROR: MCP_MAX_SESSIONS_PER_USER must be a positive whole number.");
  }

  const { createHttpApp } = await import("./http-app.js");
  const wiring = useAuth ? await setUpOAuth(mcpServerUrl) : undefined;
  const fallbackClient = useAuth ? null : clientFromEnv();
  if (!useAuth) {
    console.error(
      "Auth disabled (MCP_AUTH=false, MCP_I_UNDERSTAND_INSECURE=true). WARNING: Server is unprotected."
    );
  }

  const { app, shutdown: shutdownApp } = createHttpApp(fallbackClient, {
    toolMode,
    authMiddleware: wiring?.authMiddleware,
    idleTimeoutMs: idleMinutes !== undefined ? idleMinutes * 60 * 1000 : undefined,
    maxSessionsPerUser,
    preMcpRouteInstaller: wiring?.installer,
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
}

async function startStdio(): Promise<void> {
  const mcpServer = createServer(clientFromEnv(), toolMode);
  await mcpServer.connect(new StdioServerTransport());

  const shutdown = async () => {
    await mcpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if ((process.env.MCP_TRANSPORT || "stdio") === "http") {
  await startHttp();
} else {
  await startStdio();
}
