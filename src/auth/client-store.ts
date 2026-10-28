import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  OAuthClientMetadataSchema,
  type OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { Sealer } from "./token-crypto.js";

const CLIENT_PURPOSE = "client";
const CLIENT_VERSION = 1;
export const MAX_CLIENT_METADATA_BYTES = 4096;
const MAX_CLIENT_ID_LENGTH = 8192;

const KEPT_FIELDS = [
  "redirect_uris",
  "client_name",
  "token_endpoint_auth_method",
  "grant_types",
  "response_types",
  "scope",
  "client_secret",
  "client_secret_expires_at",
  "client_id_issued_at",
] as const;

type KeptMetadata = Partial<Pick<OAuthClientInformationFull, (typeof KEPT_FIELDS)[number]>> & {
  redirect_uris: string[];
};

interface SealedClient {
  v: typeof CLIENT_VERSION;
  md: KeptMetadata;
}

function pickKeptFields(client: OAuthClientInformationFull): KeptMetadata {
  const entries = KEPT_FIELDS.filter((f) => client[f] !== undefined).map(
    (f) => [f, client[f]] as const
  );
  return Object.fromEntries(entries) as KeptMetadata;
}

function isSealedClient(value: unknown): value is SealedClient {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<SealedClient>;
  return v.v === CLIENT_VERSION && typeof v.md === "object" && v.md !== null;
}

/**
 * Dynamic client registration without a database: the client_id IS the
 * registered metadata, sealed with AES-GCM. Because it is authenticated,
 * redirect_uris read back from it can be trusted like a stored record.
 */
export class StatelessClientsStore implements OAuthRegisteredClientsStore {
  constructor(private readonly sealer: Sealer) {}

  async registerClient(client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    const md = pickKeptFields(client);
    if (!Array.isArray(md.redirect_uris) || md.redirect_uris.length === 0) {
      throw new InvalidClientMetadataError("At least one redirect_uri is required");
    }
    if (Buffer.byteLength(JSON.stringify(md), "utf8") > MAX_CLIENT_METADATA_BYTES) {
      throw new InvalidClientMetadataError("Client metadata is too large");
    }
    const sealed: SealedClient = { v: CLIENT_VERSION, md };
    return { ...md, client_id: this.sealer.seal(CLIENT_PURPOSE, sealed) };
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    if (typeof clientId !== "string" || clientId.length > MAX_CLIENT_ID_LENGTH) return undefined;
    const opened = this.sealer.unseal(CLIENT_PURPOSE, clientId);
    if (!isSealedClient(opened)) return undefined;
    const parsed = OAuthClientMetadataSchema.safeParse(opened.md);
    if (!parsed.success || parsed.data.redirect_uris.length === 0) return undefined;
    return { ...pickKeptFields(opened.md as OAuthClientInformationFull), client_id: clientId };
  }
}
