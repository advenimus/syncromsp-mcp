import { describe, it, expect } from "vitest";
import { downloadFile, isBlockedAddress } from "../../src/utils/safe-download.js";

const TEN_MB = 10 * 1024 * 1024;

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "fe80::1", "fd00::5", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
  ])("should block %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "140.82.112.3", "2606:4700:4700::1111"])("should allow public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it("should block anything that is not an IP address", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});

describe("downloadFile", () => {
  it("should reject a URL that does not parse", async () => {
    await expect(downloadFile("not a url", TEN_MB)).rejects.toThrow("not a valid URL");
  });

  it("should reject plain http links", async () => {
    await expect(downloadFile("http://example.com/a.pdf", TEN_MB)).rejects.toThrow("https://");
  });

  it.each(["https://127.0.0.1/a.pdf", "https://[::1]/a.pdf", "https://169.254.169.254/latest/meta-data"])(
    "should refuse private IP link %s before connecting",
    async (url) => {
      await expect(downloadFile(url, TEN_MB)).rejects.toThrow("private or local address");
    }
  );

  it("should refuse a hostname that resolves to a local address", async () => {
    await expect(downloadFile("https://localhost/a.pdf", TEN_MB)).rejects.toThrow("private or local address");
  });
});
