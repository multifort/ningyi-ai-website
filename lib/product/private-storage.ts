import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";

export const PRODUCT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export function privateStorageRoot() {
  return process.env.PRODUCT_PRIVATE_STORAGE_PATH || path.join(process.cwd(), "data", "product-private");
}

export function safePrivatePath(userId: string, solutionId: string, fileId: string) {
  for (const value of [userId, solutionId, fileId]) {
    if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("INVALID_PRIVATE_PATH_ID");
  }
  const relativeKey = path.posix.join("private", userId, solutionId, fileId);
  return { relativeKey, absolutePath: path.join(privateStorageRoot(), userId, solutionId, fileId) };
}

export async function writePrivateFile(userId: string, solutionId: string, fileId: string, bytes: Buffer) {
  const target = safePrivatePath(userId, solutionId, fileId);
  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${target.absolutePath}.uploading`;
  await fs.writeFile(temporaryPath, bytes, { mode: 0o600 });
  await fs.rename(temporaryPath, target.absolutePath);
  return { storageKey: target.relativeKey, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function detectFormat(bytes: Buffer, filename = "") {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(bytes.subarray(12, 16).toString("ascii"))) return "webp";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const packageText = bytes.toString("latin1");
    if (packageText.includes("word/document.xml")) return "docx";
    if (packageText.includes("xl/workbook.xml")) return "xlsx";
    if (packageText.includes("ppt/presentation.xml")) return "pptx";
    return "zip";
  }
  const extension = path.extname(filename).toLowerCase();
  if ([".txt", ".csv", ".json"].includes(extension) && textLooksReadable(bytes)) {
    if (extension === ".json") { try { JSON.parse(bytes.toString("utf8")); return "json"; } catch { return "unknown"; } }
    return extension.slice(1);
  }
  return "unknown";
}

export function extensionMatches(filename: string, detectedFormat: string) {
  const extension = path.extname(filename).toLowerCase();
  const expected: Record<string, string[]> = { pdf: [".pdf"], png: [".png"], jpeg: [".jpg", ".jpeg"], webp: [".webp"], docx: [".docx"], xlsx: [".xlsx"], pptx: [".pptx"], txt: [".txt"], csv: [".csv"], json: [".json"] };
  return Boolean(expected[detectedFormat]?.includes(extension));
}

function textLooksReadable(bytes: Buffer) {
  if (!bytes.length || bytes.includes(0)) return false;
  const text = bytes.toString("utf8");
  if (text.includes("�")) return false;
  let controls = 0;
  for (const character of text) if (character.charCodeAt(0) < 32 && !"\n\r\t".includes(character)) controls += 1;
  return controls / Math.max(1, text.length) < 0.01;
}
