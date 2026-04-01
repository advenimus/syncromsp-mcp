import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const DOMAIN_NAMES = [
  "tickets",
  "customers",
  "assets",
  "contacts",
  "invoices",
  "estimates",
  "appointments",
  "products",
  "payments",
  "leads",
  "contracts",
  "rmm",
  "scheduling",
  "time",
  "admin",
] as const;

export type DomainName = (typeof DOMAIN_NAMES)[number];

export const DOMAIN_DESCRIPTIONS: Record<DomainName, string> = {
  tickets: "Service tickets, comments, line items, timers, attachments",
  customers: "Customer records, phones, autocomplete",
  assets: "Customer assets, patches, chat info",
  contacts: "Customer contacts",
  invoices: "Invoices, line items, print/email",
  estimates: "Estimates, line items, print/email, convert to invoice",
  appointments: "Appointments and appointment types",
  products: "Products, serials, SKUs, categories, images, inventory",
  payments: "Payments, payment methods, payment profiles",
  leads: "Leads and opportunities",
  contracts: "Service contracts and SLAs",
  rmm: "RMM alerts",
  scheduling: "Recurring invoice schedules and line items",
  time: "Ticket timers and employee time logs",
  admin:
    "Search, users, vendors, wiki, portal users, canned responses, settings, worksheets, devices, ticket forms",
};

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<ToolResult>;
}

export interface DomainTool {
  definition: Tool;
  handler: ToolHandler;
}

export interface DomainHandler {
  readonly name: DomainName;
  readonly description: string;
  getTools(): DomainTool[];
}

export interface SyncroApiConfig {
  readonly apiKey: string;
  readonly subdomain: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    total_entries?: number;
    total_pages?: number;
    page?: number;
    per_page?: number;
  };
}

export interface SyncroErrorResponse {
  error?: string;
  errors?: string[] | string | Record<string, string[]>;
  message?: string;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
