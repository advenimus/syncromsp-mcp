import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SyncroApiClient, SyncroApiError } from "./api-client.js";
import { loadDomain } from "./domains/index.js";
import {
  getSession,
  navigateTo,
  navigateBack,
  setSession,
  getDefaultSessionId,
} from "./session.js";
import {
  DOMAIN_NAMES,
  DOMAIN_DESCRIPTIONS,
  type DomainName,
  type DomainTool,
  type ToolResult,
  textResult,
  errorResult,
} from "./types.js";

export function createServer(client: SyncroApiClient): Server {
  const server = new Server(
    { name: "syncromsp-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  const navigationTools: Tool[] = [
    {
      name: "syncro_navigate",
      description:
        "Navigate to a SyncroMSP domain to access its tools. Available domains: " +
        DOMAIN_NAMES.map((d) => `${d} (${DOMAIN_DESCRIPTIONS[d]})`).join(", "),
      inputSchema: {
        type: "object" as const,
        properties: {
          domain: {
            type: "string",
            enum: [...DOMAIN_NAMES],
            description: "The domain to navigate to",
          },
        },
        required: ["domain"],
      },
    },
    {
      name: "syncro_status",
      description:
        "Show current navigation state and available SyncroMSP domains",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "syncro_back",
      description: "Return to the root domain list from the current domain",
      inputSchema: { type: "object" as const, properties: {} },
    },
  ];

  // Cache for domain tools keyed by domain name
  const domainToolsCache = new Map<DomainName, DomainTool[]>();

  async function getDomainTools(domain: DomainName): Promise<DomainTool[]> {
    const cached = domainToolsCache.get(domain);
    if (cached) return cached;

    const handler = await loadDomain(domain, client);
    const tools = handler.getTools();
    domainToolsCache.set(domain, tools);
    return tools;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const sessionId = getDefaultSessionId();
    const session = getSession(sessionId);

    if (!session.currentDomain) {
      return { tools: navigationTools };
    }

    const domainTools = await getDomainTools(session.currentDomain);
    const backTool = navigationTools.find((t) => t.name === "syncro_back")!;

    return {
      tools: [...domainTools.map((t) => t.definition), backTool],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = request.params;
    const sessionId = getDefaultSessionId();

    try {
      // Handle navigation tools
      if (name === "syncro_navigate") {
        const domain = args.domain as string;
        if (!DOMAIN_NAMES.includes(domain as DomainName)) {
          return errorResult(
            `Unknown domain: ${domain}. Available: ${DOMAIN_NAMES.join(", ")}`
          );
        }
        const newState = navigateTo(sessionId, domain as DomainName);
        setSession(sessionId, newState);

        // Pre-load domain tools
        const tools = await getDomainTools(domain as DomainName);

        await server.notification({
          method: "notifications/tools/list_changed",
        });

        return textResult(
          `Navigated to ${domain} domain. Available tools:\n` +
            tools.map((t) => `  - ${t.definition.name}: ${t.definition.description}`).join("\n")
        );
      }

      if (name === "syncro_status") {
        const session = getSession(sessionId);
        if (session.currentDomain) {
          const tools = await getDomainTools(session.currentDomain);
          return textResult(
            `Current domain: ${session.currentDomain}\n\nAvailable tools:\n` +
              tools.map((t) => `  - ${t.definition.name}: ${t.definition.description}`).join("\n") +
              `\n\nUse syncro_back to return to domain list.`
          );
        }
        return textResult(
          "Not in any domain. Available domains:\n" +
            DOMAIN_NAMES.map((d) => `  - ${d}: ${DOMAIN_DESCRIPTIONS[d]}`).join("\n") +
            "\n\nUse syncro_navigate to enter a domain."
        );
      }

      if (name === "syncro_back") {
        const session = getSession(sessionId);
        if (!session.currentDomain) {
          return textResult("Already at root. Use syncro_navigate to enter a domain.");
        }
        const prev = session.currentDomain;
        const newState = navigateBack(sessionId);
        setSession(sessionId, newState);

        await server.notification({
          method: "notifications/tools/list_changed",
        });

        return textResult(
          `Left ${prev} domain. Available domains:\n` +
            DOMAIN_NAMES.map((d) => `  - ${d}: ${DOMAIN_DESCRIPTIONS[d]}`).join("\n")
        );
      }

      // Handle domain tools
      const session = getSession(sessionId);
      if (!session.currentDomain) {
        return errorResult(
          `Unknown tool: ${name}. Use syncro_navigate to enter a domain first.`
        );
      }

      const domainTools = await getDomainTools(session.currentDomain);
      const tool = domainTools.find((t) => t.definition.name === name);
      if (!tool) {
        return errorResult(
          `Unknown tool: ${name} in domain ${session.currentDomain}. ` +
            `Available: ${domainTools.map((t) => t.definition.name).join(", ")}`
        );
      }

      const result = await tool.handler(args as Record<string, unknown>);
      return result;
    } catch (error) {
      if (error instanceof SyncroApiError) {
        return errorResult(error.message);
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  });

  return server;
}
