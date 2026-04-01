import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient } from "../../../src/api-client.js";
import { createDomain } from "../../../src/domains/tickets.js";

function createMockClient() {
  const client = new SyncroApiClient({ apiKey: "test", subdomain: "test" });
  vi.spyOn(client, "get").mockResolvedValue({ tickets: [] });
  vi.spyOn(client, "post").mockResolvedValue({ ticket: { id: 1 } });
  vi.spyOn(client, "put").mockResolvedValue({ ticket: { id: 1 } });
  vi.spyOn(client, "delete").mockResolvedValue(undefined);
  return client;
}

describe("Tickets Domain", () => {
  let client: SyncroApiClient;

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    client = createMockClient();
  });

  it("should register all expected tools", () => {
    const domain = createDomain(client);
    const tools = domain.getTools();
    const names = tools.map((t) => t.definition.name);

    expect(names).toContain("tickets_list");
    expect(names).toContain("tickets_get");
    expect(names).toContain("tickets_create");
    expect(names).toContain("tickets_update");
    expect(names).toContain("tickets_delete");
    expect(names).toContain("tickets_comment");
    expect(names).toContain("tickets_add_line_item");
    expect(names).toContain("tickets_add_timer");
    expect(names).toContain("tickets_settings");
    expect(tools.length).toBeGreaterThanOrEqual(15);
  });

  it("should list tickets with filters", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "tickets_list")!;

    await tool.handler({ status: "New", page: 1 });

    expect(client.get).toHaveBeenCalledWith("/tickets", { status: "New", page: 1 });
  });

  it("should get a ticket by ID", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "tickets_get")!;

    await tool.handler({ id: 42 });

    expect(client.get).toHaveBeenCalledWith("/tickets/42");
  });

  it("should create a ticket", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "tickets_create")!;

    await tool.handler({ customer_id: 1, subject: "Test ticket" });

    expect(client.post).toHaveBeenCalledWith("/tickets", {
      customer_id: 1,
      subject: "Test ticket",
    });
  });

  it("should require confirmation for delete", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "tickets_delete")!;

    // Without confirmation
    const result = await tool.handler({ id: 1, confirmed: false });
    expect(result.content[0].text).toContain("CONFIRMATION REQUIRED");
    expect(client.delete).not.toHaveBeenCalled();

    // With confirmation
    await tool.handler({ id: 1, confirmed: true });
    expect(client.delete).toHaveBeenCalledWith("/tickets/1");
  });

  it("should add a comment to a ticket", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "tickets_comment")!;

    await tool.handler({ id: 1, body: "Test comment", hidden: true });

    expect(client.post).toHaveBeenCalledWith("/tickets/1/comment", {
      body: "Test comment",
      hidden: true,
    });
  });

  it("should validate required fields", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "tickets_get")!;

    await expect(tool.handler({ id: "not-a-number" })).rejects.toThrow();
    await expect(tool.handler({ id: -1 })).rejects.toThrow();
  });
});
