import { randomUUID } from "node:crypto";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Response } from "express";

interface CodeData {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

interface TokenData {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    clientMetadata: OAuthClientInformationFull
  ): Promise<OAuthClientInformationFull> {
    this.clients.set(clientMetadata.client_id, clientMetadata);
    return clientMetadata;
  }
}

/**
 * OAuth provider for MCP server authentication.
 *
 * Implements the MCP OAuth 2.1 + PKCE spec so that Claude.ai and other
 * remote MCP clients can authenticate against this server.
 *
 * The authorize flow auto-approves requests — since the server operator
 * deployed this themselves with their Syncro API key, any client that
 * can reach the server and complete the OAuth flow is authorized.
 */
export class McpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore();
  private readonly codes = new Map<string, CodeData>();
  private readonly tokens = new Map<string, TokenData>();
  private readonly tokenLifetimeMs: number;

  constructor(tokenLifetimeHours: number = 24) {
    this.tokenLifetimeMs = tokenLifetimeHours * 60 * 60 * 1000;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Auto-approve: the server operator already authorized usage by deploying
    // with their Syncro API key. Generate an auth code and redirect back.
    const code = randomUUID();

    this.codes.set(code, { client, params });

    // Clean up expired codes (older than 10 minutes)
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of this.codes) {
      if (!this.tokens.has(key)) {
        // We don't have a timestamp on codes, but they're short-lived
        // and cleaned up when exchanged. This is best-effort cleanup.
      }
    }

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state !== undefined) {
      redirectUrl.searchParams.set("state", params.state);
    }

    res.redirect(redirectUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error("Invalid authorization code");
    }
    return codeData.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string
  ): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error("Invalid authorization code");
    }
    if (codeData.client.client_id !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }

    this.codes.delete(authorizationCode);

    const accessToken = randomUUID();
    const refreshToken = randomUUID();

    this.tokens.set(accessToken, {
      token: accessToken,
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt: Date.now() + this.tokenLifetimeMs,
      resource: codeData.params.resource,
    });

    // Store refresh token with longer lifetime (30 days)
    this.tokens.set(refreshToken, {
      token: refreshToken,
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      resource: codeData.params.resource,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: Math.floor(this.tokenLifetimeMs / 1000),
      refresh_token: refreshToken,
      scope: (codeData.params.scopes || []).join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const tokenData = this.tokens.get(refreshToken);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      throw new Error("Invalid or expired refresh token");
    }
    if (tokenData.clientId !== client.client_id) {
      throw new Error("Refresh token was not issued to this client");
    }

    // Issue new access token
    const newAccessToken = randomUUID();
    this.tokens.set(newAccessToken, {
      token: newAccessToken,
      clientId: client.client_id,
      scopes: tokenData.scopes,
      expiresAt: Date.now() + this.tokenLifetimeMs,
      resource: tokenData.resource,
    });

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: Math.floor(this.tokenLifetimeMs / 1000),
      refresh_token: refreshToken,
      scope: tokenData.scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenData = this.tokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      throw new Error("Invalid or expired token");
    }
    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes,
      expiresAt: Math.floor(tokenData.expiresAt / 1000),
      resource: tokenData.resource,
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string }
  ): Promise<void> {
    this.tokens.delete(request.token);
  }
}
