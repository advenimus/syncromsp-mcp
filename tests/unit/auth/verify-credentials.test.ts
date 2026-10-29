import { afterEach, describe, it, expect, vi } from "vitest";
import { verifySyncroCredentials } from "../../../src/auth/verify-credentials.js";

const CREDS = { subdomain: "acme", apiKey: "T1234567890abcdef" };

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input, init) => impl(String(input), init ?? {}));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifySyncroCredentials", () => {
  it("returns true on a 200 from the me endpoint", async () => {
    const spy = mockFetch(async () => new Response("{}", { status: 200 }));
    await expect(verifySyncroCredentials(CREDS)).resolves.toBe(true);

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe("https://acme.syncromsp.com/api/v1/me");
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${CREDS.apiKey}`
    );
    expect(init!.redirect).toBe("manual");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });

  it("never puts the key in the URL", async () => {
    const spy = mockFetch(async () => new Response("{}", { status: 200 }));
    await verifySyncroCredentials(CREDS);
    expect(String(spy.mock.calls[0]![0])).not.toContain(CREDS.apiKey);
  });

  it.each([401, 403, 404, 429, 500, 302])("returns false on HTTP %d", async (status) => {
    mockFetch(async () => new Response(null, { status }));
    await expect(verifySyncroCredentials(CREDS)).resolves.toBe(false);
  });

  it("returns false on a network error", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(verifySyncroCredentials(CREDS)).resolves.toBe(false);
  });

  it("returns false when Syncro does not answer in time", async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "TimeoutError"))
          );
        })
    );
    await expect(verifySyncroCredentials(CREDS, { timeoutMs: 20 })).resolves.toBe(false);
  });

  it("refuses to call out for an invalid subdomain", async () => {
    const spy = mockFetch(async () => new Response("{}", { status: 200 }));
    await expect(
      verifySyncroCredentials({ subdomain: "evil.com/", apiKey: "k" })
    ).resolves.toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["whitespace inside", "abc def"],
    ["newline (header injection)", "abc\r\nX-Evil: 1"],
    ["oversized", "a".repeat(513)],
  ])("refuses to call out for a %s API key", async (_label, apiKey) => {
    const spy = mockFetch(async () => new Response("{}", { status: 200 }));
    await expect(verifySyncroCredentials({ subdomain: "acme", apiKey })).resolves.toBe(
      false
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
