import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "invoices_list",
        description: "List invoices with optional filters",
        inputSchema: {
          type: "object" as const,
          properties: {
            paid: { type: "boolean", description: "Filter paid invoices only" },
            unpaid: { type: "boolean", description: "Filter unpaid invoices only" },
            ticket_id: { type: "number", description: "Filter by ticket ID" },
            since_updated_at: { type: "string", description: "ISO 8601 date - invoices updated after this date" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          paid: optionalBoolean(args.paid),
          unpaid: optionalBoolean(args.unpaid),
          ticket_id: optionalId(args.ticket_id),
          since_updated_at: optionalString(args.since_updated_at),
          page: optionalNumber(args.page),
        });
        return jsonResult(await client.get("/invoices", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "invoices_get",
        description: "Get a single invoice by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Invoice ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/invoices/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "invoices_create",
        description: "Create a new invoice. Note: line_items in the create body are IGNORED by the API -- add line items via invoices_add_line_item after creation.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            date: { type: "string", description: "Invoice date" },
            due_date: { type: "string", description: "Due date" },
            number: { type: "string", description: "Invoice number" },
            ticket_id: { type: "number", description: "Associated ticket ID" },
            location_id: { type: "number", description: "Location ID" },
            po_number: { type: "string", description: "PO number" },
            contact_id: { type: "number", description: "Contact ID" },
            note: { type: "string", description: "Invoice note" },
            hardwarecost: { type: "number", description: "Hardware cost" },
            line_items: { type: "array", description: "Array of line item objects" },
          },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          date: optionalString(args.date),
          due_date: optionalString(args.due_date),
          number: optionalString(args.number),
          ticket_id: optionalId(args.ticket_id),
          location_id: optionalId(args.location_id),
          po_number: optionalString(args.po_number),
          contact_id: optionalId(args.contact_id),
          note: optionalString(args.note),
          hardwarecost: optionalNumber(args.hardwarecost),
          line_items: args.line_items,
        });
        return jsonResult(await client.post("/invoices", body));
      },
    },
    {
      definition: {
        name: "invoices_update",
        description: "Update an existing invoice",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Invoice ID (required)" },
            customer_id: { type: "number", description: "Customer ID" },
            date: { type: "string", description: "Invoice date" },
            due_date: { type: "string", description: "Due date" },
            number: { type: "string", description: "Invoice number" },
            ticket_id: { type: "number", description: "Ticket ID" },
            location_id: { type: "number", description: "Location ID" },
            po_number: { type: "string", description: "PO number" },
            contact_id: { type: "number", description: "Contact ID" },
            note: { type: "string", description: "Invoice note" },
            hardwarecost: { type: "number", description: "Hardware cost" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          customer_id: optionalId(args.customer_id),
          date: optionalString(args.date),
          due_date: optionalString(args.due_date),
          number: optionalString(args.number),
          ticket_id: optionalId(args.ticket_id),
          location_id: optionalId(args.location_id),
          po_number: optionalString(args.po_number),
          contact_id: optionalId(args.contact_id),
          note: optionalString(args.note),
          hardwarecost: optionalNumber(args.hardwarecost),
        });
        return jsonResult(await client.put(`/invoices/${id}`, body));
      },
    },
    {
      definition: {
        name: "invoices_delete",
        description: "DELETE an invoice permanently. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Invoice ID" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) {
          return textResult(`⚠️ CONFIRMATION REQUIRED: Permanently delete invoice #${id}? Call again with confirmed: true.`);
        }
        const result = await client.delete(`/invoices/${id}`);
        return result ? jsonResult(result) : textResult(`Invoice #${id} deleted successfully.`);
      },
    },
    {
      definition: {
        name: "invoices_get_ticket",
        description: "Get the ticket associated with an invoice",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Invoice ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/invoices/${requireId(args.id)}/ticket`)),
    },
    {
      definition: {
        name: "invoices_print",
        description: "Generate a printable PDF for an invoice",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Invoice ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/invoices/${requireId(args.id)}/print`)),
    },
    {
      definition: {
        name: "invoices_email",
        description: "Email an invoice to the customer",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Invoice ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/invoices/${requireId(args.id)}/email`)),
    },
    {
      definition: {
        name: "invoices_add_line_item",
        description: "Add a line item to an invoice. When using product_id, only product_id + quantity are needed -- the API auto-fills name, cost, and price from the product catalog.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Invoice ID" },
            item: { type: "string", description: "Item name" },
            name: { type: "string", description: "Display name" },
            quantity: { type: "number", description: "Quantity" },
            price: { type: "number", description: "Price per unit" },
            cost: { type: "number", description: "Cost per unit" },
            product_id: { type: "number", description: "Product ID" },
            upc_code: { type: "string", description: "UPC code" },
            discount_percent: { type: "number", description: "Discount percentage" },
            taxable: { type: "boolean", description: "Whether taxable" },
            tax_note: { type: "string", description: "Tax note" },
            tax_rate_id: { type: "number", description: "Tax rate ID" },
            user_id: { type: "number", description: "User ID" },
            position: { type: "number", description: "Sort position" },
            product_category: { type: "string", description: "Product category" },
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
          tax_note: optionalString(args.tax_note),
          tax_rate_id: optionalId(args.tax_rate_id),
          user_id: optionalId(args.user_id),
          position: optionalNumber(args.position),
          product_category: optionalString(args.product_category),
        });
        return jsonResult(await client.post(`/invoices/${id}/line_items`, body));
      },
    },
    {
      definition: {
        name: "invoices_update_line_item",
        description: "Update a line item on an invoice",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Invoice ID" },
            line_item_id: { type: "number", description: "Line item ID" },
            item: { type: "string", description: "Item name" },
            name: { type: "string", description: "Display name" },
            quantity: { type: "number", description: "Quantity" },
            price: { type: "number", description: "Price" },
            cost: { type: "number", description: "Cost" },
            discount_percent: { type: "number", description: "Discount %" },
            taxable: { type: "boolean", description: "Whether taxable" },
          },
          required: ["id", "line_item_id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const lineItemId = requireId(args.line_item_id, "line_item_id");
        const body = pickDefined({
          item: optionalString(args.item),
          name: optionalString(args.name),
          quantity: optionalNumber(args.quantity),
          price: optionalNumber(args.price),
          cost: optionalNumber(args.cost),
          discount_percent: optionalNumber(args.discount_percent),
          taxable: optionalBoolean(args.taxable),
        });
        return jsonResult(await client.put(`/invoices/${id}/line_items/${lineItemId}`, body));
      },
    },
    {
      definition: {
        name: "invoices_delete_line_item",
        description: "Delete a line item from an invoice. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Invoice ID" },
            line_item_id: { type: "number", description: "Line item ID" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "line_item_id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const lineItemId = requireId(args.line_item_id, "line_item_id");
        if (args.confirmed !== true) {
          return textResult(`⚠️ CONFIRMATION REQUIRED: Delete line item #${lineItemId} from invoice #${id}? Call again with confirmed: true.`);
        }
        const result = await client.delete(`/invoices/${id}/line_items/${lineItemId}`);
        return result ? jsonResult(result) : textResult(`Line item deleted from invoice #${id}.`);
      },
    },
  ];

  return {
    name: "invoices",
    description: "Invoices, line items, print/email",
    getTools: () => tools,
  };
}
