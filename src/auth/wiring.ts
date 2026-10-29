import type { Express, RequestHandler } from "express";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createAuthCallbackHandler, type McpOAuthProvider } from "./provider.js";

export interface OAuthWiring {
  authMiddleware: RequestHandler;
  installRoutes: (app: Express) => void;
}

export function createOAuthWiring(provider: McpOAuthProvider, serverUrl: URL): OAuthWiring {
  const installRoutes = (app: Express) => {
    // OAuth routes: /.well-known/*, /authorize, /token, /register, /revoke
    app.use(mcpAuthRouter({ provider, issuerUrl: serverUrl, scopesSupported: ["mcp:tools"] }));
    app.post("/authorize/callback", createAuthCallbackHandler(provider));
  };

  const authMiddleware = requireBearerAuth({
    verifier: provider,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(serverUrl),
  });

  return { authMiddleware, installRoutes };
}
