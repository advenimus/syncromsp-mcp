import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let cached: string | null = null;

export function getPackageVersion(): string {
  if (cached !== null) return cached;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "..", "package.json"), "utf-8")
    );
    cached = (pkg.version as string) || "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
