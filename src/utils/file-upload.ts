import { stat, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireString, optionalString } from "./validators.js";
import { downloadFile } from "./safe-download.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const PO_ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const DATA_URL_PREFIX = /^data:[^;,]*;base64,/i;
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

export interface DecodedUpload {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

function checkFilename(
  filename: unknown,
  allowedTypes: Readonly<Record<string, string>>
): { name: string; contentType: string } {
  const name = requireString(filename, "filename");
  if (/[\\/]/.test(name)) {
    throw new Error("filename must be a bare file name, not a path");
  }

  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const contentType = allowedTypes[extension];
  if (!contentType) {
    const allowed = Object.keys(allowedTypes).join(", ");
    throw new Error(`filename must end in one of: ${allowed}. Pass filename if the source has no usable name.`);
  }
  return { name, contentType };
}

export function decodeBase64Upload(
  base64: unknown,
  filename: unknown,
  allowedTypes: Readonly<Record<string, string>>
): DecodedUpload {
  const { name, contentType } = checkFilename(filename, allowedTypes);

  const encoded = requireString(base64, "file_base64").replace(DATA_URL_PREFIX, "").replace(/\s+/g, "");
  if (encoded.length % 4 !== 0 || !BASE64_BODY.test(encoded)) {
    throw new Error("file_base64 is not valid base64");
  }
  // Checked before decoding so an oversized payload is never decoded
  if (Math.floor((encoded.length * 3) / 4) > MAX_UPLOAD_BYTES + 2) {
    throw new Error("File exceeds the 10 MB upload limit");
  }

  const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
  if (bytes.length === 0) throw new Error("file_base64 decoded to an empty file");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 10 MB upload limit");

  return { filename: name, contentType, bytes };
}

export function isHostedServer(): boolean {
  return process.env.MCP_TRANSPORT === "http";
}

export async function readLocalUpload(
  filePath: unknown,
  filename: unknown,
  allowedTypes: Readonly<Record<string, string>>
): Promise<DecodedUpload> {
  // A hosted server must never read its own disk on a caller's behalf
  if (isHostedServer()) {
    throw new Error("file_path only works when the server runs on your own computer (Claude Code or Claude Desktop). Use file_url instead.");
  }
  const raw = requireString(filePath, "file_path");
  const resolved = raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
  if (!path.isAbsolute(resolved)) {
    throw new Error("file_path must be a full path, e.g. /Users/me/Downloads/quote.pdf");
  }

  const { name, contentType } = checkFilename(optionalString(filename) ?? path.basename(resolved), allowedTypes);

  const info = await stat(resolved).catch(() => {
    throw new Error(`No file found at ${resolved}`);
  });
  if (!info.isFile()) throw new Error(`${resolved} is not a file`);
  if (info.size === 0) throw new Error(`${resolved} is empty`);
  if (info.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 10 MB upload limit");

  return { filename: name, contentType, bytes: new Uint8Array(await readFile(resolved)) };
}

export async function downloadUpload(
  fileUrl: unknown,
  filename: unknown,
  allowedTypes: Readonly<Record<string, string>>
): Promise<DecodedUpload> {
  const file = await downloadFile(requireString(fileUrl, "file_url"), MAX_UPLOAD_BYTES);
  const { name, contentType } = checkFilename(optionalString(filename) ?? file.suggestedName, allowedTypes);
  return { filename: name, contentType, bytes: file.bytes };
}

export async function resolveUpload(
  args: Record<string, unknown>,
  allowedTypes: Readonly<Record<string, string>>
): Promise<DecodedUpload> {
  const sources = (["file_url", "file_path", "file_base64"] as const).filter(
    (key) => optionalString(args[key]) !== undefined
  );
  if (sources.length !== 1) throw new Error("Give exactly one of file_url, file_path, or file_base64");

  if (sources[0] === "file_url") return downloadUpload(args.file_url, args.filename, allowedTypes);
  if (sources[0] === "file_path") return readLocalUpload(args.file_path, args.filename, allowedTypes);
  return decodeBase64Upload(args.file_base64, args.filename, allowedTypes);
}
