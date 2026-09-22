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
            created_after: { type: "string", description: "Return alerts created after this date (e.g., '2026-02-25')" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          status: optionalString(args.status),
          created_after: optionalString(args.created_after),
          page: optionalNumber(args.page),
        });
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
    {
      definition: {
        name: "rmm_schedule_script",
        description: "Run an RMM script on one asset, now or once at a later time. Recurring schedules are not allowed through the API. No API lists scripts, so get script_id from the script's page in Syncro. This runs code on a customer machine: the user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            asset_id: { type: "number", description: "Asset ID to run the script on" },
            script_id: { type: "number", description: "Script ID" },
            run_type: { type: "string", enum: ["now", "later"], description: "'now' runs right away; 'later' runs once at next_time" },
            next_time: { type: "string", description: "When to run (ISO 8601). Required when run_type is 'later'." },
            run_as: { type: "string", description: "Run-as option for the script, as offered in Syncro" },
            runtime_variables: { type: "object", description: "Values for the script's runtime variables, keyed by variable name" },
            mav_options: { type: "object", description: "Malwarebytes scan options: scan_type (string), silent (boolean), quarantine (boolean)" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["asset_id", "script_id", "run_type", "confirmed"],
        },
      },
      handler: async (args) => {
        const assetId = requireId(args.asset_id, "asset_id");
        const scriptId = requireId(args.script_id, "script_id");
        const runType = optionalString(args.run_type);
        if (runType !== "now" && runType !== "later") throw new Error("run_type must be 'now' or 'later'");
        const nextTime = optionalString(args.next_time);
        if (runType === "later" && !nextTime) throw new Error("next_time is required when run_type is 'later'");
        if (args.confirmed !== true) {
          const when = runType === "now" ? "now" : `at ${nextTime}`;
          return textResult(`⚠️ CONFIRMATION REQUIRED: Run script #${scriptId} on asset #${assetId} ${when}? Call again with confirmed: true.`);
        }
        const scriptOptions = pickDefined({ run_as: optionalString(args.run_as), runtime_variables: args.runtime_variables });
        const body = pickDefined({
          script_id: scriptId,
          run_type: runType,
          freq: "once",
          next_time: runType === "later" ? nextTime : undefined,
          script_options: Object.keys(scriptOptions).length > 0 ? scriptOptions : undefined,
          mav_options: args.mav_options,
        });
        return jsonResult(await client.post(`/rmm/public_scripts/${assetId}/schedule`, body));
      },
    },
  ];

  return { name: "rmm", description: "RMM alerts and script runs", getTools: () => tools };
}
