import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "customers_list",
        description: "List customers with optional filters. Returns paginated results.",
        inputSchema: {
          type: "object" as const,
          properties: {
            sort: { type: "string", description: "Sort field" },
            query: { type: "string", description: "Search query" },
            firstname: { type: "string", description: "Filter by first name" },
            lastname: { type: "string", description: "Filter by last name" },
            business_name: { type: "string", description: "Filter by business name" },
            email: { type: "string", description: "Filter by email" },
            id: { type: "array", items: { type: "number" }, description: "Filter by specific IDs" },
            include_disabled: { type: "string", description: "Include disabled customers (true/false)" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          sort: optionalString(args.sort),
          query: optionalString(args.query),
          firstname: optionalString(args.firstname),
          lastname: optionalString(args.lastname),
          business_name: optionalString(args.business_name),
          email: optionalString(args.email),
          include_disabled: optionalString(args.include_disabled),
          page: optionalNumber(args.page),
        });
        // Handle array params separately
        if (Array.isArray(args.id)) {
          (params as Record<string, unknown>)["id[]"] = args.id;
        }
        const result = await client.get("/customers", params as Record<string, string | number | boolean>);
        return jsonResult(result);
      },
    },
    {
      definition: {
        name: "customers_get",
        description: "Get a single customer by ID with full details",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Customer ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        return jsonResult(await client.get(`/customers/${id}`));
      },
    },
    {
      definition: {
        name: "customers_create",
        description: "Create a new customer. Note: phone and mobile fields auto-create entries in the phones sub-resource.",
        inputSchema: {
          type: "object" as const,
          properties: {
            business_name: { type: "string", description: "Business name" },
            firstname: { type: "string", description: "First name" },
            lastname: { type: "string", description: "Last name" },
            email: { type: "string", description: "Email address" },
            phone: { type: "string", description: "Phone number" },
            mobile: { type: "string", description: "Mobile number" },
            address: { type: "string", description: "Street address" },
            address_2: { type: "string", description: "Address line 2" },
            city: { type: "string", description: "City" },
            state: { type: "string", description: "State" },
            zip: { type: "string", description: "ZIP code" },
            notes: { type: "string", description: "Notes" },
            get_sms: { type: "boolean", description: "Receive SMS notifications" },
            opt_out: { type: "boolean", description: "Opt out of communications" },
            no_email: { type: "boolean", description: "No email communications" },
            get_billing: { type: "boolean", description: "Receive billing emails" },
            get_marketing: { type: "boolean", description: "Receive marketing emails" },
            get_reports: { type: "boolean", description: "Receive report emails" },
            ref_customer_id: { type: "number", description: "Referring customer ID" },
            referred_by: { type: "string", description: "Referral source" },
            tax_rate_id: { type: "number", description: "Tax rate ID" },
            notification_email: { type: "string", description: "Notification email" },
            invoice_cc_emails: { type: "string", description: "Invoice CC emails" },
            invoice_term_id: { type: "number", description: "Invoice term ID" },
            properties: { type: "object", description: "Custom field values" },
            consent: { type: "object", description: "Consent settings" },
          },
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          business_name: optionalString(args.business_name),
          firstname: optionalString(args.firstname),
          lastname: optionalString(args.lastname),
          email: optionalString(args.email),
          phone: optionalString(args.phone),
          mobile: optionalString(args.mobile),
          address: optionalString(args.address),
          address_2: optionalString(args.address_2),
          city: optionalString(args.city),
          state: optionalString(args.state),
          zip: optionalString(args.zip),
          notes: optionalString(args.notes),
          get_sms: optionalBoolean(args.get_sms),
          opt_out: optionalBoolean(args.opt_out),
          no_email: optionalBoolean(args.no_email),
          get_billing: optionalBoolean(args.get_billing),
          get_marketing: optionalBoolean(args.get_marketing),
          get_reports: optionalBoolean(args.get_reports),
          ref_customer_id: optionalId(args.ref_customer_id),
          referred_by: optionalString(args.referred_by),
          tax_rate_id: optionalId(args.tax_rate_id),
          notification_email: optionalString(args.notification_email),
          invoice_cc_emails: optionalString(args.invoice_cc_emails),
          invoice_term_id: optionalId(args.invoice_term_id),
          properties: args.properties,
          consent: args.consent,
        });
        return jsonResult(await client.post("/customers", body));
      },
    },
    {
      definition: {
        name: "customers_update",
        description: "Update an existing customer. Only provided fields will be changed.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Customer ID (required)" },
            business_name: { type: "string", description: "Business name" },
            firstname: { type: "string", description: "First name" },
            lastname: { type: "string", description: "Last name" },
            email: { type: "string", description: "Email address" },
            phone: { type: "string", description: "Phone number" },
            mobile: { type: "string", description: "Mobile number" },
            address: { type: "string", description: "Street address" },
            address_2: { type: "string", description: "Address line 2" },
            city: { type: "string", description: "City" },
            state: { type: "string", description: "State" },
            zip: { type: "string", description: "ZIP code" },
            notes: { type: "string", description: "Notes" },
            get_sms: { type: "boolean", description: "Receive SMS notifications" },
            opt_out: { type: "boolean", description: "Opt out" },
            no_email: { type: "boolean", description: "No email" },
            properties: { type: "object", description: "Custom field values" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          business_name: optionalString(args.business_name),
          firstname: optionalString(args.firstname),
          lastname: optionalString(args.lastname),
          email: optionalString(args.email),
          phone: optionalString(args.phone),
          mobile: optionalString(args.mobile),
          address: optionalString(args.address),
          address_2: optionalString(args.address_2),
          city: optionalString(args.city),
          state: optionalString(args.state),
          zip: optionalString(args.zip),
          notes: optionalString(args.notes),
          get_sms: optionalBoolean(args.get_sms),
          opt_out: optionalBoolean(args.opt_out),
          no_email: optionalBoolean(args.no_email),
          properties: args.properties,
        });
        return jsonResult(await client.put(`/customers/${id}`, body));
      },
    },
    {
      definition: {
        name: "customers_delete",
        description: "DELETE a customer permanently. The user MUST confirm before executing.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Customer ID" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) {
          return textResult(`⚠️ CONFIRMATION REQUIRED: Permanently delete customer #${id}? This cannot be undone. Call again with confirmed: true.`);
        }
        const result = await client.delete(`/customers/${id}`);
        return result ? jsonResult(result) : textResult(`Customer #${id} deleted successfully.`);
      },
    },
    {
      definition: {
        name: "customers_latest",
        description: "Get the most recently created customers",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/customers/latest")),
    },
    {
      definition: {
        name: "customers_autocomplete",
        description: "Autocomplete search for customers by name or business",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Search query for autocomplete" },
          },
          required: ["query"],
        },
      },
      handler: async (args) => {
        return jsonResult(await client.get("/customers/autocomplete", { query: args.query as string }));
      },
    },
    {
      definition: {
        name: "customers_list_phones",
        description: "List phone numbers for a customer",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
          },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const customerId = requireId(args.customer_id, "customer_id");
        return jsonResult(await client.get(`/customers/${customerId}/phones`));
      },
    },
    {
      definition: {
        name: "customers_create_phone",
        description: "Add a phone number to a customer",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            label: { type: "string", description: "Phone label (e.g., 'Work', 'Home')" },
            number: { type: "string", description: "Phone number" },
            extension: { type: "string", description: "Extension" },
          },
          required: ["customer_id", "number"],
        },
      },
      handler: async (args) => {
        const customerId = requireId(args.customer_id, "customer_id");
        const body = pickDefined({
          label: optionalString(args.label),
          number: args.number,
          extension: optionalString(args.extension),
        });
        return jsonResult(await client.post(`/customers/${customerId}/phones`, body));
      },
    },
    {
      definition: {
        name: "customers_update_phone",
        description: "Update a phone number for a customer",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            id: { type: "number", description: "Phone ID" },
            label: { type: "string", description: "Phone label" },
            number: { type: "string", description: "Phone number" },
            extension: { type: "string", description: "Extension" },
          },
          required: ["customer_id", "id"],
        },
      },
      handler: async (args) => {
        const customerId = requireId(args.customer_id, "customer_id");
        const id = requireId(args.id);
        const body = pickDefined({
          label: optionalString(args.label),
          number: optionalString(args.number),
          extension: optionalString(args.extension),
        });
        return jsonResult(await client.put(`/customers/${customerId}/phones/${id}`, body));
      },
    },
    {
      definition: {
        name: "customers_delete_phone",
        description: "Delete a phone number from a customer. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            id: { type: "number", description: "Phone ID" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["customer_id", "id", "confirmed"],
        },
      },
      handler: async (args) => {
        const customerId = requireId(args.customer_id, "customer_id");
        const id = requireId(args.id);
        if (args.confirmed !== true) {
          return textResult(`⚠️ CONFIRMATION REQUIRED: Delete phone #${id} from customer #${customerId}? Call again with confirmed: true.`);
        }
        const result = await client.delete(`/customers/${customerId}/phones/${id}`);
        return result ? jsonResult(result) : textResult(`Phone deleted successfully.`);
      },
    },
  ];

  return {
    name: "customers",
    description: "Customer records, phones, autocomplete",
    getTools: () => tools,
  };
}
