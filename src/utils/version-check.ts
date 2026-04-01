import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface ReleaseInfo {
  tag_name: string;
  html_url: string;
}

function getCurrentVersion(): string {
  try {
    // Try reading from package.json relative to this file
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(dir, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function compareVersions(current: string, latest: string): number {
  const c = current.replace(/^v/, "").split(".").map(Number);
  const l = latest.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((c[i] || 0) < (l[i] || 0)) return -1;
    if ((c[i] || 0) > (l[i] || 0)) return 1;
  }
  return 0;
}

/**
 * Non-blocking version check on startup. Logs a warning to stderr
 * if a newer version is available. Never throws — silently fails
 * on network errors, timeouts, etc.
 */
export function checkForUpdates(): void {
  const currentVersion = getCurrentVersion();
  if (currentVersion === "0.0.0") return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  fetch(
    "https://api.github.com/repos/advenimus/syncromsp-mcp/releases/latest",
    {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    }
  )
    .then((res) => (res.ok ? (res.json() as Promise<ReleaseInfo>) : null))
    .then((release) => {
      if (!release) return;
      const latestVersion = release.tag_name.replace(/^v/, "");
      if (compareVersions(currentVersion, latestVersion) < 0) {
        console.error(
          `\n⚠ SyncroMSP MCP v${latestVersion} is available (you have v${currentVersion}).` +
            `\n  Update: ${release.html_url}` +
            `\n  npx: npx syncromsp-mcp@latest` +
            `\n  Docker: docker compose pull && docker compose up -d\n`
        );
      }
    })
    .catch(() => {
      // Silently ignore — network errors, rate limits, etc.
    })
    .finally(() => clearTimeout(timeout));
}
