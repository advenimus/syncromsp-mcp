import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";
import { SCHEDULE_LINE_ITEM_PROPERTIES, buildScheduleLineItemBody } from "./schedule-line-item-fields.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "scheduling_list",
        description: "List recurring invoice schedules",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/schedules", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "scheduling_get",
        description: "Get a schedule by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Schedule ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/schedules/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "scheduling_create",
        description: "Create a recurring invoice schedule. Always create with paused=true to prevent auto-firing during setup. Note: invoice-side fields (invoice name, employee, template, billing terms, memo) are NOT settable via API.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            name: { type: "string", description: "Schedule name" },
            frequency: { type: "string", description: "Frequency: Daily, Weekly, Biweekly, Monthly, Quarterly, Semi-Annually, Annually, Biennially, Triennially" },
            next_run: { type: "string", description: "Next run date" },
            email_customer: { type: "boolean", description: "Email customer" },
            snail_mail: { type: "boolean", description: "Send physical mail" },
            charge_mop: { type: "boolean", description: "Auto-charge payment method on file" },
            invoice_unbilled_ticket_charges: { type: "boolean", description: "Include unbilled ticket charges" },
            paused: { type: "boolean", description: "Pause schedule" },
          },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          name: optionalString(args.name),
          frequency: optionalString(args.frequency),
          next_run: optionalString(args.next_run),
          email_customer: optionalBoolean(args.email_customer),
          snail_mail: optionalBoolean(args.snail_mail),
          charge_mop: optionalBoolean(args.charge_mop),
          invoice_unbilled_ticket_charges: optionalBoolean(args.invoice_unbilled_ticket_charges),
          paused: optionalBoolean(args.paused),
        });
        return jsonResult(await client.post("/schedules", body));
      },
    },
    {
      definition: {
        name: "scheduling_update",
        description: "Update a schedule",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Schedule ID (required)" },
            customer_id: { type: "number" }, name: { type: "string" },
            frequency: { type: "string" }, next_run: { type: "string" },
            email_customer: { type: "boolean" }, snail_mail: { type: "boolean" },
            charge_mop: { type: "boolean" }, paused: { type: "boolean" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          customer_id: optionalId(args.customer_id), name: optionalString(args.name),
          frequency: optionalString(args.frequency), next_run: optionalString(args.next_run),
          email_customer: optionalBoolean(args.email_customer), snail_mail: optionalBoolean(args.snail_mail),
          charge_mop: optionalBoolean(args.charge_mop), paused: optionalBoolean(args.paused),
        });
        return jsonResult(await client.put(`/schedules/${id}`, body));
      },
    },
    {
      definition: {
        name: "scheduling_delete",
        description: "DELETE a schedule. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Schedule ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete schedule #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/schedules/${id}`);
        return result ? jsonResult(result) : textResult(`Schedule #${id} deleted.`);
      },
    },
    {
      definition: {
        name: "scheduling_add_line_item",
        description: "Add a line item to a recurring invoice schedule. Needs name or product_id. Pricing is in cents (retail_cents, cost_cents) or dollars (price_retail, price_cost). recurring_type_id picks the line type, e.g. 4 bills a customer's assets by type and 9 bills the assets in a policy folder; the type-specific fields only apply to their type.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Schedule ID" },
            ...SCHEDULE_LINE_ITEM_PROPERTIES,
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        return jsonResult(await client.post(`/schedules/${id}/line_items`, buildScheduleLineItemBody(args)));
      },
    },
    {
      definition: {
        name: "scheduling_remove_line_item",
        description: "Remove a line item from a schedule. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Schedule ID" },
            line_item_id: { type: "number", description: "Schedule line item ID to remove" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "line_item_id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const lineItemId = requireId(args.line_item_id, "line_item_id");
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Remove line item #${lineItemId} from schedule #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/schedules/${id}/line_items/${lineItemId}`);
        return result ? jsonResult(result) : textResult(`Line item #${lineItemId} removed from schedule #${id}.`);
      },
    },
    {
      definition: {
        name: "scheduling_update_line_item",
        description: "Update a line item on a schedule. Takes the same fields as scheduling_add_line_item; only the fields you send change.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Schedule ID" },
            line_item_id: { type: "number", description: "Schedule line item ID" },
            ...SCHEDULE_LINE_ITEM_PROPERTIES,
          },
          required: ["id", "line_item_id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const lineItemId = requireId(args.line_item_id, "line_item_id");
        return jsonResult(await client.put(`/schedules/${id}/line_items/${lineItemId}`, buildScheduleLineItemBody(args)));
      },
    },
  ];

  return { name: "scheduling", description: "Recurring invoice schedules and line items", getTools: () => tools };
}
