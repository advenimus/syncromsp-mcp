import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  EncryptionKeyError,
  createSealer,
  parseEncryptionKey,
} from "../../../src/auth/token-crypto.js";

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);

function flipByte(sealed: string, index: number): string {
  const [prefix, body] = sealed.split(".");
  const raw = Buffer.from(body!, "base64url");
  const i = index < 0 ? raw.length + index : index;
  raw[i] = raw[i]! ^ 0x01;
  return `${prefix}.${raw.toString("base64url")}`;
}

describe("parseEncryptionKey", () => {
  it("accepts 64 hex characters", () => {
    const hex = randomBytes(32).toString("hex");
    expect(parseEncryptionKey(hex, "K").equals(Buffer.from(hex, "hex"))).toBe(true);
  });

  it("accepts base64 and base64url encodings of 32 bytes", () => {
    const raw = randomBytes(32);
    expect(parseEncryptionKey(raw.toString("base64"), "K").equals(raw)).toBe(true);
    expect(parseEncryptionKey(raw.toString("base64url"), "K").equals(raw)).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const hex = randomBytes(32).toString("hex");
    expect(parseEncryptionKey(`  ${hex}\n`, "K").length).toBe(32);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["too short hex", "ab".repeat(16)],
    ["too long hex", "ab".repeat(33)],
    ["a passphrase", "correct horse battery staple"],
    ["base64 of 16 bytes", randomBytes(16).toString("base64")],
  ])("rejects %s with an openssl hint", (_label, value) => {
    expect(() => parseEncryptionKey(value, "MCP_TOKEN_ENCRYPTION_KEY")).toThrow(
      EncryptionKeyError
    );
    expect(() => parseEncryptionKey(value, "MCP_TOKEN_ENCRYPTION_KEY")).toThrow(
      /openssl rand -hex 32/
    );
  });

  it("rejects low-entropy keys like all zeros or a short repeating pattern", () => {
    expect(() => parseEncryptionKey("0".repeat(64), "K")).toThrow(/entropy/i);
    expect(() => parseEncryptionKey("0123456789abcdef".repeat(4), "K")).toThrow(
      /entropy/i
    );
  });

  it("names the variable in the error", () => {
    expect(() => parseEncryptionKey("nope", "MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS")).toThrow(
      /MCP_TOKEN_ENCRYPTION_KEY_PREVIOUS/
    );
  });
});

describe("createSealer", () => {
  const payload = { hello: "world", n: 42 };

  it("round-trips a payload", () => {
    const sealer = createSealer("token", [KEY_A]);
    const sealed = sealer.seal("access", payload);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealer.unseal("access", sealed)).toEqual(payload);
  });

  it("does not expose the plaintext", () => {
    const sealer = createSealer("token", [KEY_A]);
    const sealed = sealer.seal("access", { key: "super-secret-api-key" });
    expect(sealed).not.toContain("super-secret");
    expect(Buffer.from(sealed.slice(3), "base64url").toString("latin1")).not.toContain(
      "super-secret"
    );
  });

  it("uses a fresh IV every time", () => {
    const sealer = createSealer("token", [KEY_A]);
    const a = sealer.seal("access", payload);
    const b = sealer.seal("access", payload);
    expect(a).not.toBe(b);
    const ivA = Buffer.from(a.slice(3), "base64url").subarray(0, 12);
    const ivB = Buffer.from(b.slice(3), "base64url").subarray(0, 12);
    expect(ivA.equals(ivB)).toBe(false);
  });

  it("rejects a tampered IV", () => {
    const sealer = createSealer("token", [KEY_A]);
    const sealed = sealer.seal("access", payload);
    expect(sealer.unseal("access", flipByte(sealed, 0))).toBeUndefined();
  });

  it("rejects tampered ciphertext", () => {
    const sealer = createSealer("token", [KEY_A]);
    const sealed = sealer.seal("access", payload);
    expect(sealer.unseal("access", flipByte(sealed, 14))).toBeUndefined();
  });

  it("rejects a tampered auth tag", () => {
    const sealer = createSealer("token", [KEY_A]);
    const sealed = sealer.seal("access", payload);
    expect(sealer.unseal("access", flipByte(sealed, -1))).toBeUndefined();
  });

  it("rejects a token sealed for a different purpose (AAD binding)", () => {
    const sealer = createSealer("token", [KEY_A]);
    const sealed = sealer.seal("refresh", payload);
    expect(sealer.unseal("access", sealed)).toBeUndefined();
  });

  it("rejects a blob sealed in a different domain (separate HKDF subkeys)", () => {
    const tokens = createSealer("token", [KEY_A]);
    const clients = createSealer("client", [KEY_A]);
    const sealed = clients.seal("access", payload);
    expect(tokens.unseal("access", sealed)).toBeUndefined();
  });

  it("rejects an unknown version prefix", () => {
    const sealer = createSealer("token", [KEY_A]);
    const sealed = sealer.seal("access", payload);
    expect(sealer.unseal("access", sealed.replace(/^v1\./, "v2."))).toBeUndefined();
    expect(sealer.unseal("access", sealed.slice(3))).toBeUndefined();
  });

  it.each([
    ["empty", ""],
    ["garbage", "v1.!!!not-base64!!!"],
    ["too short", "v1.AAAA"],
    ["oversized", `v1.${"A".repeat(20000)}`],
  ])("rejects %s input without throwing", (_label, value) => {
    const sealer = createSealer("token", [KEY_A]);
    expect(sealer.unseal("access", value)).toBeUndefined();
  });

  it("rejects a token sealed with an unrelated key", () => {
    const sealed = createSealer("token", [KEY_A]).seal("access", payload);
    expect(createSealer("token", [KEY_B]).unseal("access", sealed)).toBeUndefined();
  });

  it("decrypts with a previous key but seals with the current key", () => {
    const oldSealer = createSealer("token", [KEY_A]);
    const rotated = createSealer("token", [KEY_B, KEY_A]);
    const legacy = oldSealer.seal("access", payload);

    expect(rotated.unseal("access", legacy)).toEqual(payload);

    const fresh = rotated.seal("access", payload);
    expect(createSealer("token", [KEY_B]).unseal("access", fresh)).toEqual(payload);
    expect(oldSealer.unseal("access", fresh)).toBeUndefined();
  });

  it("requires at least one key", () => {
    expect(() => createSealer("token", [])).toThrow();
  });
});
