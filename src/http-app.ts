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
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const DEFAULT_SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface HttpAppOptions {
  toolMode: ToolMode;
  authMiddleware?: RequestHandler;
  maxSessions?: number;
  idleTimeoutMs?: number;
  sweepIntervalMs?: number;
  /**
   * Optional pre-configured handlers to be installed BEFORE the /mcp routes.
   * Used by index.ts to install the OAuth router (which itself sets a CSP
   * on the login page). Headers middleware always runs first regardless.
   */
  preMcpRouteInstaller?: (app: Express) => void;
}

interface SessionEntry {
  transport: InstanceType<typeof StreamableHTTPServerTransport>;
  server: ReturnType<typeof createServer>;
  lastActivity: number;
}

export interface HttpAppHandle {
  app: Express;
  sessions: Record<string, SessionEntry>;
  sweepIdleSessions: (now?: number) => void;
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
    idleTimeoutMs = DEFAULT_SESSION_IDLE_TIMEOUT_MS,
    sweepIntervalMs = DEFAULT_SESSION_SWEEP_INTERVAL_MS,
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

  // Most clients (claude.ai included) never send DELETE /mcp when a chat
  // ends, so without this sweep abandoned sessions pile up until the cap.
  const closeSession = (sid: string) => {
    const entry = sessions[sid];
    if (!entry) return;
    delete sessions[sid];
    entry.server.close().catch((error) => {
      console.error(`Error closing MCP session ${sid}:`, error);
    });
  };

  const sweepIdleSessions = (now: number = Date.now()) => {
    const cutoff = now - idleTimeoutMs;
    const idle = Object.entries(sessions)
      .filter(([, entry]) => entry.lastActivity < cutoff)
      .map(([sid]) => sid);
    idle.forEach(closeSession);
    if (idle.length > 0) {
      console.error(`Closed ${idle.length} idle MCP session(s)`);
    }
  };

  const evictLeastRecentlyUsed = () => {
    const oldest = Object.entries(sessions).reduce<[string, SessionEntry] | undefined>(
      (acc, cur) => (!acc || cur[1].lastActivity < acc[1].lastActivity ? cur : acc),
      undefined
    );
    if (oldest) closeSession(oldest[0]);
  };

  const touch = (sid: string) => {
    const entry = sessions[sid];
    if (entry) sessions[sid] = { ...entry, lastActivity: Date.now() };
  };

  const mcpHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (sessionId && sessions[sessionId]) {
        touch(sessionId);
        // Long-lived GET streams count as activity until they end.
        res.on("close", () => touch(sessionId));
        await sessions[sessionId].transport.handleRequest(req, res, req.body);
        return;
      }

      // Per the MCP spec, 404 tells the client to start a new session.
      if (sessionId) {
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        });
        return;
      }

      if (isInitializeRequest(req.body)) {
        if (Object.keys(sessions).length >= maxSessions) {
          sweepIdleSessions();
        }
        if (Object.keys(sessions).length >= maxSessions && maxSessions > 0) {
          console.error(
            `Session cap reached (${maxSessions}); evicting least recently used session`
          );
          evictLeastRecentlyUsed();
        }
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
            sessions[sid] = {
              transport: sessionTransport,
              server: sessionServer,
              lastActivity: Date.now(),
            };
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
  const sweepInterval = setInterval(() => sweepIdleSessions(), sweepIntervalMs);
  sweepInterval.unref();

  const sessionLogInterval = setInterval(() => {
    const count = Object.keys(sessions).length;
    if (count > 0) {
      console.error(`Active MCP sessions: ${count}`);
    }
  }, 60000);
  sessionLogInterval.unref();

  const shutdown = () => {
    clearInterval(sweepInterval);
    clearInterval(sessionLogInterval);
    Object.keys(sessions).forEach(closeSession);
  };

  return { app, sessions, sweepIdleSessions, shutdown };
}
