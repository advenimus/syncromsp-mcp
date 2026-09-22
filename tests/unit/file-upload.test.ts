import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  decodeBase64Upload,
  readLocalUpload,
  resolveUpload,
  MAX_UPLOAD_BYTES,
  PO_ATTACHMENT_TYPES,
} from "../../src/utils/file-upload.js";

const encode = (text: string) => Buffer.from(text).toString("base64");

describe("decodeBase64Upload", () => {
  it("should decode a valid file and pick the content type from the extension", () => {
    const upload = decodeBase64Upload(encode("a,b\n1,2"), "Parts.CSV", PO_ATTACHMENT_TYPES);

    expect(upload.filename).toBe("Parts.CSV");
    expect(upload.contentType).toBe("text/csv");
    expect(Buffer.from(upload.bytes).toString()).toBe("a,b\n1,2");
  });

  it("should accept a data URL and line-wrapped base64", () => {
    const wrapped = `data:application/pdf;base64,${encode("%PDF-1.4 hello world").replace(/(.{8})/g, "$1\n")}`;

    const upload = decodeBase64Upload(wrapped, "a.pdf", PO_ATTACHMENT_TYPES);

    expect(Buffer.from(upload.bytes).toString()).toBe("%PDF-1.4 hello world");
  });

  it("should reject a filename that is a path", () => {
    expect(() => decodeBase64Upload(encode("x"), "../etc/a.pdf", PO_ATTACHMENT_TYPES)).toThrow("bare file name");
  });

  it("should reject a missing or disallowed extension", () => {
    expect(() => decodeBase64Upload(encode("x"), "noextension", PO_ATTACHMENT_TYPES)).toThrow("must end in one of");
    expect(() => decodeBase64Upload(encode("x"), "run.exe", PO_ATTACHMENT_TYPES)).toThrow("must end in one of");
  });

  it("should reject text that is not base64", () => {
    expect(() => decodeBase64Upload("not base64!", "a.pdf", PO_ATTACHMENT_TYPES)).toThrow("not valid base64");
  });

  it("should reject an empty file", () => {
    expect(() => decodeBase64Upload("", "a.pdf", PO_ATTACHMENT_TYPES)).toThrow("file_base64");
  });

  it("should reject a file over the size limit without decoding it", () => {
    const tooBig = "A".repeat(Math.ceil(((MAX_UPLOAD_BYTES + 3) * 4) / 3 / 4) * 4);

    expect(() => decodeBase64Upload(tooBig, "a.pdf", PO_ATTACHMENT_TYPES)).toThrow("10 MB");
  });
});

describe("readLocalUpload", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "syncro-upload-"));
    await writeFile(path.join(dir, "quote.pdf"), "%PDF-1.4 local");
    await writeFile(path.join(dir, "empty.pdf"), "");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.MCP_TRANSPORT;
  });

  it("should read a local file and name it from the path", async () => {
    const upload = await readLocalUpload(path.join(dir, "quote.pdf"), undefined, PO_ATTACHMENT_TYPES);

    expect(upload.filename).toBe("quote.pdf");
    expect(upload.contentType).toBe("application/pdf");
    expect(Buffer.from(upload.bytes).toString()).toBe("%PDF-1.4 local");
  });

  it("should refuse to read files on a hosted server", async () => {
    process.env.MCP_TRANSPORT = "http";

    await expect(readLocalUpload(path.join(dir, "quote.pdf"), undefined, PO_ATTACHMENT_TYPES)).rejects.toThrow("Use file_url");
  });

  it("should reject a relative path", async () => {
    await expect(readLocalUpload("quote.pdf", undefined, PO_ATTACHMENT_TYPES)).rejects.toThrow("full path");
  });

  it("should reject missing, empty, and disallowed files", async () => {
    await expect(readLocalUpload(path.join(dir, "nope.pdf"), undefined, PO_ATTACHMENT_TYPES)).rejects.toThrow("No file found");
    await expect(readLocalUpload(path.join(dir, "empty.pdf"), undefined, PO_ATTACHMENT_TYPES)).rejects.toThrow("is empty");
    await expect(readLocalUpload("/etc/hosts", undefined, PO_ATTACHMENT_TYPES)).rejects.toThrow("must end in one of");
  });
});

describe("resolveUpload", () => {
  it("should require exactly one file source", async () => {
    await expect(resolveUpload({}, PO_ATTACHMENT_TYPES)).rejects.toThrow("exactly one");
    await expect(
      resolveUpload({ file_url: "https://example.com/a.pdf", file_path: "/tmp/a.pdf" }, PO_ATTACHMENT_TYPES)
    ).rejects.toThrow("exactly one");
  });

  it("should route base64 input to the base64 decoder", async () => {
    const upload = await resolveUpload({ file_base64: encode("a,b"), filename: "x.csv" }, PO_ATTACHMENT_TYPES);

    expect(upload.contentType).toBe("text/csv");
  });
});
