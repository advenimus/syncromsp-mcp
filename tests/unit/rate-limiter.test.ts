import { describe, it, expect } from "vitest";
import { RateLimiter } from "../../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  it("should allow requests within the limit", async () => {
    const limiter = new RateLimiter(10);
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }
  });

  it("should queue requests when limit is exceeded", async () => {
    // Use a high rate (6000/min = 100/sec) so refill is fast
    const limiter = new RateLimiter(6000, 5000);
    // Use up all tokens
    for (let i = 0; i < 6000; i++) {
      await limiter.acquire();
    }

    // Next request should be queued but resolve quickly due to fast refill
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1000);
  });

  it("should reject after timeout", async () => {
    const limiter = new RateLimiter(1, 100);
    await limiter.acquire();

    // Queue many requests to exhaust refill
    const promises = Array.from({ length: 200 }, () =>
      limiter.acquire().catch((e: Error) => e.message)
    );

    const results = await Promise.all(promises);
    const timeouts = results.filter(
      (r) => typeof r === "string" && r.includes("timeout")
    );
    expect(timeouts.length).toBeGreaterThan(0);
  });
});
