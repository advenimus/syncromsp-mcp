import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, requireString, optionalString, optionalNumber, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "policies_list_folders",
        description: "List policy folders for a customer. customer_id is required. Returns paginated results with each folder's parent_id, partial_policy_id (policy attached at this folder), and effective_policy_id (inherited policy).",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID whose policy folders to list (required)" },
            page: { type: "number", description: "Page number" },
            per_page: { type: "number", description: "Results per page (max 100)" },
          },
          required: ["customer_id"],
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          customer_id: requireId(args.customer_id, "customer_id"),
          page: optionalNumber(args.page),
          per_page: optionalNumber(args.per_page),
        });
        return jsonResult(await client.get("/policy_folders", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "policies_get_folder",
        description: "Get a single policy folder by ID with full details.",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Policy folder ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/policy_folders/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "policies_create_folder",
        description: "Create a new policy folder under an existing parent folder. customer_id, name, and parent_id are all required -- folders cannot be created at the root level (the root folder is auto-created per customer). Use policies_list_folders first to find the root or desired parent folder ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            customer_id: { type: "number", description: "Customer ID this folder belongs to (required)" },
            name: { type: "string", description: "Folder name (required)" },
            parent_id: { type: "number", description: "Parent policy folder ID (required) -- must belong to the same customer" },
          },
          required: ["customer_id", "name", "parent_id"],
        },
      },
      handler: async (args) => {
        const body = {
          customer_id: requireId(args.customer_id, "customer_id"),
          name: requireString(args.name, "name"),
          parent_id: requireId(args.parent_id, "parent_id"),
        };
        return jsonResult(await client.post("/policy_folders", body));
      },
    },
    {
      definition: {
        name: "policies_update_folder",
        description: "Update an existing policy folder. Use this to rename, re-parent, or attach/detach a partial policy. Set partial_policy_id to null to detach the policy at this folder; the effective_policy_id then inherits from the parent.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Policy folder ID (required)" },
            name: { type: "string", description: "New folder name" },
            parent_id: { type: "number", description: "New parent folder ID (must belong to the same customer)" },
            partial_policy_id: { type: ["number", "null"], description: "Policy ID to attach at this folder, or null to detach" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body: Record<string, unknown> = pickDefined({
          name: optionalString(args.name),
          parent_id: optionalId(args.parent_id),
        });
        // partial_policy_id is nullable -- preserve explicit null
        if (Object.prototype.hasOwnProperty.call(args, "partial_policy_id")) {
          body.partial_policy_id = args.partial_policy_id === null ? null : optionalId(args.partial_policy_id);
        }
        return jsonResult(await client.put(`/policy_folders/${id}`, body));
      },
    },
    {
      definition: {
        name: "policies_delete_folder",
        description: "DELETE a policy folder permanently. The folder must not have child folders (422 otherwise). This action cannot be undone -- the user MUST confirm before executing this.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Policy folder ID to delete" },
            confirmed: { type: "boolean", description: "Must be true to confirm deletion" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) {
          return textResult(
            `⚠️ CONFIRMATION REQUIRED: You are about to permanently delete policy folder #${id}. ` +
            `This cannot be undone. Please call this tool again with confirmed: true to proceed.`
          );
        }
        const result = await client.delete(`/policy_folders/${id}`);
        return result ? jsonResult(result) : textResult(`Policy folder #${id} deleted successfully.`);
      },
    },
  ];

  return {
    name: "policies",
    description: "Policy folders for asset policy assignment (Syncro accounts only)",
    getTools: () => tools,
  };
}
