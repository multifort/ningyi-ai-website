#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const manifestArg = process.argv[2];
if (!manifestArg) {
  console.error("usage: node verify-manifest.mjs <path/to/manifest.json>");
  process.exit(2);
}

const manifestPath = resolve(manifestArg);
const baseDir = dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const results = [];

const allowedProjectTypes = new Set(["software", "integration", "upgrade", "deployment", "ai_agent", "hybrid"]);
const allowedDifficulties = new Set(["L1", "L2", "L3", "L4"]);
const paths = (manifest.files ?? []).map((item) => item?.path);
const structuralErrors = [];
if (!/^BM-(0[1-9]|1[0-8])$/.test(manifest.benchmarkId || "")) structuralErrors.push("benchmarkId");
if (!/^\d+\.\d+$/.test(manifest.benchmarkVersion || "")) structuralErrors.push("benchmarkVersion");
if (!allowedProjectTypes.has(manifest.projectType)) structuralErrors.push("projectType");
if (!allowedDifficulties.has(manifest.difficulty)) structuralErrors.push("difficulty");
if (!Array.isArray(manifest.files) || !manifest.files.length || new Set(paths).size !== paths.length) structuralErrors.push("files");
for (const item of manifest.files ?? []) {
  if (typeof item.path !== "string" || !item.path || item.path.startsWith("/") || item.path.split(/[\\/]/).includes("..") || !/^[a-f0-9]{64}$/.test(item.sha256 || "") || !["content", "template", "brand"].includes(item.category) || typeof item.format !== "string" || !item.format || !["synthetic", "public_licensed", "approved_anonymized"].includes(item.licenseStatus)) structuralErrors.push(`file:${item?.path || "unknown"}`);
}
if (!Array.isArray(manifest.coverageTags) || new Set(manifest.coverageTags).size !== manifest.coverageTags.length) structuralErrors.push("coverageTags");
if (!Array.isArray(manifest.blockingChecks) || !manifest.blockingChecks.length || new Set(manifest.blockingChecks).size !== manifest.blockingChecks.length) structuralErrors.push("blockingChecks");
if (structuralErrors.length) {
  console.log(JSON.stringify({ benchmarkId: manifest.benchmarkId, benchmarkVersion: manifest.benchmarkVersion, passed: false, structuralErrors }, null, 2));
  process.exit(1);
}

for (const item of manifest.files ?? []) {
  const path = resolve(baseDir, item.path);
  const bytes = await readFile(path);
  const actual = createHash("sha256").update(bytes).digest("hex");
  results.push({ path: item.path, expected: item.sha256, actual, passed: actual === item.sha256 });
}

const failed = results.filter((item) => !item.passed);
console.log(JSON.stringify({
  benchmarkId: manifest.benchmarkId,
  benchmarkVersion: manifest.benchmarkVersion,
  files: results.length,
  passed: failed.length === 0,
  failures: failed,
}, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
