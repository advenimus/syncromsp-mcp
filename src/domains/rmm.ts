import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "rmm_list_alerts",
        description: "List RMM alerts",
        inputSchema: {
          type: "object" as const,
          properties: {
            status: { type: "string", description: "Filter by status" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ status: optionalString(args.status), page: optionalNumber(args.page) });
        return jsonResult(await client.get("/rmm_alerts", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "rmm_get_alert",
        description: "Get an RMM alert by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Alert ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/rmm_alerts/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "rmm_create_alert",
        description: "Create an RMM alert. Note: formatted_output (not in swagger) populates the 'Details' field in the UI. description maps to the 'Type' field. Include properties with trigger and description keys to match real alert structure.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID" },
            asset_id: { type: "number", description: "Asset ID" },
            description: { type: "string", description: "Alert description (maps to 'Type' field in UI)" },
            formatted_output: { type: "string", description: "Populates the 'Details' field in UI (not in swagger docs)" },
            resolved: { type: "boolean", description: "Whether resolved" },
            status: { type: "string", description: "Status" },
            properties: { type: "object", description: "Additional properties -- include trigger and description to match real alert structure" },
          },
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: optionalId(args.customer_id), asset_id: optionalId(args.asset_id),
          description: optionalString(args.description), formatted_output: optionalString(args.formatted_output),
          resolved: optionalBoolean(args.resolved),
          status: optionalString(args.status), properties: args.properties,
        });
        return jsonResult(await client.post("/rmm_alerts", body));
      },
    },
    {
      definition: {
        name: "rmm_mute_alert",
        description: "Mute an RMM alert. Requires mute_for parameter.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Alert ID" },
            mute_for: { type: "string", description: "Mute duration (required). Known valid value: 'forever'" },
          },
          required: ["id", "mute_for"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/rmm_alerts/${requireId(args.id)}/mute`, { mute_for: args.mute_for })),
    },
    {
      definition: {
        name: "rmm_delete_alert",
        description: "DELETE (soft-resolve) an RMM alert. Sets resolved=true -- the alert is still readable via GET after deletion. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Alert ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete RMM alert #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/rmm_alerts/${id}`);
        return result ? jsonResult(result) : textResult(`RMM alert #${id} deleted.`);
      },
    },
  ];

  return { name: "rmm", description: "RMM alerts", getTools: () => tools };
}
