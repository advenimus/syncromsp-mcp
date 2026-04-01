import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "payments_list",
        description: "List payments",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/payments", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "payments_get",
        description: "Get a single payment by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Payment ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/payments/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "payments_create",
        description: "Record a payment. Use apply_payments to distribute a payment across multiple invoices.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            invoice_id: { type: "number", description: "Invoice ID" },
            invoice_number: { type: "string", description: "Invoice number" },
            amount_cents: { type: "number", description: "Amount in cents" },
            payment_method: { type: "string", description: "Payment method" },
            ref_num: { type: "string", description: "Reference number" },
            address_street: { type: "string", description: "Billing street" },
            address_city: { type: "string", description: "Billing city" },
            address_zip: { type: "string", description: "Billing ZIP" },
            register_id: { type: "number", description: "Register ID" },
            signature_name: { type: "string", description: "Signature name" },
            apply_payments: { type: "object", description: "Object where keys are invoice IDs and values are amounts in cents. Distributes payment across multiple invoices. Example: { \"456\": 3000, \"789\": 2000 }" },
          },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          invoice_id: optionalId(args.invoice_id),
          invoice_number: optionalString(args.invoice_number),
          amount_cents: optionalNumber(args.amount_cents),
          payment_method: optionalString(args.payment_method),
          ref_num: optionalString(args.ref_num),
          address_street: optionalString(args.address_street),
          address_city: optionalString(args.address_city),
          address_zip: optionalString(args.address_zip),
          register_id: optionalId(args.register_id),
          signature_name: optionalString(args.signature_name),
          apply_payments: args.apply_payments,
        });
        return jsonResult(await client.post("/payments", body));
      },
    },
    {
      definition: {
        name: "payments_list_methods",
        description: "List available payment methods",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/payment_methods")),
    },
    {
      definition: {
        name: "payments_list_profiles",
        description: "List stored payment profiles for a customer",
        inputSchema: {
          type: "object" as const,
          properties: { customer_id: { type: "number", description: "Customer ID" } },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const cid = requireId(args.customer_id, "customer_id");
        return jsonResult(await client.get(`/customers/${cid}/payment_profiles`));
      },
    },
    {
      definition: {
        name: "payments_get_profile",
        description: "Get a payment profile by ID",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            id: { type: "number", description: "Payment profile ID" },
          },
          required: ["customer_id", "id"],
        },
      },
      handler: async (args) => {
        const cid = requireId(args.customer_id, "customer_id");
        const id = requireId(args.id);
        return jsonResult(await client.get(`/customers/${cid}/payment_profiles/${id}`));
      },
    },
    {
      definition: {
        name: "payments_create_profile",
        description: "Create a stored payment profile for a customer",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            customer_external_id: { type: "string", description: "Payment gateway customer token" },
            payment_profile_id: { type: "string", description: "Payment gateway profile token" },
            expiration: { type: "string", description: "Expiration date" },
            last_four: { type: "string", description: "Last 4 digits" },
          },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const cid = requireId(args.customer_id, "customer_id");
        const body = pickDefined({
          customer_external_id: optionalString(args.customer_external_id),
          payment_profile_id: optionalString(args.payment_profile_id),
          expiration: optionalString(args.expiration),
          last_four: optionalString(args.last_four),
        });
        return jsonResult(await client.post(`/customers/${cid}/payment_profiles`, body));
      },
    },
    {
      definition: {
        name: "payments_update_profile",
        description: "Update a payment profile",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            id: { type: "number", description: "Profile ID" },
            expiration: { type: "string" }, last_four: { type: "string" },
          },
          required: ["customer_id", "id"],
        },
      },
      handler: async (args) => {
        const cid = requireId(args.customer_id, "customer_id");
        const id = requireId(args.id);
        const body = pickDefined({ expiration: optionalString(args.expiration), last_four: optionalString(args.last_four) });
        return jsonResult(await client.put(`/customers/${cid}/payment_profiles/${id}`, body));
      },
    },
    {
      definition: {
        name: "payments_delete_profile",
        description: "Delete a payment profile. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            id: { type: "number", description: "Profile ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["customer_id", "id", "confirmed"],
        },
      },
      handler: async (args) => {
        const cid = requireId(args.customer_id, "customer_id");
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete payment profile #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/customers/${cid}/payment_profiles/${id}`);
        return result ? jsonResult(result) : textResult(`Payment profile deleted.`);
      },
    },
  ];

  return { name: "payments", description: "Payments, payment methods, payment profiles", getTools: () => tools };
}
