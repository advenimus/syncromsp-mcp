import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, requireString, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    // === Search ===
    {
      definition: {
        name: "admin_search",
        description: "Global search across Syncro (tickets, customers, assets, invoices, etc.)",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Search query (required)" },
          },
          required: ["query"],
        },
      },
      handler: async (args) => jsonResult(await client.get("/search", { query: args.query as string })),
    },
    // === Users ===
    {
      definition: {
        name: "admin_get_me",
        description: "Get the currently authenticated user's profile",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/me")),
    },
    {
      definition: {
        name: "admin_list_users",
        description: "List all users/technicians",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/users")),
    },
    {
      definition: {
        name: "admin_get_user",
        description: "Get a user by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "User ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/users/${requireId(args.id)}`)),
    },
    // === Settings ===
    {
      definition: {
        name: "admin_get_settings",
        description: "Get system settings",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/settings")),
    },
    {
      definition: {
        name: "admin_get_tabs",
        description: "Get settings tabs configuration",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/settings/tabs")),
    },
    {
      definition: {
        name: "admin_get_printing",
        description: "Get printing settings",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/settings/printing")),
    },
    // === Vendors ===
    {
      definition: {
        name: "admin_list_vendors",
        description: "List vendors",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/vendors")),
    },
    {
      definition: {
        name: "admin_get_vendor",
        description: "Get a vendor by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Vendor ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/vendors/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "admin_create_vendor",
        description: "Create a new vendor. Note: there is no delete endpoint for vendors.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Vendor name (required)" },
            rep_first_name: { type: "string" }, rep_last_name: { type: "string" },
            email: { type: "string" }, phone: { type: "string" },
            account_number: { type: "string" }, address: { type: "string" },
            city: { type: "string" }, state: { type: "string" },
            zip: { type: "string" }, website: { type: "string" },
            notes: { type: "string" },
          },
          required: ["name"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          name: requireString(args.name, "name"),
          rep_first_name: optionalString(args.rep_first_name), rep_last_name: optionalString(args.rep_last_name),
          email: optionalString(args.email), phone: optionalString(args.phone),
          account_number: optionalString(args.account_number), address: optionalString(args.address),
          city: optionalString(args.city), state: optionalString(args.state),
          zip: optionalString(args.zip), website: optionalString(args.website),
          notes: optionalString(args.notes),
        });
        return jsonResult(await client.post("/vendors", body));
      },
    },
    {
      definition: {
        name: "admin_update_vendor",
        description: "Update a vendor",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Vendor ID (required)" },
            name: { type: "string" }, rep_first_name: { type: "string" },
            rep_last_name: { type: "string" }, email: { type: "string" },
            phone: { type: "string" }, account_number: { type: "string" },
            address: { type: "string" }, city: { type: "string" },
            state: { type: "string" }, zip: { type: "string" },
            website: { type: "string" }, notes: { type: "string" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          name: optionalString(args.name), rep_first_name: optionalString(args.rep_first_name),
          rep_last_name: optionalString(args.rep_last_name), email: optionalString(args.email),
          phone: optionalString(args.phone), account_number: optionalString(args.account_number),
          address: optionalString(args.address), city: optionalString(args.city),
          state: optionalString(args.state), zip: optionalString(args.zip),
          website: optionalString(args.website), notes: optionalString(args.notes),
        });
        return jsonResult(await client.put(`/vendors/${id}`, body));
      },
    },
    // === Wiki Pages ===
    {
      definition: {
        name: "admin_list_wiki",
        description: "List wiki pages",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/wiki_pages", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "admin_get_wiki",
        description: "Get a wiki page by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Wiki page ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/wiki_pages/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "admin_create_wiki",
        description: "Create a wiki page",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Page name (required)" },
            body: { type: "string", description: "Page content (HTML/Markdown)" },
            slug: { type: "string", description: "URL slug" },
            customer_id: { type: "number", description: "Associate with customer" },
            asset_id: { type: "number", description: "Associate with asset" },
            visibility: { type: "string", description: "Visibility level" },
          },
          required: ["name"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          name: requireString(args.name, "name"), body: optionalString(args.body),
          slug: optionalString(args.slug), customer_id: optionalId(args.customer_id),
          asset_id: optionalId(args.asset_id), visibility: optionalString(args.visibility),
        });
        return jsonResult(await client.post("/wiki_pages", body));
      },
    },
    {
      definition: {
        name: "admin_update_wiki",
        description: "Update a wiki page",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Wiki page ID (required)" },
            name: { type: "string" }, body: { type: "string" }, slug: { type: "string" },
            customer_id: { type: "number" }, asset_id: { type: "number" },
            visibility: { type: "string" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          name: optionalString(args.name), body: optionalString(args.body),
          slug: optionalString(args.slug), customer_id: optionalId(args.customer_id),
          asset_id: optionalId(args.asset_id), visibility: optionalString(args.visibility),
        });
        return jsonResult(await client.put(`/wiki_pages/${id}`, body));
      },
    },
    {
      definition: {
        name: "admin_delete_wiki",
        description: "DELETE a wiki page. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Wiki page ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete wiki page #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/wiki_pages/${id}`);
        return result ? jsonResult(result) : textResult(`Wiki page #${id} deleted.`);
      },
    },
    // === Portal Users ===
    {
      definition: {
        name: "admin_list_portal_users",
        description: "List customer portal users",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/portal_users")),
    },
    {
      definition: {
        name: "admin_create_portal_user",
        description: "Create a customer portal user. Always provide contact_id to associate a person/name -- without it the portal user shows as an anonymous email.",
        inputSchema: {
          type: "object" as const,
          properties: {
            contact_id: { type: "number", description: "Contact ID (strongly recommended -- associates a name with the portal user)" },
            customer_id: { type: "number", description: "Customer ID" },
            email: { type: "string", description: "Email (required)" },
            password: { type: "string", description: "Password" },
            password_confirmation: { type: "string", description: "Password confirmation" },
            portal_group_id: { type: "number", description: "Portal group ID" },
          },
          required: ["email"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          contact_id: optionalId(args.contact_id), customer_id: optionalId(args.customer_id),
          email: args.email, password: optionalString(args.password),
          password_confirmation: optionalString(args.password_confirmation),
          portal_group_id: optionalId(args.portal_group_id),
        });
        return jsonResult(await client.post("/portal_users", body));
      },
    },
    {
      definition: {
        name: "admin_update_portal_user",
        description: "Update a portal user",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Portal user ID (required)" },
            email: { type: "string" }, password: { type: "string" },
            password_confirmation: { type: "string" }, portal_group_id: { type: "number" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          email: optionalString(args.email), password: optionalString(args.password),
          password_confirmation: optionalString(args.password_confirmation),
          portal_group_id: optionalId(args.portal_group_id),
        });
        return jsonResult(await client.put(`/portal_users/${id}`, body));
      },
    },
    {
      definition: {
        name: "admin_delete_portal_user",
        description: "DELETE a portal user. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Portal user ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete portal user #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/portal_users/${id}`);
        return result ? jsonResult(result) : textResult(`Portal user #${id} deleted.`);
      },
    },
    {
      definition: {
        name: "admin_create_portal_invitation",
        description: "Send a portal invitation to a user",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Portal user ID" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post("/portal_users/create_invitation", { id: requireId(args.id) })),
    },
    // === Canned Responses ===
    {
      definition: {
        name: "admin_list_canned_responses",
        description: "List canned ticket responses",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/canned_responses")),
    },
    {
      definition: {
        name: "admin_create_canned_response",
        description: "Create a canned response",
        inputSchema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "Title (required)" },
            body: { type: "string", description: "Response body" },
            subject: { type: "string", description: "Email subject" },
            canned_response_category_id: { type: "number", description: "Category ID" },
          },
          required: ["title"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          title: requireString(args.title, "title"), body: optionalString(args.body),
          subject: optionalString(args.subject),
          canned_response_category_id: optionalId(args.canned_response_category_id),
        });
        return jsonResult(await client.post("/canned_responses", body));
      },
    },
    {
      definition: {
        name: "admin_update_canned_response",
        description: "Update a canned response",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Canned response ID (required)" },
            title: { type: "string" }, body: { type: "string" },
            subject: { type: "string" }, canned_response_category_id: { type: "number" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          title: optionalString(args.title), body: optionalString(args.body),
          subject: optionalString(args.subject),
          canned_response_category_id: optionalId(args.canned_response_category_id),
        });
        return jsonResult(await client.patch(`/canned_responses/${id}`, body));
      },
    },
    {
      definition: {
        name: "admin_delete_canned_response",
        description: "DELETE a canned response. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Canned response ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete canned response #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/canned_responses/${id}`);
        return result ? jsonResult(result) : textResult(`Canned response #${id} deleted.`);
      },
    },
    {
      definition: {
        name: "admin_get_canned_settings",
        description: "Get canned response settings",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/canned_responses/settings")),
    },
    // === Caller ID ===
    {
      definition: {
        name: "admin_caller_id",
        description: "Look up caller information by phone number",
        inputSchema: {
          type: "object" as const,
          properties: {
            phone_number: { type: "string", description: "Phone number to look up" },
          },
          required: ["phone_number"],
        },
      },
      handler: async (args) => jsonResult(await client.get("/callerid", { phone_number: args.phone_number as string })),
    },
    // === User Devices ===
    {
      definition: {
        name: "admin_create_user_device",
        description: "Register a user device for push notifications",
        inputSchema: {
          type: "object" as const,
          properties: {
            device_uuid: { type: "string", description: "Device UUID" },
            device_name: { type: "string", description: "Device name" },
            registration_token_gcm: { type: "string", description: "GCM registration token" },
            system_name: { type: "string", description: "OS name" },
            model: { type: "string", description: "Device model" },
            screen_size: { type: "string", description: "Screen size" },
          },
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          device_uuid: optionalString(args.device_uuid), device_name: optionalString(args.device_name),
          registration_token_gcm: optionalString(args.registration_token_gcm),
          system_name: optionalString(args.system_name), model: optionalString(args.model),
          screen_size: optionalString(args.screen_size),
        });
        return jsonResult(await client.post("/user_devices", body));
      },
    },
    {
      definition: {
        name: "admin_get_user_device",
        description: "Get a user device by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Device ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/user_devices/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "admin_update_user_device",
        description: "Update a user device",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Device ID (required)" },
            registration_token_gcm: { type: "string", description: "GCM token" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        return jsonResult(await client.put(`/user_devices/${id}`, { registration_token_gcm: optionalString(args.registration_token_gcm) }));
      },
    },
    // === Ticket Forms ===
    {
      definition: {
        name: "admin_list_ticket_forms",
        description: "List new ticket forms",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/new_ticket_forms")),
    },
    {
      definition: {
        name: "admin_get_ticket_form",
        description: "Get a ticket form by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Form ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/new_ticket_forms/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "admin_process_ticket_form",
        description: "Submit/process a new ticket form",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Form ID" },
            customer_details: { type: "object", description: "Customer details" },
            ticket_details: { type: "object", description: "Ticket details" },
            appointments: { type: "object", description: "Appointment details" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          customer_details: args.customer_details,
          ticket_details: args.ticket_details,
          appointments: args.appointments,
        });
        return jsonResult(await client.post(`/new_ticket_forms/${id}/process_form`, body));
      },
    },
    // === Worksheet Results ===
    {
      definition: {
        name: "admin_list_worksheets",
        description: "List worksheet results for a ticket",
        inputSchema: {
          type: "object" as const,
          properties: { ticket_id: { type: "number", description: "Ticket ID" } },
          required: ["ticket_id"],
        },
      },
      handler: async (args) => {
        const ticketId = requireId(args.ticket_id, "ticket_id");
        return jsonResult(await client.get(`/tickets/${ticketId}/worksheet_results`));
      },
    },
    {
      definition: {
        name: "admin_get_worksheet",
        description: "Get a worksheet result by ID",
        inputSchema: {
          type: "object" as const,
          properties: {
            ticket_id: { type: "number", description: "Ticket ID" },
            id: { type: "number", description: "Worksheet result ID" },
          },
          required: ["ticket_id", "id"],
        },
      },
      handler: async (args) => {
        const ticketId = requireId(args.ticket_id, "ticket_id");
        const id = requireId(args.id);
        return jsonResult(await client.get(`/tickets/${ticketId}/worksheet_results/${id}`));
      },
    },
    {
      definition: {
        name: "admin_create_worksheet",
        description: "Create a worksheet result for a ticket. Note: worksheet_template_id is required and must reference an existing admin-configured template.",
        inputSchema: {
          type: "object" as const,
          properties: {
            ticket_id: { type: "number", description: "Ticket ID" },
            worksheet_template_id: { type: "number", description: "Worksheet template ID (required -- must reference an existing template)" },
            title: { type: "string", description: "Title" },
          },
          required: ["ticket_id"],
        },
      },
      handler: async (args) => {
        const ticketId = requireId(args.ticket_id, "ticket_id");
        const body = pickDefined({
          worksheet_template_id: optionalId(args.worksheet_template_id),
          title: optionalString(args.title),
        });
        return jsonResult(await client.post(`/tickets/${ticketId}/worksheet_results`, body));
      },
    },
    {
      definition: {
        name: "admin_update_worksheet",
        description: "Update a worksheet result",
        inputSchema: {
          type: "object" as const,
          properties: {
            ticket_id: { type: "number", description: "Ticket ID" },
            id: { type: "number", description: "Worksheet result ID" },
            title: { type: "string" }, complete: { type: "boolean" },
            public: { type: "boolean" }, required: { type: "boolean" },
            user_id: { type: "number" }, answers: { type: "object", description: "Worksheet answers" },
          },
          required: ["ticket_id", "id"],
        },
      },
      handler: async (args) => {
        const ticketId = requireId(args.ticket_id, "ticket_id");
        const id = requireId(args.id);
        const body = pickDefined({
          title: optionalString(args.title), complete: optionalBoolean(args.complete),
          public: optionalBoolean(args.public), required: optionalBoolean(args.required),
          user_id: optionalId(args.user_id), answers: args.answers,
        });
        return jsonResult(await client.put(`/tickets/${ticketId}/worksheet_results/${id}`, body));
      },
    },
    {
      definition: {
        name: "admin_delete_worksheet",
        description: "DELETE a worksheet result. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            ticket_id: { type: "number", description: "Ticket ID" },
            id: { type: "number", description: "Worksheet result ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["ticket_id", "id", "confirmed"],
        },
      },
      handler: async (args) => {
        const ticketId = requireId(args.ticket_id, "ticket_id");
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete worksheet #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/tickets/${ticketId}/worksheet_results/${id}`);
        return result ? jsonResult(result) : textResult(`Worksheet deleted.`);
      },
    },
    // === Purchase Orders ===
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
    // === Items & Line Items ===
    {
      definition: {
        name: "admin_list_items",
        description: "List items (global item catalog)",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/items")),
    },
    {
      definition: {
        name: "admin_list_line_items",
        description: "List line items across invoices/tickets",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/line_items")),
    },
    // === OTP Login ===
    {
      definition: {
        name: "admin_otp_login",
        description: "Login with a one-time password code",
        inputSchema: {
          type: "object" as const,
          properties: {
            code: { type: "string", description: "OTP code" },
          },
          required: ["code"],
        },
      },
      handler: async (args) => jsonResult(await client.post("/otp_login", { code: args.code })),
    },
  ];

  return {
    name: "admin",
    description: "Search, users, vendors, wiki, portal users, canned responses, settings, worksheets, purchase orders, devices, ticket forms",
    getTools: () => tools,
  };
}
