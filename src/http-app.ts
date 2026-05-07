import express, {
  type Express,
  type RequestHandler,
  type Request,
  type Response,
} from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SyncroApiClient } from "./api-client.js";
import { createServer, type ToolMode } from "./server.js";

export const DEFAULT_MAX_SESSIONS = 1000;

export interface HttpAppOptions {
  toolMode: ToolMode;
  authMiddleware?: RequestHandler;
  maxSessions?: number;
  /**
   * Optional pre-configured handlers to be installed BEFORE the /mcp routes.
   * Used by index.ts to install the OAuth router (which itself sets a CSP
   * on the login page). Headers middleware always runs first regardless.
   */
  preMcpRouteInstaller?: (app: Express) => void;
}

export interface HttpAppHandle {
  app: Express;
  sessions: Record<
    string,
    {
      transport: InstanceType<typeof StreamableHTTPServerTransport>;
      server: ReturnType<typeof createServer>;
    }
  >;
  shutdown: () => void;
}

/**
 * Builds and configures the Express app used for the HTTP transport.
 * Pure (no app.listen) so tests can mount it without binding a port.
 */
export function createHttpApp(
  client: SyncroApiClient,
  options: HttpAppOptions
): HttpAppHandle {
  const {
    toolMode,
    authMiddleware,
    maxSessions = DEFAULT_MAX_SESSIONS,
    preMcpRouteInstaller,
  } = options;

  const app = express();

  // 1. Honor X-Forwarded-For from a single reverse proxy hop. Without this,
  //    the SDK's internal rate limiter and any IP-based logging see the
  //    proxy IP, not the real client IP.
  app.set("trust proxy", 1);

  // 2. Security headers — set on every response BEFORE route handlers run.
  //    Note: no global Content-Security-Policy here — the OAuth login page
  //    in src/auth.ts sets its own CSP and a global one would conflict.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    next();
  });

  // 3. Body parsers with explicit limits. Without these limits, an attacker
  //    could send arbitrarily large bodies and exhaust memory.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  // 4. Health check (always unauthenticated). Intentionally minimal — the
  //    transport/auth fields previously here leaked configuration to
  //    unauthenticated callers.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // 5. Optional installer: lets the caller (index.ts) attach OAuth routes
  //    AFTER security headers + body parsers but BEFORE the /mcp endpoints.
  if (preMcpRouteInstaller) {
    preMcpRouteInstaller(app);
  }

  // Session management — each session gets its own Server + Transport pair
  // because the MCP SDK Server can only bind to one transport at a time.
  const sessions: HttpAppHandle["sessions"] = {};

  const mcpHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (sessionId && sessions[sessionId]) {
        await sessions[sessionId].transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        // Cap the sessions Map to prevent unbounded growth from abusive
        // or buggy clients. 1000 is generous for legitimate use.
        if (Object.keys(sessions).length >= maxSessions) {
          console.error(
            `Session cap reached (${maxSessions}); rejecting new session`
          );
          res.status(503).json({ error: "Server at session capacity" });
          return;
        }

        // Create a fresh Server + Transport for this session
        const sessionServer = createServer(client, toolMode);
        const sessionTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions[sid] = { transport: sessionTransport, server: sessionServer };
          },
        });
        sessionTransport.onclose = () => {
          const sid = sessionTransport.sessionId;
          if (sid) delete sessions[sid];
        };
        await sessionServer.connect(sessionTransport);
        await sessionTransport.handleRequest(req, res, req.body);
        return;
      }

      res
        .status(400)
        .json({ error: "Bad request: missing session ID or not an init request" });
    } catch (error) {
      // Log full error server-side; client only sees generic 500.
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

  // Periodic session-count logging. .unref() so the timer doesn't keep the
  // process alive on its own; clearInterval on shutdown for tidiness.
  const sessionLogInterval = setInterval(() => {
    const count = Object.keys(sessions).length;
    if (count > 0) {
      console.error(`Active MCP sessions: ${count}`);
    }
  }, 60000);
  sessionLogInterval.unref();

  const shutdown = () => {
    clearInterval(sessionLogInterval);
    for (const s of Object.values(sessions)) {
      s.transport.close();
    }
  };

  return { app, sessions, shutdown };
}
