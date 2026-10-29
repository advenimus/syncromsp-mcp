import { describe, it, expect } from "vitest";
import { AttemptLimiter } from "../../../src/auth/login-limiter.js";

const WINDOW = 15 * 60 * 1000;

describe("AttemptLimiter", () => {
  it("allows up to max attempts per key inside the window", () => {
    const limiter = new AttemptLimiter({ max: 5, windowMs: WINDOW });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume("1.2.3.4", t0 + i)).toBe(true);
    }
    expect(limiter.tryConsume("1.2.3.4", t0 + 10)).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = new AttemptLimiter({ max: 1, windowMs: WINDOW });
    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("a", 1)).toBe(false);
    expect(limiter.tryConsume("b", 2)).toBe(true);
  });

  it("allows attempts again once old ones leave the window", () => {
    const limiter = new AttemptLimiter({ max: 2, windowMs: WINDOW });
    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("a", 1)).toBe(true);
    expect(limiter.tryConsume("a", 2)).toBe(false);
    expect(limiter.tryConsume("a", WINDOW + 1)).toBe(true);
  });

  it("sweep drops keys with no recent attempts", () => {
    const limiter = new AttemptLimiter({ max: 2, windowMs: WINDOW });
    limiter.tryConsume("a", 0);
    limiter.sweep(WINDOW + 5);
    expect(limiter.size).toBe(0);
  });

  it("caps the number of tracked keys", () => {
    const limiter = new AttemptLimiter({ max: 2, windowMs: WINDOW, maxKeys: 3 });
    ["a", "b", "c", "d", "e"].forEach((k, i) => limiter.tryConsume(k, i));
    expect(limiter.size).toBeLessThanOrEqual(3);
  });

  it("refund gives back exactly one attempt", () => {
    const limiter = new AttemptLimiter({ max: 2, windowMs: WINDOW });
    limiter.tryConsume("a", 1);
    limiter.tryConsume("a", 2);
    expect(limiter.tryConsume("a", 3)).toBe(false);
    limiter.refund("a", 2);
    expect(limiter.tryConsume("a", 4)).toBe(true);
    expect(limiter.tryConsume("a", 5)).toBe(false);
  });

  it("refund of an unknown attempt is a no-op", () => {
    const limiter = new AttemptLimiter({ max: 1, windowMs: WINDOW });
    limiter.tryConsume("a", 1);
    limiter.refund("a", 99);
    limiter.refund("b", 1);
    expect(limiter.tryConsume("a", 2)).toBe(false);
  });
});
