import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import { createHttpApp, type HttpAppHandle } from "../../src/http-app.js";
import { McpOAuthProvider, createOAuthWiring } from "../../src/auth/index.js";

/**
 * Full sign-in through the real SDK router: register, authorize, log in with
 * a Syncro key (Syncro mocked), exchange the code, then use /mcp. Also checks
 * that sign-ins survive a "restart" (new provider + app, same key).
 */

const ENC_KEY = randomBytes(32);
const API_KEY = "T-e2e-SyncroKey-0123456789";
const REDIRECT = "http://localhost:9999/cb";
const realFetch = globalThis.fetch;

interface Running {
  handle: HttpAppHandle;
  provider: McpOAuthProvider;
  server: HttpServer;
  url: string;
}

async function start(): Promise<Running> {
  const provider = new McpOAuthProvider({
    encryptionKey: ENC_KEY,
    subdomainPolicy: { kind: "allowlist", subdomains: new Set(["acme"]) },
  });
  // Issuer must be known before listen; the router only uses it for metadata.
  const wiring = createOAuthWiring(provider, new URL("http://localhost:3999"));
  const handle = createHttpApp(null, {
    toolMode: "flat",
    authMiddleware: wiring.authMiddleware,
    preMcpRouteInstaller: wiring.installRoutes,
  });
  const server = await new Promise<HttpServer>((resolve) => {
    const s = handle.app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { handle, provider, server, url: `http://127.0.0.1:${port}` };
}

async function stop(r: Running) {
  r.handle.shutdown();
  r.provider.dispose();
  await new Promise<void>((resolve) => r.server.close(() => resolve()));
}

const syncroCalls: Array<{ url: string; auth?: string }> = [];
let logs: string[] = [];

beforeEach(() => {
  syncroCalls.length = 0;
  logs = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    if (target.includes("syncromsp.com")) {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      syncroCalls.push({ url: target, auth });
      const ok = auth === `Bearer ${API_KEY}`;
      return new Response(JSON.stringify(ok ? { user: { id: 1 } } : { error: "nope" }), {
        status: ok ? 200 : 401,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function register(url: string): Promise<string> {
  const res = await fetch(`${url}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "E2E",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

async function signIn(url: string, clientId: string, apiKey = API_KEY) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL(`${url}/authorize`);
  Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st",
    scope: "mcp:tools",
  }).forEach(([k, v]) => authorize.searchParams.set(k, v));

  const page = await fetch(authorize);
  expect(page.status).toBe(200);
  const html = await page.text();
  const pendingId = /name="pending_id" value="([^"]+)"/.exec(html)![1]!;

  const callback = await fetch(`${url}/authorize/callback`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ pending_id: pendingId, subdomain: "acme", api_key: apiKey }),
    redirect: "manual",
  });
  return { callback, verifier };
}

async function exchange(url: string, clientId: string, code: string, verifier: string) {
  const res = await fetch(`${url}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT,
    }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

async function initialize(url: string, bearer: string): Promise<Response> {
  const res = await fetch(`${url}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "e2e", version: "0.0.0" },
      },
    }),
  });
  await res.text();
  return res;
}

async function callGetMe(url: string, bearer: string, sid: string): Promise<number> {
  const res = await fetch(`${url}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${bearer}`,
      "mcp-session-id": sid,
      "mcp-protocol-version": "2025-03-26",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "admin_get_me", arguments: {} },
    }),
  });
  await res.text();
  return res.status;
}

describe("OAuth sign-in end to end", () => {
  it("signs in with a Syncro key and uses it for tool calls", async () => {
    const r = await start();
    try {
      const clientId = await register(r.url);
      const { callback, verifier } = await signIn(r.url, clientId);
      expect(callback.status).toBe(302);
      const location = new URL(callback.headers.get("location")!);
      expect(location.origin + location.pathname).toBe(REDIRECT);
      const code = location.searchParams.get("code")!;

      const tokens = await exchange(r.url, clientId, code, verifier);
      expect(tokens.expires_in).toBe(3600);

      const init = await initialize(r.url, tokens.access_token);
      expect(init.status).toBe(200);
      const sid = init.headers.get("mcp-session-id")!;
      expect(await callGetMe(r.url, tokens.access_token, sid)).toBe(200);

      expect(syncroCalls.map((c) => c.url)).toEqual([
        "https://acme.syncromsp.com/api/v1/me",
        "https://acme.syncromsp.com/api/v1/me",
      ]);
      expect(syncroCalls.every((c) => c.auth === `Bearer ${API_KEY}`)).toBe(true);

      const refreshAsBearer = await initialize(r.url, tokens.refresh_token);
      expect(refreshAsBearer.status).toBe(401);

      const everything = logs.join("\n");
      expect(everything).not.toContain(API_KEY);
      expect(everything).not.toContain(tokens.access_token);
      expect(everything).not.toContain(tokens.refresh_token);
    } finally {
      await stop(r);
    }
  });

  it("rejects a bad key with a generic page and no redirect", async () => {
    const r = await start();
    try {
      const clientId = await register(r.url);
      const { callback } = await signIn(r.url, clientId, "T-wrong-key-000000");
      expect(callback.status).toBe(403);
      const body = await callback.text();
      expect(body).toContain("Sign-in failed");
      expect(body).not.toContain("T-wrong-key-000000");
      expect(logs.join("\n")).not.toContain("T-wrong-key-000000");
    } finally {
      await stop(r);
    }
  });

  it("keeps the client registration and tokens working across a restart", async () => {
    const first = await start();
    const clientId = await register(first.url);
    const { callback, verifier } = await signIn(first.url, clientId);
    const code = new URL(callback.headers.get("location")!).searchParams.get("code")!;
    const tokens = await exchange(first.url, clientId, code, verifier);
    await stop(first);

    const second = await start();
    try {
      expect((await initialize(second.url, tokens.access_token)).status).toBe(200);

      const refresh = await fetch(`${second.url}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }),
      });
      expect(refresh.status).toBe(200);
      const rotated = (await refresh.json()) as { access_token: string };
      expect((await initialize(second.url, rotated.access_token)).status).toBe(200);
    } finally {
      await stop(second);
    }
  });
});
