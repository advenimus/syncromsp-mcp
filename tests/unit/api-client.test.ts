import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient, SyncroApiError } from "../../src/api-client.js";

describe("SyncroApiClient", () => {
  it("should throw if apiKey is missing", () => {
    expect(() => new SyncroApiClient({ apiKey: "", subdomain: "test" })).toThrow(
      "SYNCRO_API_KEY is required"
    );
  });

  it("should throw if subdomain is missing", () => {
    expect(
      () => new SyncroApiClient({ apiKey: "key", subdomain: "" })
    ).toThrow("SYNCRO_SUBDOMAIN is required");
  });

  it("should construct proper base URL", async () => {
    const client = new SyncroApiClient({
      apiKey: "test-key",
      subdomain: "mycompany",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: "test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await client.get("/tickets");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://mycompany.syncromsp.com/api/v1/tickets",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it("should include query parameters", async () => {
    const client = new SyncroApiClient({
      apiKey: "test-key",
      subdomain: "mycompany",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await client.get("/tickets", { status: "New", page: 2 });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("status=New");
    expect(calledUrl).toContain("page=2");

    fetchSpy.mockRestore();
  });

  it("should send JSON body on POST", async () => {
    const client = new SyncroApiClient({
      apiKey: "test-key",
      subdomain: "mycompany",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await client.post("/tickets", { subject: "Test", customer_id: 1 });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ subject: "Test", customer_id: 1 }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it("should throw SyncroApiError on non-OK response", async () => {
    const client = new SyncroApiClient({
      apiKey: "bad-key",
      subdomain: "mycompany",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    await expect(client.get("/tickets")).rejects.toThrow(SyncroApiError);
    await expect(client.get("/tickets")).rejects.toThrow("Invalid or expired API key");

    vi.restoreAllMocks();
  });

  it("should handle 404 errors", async () => {
    const client = new SyncroApiClient({
      apiKey: "key",
      subdomain: "mycompany",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 404 })
    );

    await expect(client.get("/tickets/999")).rejects.toThrow("Resource not found");

    vi.restoreAllMocks();
  });

  it("should append API-provided detail to 403 errors when present", async () => {
    const client = new SyncroApiClient({ apiKey: "key", subdomain: "mycompany" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ errors: ["Required permission: Policies - Create"] }), { status: 403 })
    );

    await expect(client.post("/policy_folders", { name: "x" })).rejects.toThrow(
      "Insufficient permissions. Check your API token's custom permissions. — Required permission: Policies - Create"
    );

    vi.restoreAllMocks();
  });

  it("should append API-provided detail to 404 errors when present", async () => {
    const client = new SyncroApiClient({ apiKey: "key", subdomain: "mycompany" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ errors: ["Policy folder not found"] }), { status: 404 })
    );

    await expect(client.get("/policy_folders/999")).rejects.toThrow(
      "Resource not found. — Policy folder not found"
    );

    vi.restoreAllMocks();
  });

  it("should keep generic 403 message when body has no errors", async () => {
    const client = new SyncroApiClient({ apiKey: "key", subdomain: "mycompany" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 403 })
    );

    await expect(client.get("/tickets")).rejects.toThrow(
      "Syncro API error (403): Insufficient permissions. Check your API token's custom permissions."
    );

    vi.restoreAllMocks();
  });

  it("should surface nested field errors on 422", async () => {
    const client = new SyncroApiClient({ apiKey: "key", subdomain: "mycompany" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ errors: { parent_id: ["must belong to the same customer"] } }), { status: 422 })
    );

    await expect(client.put("/policy_folders/1", { parent_id: 99 })).rejects.toThrow(
      "parent_id: must belong to the same customer"
    );

    vi.restoreAllMocks();
  });

  it("should skip undefined query params", async () => {
    const client = new SyncroApiClient({
      apiKey: "key",
      subdomain: "mycompany",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await client.get("/tickets", { status: undefined, page: 1 });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("status");
    expect(calledUrl).toContain("page=1");

    fetchSpy.mockRestore();
  });
});
