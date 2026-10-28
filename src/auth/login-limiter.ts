export interface AttemptLimiterOptions {
  max: number;
  windowMs: number;
  maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 10_000;

/** Sliding-window attempt counter keyed by client IP. In memory only. */
export class AttemptLimiter {
  private readonly attempts = new Map<string, readonly number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(options: AttemptLimiterOptions) {
    this.max = options.max;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  }

  get size(): number {
    return this.attempts.size;
  }

  tryConsume(key: string, now: number = Date.now()): boolean {
    const recent = this.recentAttempts(key, now);
    if (recent.length >= this.max) {
      this.attempts.set(key, recent);
      return false;
    }
    this.attempts.delete(key);
    this.attempts.set(key, [...recent, now]);
    this.enforceKeyCap(now);
    return true;
  }

  sweep(now: number = Date.now()): void {
    for (const key of [...this.attempts.keys()]) {
      const recent = this.recentAttempts(key, now);
      if (recent.length === 0) this.attempts.delete(key);
      else this.attempts.set(key, recent);
    }
  }

  private recentAttempts(key: string, now: number): readonly number[] {
    const cutoff = now - this.windowMs;
    return (this.attempts.get(key) ?? []).filter((t) => t > cutoff);
  }

  private enforceKeyCap(now: number): void {
    if (this.attempts.size <= this.maxKeys) return;
    this.sweep(now);
    // Map iteration order is insertion order, so the first key is the stalest.
    while (this.attempts.size > this.maxKeys) {
      const oldest = this.attempts.keys().next().value;
      if (oldest === undefined) break;
      this.attempts.delete(oldest);
    }
  }
}
