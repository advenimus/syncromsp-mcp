import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient } from "../../../src/api-client.js";
import { createDomain } from "../../../src/domains/customers.js";

function createMockClient() {
  const client = new SyncroApiClient({ apiKey: "test", subdomain: "test" });
  vi.spyOn(client, "get").mockResolvedValue({ customers: [] });
  vi.spyOn(client, "post").mockResolvedValue({ customer: { id: 1 } });
  vi.spyOn(client, "put").mockResolvedValue({ customer: { id: 1 } });
  vi.spyOn(client, "delete").mockResolvedValue(undefined);
  return client;
}

describe("Customers Domain", () => {
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

    expect(names).toContain("customers_list");
    expect(names).toContain("customers_get");
    expect(names).toContain("customers_create");
    expect(names).toContain("customers_update");
    expect(names).toContain("customers_delete");
    expect(names).toContain("customers_latest");
    expect(names).toContain("customers_autocomplete");
    expect(names).toContain("customers_list_phones");
    expect(names).toContain("customers_create_phone");
    expect(tools.length).toBe(11);
  });

  it("should list customers with search", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "customers_list")!;

    await tool.handler({ query: "Acme", page: 1 });

    expect(client.get).toHaveBeenCalledWith("/customers", { query: "Acme", page: 1 });
  });

  it("should create a customer", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "customers_create")!;

    await tool.handler({ business_name: "Acme Corp", email: "info@acme.com" });

    expect(client.post).toHaveBeenCalledWith("/customers", {
      business_name: "Acme Corp",
      email: "info@acme.com",
    });
  });

  it("should require confirmation for delete", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "customers_delete")!;

    const result = await tool.handler({ id: 1, confirmed: false });
    expect(result.content[0].text).toContain("CONFIRMATION REQUIRED");

    await tool.handler({ id: 1, confirmed: true });
    expect(client.delete).toHaveBeenCalledWith("/customers/1");
  });

  it("should add phone to customer", async () => {
    const domain = createDomain(client);
    const tool = domain.getTools().find((t) => t.definition.name === "customers_create_phone")!;

    await tool.handler({ customer_id: 1, number: "555-1234", label: "Work" });

    expect(client.post).toHaveBeenCalledWith("/customers/1/phones", {
      number: "555-1234",
      label: "Work",
    });
  });
});
