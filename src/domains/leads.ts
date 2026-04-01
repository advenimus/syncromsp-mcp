import type { SyncroApiClient } from "../api-client.js";
import type { DomainHandler, DomainTool } from "../types.js";
import { jsonResult } from "../types.js";
import { requireId, optionalString, optionalNumber, optionalBoolean, optionalId, pickDefined } from "../utils/validators.js";

export function createDomain(client: SyncroApiClient): DomainHandler {
  const tools: DomainTool[] = [
    {
      definition: {
        name: "leads_list",
        description: "List leads/opportunities",
        inputSchema: {
          type: "object" as const,
          properties: { page: { type: "number", description: "Page number" } },
        },
      },
      handler: async (args) => {
        const params = pickDefined({ page: optionalNumber(args.page) });
        return jsonResult(await client.get("/leads", params as Record<string, string | number | boolean>));
      },
    },
    {
      definition: {
        name: "leads_get",
        description: "Get a lead by ID",
        inputSchema: {
          type: "object" as const,
          properties: { id: { type: "number", description: "Lead ID" } },
          required: ["id"],
        },
      },
      handler: async (args) => jsonResult(await client.get(`/leads/${requireId(args.id)}`)),
    },
    {
      definition: {
        name: "leads_create",
        description: "Create a new lead. Note: leads have no DELETE endpoint. To soft-delete, use leads_update with disabled=true.",
        inputSchema: {
          type: "object" as const,
          properties: {
            first_name: { type: "string", description: "First name" },
            last_name: { type: "string", description: "Last name" },
            business_name: { type: "string", description: "Business name" },
            email: { type: "string", description: "Email" },
            phone: { type: "string", description: "Phone" },
            mobile: { type: "string", description: "Mobile" },
            address: { type: "string", description: "Address" },
            city: { type: "string", description: "City" },
            state: { type: "string", description: "State" },
            zip: { type: "string", description: "ZIP" },
            status: { type: "string", description: "Status" },
            ticket_subject: { type: "string", description: "Ticket subject" },
            ticket_description: { type: "string", description: "Ticket description" },
            ticket_problem_type: { type: "string", description: "Problem type" },
            hidden_notes: { type: "string", description: "Hidden notes" },
            user_id: { type: "number", description: "Assigned user ID" },
            customer_id: { type: "number", description: "Existing customer ID" },
            contact_id: { type: "number", description: "Contact ID" },
            location_id: { type: "number", description: "Location ID" },
            opportunity_amount_dollars: { type: "number", description: "Opportunity amount in dollars" },
            likelihood: { type: "number", description: "Likelihood (0-100)" },
            opportunity_start_date: { type: "string", description: "Opportunity start date" },
            appointment_time: { type: "string", description: "Appointment time" },
            appointment_type_id: { type: "number", description: "Appointment type ID" },
            properties: { type: "object", description: "Custom field values" },
            ticket_properties: { type: "object", description: "Ticket custom field values" },
          },
        },
      },
      handler: async (args) => {
        const body = pickDefined({
          first_name: optionalString(args.first_name), last_name: optionalString(args.last_name),
          business_name: optionalString(args.business_name), email: optionalString(args.email),
          phone: optionalString(args.phone), mobile: optionalString(args.mobile),
          address: optionalString(args.address), city: optionalString(args.city),
          state: optionalString(args.state), zip: optionalString(args.zip),
          status: optionalString(args.status),
          ticket_subject: optionalString(args.ticket_subject),
          ticket_description: optionalString(args.ticket_description),
          ticket_problem_type: optionalString(args.ticket_problem_type),
          hidden_notes: optionalString(args.hidden_notes),
          user_id: optionalId(args.user_id), customer_id: optionalId(args.customer_id),
          contact_id: optionalId(args.contact_id), location_id: optionalId(args.location_id),
          opportunity_amount_dollars: optionalNumber(args.opportunity_amount_dollars),
          likelihood: optionalNumber(args.likelihood),
          opportunity_start_date: optionalString(args.opportunity_start_date),
          appointment_time: optionalString(args.appointment_time),
          appointment_type_id: optionalId(args.appointment_type_id),
          properties: args.properties, ticket_properties: args.ticket_properties,
        });
        return jsonResult(await client.post("/leads", body));
      },
    },
    {
      definition: {
        name: "leads_update",
        description: "Update an existing lead",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "number", description: "Lead ID (required)" },
            first_name: { type: "string" }, last_name: { type: "string" },
            business_name: { type: "string" }, email: { type: "string" },
            phone: { type: "string" }, mobile: { type: "string" },
            address: { type: "string" }, city: { type: "string" },
            state: { type: "string" }, zip: { type: "string" },
            status: { type: "string" }, converted: { type: "boolean" },
            disabled: { type: "boolean" },
            hidden_notes: { type: "string" }, user_id: { type: "number" },
            opportunity_amount_dollars: { type: "number" },
            likelihood: { type: "number" },
            properties: { type: "object" },
          },
          required: ["id"],
        },
      },
      handler: async (args) => {
        const id = requireId(args.id);
        const body = pickDefined({
          first_name: optionalString(args.first_name), last_name: optionalString(args.last_name),
          business_name: optionalString(args.business_name), email: optionalString(args.email),
          phone: optionalString(args.phone), mobile: optionalString(args.mobile),
          address: optionalString(args.address), city: optionalString(args.city),
          state: optionalString(args.state), zip: optionalString(args.zip),
          status: optionalString(args.status), converted: optionalBoolean(args.converted),
          disabled: optionalBoolean(args.disabled),
          hidden_notes: optionalString(args.hidden_notes), user_id: optionalId(args.user_id),
          opportunity_amount_dollars: optionalNumber(args.opportunity_amount_dollars),
          likelihood: optionalNumber(args.likelihood),
          properties: args.properties,
        });
        return jsonResult(await client.put(`/leads/${id}`, body));
      },
    },
  ];

  return { name: "leads", description: "Leads and opportunities (no DELETE endpoint -- use disabled=true via update to soft-delete)", getTools: () => tools };
}
