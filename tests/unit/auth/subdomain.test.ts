import { describe, it, expect } from "vitest";
import {
  isSubdomainAllowed,
  isValidSubdomain,
  syncroBaseUrl,
  type SubdomainPolicy,
} from "../../../src/auth/subdomain.js";

describe("isValidSubdomain", () => {
  it.each(["acme", "a", "my-company", "abc123", "0x", "a".repeat(63)])(
    "accepts %s",
    (value) => {
      expect(isValidSubdomain(value)).toBe(true);
    }
  );

  it.each([
    ["empty", ""],
    ["path injection", "evil.com/"],
    ["dotted host", "a.b"],
    ["leading hyphen", "-x"],
    ["trailing hyphen", "x-"],
    ["uppercase", "Acme"],
    ["unicode", "ãcme"],
    ["punycode-looking unicode", "xn--ëvil"],
    ["userinfo", "user@evil.com"],
    ["at sign", "@"],
    ["port", "acme:443"],
    ["query", "acme?x=1"],
    ["fragment", "acme#x"],
    ["whitespace", "ac me"],
    ["leading whitespace", " acme"],
    ["newline", "acme\n"],
    ["backslash", "acme\\evil"],
    ["encoded slash", "acme%2f"],
    ["too long", "a".repeat(64)],
    ["underscore", "a_b"],
  ])("rejects %s", (_label, value) => {
    expect(isValidSubdomain(value)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidSubdomain(undefined)).toBe(false);
    expect(isValidSubdomain(42)).toBe(false);
    expect(isValidSubdomain(["acme"])).toBe(false);
  });
});

describe("syncroBaseUrl", () => {
  it("always targets *.syncromsp.com over https", () => {
    expect(syncroBaseUrl("acme")).toBe("https://acme.syncromsp.com");
  });

  it("throws on an invalid subdomain instead of building a URL", () => {
    expect(() => syncroBaseUrl("evil.com/")).toThrow();
    expect(() => syncroBaseUrl("a.b")).toThrow();
  });
});

describe("isSubdomainAllowed", () => {
  const locked: SubdomainPolicy = { kind: "locked", subdomain: "acme" };
  const allowlist: SubdomainPolicy = {
    kind: "allowlist",
    subdomains: new Set(["acme", "beta"]),
  };
  const any: SubdomainPolicy = { kind: "any" };

  it("locked policy only allows the locked subdomain", () => {
    expect(isSubdomainAllowed(locked, "acme")).toBe(true);
    expect(isSubdomainAllowed(locked, "beta")).toBe(false);
  });

  it("allowlist policy only allows listed subdomains", () => {
    expect(isSubdomainAllowed(allowlist, "acme")).toBe(true);
    expect(isSubdomainAllowed(allowlist, "beta")).toBe(true);
    expect(isSubdomainAllowed(allowlist, "gamma")).toBe(false);
  });

  it("any policy allows every valid subdomain", () => {
    expect(isSubdomainAllowed(any, "whatever")).toBe(true);
  });

  it("never allows an invalid subdomain, whatever the policy", () => {
    expect(isSubdomainAllowed(any, "evil.com/")).toBe(false);
    expect(
      isSubdomainAllowed({ kind: "allowlist", subdomains: new Set(["a.b"]) }, "a.b")
    ).toBe(false);
  });
});
