import { describe, it, expect } from "vitest";
import { isRedirectAllowed, parseRedirectAllowlist } from "../../../src/auth/redirect-policy.js";

const rules = parseRedirectAllowlist(
  "https://claude.ai/api/mcp/auth_callback, http://localhost, http://127.0.0.1"
);

describe("redirect allowlist", () => {
  it.each([
    "https://claude.ai/api/mcp/auth_callback",
    "http://localhost:53122/callback",
    "http://localhost/cb",
    "http://127.0.0.1:9999/oauth/callback",
  ])("allows %s", (uri) => {
    expect(isRedirectAllowed(uri, rules)).toBe(true);
  });

  it.each([
    "https://claude.ai.evil.com/api/mcp/auth_callback",
    "https://evil.com/?https://claude.ai/api/mcp/auth_callback",
    "http://claude.ai/api/mcp/auth_callback",
    "https://claude.ai/other",
    "https://claude.ai/api/mcp/auth_callbackX",
    "https://user@claude.ai/api/mcp/auth_callback",
    "https://localhost/cb",
    "http://localhost.evil.com/cb",
    "not a url",
  ])("rejects %s", (uri) => {
    expect(isRedirectAllowed(uri, rules)).toBe(false);
  });

  it("matches an explicit port exactly", () => {
    const portRules = parseRedirectAllowlist("http://localhost:3000/cb");
    expect(isRedirectAllowed("http://localhost:3000/cb", portRules)).toBe(true);
    expect(isRedirectAllowed("http://localhost:3001/cb", portRules)).toBe(false);
  });

  it("rejects malformed or unsafe entries at startup", () => {
    expect(() => parseRedirectAllowlist("not-a-url")).toThrow();
    expect(() => parseRedirectAllowlist("javascript:alert(1)")).toThrow();
    expect(() => parseRedirectAllowlist(" , ")).toThrow();
  });
});
