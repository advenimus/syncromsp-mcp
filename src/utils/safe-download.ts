import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import type { IncomingHttpHeaders } from "node:http";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

const BLOCKED_ADDRESSES = new net.BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(subnet, prefix, "ipv4");
}
for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(subnet, prefix, "ipv6");
}

export interface DownloadedFile {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
  readonly suggestedName?: string;
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  return BLOCKED_ADDRESSES.check(address, family === 4 ? "ipv4" : "ipv6");
}

function blockedHostError(host: string): Error {
  return new Error(`Refusing to download from a private or local address (${host})`);
}

// Validating inside the socket's own lookup means the address checked is the address connected to
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const addresses = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (addresses.some(isBlockedAddress)) return callback(blockedHostError(hostname), address, family);
    callback(null, address, family);
  });
};

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== "https:") throw new Error("file_url must start with https://");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Node skips the lookup hook for IP literals, so they are checked here
  if (net.isIP(host) && isBlockedAddress(host)) throw blockedHostError(host);
}

interface RawResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

function requestOnce(url: URL, maxBytes: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: guardedLookup, headers: { "User-Agent": "syncromsp-mcp" } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status !== 200) {
        res.resume();
        resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        return;
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > maxBytes) {
        req.destroy(new Error("File exceeds the 10 MB upload limit"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error("File exceeds the 10 MB upload limit"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("Download timed out")));
    req.on("error", reject);
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function nameFromHeaders(headers: IncomingHttpHeaders): string | undefined {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(headers["content-disposition"] ?? "");
  return match ? safeDecode(match[1]).trim() : undefined;
}

function nameFromUrl(url: URL): string | undefined {
  const last = url.pathname.split("/").pop();
  return last ? safeDecode(last) : undefined;
}

export async function downloadFile(rawUrl: string, maxBytes: number): Promise<DownloadedFile> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("file_url is not a valid URL");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedUrl(url);
    const res = await requestOnce(url, maxBytes);

    if (REDIRECT_CODES.has(res.status) && res.headers.location) {
      url = new URL(res.headers.location, url);
      continue;
    }
    if (res.status !== 200) throw new Error(`Download failed (HTTP ${res.status})`);

    const contentType = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (contentType === "text/html") {
      throw new Error("The link opened a web page, not the file. Use a direct download link (e.g. a Dropbox link ending in ?dl=1).");
    }
    if (res.body.length === 0) throw new Error("The link returned an empty file");

    return {
      bytes: new Uint8Array(res.body),
      contentType,
      suggestedName: nameFromHeaders(res.headers) ?? nameFromUrl(url),
    };
  }
  throw new Error("Too many redirects");
}
