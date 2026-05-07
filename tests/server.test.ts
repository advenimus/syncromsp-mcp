import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import { SyncroApiClient } from "../src/api-client.js";
import { createHttpApp, type HttpAppHandle } from "../src/http-app.js";

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
