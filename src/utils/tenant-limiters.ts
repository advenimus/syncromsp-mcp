import { RateLimiter, type Limiter } from "./rate-limiter.js";

export const SYNCRO_LIMIT_PER_MINUTE = 180;
const DEFAULT_MAX_TENANTS = 10_000;

export interface TenantLimiterOptions {
  perTenantPerMinute?: number;
  serverPerMinute?: number;
  maxTenants?: number;
}

// Syncro documents its limit per IP, and every tenant shares this server's
// IP, so each call takes a token from its tenant's bucket and the server's.
export class TenantLimiters {
  private readonly tenants = new Map<string, Limiter>();
  private readonly server: RateLimiter;
  private readonly perTenantPerMinute: number;
  private readonly maxTenants: number;

  constructor(options: TenantLimiterOptions = {}) {
    this.perTenantPerMinute = options.perTenantPerMinute ?? SYNCRO_LIMIT_PER_MINUTE;
    this.server = new RateLimiter(options.serverPerMinute ?? SYNCRO_LIMIT_PER_MINUTE);
    this.maxTenants = options.maxTenants ?? DEFAULT_MAX_TENANTS;
  }

  for(subdomain: string): Limiter {
    const existing = this.tenants.get(subdomain);
    if (existing) {
      this.tenants.delete(subdomain);
      this.tenants.set(subdomain, existing);
      return existing;
    }
    const tenant = new RateLimiter(this.perTenantPerMinute);
    const server = this.server;
    const limiter: Limiter = {
      async acquire() {
        await tenant.acquire();
        await server.acquire();
      },
    };
    this.tenants.set(subdomain, limiter);
    this.evictOverflow();
    return limiter;
  }

  get size(): number {
    return this.tenants.size;
  }

  private evictOverflow(): void {
    while (this.tenants.size > this.maxTenants) {
      const oldest = this.tenants.keys().next().value;
      if (oldest === undefined) break;
      this.tenants.delete(oldest);
    }
  }
}
