import { describe, it, expect } from "vitest";
import { TenantLimiters } from "../../src/utils/tenant-limiters.js";

describe("TenantLimiters", () => {
  it("hands every client of one tenant the same limiter", () => {
    const limiters = new TenantLimiters();
    expect(limiters.for("acme")).toBe(limiters.for("acme"));
  });

  it("gives each tenant its own limiter so one busy tenant can't starve another", () => {
    const limiters = new TenantLimiters();
    expect(limiters.for("acme")).not.toBe(limiters.for("beta"));
    expect(limiters.size).toBe(2);
  });
});
