import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, errorResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "tickets_list",
        description: "List tickets with optional filters. Returns paginated results.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Filter by customer ID" },
            contact_id: { type: "number", description: "Filter by contact ID" },
            number: { type: "string", description: "Filter by ticket number" },
            status: { type: "string", description: "Filter by status (e.g., 'New', 'In Progress', 'Resolved', 'Waiting for Parts')" },
            query: { type: "string", description: "Search query string" },
            user_id: { type: "number", description: "Filter by assigned user ID" },
            mine: { type: "boolean", description: "Only show tickets assigned to the authenticated user" },
            resolved_after: { type: "string", description: "ISO 8601 date - tickets resolved after this date" },
            created_after: { type: "string", description: "ISO 8601 date - tickets created after this date" },
            since_updated_at: { type: "string", description: "ISO 8601 date - tickets updated after this date" },
            ticket_search_id: { type: "number", description: "Filter by saved search ID" },
            page: { type: "number", description: "Page number for pagination" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          customer_id: optionalId(args.customer_id),
          contact_id: optionalId(args.contact_id),
          number: optionalString(args.number),
          status: optionalString(args.status),
          query: optionalString(args.query),
          user_id: optionalId(args.user_id),
          mine: optionalBoolean(args.mine),
          resolved_after: optionalString(args.resolved_after),
          created_after: optionalString(args.created_after),
          since_updated_at: optionalString(args.since_updated_at),
          ticket_search_id: optionalId(args.ticket_search_id),
          page: optionalNumber(args.page),
        });
        const result = await client.get("/tickets", params as Record<string, string | number | boolean>);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_get",
        description: "Get a single ticket by ID with full details",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const result = await client.get(`/tickets/${id}`);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_create",
        description: "Create a new ticket. Requires customer_id and subject at minimum. Note: line_items cannot be added inline during creation -- use tickets_add_line_item after the ticket is created.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            subject: { type: "string", description: "Ticket subject (required)" },
            ticket_type_id: { type: "number", description: "Ticket type ID" },
            number: { type: "string", description: "Custom ticket number" },
            due_date: { type: "string", description: "Due date (ISO 8601)" },
            start_at: { type: "string", description: "Start date (ISO 8601)" },
            end_at: { type: "string", description: "End date (ISO 8601)" },
            location_id: { type: "number", description: "Location ID" },
            problem_type: { type: "string", description: "Problem type" },
            status: { type: "string", description: "Ticket status" },
            user_id: { type: "number", description: "Assigned user ID" },
            properties: { type: "object", description: "Custom field values" },
            asset_ids: { type: "array", items: { type: "number" }, description: "Asset IDs to link" },
            contact_id: { type: "number", description: "Contact ID" },
            priority: { type: "string", description: "Priority level" },
            tag_list: { type: "array", items: { type: "string" }, description: "Tags" },
            sla_id: { type: "number", description: "SLA ID" },
            comments_attributes: { type: "array", description: "Initial comments" },
          },
          required: ["customer_id", "subject"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          subject: args.subject,
          ticket_type_id: optionalId(args.ticket_type_id),
          number: optionalString(args.number),
          due_date: optionalString(args.due_date),
          start_at: optionalString(args.start_at),
          end_at: optionalString(args.end_at),
          location_id: optionalId(args.location_id),
          problem_type: optionalString(args.problem_type),
          status: optionalString(args.status),
          user_id: optionalId(args.user_id),
          properties: args.properties,
          asset_ids: args.asset_ids,
          contact_id: optionalId(args.contact_id),
          priority: optionalString(args.priority),
          tag_list: args.tag_list,
          sla_id: optionalId(args.sla_id),
          comments_attributes: args.comments_attributes,
        });
        const result = await client.post("/tickets", body);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_update",
        description: "Update an existing ticket. Only provided fields will be changed.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID (required)" },
            subject: { type: "string", description: "Ticket subject" },
            ticket_type_id: { type: "number", description: "Ticket type ID" },
            number: { type: "string", description: "Custom ticket number" },
            due_date: { type: "string", description: "Due date (ISO 8601)" },
            start_at: { type: "string", description: "Start date (ISO 8601)" },
            end_at: { type: "string", description: "End date (ISO 8601)" },
            location_id: { type: "number", description: "Location ID" },
            problem_type: { type: "string", description: "Problem type" },
            status: { type: "string", description: "Ticket status" },
            user_id: { type: "number", description: "Assigned user ID" },
            customer_id: { type: "number", description: "Customer ID" },
            properties: { type: "object", description: "Custom field values" },
            asset_ids: { type: "array", items: { type: "number" }, description: "Asset IDs to link" },
            contact_id: { type: "number", description: "Contact ID" },
            priority: { type: "string", description: "Priority level" },
            tag_list: { type: "array", items: { type: "string" }, description: "Tags" },
            sla_id: { type: "number", description: "SLA ID" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          subject: optionalString(args.subject),
          ticket_type_id: optionalId(args.ticket_type_id),
          number: optionalString(args.number),
          due_date: optionalString(args.due_date),
          start_at: optionalString(args.start_at),
          end_at: optionalString(args.end_at),
          location_id: optionalId(args.location_id),
          problem_type: optionalString(args.problem_type),
          status: optionalString(args.status),
          user_id: optionalId(args.user_id),
          customer_id: optionalId(args.customer_id),
          properties: args.properties,
          asset_ids: args.asset_ids,
          contact_id: optionalId(args.contact_id),
          priority: optionalString(args.priority),
          tag_list: args.tag_list,
          sla_id: optionalId(args.sla_id),
        });
        const result = await client.put(`/tickets/${id}`, body);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_delete",
        description: "DELETE a ticket permanently. This action cannot be undone. The user MUST confirm before executing this.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID to delete" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) {
          return textResult(
            `⚠️ CONFIRMATION REQUIRED: You are about to permanently delete ticket #${id}. ` +
            `This cannot be undone. Please call this tool again with confirmed: true to proceed.`
          );
        }
        const result = await client.delete(`/tickets/${id}`);
        return result ? jsonResult(result) : textResult(`Ticket #${id} deleted successfully.`);
      },
    },
    {
      definition: {
        name: "tickets_get_comments",
        description: "Get all comments on a ticket",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const result = await client.get(`/tickets/${id}/comments`);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_comment",
        description: "Add a comment to a ticket. Three comment modes: (1) Email reply: hidden=false, do_not_email=false sends email to customer. (2) Public note: hidden=false, do_not_email=true is visible on portal/invoice but no email sent. (3) Private note: hidden=true, do_not_email=true is tech-only and invisible to customer. Note: subject is REQUIRED or the API returns 422.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            subject: { type: "string", description: "Comment subject (REQUIRED - API returns 422 without it)" },
            body: { type: "string", description: "Comment body (required)" },
            tech: { type: "string", description: "Technician name" },
            hidden: { type: "boolean", description: "If true, comment is hidden from customer (private note)" },
            sms_body: { type: "string", description: "SMS body text" },
            do_not_email: { type: "boolean", description: "If true, do not send email notification to customer" },
          },
          required: ["id", "body", "subject"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          subject: optionalString(args.subject),
          body: args.body,
          tech: optionalString(args.tech),
          hidden: optionalBoolean(args.hidden),
          sms_body: optionalString(args.sms_body),
          do_not_email: optionalBoolean(args.do_not_email),
        });
        const result = await client.post(`/tickets/${id}/comment`, body);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_add_line_item",
        description: "Add a line item (product/service charge) to a ticket. Note: name and description are REQUIRED even when using product_id (unlike invoices/estimates which auto-fill from catalog).",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            name: { type: "string", description: "Line item name" },
            description: { type: "string", description: "Line item description" },
            quantity: { type: "number", description: "Quantity" },
            price_cost: { type: "number", description: "Cost price" },
            price_retail: { type: "number", description: "Retail price" },
            product_id: { type: "number", description: "Product ID from inventory" },
            upc_code: { type: "string", description: "UPC code" },
            taxable: { type: "boolean", description: "Whether item is taxable" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          name: optionalString(args.name),
          description: optionalString(args.description),
          quantity: optionalNumber(args.quantity),
          price_cost: optionalNumber(args.price_cost),
          price_retail: optionalNumber(args.price_retail),
          product_id: optionalId(args.product_id),
          upc_code: optionalString(args.upc_code),
          taxable: optionalBoolean(args.taxable),
        });
        const result = await client.post(`/tickets/${id}/add_line_item`, body);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_remove_line_item",
        description: "Remove a line item from a ticket. The user MUST confirm before executing this.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            ticket_line_item_id: { type: "number", description: "Line item ID to remove" },
            confirmed: { type: "boolean", description: "Must be true to confirm removal" },
          },
          required: ["id", "ticket_line_item_id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const lineItemId = requireId(args.ticket_line_item_id, "ticket_line_item_id");
        if (args.confirmed !== true) {
          return textResult(
            `⚠️ CONFIRMATION REQUIRED: Remove line item ${lineItemId} from ticket #${id}? ` +
            `Call again with confirmed: true to proceed.`
          );
        }
        const result = await client.post(`/tickets/${id}/remove_line_item`, { ticket_line_item_id: lineItemId });
        return result ? jsonResult(result) : textResult(`Line item removed from ticket #${id}.`);
      },
    },
    {
      definition: {
        name: "tickets_update_line_item",
        description: "Update a line item on a ticket",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            ticket_line_item_id: { type: "number", description: "Line item ID to update" },
            name: { type: "string", description: "Line item name" },
            description: { type: "string", description: "Line item description" },
            quantity: { type: "number", description: "Quantity" },
            price_cost: { type: "number", description: "Cost price" },
            price_retail: { type: "number", description: "Retail price" },
            product_id: { type: "number", description: "Product ID" },
            upc_code: { type: "string", description: "UPC code" },
            taxable: { type: "boolean", description: "Whether item is taxable" },
          },
          required: ["id", "ticket_line_item_id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          ticket_line_item_id: requireId(args.ticket_line_item_id, "ticket_line_item_id"),
          name: optionalString(args.name),
          description: optionalString(args.description),
          quantity: optionalNumber(args.quantity),
          price_cost: optionalNumber(args.price_cost),
          price_retail: optionalNumber(args.price_retail),
          product_id: optionalId(args.product_id),
          upc_code: optionalString(args.upc_code),
          taxable: optionalBoolean(args.taxable),
        });
        const result = await client.put(`/tickets/${id}/update_line_item`, body);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_add_timer",
        description: "Add a timer entry to a ticket for time tracking. Note: start_at is REQUIRED (API returns 422 without it). duration_minutes auto-calculates end_time from start_at.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            start_at: { type: "string", description: "Start time (ISO 8601) - REQUIRED" },
            end_at: { type: "string", description: "End time (ISO 8601)" },
            duration_minutes: { type: "number", description: "Duration in minutes (alternative to start/end)" },
            user_id: { type: "number", description: "User ID (defaults to current user)" },
            notes: { type: "string", description: "Timer notes" },
            product_id: { type: "number", description: "Product ID for billing" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          start_at: optionalString(args.start_at),
          end_at: optionalString(args.end_at),
          duration_minutes: optionalNumber(args.duration_minutes),
          user_id: optionalId(args.user_id),
          notes: optionalString(args.notes),
          product_id: optionalId(args.product_id),
        });
        const result = await client.post(`/tickets/${id}/timer_entry`, body);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_update_timer",
        description: "Update a timer entry on a ticket",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            timer_entry_id: { type: "number", description: "Timer entry ID" },
            start_at: { type: "string", description: "Start time (ISO 8601)" },
            duration_minutes: { type: "number", description: "Duration in minutes" },
            user_id: { type: "number", description: "User ID" },
            notes: { type: "string", description: "Timer notes" },
            product_id: { type: "number", description: "Product ID for billing" },
          },
          required: ["id", "timer_entry_id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          timer_entry_id: requireId(args.timer_entry_id, "timer_entry_id"),
          start_at: optionalString(args.start_at),
          duration_minutes: optionalNumber(args.duration_minutes),
          user_id: optionalId(args.user_id),
          notes: optionalString(args.notes),
          product_id: optionalId(args.product_id),
        });
        const result = await client.put(`/tickets/${id}/update_timer_entry`, body);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_delete_timer",
        description: "Delete a timer entry from a ticket. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            timer_entry_id: { type: "number", description: "Timer entry ID" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "timer_entry_id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const timerEntryId = requireId(args.timer_entry_id, "timer_entry_id");
        if (args.confirmed !== true) {
          return textResult(
            `⚠️ CONFIRMATION REQUIRED: Delete timer entry ${timerEntryId} from ticket #${id}? ` +
            `Call again with confirmed: true to proceed.`
          );
        }
        const result = await client.post(`/tickets/${id}/delete_timer_entry`, { timer_entry_id: timerEntryId });
        return result ? jsonResult(result) : textResult(`Timer entry deleted from ticket #${id}.`);
      },
    },
    {
      definition: {
        name: "tickets_charge_timer",
        description: "Charge a timer entry on a ticket (convert to billable line item)",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            timer_entry_id: { type: "number", description: "Timer entry ID to charge" },
          },
          required: ["id", "timer_entry_id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const timerEntryId = requireId(args.timer_entry_id, "timer_entry_id");
        const result = await client.post(`/tickets/${id}/charge_timer_entry`, { timer_entry_id: timerEntryId });
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_attach_file",
        description: "Attach a file to a ticket via URL",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            files: { type: "array", items: { type: "string" }, description: "Array of file URLs to attach" },
          },
          required: ["id", "files"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const result = await client.post(`/tickets/${id}/attach_file_url`, { files: args.files });
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_delete_attachment",
        description: "Delete an attachment from a ticket. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
            attachment_id: { type: "number", description: "Attachment ID" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "attachment_id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const attachmentId = requireId(args.attachment_id, "attachment_id");
        if (args.confirmed !== true) {
          return textResult(
            `⚠️ CONFIRMATION REQUIRED: Delete attachment ${attachmentId} from ticket #${id}? ` +
            `Call again with confirmed: true to proceed.`
          );
        }
        const result = await client.post(`/tickets/${id}/delete_attachment`, { attachment_id: attachmentId });
        return result ? jsonResult(result) : textResult(`Attachment deleted from ticket #${id}.`);
      },
    },
    {
      definition: {
        name: "tickets_print",
        description: "Generate a printable PDF for a ticket",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Ticket ID" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const result = await client.post(`/tickets/${id}/print`);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "tickets_settings",
        description: "Get ticket system settings",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => {
        const result = await client.get("/tickets/settings");
        return jsonResult(result);
      },
    },
  ];

  return {
    name: "tickets",
    description: "Service tickets, comments, line items, timers, attachments",
    getTools: () => tools,
  };
}
