import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "estimates_list",
        description: "List estimates with optional filters",
        inputSchema: {
          type: "object" as const,
          properties: {
            status: { type: "string", description: "Filter by status (Fresh, Draft, Approved, Declined)" },
            customer_id: { type: "number", description: "Filter by customer ID" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          status: optionalString(args.status),
          customer_id: optionalId(args.customer_id),
          page: optionalNumber(args.page),
        });
        return jsonResult(await client.get("/estimates", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "estimates_get",
        description: "Get a single estimate by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Estimate ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/estimates/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "estimates_create",
        description: "Create a new estimate. Note: line_items array in the create body is IGNORED by the API -- add line items via estimates_add_line_item after creation.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            name: { type: "string", description: "Estimate name" },
            number: { type: "string", description: "Estimate number" },
            date: { type: "string", description: "Date" },
            note: { type: "string", description: "Note" },
            status: { type: "string", description: "Status: Fresh, Draft, Approved, Declined" },
            ticket_id: { type: "number", description: "Associated ticket ID" },
            location_id: { type: "number", description: "Location ID" },
            line_items: { type: "array", description: "Array of line item objects" },
          },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          name: optionalString(args.name),
          number: optionalString(args.number),
          date: optionalString(args.date),
          note: optionalString(args.note),
          status: optionalString(args.status),
          ticket_id: optionalId(args.ticket_id),
          location_id: optionalId(args.location_id),
          line_items: args.line_items,
        });
        return jsonResult(await client.post("/estimates", body));
      },
    },
    {
      definition: {
        name: "estimates_update",
        description: "Update an existing estimate",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Estimate ID (required)" },
            customer_id: { type: "number", description: "Customer ID" },
            name: { type: "string", description: "Estimate name" },
            number: { type: "string", description: "Number" },
            date: { type: "string", description: "Date" },
            note: { type: "string", description: "Note" },
            status: { type: "string", description: "Status: Fresh, Draft, Approved, Declined" },
            ticket_id: { type: "number", description: "Ticket ID" },
            location_id: { type: "number", description: "Location ID" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          customer_id: optionalId(args.customer_id),
          name: optionalString(args.name),
          number: optionalString(args.number),
          date: optionalString(args.date),
          note: optionalString(args.note),
          status: optionalString(args.status),
          ticket_id: optionalId(args.ticket_id),
          location_id: optionalId(args.location_id),
        });
        return jsonResult(await client.put(`/estimates/${id}`, body));
      },
    },
    {
      definition: {
        name: "estimates_delete",
        description: "DELETE an estimate permanently. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Estimate ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Permanently delete estimate #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/estimates/${id}`);
        return result ? jsonResult(result) : textResult(`Estimate #${id} deleted.`);
      },
    },
    {
      definition: {
        name: "estimates_print",
        description: "Generate a printable PDF for an estimate",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Estimate ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/estimates/${requireId(args.id)}/print`)),
    },
    {
      definition: {
        name: "estimates_email",
        description: "Email an estimate to the customer",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Estimate ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/estimates/${requireId(args.id)}/email`)),
    },
    {
      definition: {
        name: "estimates_convert_to_invoice",
        description: "Convert an estimate to an invoice",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Estimate ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/estimates/${requireId(args.id)}/convert_to_invoice`)),
    },
    {
      definition: {
        name: "estimates_add_line_item",
        description: "Add a line item to an estimate. When using product_id, only product_id + quantity are needed -- the API auto-fills name, cost, and price from the product catalog.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Estimate ID" },
            item: { type: "string", description: "Item name" },
            name: { type: "string", description: "Display name" },
            quantity: { type: "number", description: "Quantity" },
            price: { type: "number", description: "Price" },
            cost: { type: "number", description: "Cost" },
            product_id: { type: "number", description: "Product ID" },
            upc_code: { type: "string", description: "UPC code" },
            discount_percent: { type: "number", description: "Discount %" },
            taxable: { type: "boolean", description: "Whether taxable" },
            tax_rate_id: { type: "number", description: "Tax rate ID" },
            position: { type: "number", description: "Sort position" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          item: optionalString(args.item),
          name: optionalString(args.name),
          quantity: optionalNumber(args.quantity),
          price: optionalNumber(args.price),
          cost: optionalNumber(args.cost),
          product_id: optionalId(args.product_id),
          upc_code: optionalString(args.upc_code),
          discount_percent: optionalNumber(args.discount_percent),
          taxable: optionalBoolean(args.taxable),
          tax_rate_id: optionalId(args.tax_rate_id),
          position: optionalNumber(args.position),
        });
        return jsonResult(await client.post(`/estimates/${id}/line_items`, body));
      },
    },
    {
      definition: {
        name: "estimates_update_line_item",
        description: "Update a line item on an estimate",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Estimate ID" },
            line_item_id: { type: "number", description: "Line item ID" },
            item: { type: "string" }, name: { type: "string" },
            quantity: { type: "number" }, price: { type: "number" },
            cost: { type: "number" }, discount_percent: { type: "number" },
            taxable: { type: "boolean" },
          },
          required: ["id", "line_item_id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const lineItemId = requireId(args.line_item_id, "line_item_id");
        const body = pickDefined({
          item: optionalString(args.item), name: optionalString(args.name),
          quantity: optionalNumber(args.quantity), price: optionalNumber(args.price),
          cost: optionalNumber(args.cost), discount_percent: optionalNumber(args.discount_percent),
          taxable: optionalBoolean(args.taxable),
        });
        return jsonResult(await client.put(`/estimates/${id}/line_items/${lineItemId}`, body));
      },
    },
    {
      definition: {
        name: "estimates_delete_line_item",
        description: "Delete a line item from an estimate. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Estimate ID" },
            line_item_id: { type: "number", description: "Line item ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "line_item_id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const lineItemId = requireId(args.line_item_id, "line_item_id");
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete line item #${lineItemId} from estimate #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/estimates/${id}/line_items/${lineItemId}`);
        return result ? jsonResult(result) : textResult(`Line item deleted.`);
      },
    },
  ];

  return { name: "estimates", description: "Estimates, line items, print/email, convert to invoice", getTools: () => tools };
}
