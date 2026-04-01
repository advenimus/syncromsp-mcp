import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient } from "../../src/api-client.js";
import { createServer } from "../../src/server.js";
import { removeSession, getDefaultSessionId } from "../../src/session.js";

// Mock fetch to prevent real API calls
vi.spyOn(globalThis, "fetch").mockResolvedValue(
  new Response(JSON.stringify({ tickets: [] }), { status: 200 })
);

function createTestServer() {
  const client = new SyncroApiClient({ apiKey: "test-key", subdomain: "test" });
  return createServer(client);
}

describe("Navigation", () => {
  beforeEach(() => {
    removeSession(getDefaultSessionId());
  });

  it("should list navigation tools at root", async () => {
    const server = createTestServer();

    // Access the ListTools handler directly via protocol
    const result = await (server as any)._requestHandlers.get("tools/list")!({
      method: "tools/list",
      params: {},
    }, {});

    expect(result.tools).toHaveLength(3);
    const names = result.tools.map((t: any) => t.name);
    expect(names).toContain("syncro_navigate");
    expect(names).toContain("syncro_status");
    expect(names).toContain("syncro_back");
  });

  it("should show domain tools after navigation", async () => {
    const server = createTestServer();

    // Navigate to tickets
    const callHandler = (server as any)._requestHandlers.get("tools/call")!;
    const notifHandler = (server as any)._notificationHandlers;

    // Suppress notification errors
    vi.spyOn(server, "notification").mockResolvedValue(undefined);

    await callHandler({
      method: "tools/call",
      params: { name: "syncro_navigate", arguments: { domain: "tickets" } },
    }, {});

    // Now list tools should show ticket tools
    const listHandler = (server as any)._requestHandlers.get("tools/list")!;
    const result = await listHandler({ method: "tools/list", params: {} }, {});

    const names = result.tools.map((t: any) => t.name);
    expect(names).toContain("tickets_list");
    expect(names).toContain("tickets_get");
    expect(names).toContain("tickets_create");
    expect(names).toContain("syncro_back");
    expect(names).not.toContain("syncro_navigate");
  });

  it("should return to root after syncro_back", async () => {
    const server = createTestServer();
    vi.spyOn(server, "notification").mockResolvedValue(undefined);

    const callHandler = (server as any)._requestHandlers.get("tools/call")!;

    // Navigate to tickets
    await callHandler({
      method: "tools/call",
      params: { name: "syncro_navigate", arguments: { domain: "tickets" } },
    }, {});

    // Go back
    await callHandler({
      method: "tools/call",
      params: { name: "syncro_back", arguments: {} },
    }, {});

    // Should be back at root
    const listHandler = (server as any)._requestHandlers.get("tools/list")!;
    const result = await listHandler({ method: "tools/list", params: {} }, {});

    expect(result.tools).toHaveLength(3);
    const names = result.tools.map((t: any) => t.name);
    expect(names).toContain("syncro_navigate");
  });

  it("should reject invalid domain", async () => {
    const server = createTestServer();
    vi.spyOn(server, "notification").mockResolvedValue(undefined);

    const callHandler = (server as any)._requestHandlers.get("tools/call")!;
    const result = await callHandler({
      method: "tools/call",
      params: { name: "syncro_navigate", arguments: { domain: "invalid" } },
    }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown domain");
  });

  it("should show status at root", async () => {
    const server = createTestServer();

    const callHandler = (server as any)._requestHandlers.get("tools/call")!;
    const result = await callHandler({
      method: "tools/call",
      params: { name: "syncro_status", arguments: {} },
    }, {});

    expect(result.content[0].text).toContain("Not in any domain");
    expect(result.content[0].text).toContain("tickets");
  });
});
