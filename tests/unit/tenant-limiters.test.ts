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

  it("also draws every call from one server-wide budget", async () => {
    const limiters = new TenantLimiters({ perTenantPerMinute: 100, serverPerMinute: 2 });
    await limiters.for("acme").acquire();
    await limiters.for("beta").acquire();
    const third = limiters.for("gamma").acquire();
    const outcome = await Promise.race([
      third.then(() => "acquired"),
      new Promise((r) => setTimeout(() => r("waiting"), 50)),
    ]);
    expect(outcome).toBe("waiting");
  });

  it("still holds a single busy tenant to its own budget", async () => {
    const limiters = new TenantLimiters({ perTenantPerMinute: 1, serverPerMinute: 100 });
    await limiters.for("acme").acquire();
    const outcome = await Promise.race([
      limiters.for("acme").acquire().then(() => "acquired"),
      new Promise((r) => setTimeout(() => r("waiting"), 50)),
    ]);
    expect(outcome).toBe("waiting");
    expect(
      await Promise.race([
        limiters.for("beta").acquire().then(() => "acquired"),
        new Promise((r) => setTimeout(() => r("waiting"), 50)),
      ])
    ).toBe("acquired");
  });

  it("caps how many tenants it tracks, dropping the least recently used", () => {
    const limiters = new TenantLimiters({ maxTenants: 2 });
    const acme = limiters.for("acme");
    limiters.for("beta");
    limiters.for("acme");
    limiters.for("gamma");
    expect(limiters.size).toBe(2);
    expect(limiters.for("acme")).toBe(acme);
  });
});
