import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient } from "../../../src/api-client.js";
import { createDomain as createInvoices } from "../../../src/domains/invoices.js";
import { createDomain as createScheduling } from "../../../src/domains/scheduling.js";
import type { DomainHandler } from "../../../src/types.js";

function createMockClient() {
  const client = new SyncroApiClient({ apiKey: "test", subdomain: "test" });
  vi.spyOn(client, "post").mockResolvedValue({ id: 1 });
  vi.spyOn(client, "put").mockResolvedValue({ id: 1 });
  vi.spyOn(client, "delete").mockResolvedValue(undefined);
  return client;
}

function findTool(domain: DomainHandler, name: string) {
  return domain.getTools().find((t) => t.definition.name === name)!;
}

describe("Invoices Domain: draft workflow", () => {
  let client: SyncroApiClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("should publish a draft invoice", async () => {
    await findTool(createInvoices(client), "invoices_publish").handler({ id: 12 });

    expect(client.post).toHaveBeenCalledWith("/invoices/12/publish");
  });

  it("should convert a published invoice to a draft", async () => {
    await findTool(createInvoices(client), "invoices_convert_to_draft").handler({ id: 12 });

    expect(client.post).toHaveBeenCalledWith("/invoices/12/convert_to_draft");
  });
});

describe("Scheduling Domain: line items", () => {
  let client: SyncroApiClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("should add a line item on the nested route with type-specific fields", async () => {
    await findTool(createScheduling(client), "scheduling_add_line_item").handler({
      id: 4,
      name: "Managed workstations",
      recurring_type_id: 9,
      policy_folder_id: 33,
      bill_nested_folders: true,
      price_retail: 45,
    });

    expect(client.post).toHaveBeenCalledWith("/schedules/4/line_items", {
      name: "Managed workstations",
      recurring_type_id: 9,
      policy_folder_id: 33,
      bill_nested_folders: true,
      price_retail: 45,
    });
  });

  it("should update a line item with the same field set", async () => {
    await findTool(createScheduling(client), "scheduling_update_line_item").handler({
      id: 4,
      line_item_id: 8,
      bill_all_units: false,
      bill_units_threshold: 5,
    });

    expect(client.put).toHaveBeenCalledWith("/schedules/4/line_items/8", {
      bill_all_units: false,
      bill_units_threshold: 5,
    });
  });

  it("should require confirmation, then DELETE on the nested route", async () => {
    const tool = findTool(createScheduling(client), "scheduling_remove_line_item");

    const unconfirmed = await tool.handler({ id: 4, line_item_id: 8 });
    expect(unconfirmed.content[0].text).toContain("CONFIRMATION REQUIRED");
    expect(client.delete).not.toHaveBeenCalled();

    await tool.handler({ id: 4, line_item_id: 8, confirmed: true });
    expect(client.delete).toHaveBeenCalledWith("/schedules/4/line_items/8");
    expect(client.post).not.toHaveBeenCalled();
  });
});
