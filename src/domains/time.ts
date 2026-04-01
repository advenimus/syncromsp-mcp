import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult } from "../types.js";
import { optionalString, optionalNumber, optionalBoolean, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "time_list_timers",
        description: "List ticket timers (active/running timers across tickets)",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/ticket_timers", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "time_update_timer",
        description: "Update a ticket timer (e.g., start/stop, change notes)",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Timer ID (required)" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = args.id as number;
        return jsonResult(await client.patch(`/ticket_timers/${id}`));
      },
    },
    {
      definition: {
        name: "time_list_timelogs",
        description: "List employee time logs (clock in/out records)",
        inputSchema: {
          type: "object" as const,
          properties: {
            user_id: { type: "number", description: "Filter by user ID" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          user_id: optionalNumber(args.user_id),
          page: optionalNumber(args.page),
        });
        return jsonResult(await client.get("/timelogs", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "time_update_timelog",
        description: "Update a time log entry (clock in/out, lunch, notes)",
        inputSchema: {
          type: "object" as const,
          properties: {
            lunch: { type: "boolean", description: "Lunch break" },
            in_at: { type: "string", description: "Clock-in time (ISO 8601)" },
            out_at: { type: "string", description: "Clock-out time (ISO 8601)" },
            in_note: { type: "string", description: "Clock-in note" },
            out_note: { type: "string", description: "Clock-out note" },
          },
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          lunch: optionalBoolean(args.lunch),
          in_at: optionalString(args.in_at),
          out_at: optionalString(args.out_at),
          in_note: optionalString(args.in_note),
          out_note: optionalString(args.out_note),
        });
        return jsonResult(await client.put("/timelogs", body));
      },
    },
    {
      definition: {
        name: "time_get_last_timelog",
        description: "Get the most recent time log entry for the current user",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/timelogs/last")),
    },
  ];

  return { name: "time", description: "Ticket timers and employee time logs", getTools: () => tools };
}
