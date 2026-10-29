import type { SyncroApiConfig, SyncroErrorResponse } from "./types.js";
import { RateLimiter } from "./utils/rate-limiter.js";

export class SyncroApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: SyncroErrorResponse
  ) {
    super(message);
    this.name = "SyncroApiError";
  }
}

export class SyncroApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiter;

  constructor(config: SyncroApiConfig, rateLimiter: RateLimiter = new RateLimiter()) {
    if (!config.apiKey) throw new Error("SYNCRO_API_KEY is required");
    if (!config.subdomain) throw new Error("SYNCRO_SUBDOMAIN is required");
    this.baseUrl = `https://${config.subdomain}.syncromsp.com/api/v1`;
    this.apiKey = config.apiKey;
    this.rateLimiter = rateLimiter;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: Record<string, unknown> | FormData;
    } = {}
  ): Promise<T> {
    await this.rateLimiter.acquire();

    const url = this.buildUrl(path, options.params);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };

    const fetchOptions: RequestInit = { method, headers };

    if (options.body instanceof FormData) {
      // fetch must set the multipart Content-Type itself so it can include the boundary
      fetchOptions.body = options.body;
    } else if (options.body) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(this.redact(`Request to Syncro failed: ${message}`));
    }

    if (!response.ok) {
      let details: SyncroErrorResponse | undefined;
      try {
        details = this.redactDetails((await response.json()) as SyncroErrorResponse);
      } catch {
        // response may not be JSON
      }

      const message = this.redact(this.formatErrorMessage(response.status, details));
      throw new SyncroApiError(message, response.status, details);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  // Error text is returned to the MCP client, so the key must never be echoed.
  private redact(text: string): string {
    return text.split(this.apiKey).join("[redacted]");
  }

  private redactDetails(details: SyncroErrorResponse): SyncroErrorResponse {
    return this.redactValue(details) as SyncroErrorResponse;
  }

  private redactValue(value: unknown): unknown {
    if (typeof value === "string") return this.redact(value);
    if (Array.isArray(value)) return value.map((v) => this.redactValue(v));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [this.redact(k), this.redactValue(v)])
      );
    }
    return value;
  }

  private formatErrorMessage(status: number, details?: SyncroErrorResponse): string {
    const base = `Syncro API error (${status})`;
    const apiDetail = this.extractApiErrorDetail(details);

    const withDetail = (generic: string): string =>
      apiDetail ? `${base}: ${generic} — ${apiDetail}` : `${base}: ${generic}`;

    if (status === 401) return withDetail("Invalid or expired API key. Check your Syncro API key.");
    if (status === 403) return withDetail("Insufficient permissions. Check your API token's custom permissions.");
    if (status === 404) return withDetail("Resource not found.");
    if (status === 429) return withDetail("Rate limit exceeded. Please wait before retrying.");

    if (apiDetail) return `${base}: ${apiDetail}`;
    return base;
  }

  private extractApiErrorDetail(details?: SyncroErrorResponse): string | undefined {
    if (!details) return undefined;
    if (details.errors) {
      let errMsg: string;
      if (Array.isArray(details.errors)) {
        errMsg = details.errors.join(", ");
      } else if (typeof details.errors === "string") {
        errMsg = details.errors;
      } else if (typeof details.errors === "object") {
        // Handle nested error objects like { mute_for: ["is not valid"] }
        errMsg = Object.entries(details.errors as Record<string, string[]>)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
          .join("; ");
      } else {
        errMsg = String(details.errors);
      }
      if (errMsg.length > 0) return errMsg;
    }
    if (details.error) return details.error;
    if (details.message) return details.message;
    return undefined;
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async post<T>(path: string, body?: Record<string, unknown>, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("POST", path, { body, params });
  }

  async postMultipart<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>("POST", path, { body: form });
  }

  async put<T>(path: string, body?: Record<string, unknown>, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("PUT", path, { body, params });
  }

  async patch<T>(path: string, body?: Record<string, unknown>, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("PATCH", path, { body, params });
  }

  async delete<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("DELETE", path, { params });
  }
}
