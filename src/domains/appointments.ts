import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult, textResult } from "../types.js";
import { requireId, requireString, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "appointments_list",
        description: "List appointments with optional date range filter",
        inputSchema: {
          type: "object" as const,
          properties: {
            date_from: { type: "string", description: "Start date (ISO 8601)" },
            date_to: { type: "string", description: "End date (ISO 8601)" },
            mine: { type: "boolean", description: "Only my appointments" },
            page: { type: "number", description: "Page number" },
          },
        },
      },
      handler: async (args) => {
        const params = pickDefined({
          date_from: optionalString(args.date_from),
          date_to: optionalString(args.date_to),
          mine: optionalBoolean(args.mine),
          page: optionalNumber(args.page),
        });
        return jsonResult(await client.get("/appointments", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "appointments_get",
        description: "Get a single appointment by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Appointment ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/appointments/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "appointments_create",
        description: "Create a new appointment. When possible, link to a ticket via ticket_id -- this auto-populates the description with ticket details and the location from the customer address.",
        inputSchema: {
          type: "object" as const,
          properties: {
            summary: { type: "string", description: "Appointment summary/title" },
            description: { type: "string", description: "Description" },
            start_at: { type: "string", description: "Start time (ISO 8601)" },
            end_at: { type: "string", description: "End time (ISO 8601)" },
            appointment_duration: { type: "string", description: "Duration (e.g., '1h', '30m')" },
            customer_id: { type: "number", description: "Customer ID" },
            ticket_id: { type: "number", description: "Ticket ID" },
            user_id: { type: "number", description: "Assigned user ID" },
            user_ids: { type: "array", items: { type: "number" }, description: "Multiple user IDs" },
            location: { type: "string", description: "Location" },
            appointment_type_id: { type: "number", description: "Appointment type ID" },
            email_customer: { type: "boolean", description: "Email customer about appointment" },
            do_not_email: { type: "boolean", description: "Suppress email notification" },
            all_day: { type: "boolean", description: "All-day appointment" },
          },
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          summary: optionalString(args.summary),
          description: optionalString(args.description),
          start_at: optionalString(args.start_at),
          end_at: optionalString(args.end_at),
          appointment_duration: optionalString(args.appointment_duration),
          customer_id: optionalId(args.customer_id),
          ticket_id: optionalId(args.ticket_id),
          user_id: optionalId(args.user_id),
          user_ids: args.user_ids,
          location: optionalString(args.location),
          appointment_type_id: optionalId(args.appointment_type_id),
          email_customer: optionalBoolean(args.email_customer),
          do_not_email: optionalBoolean(args.do_not_email),
          all_day: optionalBoolean(args.all_day),
        });
        return jsonResult(await client.post("/appointments", body));
      },
    },
    {
      definition: {
        name: "appointments_update",
        description: "Update an existing appointment",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Appointment ID (required)" },
            summary: { type: "string" }, description: { type: "string" },
            start_at: { type: "string" }, end_at: { type: "string" },
            appointment_duration: { type: "string" },
            customer_id: { type: "number" }, ticket_id: { type: "number" },
            user_id: { type: "number" }, user_ids: { type: "array", items: { type: "number" } },
            location: { type: "string" }, appointment_type_id: { type: "number" },
            email_customer: { type: "boolean" }, all_day: { type: "boolean" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          summary: optionalString(args.summary), description: optionalString(args.description),
          start_at: optionalString(args.start_at), end_at: optionalString(args.end_at),
          appointment_duration: optionalString(args.appointment_duration),
          customer_id: optionalId(args.customer_id), ticket_id: optionalId(args.ticket_id),
          user_id: optionalId(args.user_id), user_ids: args.user_ids,
          location: optionalString(args.location), appointment_type_id: optionalId(args.appointment_type_id),
          email_customer: optionalBoolean(args.email_customer), all_day: optionalBoolean(args.all_day),
        });
        return jsonResult(await client.put(`/appointments/${id}`, body));
      },
    },
    {
      definition: {
        name: "appointments_delete",
        description: "DELETE an appointment. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Appointment ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete appointment #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/appointments/${id}`);
        return result ? jsonResult(result) : textResult(`Appointment #${id} deleted.`);
      },
    },
    {
      definition: {
        name: "appointments_list_types",
        description: "List appointment types",
        inputSchema: { type: "object" as const, properties: {} },
      },
      handler: async () => jsonResult(await client.get("/appointment_types")),
    },
    {
      definition: {
        name: "appointments_get_type",
        description: "Get an appointment type by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Appointment type ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/appointment_types/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "appointments_create_type",
        description: "Create a new appointment type. Note: location_type is REQUIRED (API returns 422 without it). Integer value where 0 = 'customer'.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Type name (required)" },
            email_instructions: { type: "string", description: "Instructions sent in email" },
            location_type: { type: "number", description: "Location type (REQUIRED, integer, 0 = 'customer')" },
            location_hard_code: { type: "string", description: "Hardcoded location" },
          },
          required: ["name"],
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          name: requireString(args.name, "name"),
          email_instructions: optionalString(args.email_instructions),
          location_type: optionalNumber(args.location_type),
          location_hard_code: optionalString(args.location_hard_code),
        });
        return jsonResult(await client.post("/appointment_types", body));
      },
    },
    {
      definition: {
        name: "appointments_update_type",
        description: "Update an appointment type",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Appointment type ID" },
            name: { type: "string" }, email_instructions: { type: "string" },
            location_type: { type: "number" }, location_hard_code: { type: "string" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          name: optionalString(args.name), email_instructions: optionalString(args.email_instructions),
          location_type: optionalNumber(args.location_type), location_hard_code: optionalString(args.location_hard_code),
        });
        return jsonResult(await client.put(`/appointment_types/${id}`, body));
      },
    },
    {
      definition: {
        name: "appointments_delete_type",
        description: "DELETE an appointment type. The user MUST confirm.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Appointment type ID" },
            confirmed: { type: "boolean", description: "Must be true" },
          },
          required: ["id", "confirmed"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        if (args.confirmed !== true) return textResult(`⚠️ CONFIRMATION REQUIRED: Delete appointment type #${id}? Call again with confirmed: true.`);
        const result = await client.delete(`/appointment_types/${id}`);
        return result ? jsonResult(result) : textResult(`Appointment type #${id} deleted.`);
      },
    },
  ];

  return { name: "appointments", description: "Appointments and appointment types", getTools: () => tools };
}
