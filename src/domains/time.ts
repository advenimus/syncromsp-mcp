import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "time_list_timers",
        description: "List ticket timers across tickets. Filter by ticket, technician, timer state, customer, or derived billing status. Use status 'running' or 'paused' to find a timer to pause or stop.",
        inputSchema: {
          type: "object" as const,
          properties: {
            ticket_id: { type: "number", description: "Return timers for this ticket" },
            user_id: { type: "number", description: "Return timers for this technician" },
            status: { type: "string", description: "Filter by timer state: 'running', 'paused', or 'stopped'" },
            customer_id: { type: "number", description: "Return timers for tickets belonging to this customer" },
            billing_status: { type: "string", description: "Filter by derived billing status: 'non-billable', 'unbilled', 'billed', or 'invoiced'" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          ticket_id: optionalId(args.ticket_id),
          user_id: optionalId(args.user_id),
          status: optionalString(args.status),
          customer_id: optionalId(args.customer_id),
          billing_status: optionalString(args.billing_status),
          page: optionalNumber(args.page),
        });
        return jsonResult(await client.get("/ticket_timers", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "time_create_timer",
        description: "Start a live timer on a ticket for the API token's technician (user_id cannot be set). If that technician already has a running or paused timer on the ticket, Syncro resumes and returns it instead of making a second one. Omit billable to use the account default. For logging past work, use tickets_add_timer instead.",
        inputSchema: {
          type: "object" as const,
          properties: {
            ticket_id: { type: "number", description: "Ticket ID (required)" },
            product_id: { type: "number", description: "Labor product ID used when the timer is charged" },
            comment_id: { type: "number", description: "Ticket comment to link the timer to" },
            notes: { type: "string", description: "Notes about the work" },
            billable: { type: "boolean", description: "Whether the time is billable" },
          },
          required: ["ticket_id"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          ticket_id: requireId(args.ticket_id, "ticket_id"),
          product_id: optionalId(args.product_id),
          comment_id: optionalId(args.comment_id),
          notes: optionalString(args.notes),
          billable: optionalBoolean(args.billable),
        });
        return jsonResult(await client.post("/ticket_timers", body));
      },
    },
    {
      definition: {
        name: "time_start_timer",
        description: "Start a timer that has never run, or resume a paused one. Syncro returns 422 if the timer is already running or stopped.",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Timer ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/ticket_timers/${requireId(args.id)}/start`)),
    },
    {
      definition: {
        name: "time_pause_timer",
        description: "Pause a running timer. Syncro returns 422 if the timer is not running.",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Timer ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/ticket_timers/${requireId(args.id)}/pause`)),
    },
    {
      definition: {
        name: "time_stop_timer",
        description: "Stop a running or paused timer. If the account has 'charge timers by default' turned on, this also adds the charge line item to the ticket; otherwise charge it afterwards with tickets_charge_timer (timer_entry_id = this timer's ID). Syncro returns 422 if the timer is already stopped.",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Timer ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.post(`/ticket_timers/${requireId(args.id)}/stop`)),
    },
    {
      definition: {
        name: "time_update_timer",
        description: "Change whether a ticket timer is billable. To start, pause, or stop a timer use time_start_timer, time_pause_timer, or time_stop_timer; to change notes or duration use tickets_update_timer.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Timer ID (required)" },
            billable: { type: "boolean", description: "Whether the time is billable (required)" },
          },
          required: ["id", "billable"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (typeof args.billable !== "boolean") throw new Error("billable must be true or false");
        return jsonResult(await client.patch(`/ticket_timers/${id}`, { billable: args.billable }));
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

  return { name: "time", description: "Ticket timers (start, pause, stop, billable) and employee time logs", getTools: () => tools };
}
