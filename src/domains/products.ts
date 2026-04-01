import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, requireString, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "products_list",
        description: "List products/inventory items",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/products", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "products_get",
        description: "Get a product by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Product ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/products/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "products_create",
        description: "Create a new product. Note: products have no DELETE endpoint -- use products_update with disabled=true instead. Custom properties on create may be ignored -- set via products_update after creation.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Product name (required)" },
            description: { type: "string", description: "Description" },
            price_cost: { type: "number", description: "Cost price" },
            price_retail: { type: "number", description: "Retail price" },
            price_wholesale: { type: "number", description: "Wholesale price" },
            condition: { type: "string", description: "Condition" },
            maintain_stock: { type: "boolean", description: "Track inventory" },
            quantity: { type: "number", description: "Quantity in stock" },
            warranty: { type: "string", description: "Warranty info" },
            reorder_at: { type: "number", description: "Reorder threshold" },
            desired_stock_level: { type: "number", description: "Desired stock level" },
            disabled: { type: "boolean", description: "Disabled" },
            taxable: { type: "boolean", description: "Taxable" },
            product_category: { type: "string", description: "Category" },
            upc_code: { type: "string", description: "UPC code" },
            discount_percent: { type: "number", description: "Discount %" },
            notes: { type: "string", description: "Notes" },
            physical_location: { type: "string", description: "Physical location" },
            serialized: { type: "boolean", description: "Serialized product" },
            vendor_ids: { type: "array", items: { type: "number" }, description: "Vendor IDs" },
            category_ids: { type: "array", items: { type: "number" }, description: "Category IDs" },
          },
          required: ["name"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          name: requireString(args.name, "name"),
          description: optionalString(args.description),
          price_cost: optionalNumber(args.price_cost), price_retail: optionalNumber(args.price_retail),
          price_wholesale: optionalNumber(args.price_wholesale), condition: optionalString(args.condition),
          maintain_stock: optionalBoolean(args.maintain_stock), quantity: optionalNumber(args.quantity),
          warranty: optionalString(args.warranty), reorder_at: optionalNumber(args.reorder_at),
          desired_stock_level: optionalNumber(args.desired_stock_level),
          disabled: optionalBoolean(args.disabled), taxable: optionalBoolean(args.taxable),
          product_category: optionalString(args.product_category), upc_code: optionalString(args.upc_code),
          discount_percent: optionalNumber(args.discount_percent), notes: optionalString(args.notes),
          physical_location: optionalString(args.physical_location), serialized: optionalBoolean(args.serialized),
          vendor_ids: args.vendor_ids, category_ids: args.category_ids,
        });
        return jsonResult(await client.post("/products", body));
      },
    },
    {
      definition: {
        name: "products_update",
        description: "Update a product",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Product ID (required)" },
            name: { type: "string" }, description: { type: "string" },
            price_cost: { type: "number" }, price_retail: { type: "number" },
            price_wholesale: { type: "number" }, condition: { type: "string" },
            maintain_stock: { type: "boolean" }, quantity: { type: "number" },
            disabled: { type: "boolean" }, taxable: { type: "boolean" },
            product_category: { type: "string" }, upc_code: { type: "string" },
            notes: { type: "string" }, physical_location: { type: "string" },
            vendor_ids: { type: "array", items: { type: "number" } },
            category_ids: { type: "array", items: { type: "number" } },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          name: optionalString(args.name), description: optionalString(args.description),
          price_cost: optionalNumber(args.price_cost), price_retail: optionalNumber(args.price_retail),
          price_wholesale: optionalNumber(args.price_wholesale), condition: optionalString(args.condition),
          maintain_stock: optionalBoolean(args.maintain_stock), quantity: optionalNumber(args.quantity),
          disabled: optionalBoolean(args.disabled), taxable: optionalBoolean(args.taxable),
          product_category: optionalString(args.product_category), upc_code: optionalString(args.upc_code),
          notes: optionalString(args.notes), physical_location: optionalString(args.physical_location),
          vendor_ids: args.vendor_ids, category_ids: args.category_ids,
        });
        return jsonResult(await client.put(`/products/${id}`, body));
      },
    },
    {
      definition: {
        name: "products_barcode",
        description: "Look up a product by barcode/UPC",
        inputSchema: {
          type: "object" as const,
          properties: { barcode: { type: "string", description: "Barcode/UPC value" } },
          required: ["barcode"],
        },
      },
      handler: async (args) => jsonResult(await client.get("/products/barcode", { barcode: args.barcode as string })),
    },
    {
      definition: {
        name: "products_categories",
        description: "List product categories",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/products/categories")),
    },
    {
      definition: {
        name: "products_add_images",
        description: "Add images to a product",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Product ID" },
            files: { type: "array", items: { type: "string" }, description: "Image URLs" },
          },
          required: ["id", "files"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        return jsonResult(await client.post(`/products/${id}/add_images`, { files: args.files }));
      },
    },
    {
      definition: {
        name: "products_delete_image",
        description: "Delete an image from a product. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Product ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete image from product #${id}? Call again with confirmed: true.`);
        return jsonResult(await client.delete(`/products/${id}/delete_image`));
      },
    },
    {
      definition: {
        name: "products_update_location_qty",
        description: "Update product quantity at a location",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Product ID" },
            location_quantity_id: { type: "number", description: "Location quantity ID" },
            quantity: { type: "number", description: "New quantity" },
          },
          required: ["id", "location_quantity_id", "quantity"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        return jsonResult(await client.put(`/products/${id}/location_quantities`, {
          location_quantity_id: requireId(args.location_quantity_id, "location_quantity_id"),
          quantity: args.quantity as number,
        }));
      },
    },
    {
      definition: {
        name: "products_list_serials",
        description: "List serial numbers for a product",
        inputSchema: {
          type: "object" as const,
          properties: { product_id: { type: "number", description: "Product ID" } },
          required: ["product_id"],
        },
      },
      handler: async (args) => {
        const pid = requireId(args.product_id, "product_id");
        return jsonResult(await client.get(`/products/${pid}/product_serials`));
      },
    },
    {
      definition: {
        name: "products_create_serial",
        description: "Create a serial number for a product",
        inputSchema: {
          type: "object" as const,
          properties: {
            product_id: { type: "number", description: "Product ID" },
            serial_number: { type: "string", description: "Serial number (required)" },
            condition: { type: "string", description: "Condition" },
            price_cost_cents: { type: "number", description: "Cost in cents" },
            price_retail_cents: { type: "number", description: "Retail in cents" },
          },
          required: ["product_id", "serial_number"],
        },
      },
      handler: async (args) => {
        const pid = requireId(args.product_id, "product_id");
        const body = pickDefined({
          serial_number: requireString(args.serial_number, "serial_number"),
          condition: optionalString(args.condition),
          price_cost_cents: optionalNumber(args.price_cost_cents),
          price_retail_cents: optionalNumber(args.price_retail_cents),
        });
        return jsonResult(await client.post(`/products/${pid}/product_serials`, body));
      },
    },
    {
      definition: {
        name: "products_update_serial",
        description: "Update a product serial",
        inputSchema: {
          type: "object" as const,
          properties: {
            product_id: { type: "number", description: "Product ID" },
            id: { type: "number", description: "Serial ID" },
            serial_number: { type: "string" }, condition: { type: "string" },
            price_cost_cents: { type: "number" }, price_retail_cents: { type: "number" },
            notes: { type: "string" },
          },
          required: ["product_id", "id"],
        },
      },
      handler: async (args) => {
        const pid = requireId(args.product_id, "product_id");
        const id = requireId(args.id);
        const body = pickDefined({
          serial_number: optionalString(args.serial_number), condition: optionalString(args.condition),
          price_cost_cents: optionalNumber(args.price_cost_cents), price_retail_cents: optionalNumber(args.price_retail_cents),
          notes: optionalString(args.notes),
        });
        return jsonResult(await client.put(`/products/${pid}/product_serials/${id}`, body));
      },
    },
    {
      definition: {
        name: "products_attach_serial_to_line_item",
        description: "Attach serial numbers to a line item",
        inputSchema: {
          type: "object" as const,
          properties: {
            product_id: { type: "number", description: "Product ID" },
            record_type: { type: "string", description: "Record type" },
            line_item_id: { type: "number", description: "Line item ID" },
            product_serial_ids: { type: "array", items: { type: "number" }, description: "Serial IDs" },
          },
          required: ["product_id", "line_item_id", "product_serial_ids"],
        },
      },
      handler: async (args) => {
        const pid = requireId(args.product_id, "product_id");
        return jsonResult(await client.post(`/products/${pid}/product_serials/attach_to_line_item`, {
          record_type: optionalString(args.record_type),
          line_item_id: requireId(args.line_item_id, "line_item_id"),
          product_serial_ids: args.product_serial_ids,
        }));
      },
    },
    {
      definition: {
        name: "products_list_skus",
        description: "List SKUs for a product",
        inputSchema: {
          type: "object" as const,
          properties: { product_id: { type: "number", description: "Product ID" } },
          required: ["product_id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/products/${requireId(args.product_id, "product_id")}/product_skus`)),
    },
    {
      definition: {
        name: "products_create_sku",
        description: "Create a SKU for a product",
        inputSchema: {
          type: "object" as const,
          properties: {
            product_id: { type: "number", description: "Product ID" },
            vendor_id: { type: "string", description: "Vendor ID" },
            value: { type: "string", description: "SKU value (required)" },
          },
          required: ["product_id", "value"],
        },
      },
      handler: async (args) => {
        const pid = requireId(args.product_id, "product_id");
        const body = pickDefined({
          vendor_id: optionalString(args.vendor_id),
          value: requireString(args.value, "value"),
        });
        return jsonResult(await client.post(`/products/${pid}/product_skus`, body));
      },
    },
    {
      definition: {
        name: "products_update_sku",
        description: "Update a product SKU",
        inputSchema: {
          type: "object" as const,
          properties: {
            product_id: { type: "number", description: "Product ID" },
            id: { type: "number", description: "SKU ID" },
            vendor_id: { type: "number", description: "Vendor ID" },
            value: { type: "string", description: "SKU value" },
          },
          required: ["product_id", "id"],
        },
      },
      handler: async (args) => {
        const pid = requireId(args.product_id, "product_id");
        const id = requireId(args.id);
        const body = pickDefined({ vendor_id: optionalNumber(args.vendor_id), value: optionalString(args.value) });
        return jsonResult(await client.put(`/products/${pid}/product_skus/${id}`, body));
      },
    },
  ];

  return { name: "products", description: "Products, serials, SKUs, categories, images, inventory", getTools: () => tools };
}
