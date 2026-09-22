import type { SyncroApiClient } from "../api-client.js";
import type { DomainTool } from "../types.js";
import { jsonResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalId, pickDefined } from "../utils/validators.js";
import { resolveUpload, PO_ATTACHMENT_TYPES } from "../utils/file-upload.js";

export function createPurchaseOrderTools(client: SyncroApiClient): DomainTool[] {
  return [
    {
      definition: {
        name: "admin_list_purchase_orders",
        description: "List purchase orders",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/purchase_orders", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "admin_get_purchase_order",
        description: "Get a purchase order by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "PO ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/purchase_orders/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "admin_create_purchase_order",
        description: "Create a purchase order",
        inputSchema: {
          type: "object" as const,
          properties: {
            vendor_id: { type: "number", description: "Vendor ID (required)" },
            user_id: { type: "number", description: "User ID" },
            location_id: { type: "number", description: "Location ID" },
            expected_date: { type: "string", description: "Expected delivery date" },
            due_date: { type: "string", description: "Due date" },
            order_date: { type: "string", description: "Order date" },
            paid_date: { type: "string", description: "Paid date" },
            general_notes: { type: "string", description: "Notes" },
            shipping_notes: { type: "string", description: "Shipping notes" },
            shipping_cents: { type: "number", description: "Shipping cost in cents" },
            other_cents: { type: "number", description: "Other costs in cents" },
            discount_percent: { type: "number", description: "Discount %" },
            delivery_tracking: { type: "string", description: "Tracking number" },
          },
          required: ["vendor_id"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          vendor_id: requireId(args.vendor_id, "vendor_id"),
          user_id: optionalId(args.user_id), location_id: optionalId(args.location_id),
          expected_date: optionalString(args.expected_date), due_date: optionalString(args.due_date),
          order_date: optionalString(args.order_date), paid_date: optionalString(args.paid_date),
          general_notes: optionalString(args.general_notes), shipping_notes: optionalString(args.shipping_notes),
          shipping_cents: optionalNumber(args.shipping_cents), other_cents: optionalNumber(args.other_cents),
          discount_percent: optionalNumber(args.discount_percent),
          delivery_tracking: optionalString(args.delivery_tracking),
        });
        return jsonResult(await client.post("/purchase_orders", body));
      },
    },
    {
      definition: {
        name: "admin_update_purchase_order",
        description: "Update a purchase order. Only status, general_notes, shipping_cents, delivery_tracking, and vendor_id can be changed. Syncro rejects the 'Finished' status while any line item is still unreceived.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "PO ID (required)" },
            status: { type: "string", description: "PO status (e.g. 'Finished')" },
            general_notes: { type: "string", description: "Notes" },
            shipping_cents: { type: "number", description: "Shipping cost in cents" },
            delivery_tracking: { type: "string", description: "Tracking number" },
            vendor_id: { type: "number", description: "Vendor ID" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          status: optionalString(args.status),
          general_notes: optionalString(args.general_notes),
          shipping_cents: optionalNumber(args.shipping_cents),
          delivery_tracking: optionalString(args.delivery_tracking),
          vendor_id: optionalId(args.vendor_id),
        });
        return jsonResult(await client.put(`/purchase_orders/${id}`, body));
      },
    },
    {
      definition: {
        name: "admin_add_po_attachment",
        description: "Attach a file (vendor quote, invoice, packing slip) to a purchase order. Give exactly one source: file_url (a direct download link; works everywhere), file_path (a file on this computer; local installs only), or file_base64 (only for tiny files you create yourself, like a short CSV, because the whole file must be written out). Allowed: JPEG, PNG, GIF, PDF, CSV, XLS, XLSX. Max 10 MB and 10 files per PO; the extension must match the real file type.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "PO ID (required)" },
            file_url: { type: "string", description: "https link that downloads the file directly (not a preview page)" },
            file_path: { type: "string", description: "Full path to a file on this computer, e.g. /Users/me/Downloads/quote.pdf. Local installs only." },
            file_base64: { type: "string", description: "File contents, base64-encoded. Tiny files only; needs filename." },
            filename: { type: "string", description: "File name with extension, e.g. 'quote.pdf'. Required with file_base64; otherwise taken from the link or path." },
            name: { type: "string", description: "Display name (defaults to the filename)" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const upload = await resolveUpload(args, PO_ATTACHMENT_TYPES);
        const form = new FormData();
        form.append("file", new Blob([upload.bytes], { type: upload.contentType }), upload.filename);
        const name = optionalString(args.name);
        if (name) form.append("name", name);
        return jsonResult(await client.postMultipart(`/purchase_orders/${id}/attachments`, form));
      },
    },
    {
      definition: {
        name: "admin_receive_purchase_order",
        description: "Receive a line item on a purchase order",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "PO ID" },
            line_item_id: { type: "number", description: "Line item ID to receive" },
          },
          required: ["id", "line_item_id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        return jsonResult(await client.post(`/purchase_orders/${id}/receive`, { line_item_id: requireId(args.line_item_id, "line_item_id") }));
      },
    },
    {
      definition: {
        name: "admin_add_po_line_item",
        description: "Add a line item to a purchase order. Note: the product must have maintain_stock=true or the API returns 422.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "PO ID" },
            product_id: { type: "number", description: "Product ID" },
            quantity: { type: "number", description: "Quantity" },
          },
          required: ["id", "product_id", "quantity"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        return jsonResult(await client.post(`/purchase_orders/${id}/create_po_line_item`, {
          product_id: requireId(args.product_id, "product_id"),
          quantity: args.quantity as number,
        }));
      },
    },
  ];
}
