import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "contacts_list",
        description: "List contacts with optional filters",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Filter by customer ID" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          customer_id: optionalId(args.customer_id),
          page: optionalNumber(args.page),
        });
        return jsonResult(await client.get("/contacts", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "contacts_get",
        description: "Get a single contact by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Contact ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/contacts/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "contacts_create",
        description: "Create a new contact for a customer",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            name: { type: "string", description: "Contact name (required)" },
            email: { type: "string", description: "Email address" },
            phone: { type: "string", description: "Phone number" },
            mobile: { type: "string", description: "Mobile number" },
            address1: { type: "string", description: "Address line 1" },
            address2: { type: "string", description: "Address line 2" },
            city: { type: "string", description: "City" },
            state: { type: "string", description: "State" },
            zip: { type: "string", description: "ZIP code" },
            notes: { type: "string", description: "Notes" },
          },
          required: ["customer_id", "name"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          name: args.name,
          email: optionalString(args.email),
          phone: optionalString(args.phone),
          mobile: optionalString(args.mobile),
          address1: optionalString(args.address1),
          address2: optionalString(args.address2),
          city: optionalString(args.city),
          state: optionalString(args.state),
          zip: optionalString(args.zip),
          notes: optionalString(args.notes),
        });
        return jsonResult(await client.post("/contacts", body));
      },
    },
    {
      definition: {
        name: "contacts_update",
        description: "Update an existing contact",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Contact ID (required)" },
            customer_id: { type: "number", description: "Customer ID" },
            name: { type: "string", description: "Contact name" },
            email: { type: "string", description: "Email address" },
            phone: { type: "string", description: "Phone number" },
            mobile: { type: "string", description: "Mobile number" },
            title: { type: "string", description: "Job title" },
            address1: { type: "string", description: "Address line 1" },
            address2: { type: "string", description: "Address line 2" },
            city: { type: "string", description: "City" },
            state: { type: "string", description: "State" },
            zip: { type: "string", description: "ZIP code" },
            notes: { type: "string", description: "Notes" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          customer_id: optionalId(args.customer_id),
          name: optionalString(args.name),
          email: optionalString(args.email),
          phone: optionalString(args.phone),
          mobile: optionalString(args.mobile),
          title: optionalString(args.title),
          address1: optionalString(args.address1),
          address2: optionalString(args.address2),
          city: optionalString(args.city),
          state: optionalString(args.state),
          zip: optionalString(args.zip),
          notes: optionalString(args.notes),
        });
        return jsonResult(await client.put(`/contacts/${id}`, body));
      },
    },
    {
      definition: {
        name: "contacts_delete",
        description: "DELETE a contact permanently. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Contact ID" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) {
          return textResult(`⚠️ CONFIRMATION REQUIRED: Permanently delete contact #${id}? Call again with confirmed: true.`);
        }
        const result = await client.delete(`/contacts/${id}`);
        return result ? jsonResult(result) : textResult(`Contact #${id} deleted successfully.`);
      },
    },
  ];

  return {
    name: "contacts",
    description: "Customer contacts",
    getTools: () => tools,
  };
}
