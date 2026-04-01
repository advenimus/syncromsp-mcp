export function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }
  return value;
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function requireId(value: unknown, name: string = "id"): number {
  const num = requireNumber(value, name);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return num;
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") return undefined;
  return value;
}

export function optionalId(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const num = optionalNumber(value);
  if (num !== undefined && Number.isInteger(num) && num > 0) return num;
  return undefined;
}

export function pickDefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
