import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "assets_list",
        description: "List customer assets with optional filters. Returns paginated results.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Filter by customer ID" },
            asset_type_id: { type: "number", description: "Filter by asset type ID" },
            snmp_enabled: { type: "string", description: "Filter by SNMP enabled status" },
            query: { type: "string", description: "Search query" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          customer_id: optionalId(args.customer_id),
          asset_type_id: optionalId(args.asset_type_id),
          snmp_enabled: optionalString(args.snmp_enabled),
          query: optionalString(args.query),
          page: optionalNumber(args.page),
        });
        return jsonResult(await client.get("/customer_assets", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "assets_get",
        description: "Get a single asset by ID with full details",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Asset ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/customer_assets/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "assets_create",
        description: "Create a new customer asset. Note: asset_type_name must match an existing type in the account. Custom properties on create are IGNORED -- set them via assets_update after creation.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID (required)" },
            name: { type: "string", description: "Asset name (required)" },
            asset_type_name: { type: "string", description: "Asset type name (must match an existing type in the account)" },
            asset_type_id: { type: "number", description: "Asset type ID" },
            asset_serial: { type: "string", description: "Serial number" },
            properties: { type: "object", description: "Custom properties" },
          },
          required: ["customer_id", "name"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          name: args.name,
          asset_type_name: optionalString(args.asset_type_name),
          asset_type_id: optionalId(args.asset_type_id),
          asset_serial: optionalString(args.asset_serial),
          properties: args.properties,
        });
        return jsonResult(await client.post("/customer_assets", body));
      },
    },
    {
      definition: {
        name: "assets_update",
        description: "Update an existing asset. Use this to set asset properties (hdd, manufacturer, model, os, cpu_name, ram, last_boot) after creation, as properties on create are ignored.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Asset ID (required)" },
            name: { type: "string", description: "Asset name" },
            asset_type_name: { type: "string", description: "Asset type name" },
            asset_type_id: { type: "number", description: "Asset type ID" },
            customer_id: { type: "number", description: "Customer ID" },
            asset_serial: { type: "string", description: "Serial number" },
            properties: { type: "object", description: "Asset properties (hdd, manufacturer, model, os, cpu_name, ram, last_boot, etc.)" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          name: optionalString(args.name),
          asset_type_name: optionalString(args.asset_type_name),
          asset_type_id: optionalId(args.asset_type_id),
          customer_id: optionalId(args.customer_id),
          asset_serial: optionalString(args.asset_serial),
          properties: args.properties,
        });
        return jsonResult(await client.put(`/customer_assets/${id}`, body));
      },
    },
    {
      definition: {
        name: "assets_get_patches",
        description: "Get patch information for an asset (available OS/software patches)",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Asset ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/customer_assets/${requireId(args.id)}/patches`)),
    },
    {
      definition: {
        name: "assets_chat_info",
        description: "Get chat information for assets by IDs",
        inputSchema: {
          type: "object" as const,
          properties: {
            ids: { type: "string", description: "Comma-separated asset IDs" },
          },
          required: ["ids"],
        },
      },
      handler: async (args) => {
        return jsonResult(await client.get("/customer_assets/chat_information_by_ids", { ids: args.ids as string }));
      },
    },
  ];

  return {
    name: "assets",
    description: "Customer assets, patches, chat info",
    getTools: () => tools,
  };
}
