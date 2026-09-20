#!/usr/bin/env node

import "./product-env.mjs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const errors = [];
const warnings = [];
const sessionSecret = process.env.PRODUCT_SESSION_SECRET || "";
const workerSecret = process.env.PRODUCT_WORKER_SECRET || "";
const backupEncryptionKey = process.env.PRODUCT_BACKUP_ENCRYPTION_KEY || "";
const downloadSecret = process.env.PRODUCT_DOWNLOAD_SECRET || "";
const databasePath = process.env.PRODUCT_DB_PATH || "";
const storagePath = process.env.PRODUCT_PRIVATE_STORAGE_PATH || "";
const backupPath = process.env.PRODUCT_BACKUP_PATH || "";

checkSecret("SESSION_SECRET", sessionSecret);
checkSecret("WORKER_SECRET", workerSecret);
checkSecret("BACKUP_ENCRYPTION_KEY", backupEncryptionKey);
checkSecret("DOWNLOAD_SECRET", downloadSecret);
if (new Set([sessionSecret, workerSecret, backupEncryptionKey, downloadSecret].filter(Boolean)).size !== 4) errors.push("SECRETS_MUST_BE_DISTINCT");
checkAbsolutePath("DB_PATH", databasePath);
checkAbsolutePath("PRIVATE_STORAGE_PATH", storagePath);
checkAbsolutePath("BACKUP_PATH", backupPath);
if (databasePath && storagePath && path.resolve(databasePath).startsWith(`${path.resolve(storagePath)}${path.sep}`)) errors.push("DB_INSIDE_PRIVATE_STORAGE");
if (backupPath && storagePath && pathsOverlap(backupPath, storagePath)) errors.push("BACKUP_PRIVATE_STORAGE_OVERLAP");
if (!fs.existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) errors.push("PRODUCTION_BUILD_MISSING");
const fontPath = path.join(process.cwd(), "assets", "fonts", "NotoSansCJKsc-Regular.otf");
if (!fs.existsSync(fontPath) || fs.statSync(fontPath).size < 1_000_000) errors.push("PDF_CJK_FONT_MISSING");
checkWritableDirectory(databasePath ? path.dirname(path.resolve(databasePath)) : "", "DB_DIRECTORY_NOT_WRITABLE");
checkWritableDirectory(storagePath ? path.resolve(storagePath) : "", "PRIVATE_STORAGE_NOT_WRITABLE");
checkWritableDirectory(backupPath ? path.resolve(backupPath) : "", "BACKUP_DIRECTORY_NOT_WRITABLE");

const formalProvider = process.env.PRODUCT_FORMAL_MODEL_PROVIDER || "openai";
if (formalProvider !== "openai") errors.push("FORMAL_PROVIDER_UNSUPPORTED");
if (formalProvider === "openai" && !validProviderKey(process.env.OPENAI_API_KEY)) errors.push("FORMAL_PROVIDER_KEY_MISSING");
const modelWindowEnabled = String(process.env.PRODUCT_MODEL_EXECUTION_WINDOW_ENABLED || "true").toLowerCase() !== "false";
if (modelWindowEnabled) {
  const modelTimezone = String(process.env.PRODUCT_MODEL_EXECUTION_TIMEZONE || "Asia/Shanghai").trim();
  try { new Intl.DateTimeFormat("en-US", { timeZone: modelTimezone }).format(); }
  catch { errors.push("MODEL_EXECUTION_TIMEZONE_INVALID"); }
  const windowStart = optionalHour("PRODUCT_MODEL_EXECUTION_START_HOUR", 0);
  const windowEnd = optionalHour("PRODUCT_MODEL_EXECUTION_END_HOUR", 6);
  if (windowStart === null) errors.push("MODEL_EXECUTION_START_HOUR_INVALID");
  if (windowEnd === null) errors.push("MODEL_EXECUTION_END_HOUR_INVALID");
  if (windowStart !== null && windowEnd !== null && windowStart === windowEnd) errors.push("MODEL_EXECUTION_WINDOW_EMPTY");
}
const python = process.env.PRODUCT_PYTHON_PATH || "python3";
const pythonCheck = spawnSync(python, ["--version"], { encoding: "utf8", timeout: 5000 });
if (pythonCheck.error || pythonCheck.status !== 0) errors.push("PYTHON_RUNTIME_UNAVAILABLE");
if (!process.env.PRODUCT_APP_ORIGIN) warnings.push("APP_ORIGIN_DEFAULTED");

const result = { status: errors.length ? "failed" : "ready", errors, warnings, checks: { secrets: errors.every((code) => !code.includes("SECRET")), storage: errors.every((code) => !code.includes("WRITABLE") && !code.includes("STORAGE")), build: !errors.includes("PRODUCTION_BUILD_MISSING"), font: !errors.includes("PDF_CJK_FONT_MISSING"), formalProvider: !errors.some((code) => code.startsWith("FORMAL_PROVIDER")), python: !errors.includes("PYTHON_RUNTIME_UNAVAILABLE") } };
(errors.length ? process.stderr : process.stdout).write(`${JSON.stringify({ level: errors.length ? "error" : warnings.length ? "warning" : "info", event: "product_production_check", ...result })}\n`);
if (errors.length) process.exit(1);

function checkSecret(label, value) {
  if (Buffer.byteLength(value) < 32 || /replace|change.?me|example/i.test(value)) errors.push(`${label}_WEAK`);
}
function checkAbsolutePath(label, value) {
  if (!value || !path.isAbsolute(value)) errors.push(`${label}_INVALID`);
}
function checkWritableDirectory(directory, code) {
  if (!directory) return;
  const probe = path.join(directory, `.production-check-${randomUUID()}`);
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(probe, "ready", { mode: 0o600 });
    fs.unlinkSync(probe);
  } catch {
    try { fs.unlinkSync(probe); } catch {}
    errors.push(code);
  }
}
function validProviderKey(value) {
  return Boolean(value && value.length >= 20 && !/replace|example|change.?me/i.test(value));
}
function optionalHour(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
}
function pathsOverlap(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}
