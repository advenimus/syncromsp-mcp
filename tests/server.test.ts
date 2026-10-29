import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import type { RequestHandler } from "express";
import { SyncroApiClient } from "../src/api-client.js";
import { hasCachedDomains } from "../src/domains/index.js";
import {
  createHttpApp,
  MIN_EVICTION_IDLE_MS,
  type HttpAppHandle,
} from "../src/http-app.js";

/**
 * Tests for the HTTP transport layer (src/http-app.ts).
 *
 * These tests bind to an ephemeral port and exercise the Express app via
 * the global fetch (Node 20+). No new deps required.
 */

const SECURITY_HEADERS = [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "no-referrer"],
  ["x-dns-prefetch-control", "off"],
  ["x-permitted-cross-domain-policies", "none"],
  ["strict-transport-security", "max-age=31536000; includeSubDomains"],
];

function listen(handle: HttpAppHandle): Promise<{ url: string; server: HttpServer }> {
  return new Promise((resolve) => {
    const server = handle.app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

function makeClient(): SyncroApiClient {
  // The api-client only opens connections when an HTTP request method is
  // invoked; constructing it is cheap and side-effect-free, so this is
  // safe to use in tests that never trigger an outbound call.
  return new SyncroApiClient({ apiKey: "test-key", subdomain: "test" });
}

describe("createHttpApp — security headers", () => {
  let handle: HttpAppHandle;
  let server: HttpServer;
  let url: string;

  beforeAll(async () => {
    handle = createHttpApp(makeClient(), { toolMode: "flat" });
    const started = await listen(handle);
    server = started.server;
    url = started.url;
  });

  afterAll(async () => {
    handle.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sets all required security headers on /health", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    for (const [name, value] of SECURITY_HEADERS) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("sets all required security headers on a 4xx response too", async () => {
    // Unknown route → 404, but headers must still be present.
    const res = await fetch(`${url}/does-not-exist`);
    expect(res.status).toBe(404);
    for (const [name, value] of SECURITY_HEADERS) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("does NOT set a global Content-Security-Policy", async () => {
    // The OAuth login page sets its own CSP; a global one would conflict.
    const res = await fetch(`${url}/health`);
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});

describe("createHttpApp — /health", () => {
  let handle: HttpAppHandle;
  let server: HttpServer;
  let url: string;

  beforeAll(async () => {
    handle = createHttpApp(makeClient(), { toolMode: "flat" });
    const started = await listen(handle);
    server = started.server;
    url = started.url;
  });

  afterAll(async () => {
    handle.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns exactly {status:'ok'} with no extra fields", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Strict equality: no transport / auth fields leaked.
    expect(body).toEqual({ status: "ok" });
    expect(Object.keys(body).sort()).toEqual(["status"]);
  });
});

describe("createHttpApp — body limits", () => {
  let handle: HttpAppHandle;
  let server: HttpServer;
  let url: string;

  beforeAll(async () => {
    handle = createHttpApp(makeClient(), { toolMode: "flat" });
    const started = await listen(handle);
    server = started.server;
    url = started.url;
  });

  afterAll(async () => {
    handle.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("rejects POST /mcp bodies larger than 1mb with 413", async () => {
    // Build a ~2mb JSON-shaped payload.
    const padding = "a".repeat(2 * 1024 * 1024);
    const body = JSON.stringify({ pad: padding });
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(413);
  });
});

describe("createHttpApp — auth wiring", () => {
  let handle: HttpAppHandle;
  let server: HttpServer;
  let url: string;

  beforeAll(async () => {
    // Stub middleware that mimics the SDK's bearer-auth rejection: any
    // request without a valid token gets a 401. We only verify wiring
    // here — not the OAuth provider itself (out of scope).
    handle = createHttpApp(makeClient(), {
      toolMode: "flat",
      authMiddleware: (_req, res, _next) => {
        res.status(401).json({ error: "unauthorized" });
      },
    });
    const started = await listen(handle);
    server = started.server;
    url = started.url;
  });

  afterAll(async () => {
    handle.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 401 on POST /mcp when auth middleware rejects", async () => {
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
  });

  it("/health remains accessible even when auth is configured", async () => {
    // /health must never require auth — operators rely on it for liveness.
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
  });
});

describe("createHttpApp — session cap", () => {
  let handle: HttpAppHandle;
  let server: HttpServer;
  let url: string;

  beforeEach(async () => {
    handle = createHttpApp(makeClient(), {
      toolMode: "flat",
      // Cap at 0 — any new init request must be rejected with 503.
      // Setting to 0 lets us verify the cap path without needing to
      // successfully establish a real MCP session first (which would
      // require a full SDK client handshake).
      maxSessions: 0,
    });
    const started = await listen(handle);
    server = started.server;
    url = started.url;
  });

  afterAll(async () => {
    if (server) {
      handle.shutdown();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns 503 once session count reaches the cap", async () => {
    // Send a valid initialize request shape — the cap check happens before
    // any transport machinery, so we only need the request to look like an
    // MCP initialize JSON-RPC payload.
    const initBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
      },
    };
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(initBody),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "Server at session capacity" });

    handle.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("createHttpApp — idle session cleanup", () => {
  let handle: HttpAppHandle;
  let server: HttpServer;
  let url: string;

  const IDLE_MS = 60 * 60 * 1000;

  const initBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" },
    },
  };

  async function openSession(): Promise<string> {
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(initBody),
    });
    expect(res.status).toBe(200);
    await res.text();
    const sid = res.headers.get("mcp-session-id");
    expect(sid).toBeTruthy();
    return sid!;
  }

  async function ping(sid: string): Promise<Response> {
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": sid,
        "mcp-protocol-version": "2025-03-26",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    await res.text();
    return res;
  }

  async function openStream(sid: string) {
    const controller = new AbortController();
    const stream = await fetch(`${url}/mcp`, {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sid,
        "mcp-protocol-version": "2025-03-26",
      },
      signal: controller.signal,
    });
    expect(stream.status).toBe(200);
    return { controller, stream };
  }

  function backdate(sid: string, ageMs: number) {
    handle.sessions[sid] = {
      ...handle.sessions[sid]!,
      lastActivity: Date.now() - ageMs,
    };
  }

  async function start(maxSessions?: number) {
    handle = createHttpApp(makeClient(), {
      toolMode: "flat",
      idleTimeoutMs: IDLE_MS,
      ...(maxSessions !== undefined ? { maxSessions } : {}),
    });
    const started = await listen(handle);
    server = started.server;
    url = started.url;
  }

  afterEach(async () => {
    handle.shutdown();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("removes sessions that have been idle longer than the timeout", async () => {
    await start();
    const sid = await openSession();
    expect(Object.keys(handle.sessions)).toContain(sid);

    handle.sweepIdleSessions(Date.now() + IDLE_MS + 1000);

    expect(Object.keys(handle.sessions)).not.toContain(sid);
  });

  it("keeps sessions that are still within the timeout", async () => {
    await start();
    const sid = await openSession();

    handle.sweepIdleSessions(Date.now() + IDLE_MS - 60_000);

    expect(Object.keys(handle.sessions)).toContain(sid);
  });

  it("counts each request as activity, pushing back the idle deadline", async () => {
    await start();
    const sid = await openSession();
    const openedAt = handle.sessions[sid]!.lastActivity;

    await new Promise((r) => setTimeout(r, 5));
    expect((await ping(sid)).status).toBe(200);

    expect(handle.sessions[sid]!.lastActivity).toBeGreaterThan(openedAt);
  });

  it("keeps a session with an open event stream, then sweeps it once the stream ends", async () => {
    await start();
    const sid = await openSession();
    const { controller, stream } = await openStream(sid);

    handle.sweepIdleSessions(Date.now() + IDLE_MS + 1000);
    expect(Object.keys(handle.sessions)).toContain(sid);

    controller.abort();
    await stream.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(handle.sessions[sid]!.openRequests).toBe(0);

    handle.sweepIdleSessions(Date.now() + IDLE_MS + 1000);
    expect(Object.keys(handle.sessions)).not.toContain(sid);
  });

  it("returns 404 for an unknown session so the client starts a new one", async () => {
    await start();
    const sid = await openSession();
    handle.sweepIdleSessions(Date.now() + IDLE_MS + 1000);

    const res = await ping(sid);

    expect(res.status).toBe(404);
  });

  it("evicts the least recently used idle session at the cap", async () => {
    await start(2);
    const first = await openSession();
    const second = await openSession();
    backdate(first, MIN_EVICTION_IDLE_MS + 60_000);
    backdate(second, MIN_EVICTION_IDLE_MS + 120_000);

    const third = await openSession();

    const ids = Object.keys(handle.sessions);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(first);
    expect(ids).toContain(third);
    expect(ids).not.toContain(second);
  });

  it("returns 503 at the cap when every session is busy or recently active", async () => {
    await start(2);
    const busy = await openSession();
    const recent = await openSession();
    const { controller, stream } = await openStream(busy);
    backdate(busy, MIN_EVICTION_IDLE_MS + 60_000);

    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(initBody),
    });
    await res.text();

    expect(res.status).toBe(503);
    expect(Object.keys(handle.sessions).sort()).toEqual([busy, recent].sort());

    controller.abort();
    await stream.body?.cancel().catch(() => {});
  });
});

describe("createHttpApp — per-user Syncro credentials", () => {
  let handle: HttpAppHandle;
  let server: HttpServer;
  let url: string;
  const realFetch = globalThis.fetch;
  let syncroCalls: Array<{ url: string; authorization: string | undefined }>;

  const USERS: Record<string, { subdomain: string; apiKey: string }> = {
    alice: { subdomain: "alpha", apiKey: "key-alice-123" },
    bob: { subdomain: "bravo", apiKey: "key-bob-456" },
  };

  const testAuth: RequestHandler = (req, res, next) => {
    const user = req.headers["x-test-user"];
    if (user === "no-creds") {
      req.auth = { token: "t", clientId: "c", scopes: [], expiresAt: 9e9 };
      next();
      return;
    }
    const creds = typeof user === "string" ? USERS[user] : undefined;
    if (!creds) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.auth = {
      token: `token-${user}`,
      clientId: "client",
      scopes: [],
      expiresAt: 9e9,
      extra: { syncro: creds },
    };
    next();
  };

  const headersFor = (user: string, sid?: string): Record<string, string> => ({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-test-user": user,
    ...(sid ? { "mcp-session-id": sid, "mcp-protocol-version": "2025-03-26" } : {}),
  });

  async function openSessionAs(user: string): Promise<Response> {
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: headersFor(user),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      }),
    });
    await res.text();
    return res;
  }

  async function callAs(
    user: string,
    sid: string,
    body: object
  ): Promise<{ status: number; text: string }> {
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: headersFor(user, sid),
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  }

  const getMe = {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "admin_get_me", arguments: {} },
  };

  async function stop() {
    handle.shutdown();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async function start(fallback: SyncroApiClient | null) {
    handle = createHttpApp(fallback, { toolMode: "flat", authMiddleware: testAuth });
    const started = await listen(handle);
    server = started.server;
    url = started.url;
  }

  beforeEach(async () => {
    syncroCalls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      if (target.includes("syncromsp.com")) {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        syncroCalls.push({ url: target, authorization: headers.Authorization });
        return new Response(JSON.stringify({ user: { id: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    await start(null);
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    await stop();
  });

  it("calls Syncro with the session owner's own subdomain and key", async () => {
    const res = await openSessionAs("alice");
    expect(res.status).toBe(200);
    const sid = res.headers.get("mcp-session-id")!;

    const call = await callAs("alice", sid, getMe);
    expect(call.status).toBe(200);
    expect(syncroCalls).toEqual([
      { url: "https://alpha.syncromsp.com/api/v1/me", authorization: "Bearer key-alice-123" },
    ]);
  });

  it("keeps users apart even after the first user loaded the tool domains", async () => {
    const a = (await openSessionAs("alice")).headers.get("mcp-session-id")!;
    const b = (await openSessionAs("bob")).headers.get("mcp-session-id")!;
    await callAs("alice", a, getMe);
    await callAs("bob", b, getMe);
    expect(syncroCalls.map((c) => c.authorization)).toEqual([
      "Bearer key-alice-123",
      "Bearer key-bob-456",
    ]);
    expect(syncroCalls[1]!.url).toBe("https://bravo.syncromsp.com/api/v1/me");
  });

  it("returns 404 when another user presents someone else's session id", async () => {
    const sid = (await openSessionAs("alice")).headers.get("mcp-session-id")!;

    const hijack = await callAs("bob", sid, getMe);
    expect(hijack.status).toBe(404);
    expect(syncroCalls).toHaveLength(0);

    const owner = await callAs("alice", sid, { jsonrpc: "2.0", id: 2, method: "ping" });
    expect(owner.status).toBe(200);
  });

  it("returns the same 404 body for a hijack attempt and an unknown session", async () => {
    const sid = (await openSessionAs("alice")).headers.get("mcp-session-id")!;
    const hijack = await callAs("bob", sid, getMe);
    const unknown = await callAs("bob", "00000000-0000-0000-0000-000000000000", getMe);
    expect(hijack.status).toBe(unknown.status);
    expect(hijack.text).toBe(unknown.text);
  });

  it("refuses to open a session when the token carries no Syncro credentials", async () => {
    const res = await openSessionAs("no-creds");
    expect(res.status).toBe(401);
    expect(Object.keys(handle.sessions)).toHaveLength(0);
  });

  it("never falls back to a server-wide client when auth is on", async () => {
    await stop();
    await start(makeClient());
    const res = await openSessionAs("no-creds");
    expect(res.status).toBe(401);
    expect(Object.keys(handle.sessions)).toHaveLength(0);
  });

  async function sessionWithLoadedDomains(user: string) {
    const sid = (await openSessionAs(user)).headers.get("mcp-session-id")!;
    await callAs(user, sid, getMe);
    const client = handle.sessions[sid]!.client;
    expect(hasCachedDomains(client)).toBe(true);
    return { sid, client };
  }

  it("drops the per-user domain cache when the idle sweep closes a session", async () => {
    const { sid, client } = await sessionWithLoadedDomains("alice");
    handle.sweepIdleSessions(Date.now() + 2 * 60 * 60 * 1000);
    expect(handle.sessions[sid]).toBeUndefined();
    expect(hasCachedDomains(client)).toBe(false);
  });

  it("drops the per-user domain cache when a session is evicted at the cap", async () => {
    await stop();
    handle = createHttpApp(null, { toolMode: "flat", authMiddleware: testAuth, maxSessions: 1 });
    const started = await listen(handle);
    server = started.server;
    url = started.url;

    const { sid, client } = await sessionWithLoadedDomains("alice");
    handle.sessions[sid] = {
      ...handle.sessions[sid]!,
      lastActivity: Date.now() - MIN_EVICTION_IDLE_MS - 1000,
    };
    expect((await openSessionAs("bob")).status).toBe(200);
    expect(handle.sessions[sid]).toBeUndefined();
    expect(hasCachedDomains(client)).toBe(false);
  });

  it("drops the per-user domain cache when the client deletes its session", async () => {
    const { sid, client } = await sessionWithLoadedDomains("alice");
    const res = await fetch(`${url}/mcp`, { method: "DELETE", headers: headersFor("alice", sid) });
    await res.text();
    expect(handle.sessions[sid]).toBeUndefined();
    expect(hasCachedDomains(client)).toBe(false);
  });
});
