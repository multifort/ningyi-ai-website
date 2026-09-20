#!/usr/bin/env node

import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";

const sourcePath = process.env.PRODUCT_DB_PATH || "";
const backupRoot = process.env.PRODUCT_BACKUP_PATH || "";
const privateStoragePath = process.env.PRODUCT_PRIVATE_STORAGE_PATH || "";
const encryptionSecret = process.env.PRODUCT_BACKUP_ENCRYPTION_KEY || "";
const retentionDays = Math.min(365, Math.max(3, Number(process.env.PRODUCT_BACKUP_RETENTION_DAYS || 14)));
if (!path.isAbsolute(sourcePath)) fail("BACKUP_DB_PATH_INVALID");
if (!path.isAbsolute(backupRoot)) fail("BACKUP_PATH_INVALID");
if (path.resolve(sourcePath).startsWith(`${path.resolve(backupRoot)}${path.sep}`)) fail("DATABASE_INSIDE_BACKUP_PATH");
if (privateStoragePath && pathsOverlap(backupRoot, privateStoragePath)) fail("BACKUP_PRIVATE_STORAGE_OVERLAP");
if (Buffer.byteLength(encryptionSecret) < 32 || /replace|change.?me|example/i.test(encryptionSecret)) fail("BACKUP_ENCRYPTION_KEY_WEAK");

await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const basename = `product-${timestamp}-${randomUUID().slice(0, 8)}.sqlite.enc`;
const finalPath = path.join(backupRoot, basename);
const plaintextPath = `${finalPath}.sqlite.partial`;
const encryptedPath = `${finalPath}.partial`;
const manifestPath = `${finalPath}.json`;
const manifestTemporaryPath = `${manifestPath}.partial`;
let database;
try {
  database = new Database(sourcePath, { readonly: true, fileMustExist: true });
  await database.backup(plaintextPath);
  database.close();
  database = undefined;
  const verification = new Database(plaintextPath, { readonly: true, fileMustExist: true });
  const integrity = verification.pragma("integrity_check")?.[0]?.integrity_check;
  const tables = verification.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count;
  verification.close();
  if (integrity !== "ok" || tables < 1) throw new Error("BACKUP_INTEGRITY_FAILED");
  const sourceSizeBytes = (await fs.stat(plaintextPath)).size;
  const iv = randomBytes(12);
  const key = createHash("sha256").update(encryptionSecret, "utf8").digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await pipeline(createReadStream(plaintextPath), cipher, createWriteStream(encryptedPath, { mode: 0o600 }));
  const authTag = cipher.getAuthTag();
  await fs.unlink(plaintextPath);
  const encryptedSizeBytes = (await fs.stat(encryptedPath)).size;
  const sha256 = await fileSha256(encryptedPath);
  const manifest = { schemaVersion: "2.0", databaseFile: basename, createdAt: new Date().toISOString(), encryptedSizeBytes, sourceSizeBytes, sha256, integrity: "ok", tableCount: tables, encryption: { algorithm: "aes-256-gcm", keyDerivation: "sha256", iv: iv.toString("base64"), authTag: authTag.toString("base64") } };
  await fs.writeFile(manifestTemporaryPath, JSON.stringify(manifest), { mode: 0o600 });
  await fs.rename(encryptedPath, finalPath);
  await fs.rename(manifestTemporaryPath, manifestPath);
  const removed = await pruneExpiredBackups(backupRoot, retentionDays);
  process.stdout.write(`${JSON.stringify({ level: "info", event: "product_backup_completed", databaseFile: basename, encryptedSizeBytes, sourceSizeBytes, sha256, tableCount: tables, encryption: "aes-256-gcm", retentionDays, removed })}\n`);
} catch (error) {
  if (database) database.close();
  await Promise.all([plaintextPath, encryptedPath, manifestTemporaryPath].map((target) => fs.unlink(target).catch(() => undefined)));
  fail(error instanceof Error ? error.message : "BACKUP_FAILED");
}

async function pruneExpiredBackups(root, days) {
  const cutoff = Date.now() - days * 86400_000;
  let removed = 0;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !/^product-\d{8}T\d{6}Z-[0-9a-f]{8}\.sqlite\.enc(?:\.json)?$/.test(entry.name)) continue;
    const target = path.join(root, entry.name);
    if ((await fs.stat(target)).mtimeMs >= cutoff) continue;
    await fs.unlink(target);
    removed += 1;
  }
  return removed;
}

async function fileSha256(target) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}

function fail(code) {
  process.stderr.write(`${JSON.stringify({ level: "critical", event: "product_backup_failed", errorCode: safeCode(code) })}\n`);
  process.exit(1);
}
function safeCode(value) {
  return String(value).split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "BACKUP_FAILED";
}
function pathsOverlap(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}
