import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_VERSION = "v1";
const PREFIX = `${FORMAT_VERSION}.`;
const MAX_SEALED_LENGTH = 16 * 1024;
const MIN_DISTINCT_KEY_BYTES = 16;
const HKDF_SALT = Buffer.from("syncromsp-mcp/hkdf-salt/v1");
const GENERATE_HINT = "Generate one with: openssl rand -hex 32";

export type SealerDomain = "token" | "client";

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

export interface Sealer {
  seal(purpose: string, payload: unknown): string;
  unseal(purpose: string, sealed: string): unknown | undefined;
}

const HEX_RE = /^[0-9a-fA-F]+$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function decodeKey(value: string): Buffer | undefined {
  if (value.length === KEY_BYTES * 2 && HEX_RE.test(value)) {
    return Buffer.from(value, "hex");
  }
  if (BASE64_RE.test(value)) return Buffer.from(value, "base64");
  if (BASE64URL_RE.test(value)) return Buffer.from(value, "base64url");
  return undefined;
}

/**
 * Parses a 32-byte key given as 64 hex chars or base64/base64url.
 * Error messages name the variable but never echo its value.
 */
export function parseEncryptionKey(raw: string | undefined, name: string): Buffer {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    throw new EncryptionKeyError(`${name} is required. ${GENERATE_HINT}`);
  }
  const key = decodeKey(value);
  if (!key || key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(
      `${name} must be exactly ${KEY_BYTES} random bytes, written as 64 hex characters or base64. ${GENERATE_HINT}`
    );
  }
  if (new Set(key).size < MIN_DISTINCT_KEY_BYTES) {
    throw new EncryptionKeyError(
      `${name} has too little entropy (it looks like a pattern, not random bytes). ${GENERATE_HINT}`
    );
  }
  return key;
}

function deriveSubkey(master: Buffer, domain: SealerDomain): Buffer {
  return Buffer.from(
    hkdfSync("sha256", master, HKDF_SALT, `syncromsp-mcp/${domain}/${FORMAT_VERSION}`, KEY_BYTES)
  );
}

function aadFor(domain: SealerDomain, purpose: string): Buffer {
  return Buffer.from(`syncromsp-mcp|${FORMAT_VERSION}|${domain}|${purpose}`);
}

function sealWith(key: Buffer, aad: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, ciphertext, tag]).toString("base64url");
}

function openWith(key: Buffer, aad: Buffer, raw: Buffer): Buffer | undefined {
  try {
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return undefined;
  }
}

function decodeSealed(sealed: string): Buffer | undefined {
  if (typeof sealed !== "string" || sealed.length > MAX_SEALED_LENGTH) return undefined;
  if (!sealed.startsWith(PREFIX)) return undefined;
  const body = sealed.slice(PREFIX.length);
  if (!BASE64URL_RE.test(body)) return undefined;
  const raw = Buffer.from(body, "base64url");
  return raw.length > IV_BYTES + TAG_BYTES ? raw : undefined;
}

/**
 * AES-256-GCM sealing with per-domain HKDF subkeys. The first master key
 * seals; every key (current first, then previous ones) may unseal, which is
 * what makes decrypt-only key rotation work.
 */
export function createSealer(domain: SealerDomain, masterKeys: readonly Buffer[]): Sealer {
  if (masterKeys.length === 0) throw new Error("createSealer needs at least one key");
  const subkeys = masterKeys.map((k) => deriveSubkey(k, domain));
  const sealingKey = subkeys[0]!;

  return {
    seal(purpose, payload) {
      const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
      return sealWith(sealingKey, aadFor(domain, purpose), plaintext);
    },
    unseal(purpose, sealed) {
      const raw = decodeSealed(sealed);
      if (!raw) return undefined;
      const aad = aadFor(domain, purpose);
      for (const key of subkeys) {
        const plaintext = openWith(key, aad, raw);
        if (plaintext) {
          try {
            return JSON.parse(plaintext.toString("utf8")) as unknown;
          } catch {
            return undefined;
          }
        }
      }
      return undefined;
    },
  };
}
