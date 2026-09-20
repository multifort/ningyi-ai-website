#!/usr/bin/env node

import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";

const options = parseArguments(process.argv.slice(2));
const encryptionSecret = process.env.PRODUCT_BACKUP_ENCRYPTION_KEY || "";
if (Buffer.byteLength(encryptionSecret) < 32 || /replace|change.?me|example/i.test(encryptionSecret)) fail("BACKUP_ENCRYPTION_KEY_WEAK");
if (!options.backup || !path.isAbsolute(options.backup) || !/\.sqlite\.enc$/.test(options.backup)) fail("RESTORE_BACKUP_PATH_INVALID");
const manifestPath = `${options.backup}.json`;
const liveDatabase = process.env.PRODUCT_DB_PATH ? path.resolve(process.env.PRODUCT_DB_PATH) : null;
if (options.output && (!path.isAbsolute(options.output) || path.resolve(options.output) === liveDatabase)) fail("RESTORE_OUTPUT_PATH_INVALID");
if (options.output && await exists(options.output)) fail("RESTORE_OUTPUT_EXISTS");

let temporaryDirectory = null;
const outputPath = options.output || path.join(temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-restore-")), "verified.sqlite");
const partialPath = `${outputPath}.partial-${randomUUID().slice(0, 8)}`;
try {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  validateManifest(manifest, path.basename(options.backup));
  const actualHash = await fileSha256(options.backup);
  if (actualHash !== manifest.sha256) throw new Error("RESTORE_CIPHERTEXT_HASH_MISMATCH");
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const key = createHash("sha256").update(encryptionSecret, "utf8").digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(manifest.encryption.iv, "base64"));
  decipher.setAuthTag(Buffer.from(manifest.encryption.authTag, "base64"));
  await pipeline(createReadStream(options.backup), decipher, createWriteStream(partialPath, { mode: 0o600, flags: "wx" }));
  const database = new Database(partialPath, { readonly: true, fileMustExist: true });
  const integrity = database.pragma("integrity_check")?.[0]?.integrity_check;
  const tables = database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count;
  database.close();
  if (integrity !== "ok" || tables !== manifest.tableCount) throw new Error("RESTORE_DATABASE_INTEGRITY_FAILED");
  if (options.output) {
    await fs.link(partialPath, outputPath);
    await fs.unlink(partialPath);
    await fs.chmod(outputPath, 0o600);
  } else {
    await fs.unlink(partialPath);
  }
  process.stdout.write(`${JSON.stringify({ level: "info", event: options.output ? "product_restore_completed" : "product_backup_verified", databaseFile: path.basename(options.backup), integrity: "ok", tableCount: tables, outputCreated: Boolean(options.output) })}\n`);
} catch (error) {
  await fs.unlink(partialPath).catch(() => undefined);
  if (temporaryDirectory) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    temporaryDirectory = null;
  }
  fail(restoreErrorCode(error));
} finally {
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
}

function parseArguments(args) {
  const result = { backup: "", output: "" };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--backup") result.backup = args[++index] || "";
    else if (args[index] === "--output") result.output = args[++index] || "";
    else fail("RESTORE_ARGUMENT_INVALID");
  }
  return result;
}
function validateManifest(manifest, filename) {
  if (manifest?.schemaVersion !== "2.0" || manifest.databaseFile !== filename || manifest.integrity !== "ok" || manifest.encryption?.algorithm !== "aes-256-gcm" || manifest.encryption?.keyDerivation !== "sha256" || !/^[0-9a-f]{64}$/.test(manifest.sha256 || "") || !Number.isInteger(manifest.tableCount) || manifest.tableCount < 1) throw new Error("RESTORE_MANIFEST_INVALID");
  if (Buffer.from(manifest.encryption.iv || "", "base64").length !== 12 || Buffer.from(manifest.encryption.authTag || "", "base64").length !== 16) throw new Error("RESTORE_MANIFEST_INVALID");
}
async function fileSha256(target) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}
async function exists(target) {
  return Boolean(await fs.stat(target).catch(() => null));
}
function fail(code) {
  process.stderr.write(`${JSON.stringify({ level: "critical", event: "product_restore_failed", errorCode: safeCode(code) })}\n`);
  process.exit(1);
}
function safeCode(value) {
  return String(value).split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "RESTORE_FAILED";
}
function restoreErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/authenticate|bad decrypt|unsupported state/i.test(message)) return "RESTORE_AUTHENTICATION_FAILED";
  if (/ENOENT/.test(message)) return "RESTORE_FILE_MISSING";
  return message || "RESTORE_FAILED";
}
