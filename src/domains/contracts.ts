import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "contracts_list",
        description: "List contracts",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/contracts", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "contracts_get",
        description: "Get a contract by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Contract ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/contracts/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "contracts_create",
        description: "Create a new contract. Note: there is no 'notes' field -- 'description' is the only text field. The activity/notes section in the UI is not API-accessible.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            name: { type: "string", description: "Contract name (required)" },
            description: { type: "string", description: "Description" },
            contract_amount: { type: "string", description: "Contract amount" },
            start_date: { type: "string", description: "Start date" },
            end_date: { type: "string", description: "End date" },
            primary_contact: { type: "string", description: "Primary contact" },
            status: { type: "string", description: "Status" },
            likelihood: { type: "number", description: "Likelihood (0-100)" },
            apply_to_all: { type: "boolean", description: "Apply to all" },
            sla_id: { type: "number", description: "SLA ID" },
          },
          required: ["customer_id", "name"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          name: args.name,
          description: optionalString(args.description),
          contract_amount: optionalString(args.contract_amount),
          start_date: optionalString(args.start_date),
          end_date: optionalString(args.end_date),
          primary_contact: optionalString(args.primary_contact),
          status: optionalString(args.status),
          likelihood: optionalNumber(args.likelihood),
          apply_to_all: optionalBoolean(args.apply_to_all),
          sla_id: optionalId(args.sla_id),
        });
        return jsonResult(await client.post("/contracts", body));
      },
    },
    {
      definition: {
        name: "contracts_update",
        description: "Update a contract. Note: there is no 'notes' field -- 'description' is the only text field. The activity/notes section in the UI is not API-accessible.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Contract ID (required)" },
            customer_id: { type: "number" }, name: { type: "string" },
            description: { type: "string" }, contract_amount: { type: "string" },
            start_date: { type: "string" }, end_date: { type: "string" },
            primary_contact: { type: "string" }, status: { type: "string" },
            likelihood: { type: "number" }, apply_to_all: { type: "boolean" },
            sla_id: { type: "number" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          customer_id: optionalId(args.customer_id), name: optionalString(args.name),
          description: optionalString(args.description), contract_amount: optionalString(args.contract_amount),
          start_date: optionalString(args.start_date), end_date: optionalString(args.end_date),
          primary_contact: optionalString(args.primary_contact), status: optionalString(args.status),
          likelihood: optionalNumber(args.likelihood), apply_to_all: optionalBoolean(args.apply_to_all),
          sla_id: optionalId(args.sla_id),
        });
        return jsonResult(await client.put(`/contracts/${id}`, body));
      },
    },
    {
      definition: {
        name: "contracts_delete",
        description: "DELETE a contract (soft-delete -- GET returns null after deletion, not 404). The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Contract ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete contract #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/contracts/${id}`);
        return result ? jsonResult(result) : textResult(`Contract #${id} deleted.`);
      },
    },
  ];

  return { name: "contracts", description: "Service contracts and SLAs", getTools: () => tools };
}
