import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient } from "../../../src/api-client.js";
import { createDomain as createAdmin } from "../../../src/domains/admin.js";
import { createDomain as createProducts } from "../../../src/domains/products.js";
import type { DomainHandler } from "../../../src/types.js";

function createMockClient() {
  const client = new SyncroApiClient({ apiKey: "test", subdomain: "test" });
  vi.spyOn(client, "put").mockResolvedValue({ purchase_order: { id: 1 } });
  vi.spyOn(client, "delete").mockResolvedValue(undefined);
  vi.spyOn(client, "postMultipart").mockResolvedValue({ attachment: { id: 1 } });
  return client;
}

function findTool(domain: DomainHandler, name: string) {
  return domain.getTools().find((t) => t.definition.name === name)!;
}

describe("Admin Domain: purchase orders", () => {
  let client: SyncroApiClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("should keep every purchase order tool in the admin domain", () => {
    const names = createAdmin(client).getTools().map((t) => t.definition.name);

    expect(names).toEqual(expect.arrayContaining([
      "admin_list_purchase_orders",
      "admin_get_purchase_order",
      "admin_create_purchase_order",
      "admin_update_purchase_order",
      "admin_add_po_attachment",
      "admin_receive_purchase_order",
      "admin_add_po_line_item",
      "admin_list_items",
    ]));
  });

  it("should update only the editable purchase order fields", async () => {
    await findTool(createAdmin(client), "admin_update_purchase_order").handler({
      id: 6, status: "Finished", delivery_tracking: "1Z999", other_cents: 500,
    });

    expect(client.put).toHaveBeenCalledWith("/purchase_orders/6", { status: "Finished", delivery_tracking: "1Z999" });
  });

  it("should upload a base64 file as multipart form data", async () => {
    const pdf = Buffer.from("%PDF-1.4 test").toString("base64");

    await findTool(createAdmin(client), "admin_add_po_attachment").handler({
      id: 6, filename: "quote.pdf", file_base64: pdf, name: "Vendor quote",
    });

    const [path, form] = vi.mocked(client.postMultipart).mock.calls[0] as [string, FormData];
    expect(path).toBe("/purchase_orders/6/attachments");
    const file = form.get("file") as File;
    expect(file.name).toBe("quote.pdf");
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.4 test");
    expect(form.get("name")).toBe("Vendor quote");
  });

  it("should refuse a disallowed file type before calling the API", async () => {
    const exe = Buffer.from("MZ").toString("base64");

    await expect(
      findTool(createAdmin(client), "admin_add_po_attachment").handler({ id: 6, filename: "setup.exe", file_base64: exe })
    ).rejects.toThrow("filename must end in one of");
    expect(client.postMultipart).not.toHaveBeenCalled();
  });
});

describe("Products Domain: products_delete_sku", () => {
  it("should require confirmation, then DELETE the SKU", async () => {
    const client = createMockClient();
    const tool = findTool(createProducts(client), "products_delete_sku");

    const unconfirmed = await tool.handler({ product_id: 2, id: 5 });
    expect(unconfirmed.content[0].text).toContain("CONFIRMATION REQUIRED");
    expect(client.delete).not.toHaveBeenCalled();

    await tool.handler({ product_id: 2, id: 5, confirmed: true });
    expect(client.delete).toHaveBeenCalledWith("/products/2/product_skus/5");
  });
});
