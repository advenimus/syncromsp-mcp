export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private readonly queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(maxPerMinute: number = 180, private readonly timeoutMs: number = 30000) {
    this.maxTokens = maxPerMinute;
    this.tokens = maxPerMinute;
    this.refillRate = maxPerMinute / 60000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        reject(new Error("Rate limit timeout: request queued for too long"));
      }, this.timeoutMs);

      this.queue.push({ resolve, reject, timer });
      this.scheduleProcess();
    });
  }

  private processTimeout: ReturnType<typeof setTimeout> | null = null;

  private scheduleProcess(): void {
    if (this.processTimeout !== null) return;
    const waitMs = Math.ceil(1 / this.refillRate);
    this.processTimeout = setTimeout(() => {
      this.processTimeout = null;
      this.processQueue();
    }, waitMs);
  }

  private processQueue(): void {
    this.refill();
    while (this.queue.length > 0 && this.tokens >= 1) {
      const item = this.queue.shift()!;
      clearTimeout(item.timer);
      this.tokens -= 1;
      item.resolve();
    }
    if (this.queue.length > 0) {
      this.scheduleProcess();
    }
  }
}
