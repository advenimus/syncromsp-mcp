import { RateLimiter } from "./rate-limiter.js";

/**
 * One outbound rate budget per Syncro tenant, shared by every user and
 * session of that tenant, so a busy tenant can't starve the others.
 */
export class TenantLimiters {
  private readonly limiters = new Map<string, RateLimiter>();

  for(subdomain: string): RateLimiter {
    const existing = this.limiters.get(subdomain);
    if (existing) return existing;
    const limiter = new RateLimiter();
    this.limiters.set(subdomain, limiter);
    return limiter;
  }

  get size(): number {
    return this.limiters.size;
  }
}
