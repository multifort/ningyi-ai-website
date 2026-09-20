#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const manifestArg = process.argv[2];
const allowedProjectTypes = new Set(["software", "integration", "upgrade", "deployment", "ai_agent", "hybrid"]);
const allowedDifficulties = new Set(["L1", "L2", "L3", "L4"]);

async function verifyManifest(manifestPath) {
  const baseDir = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const results = [];
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
    return { benchmarkId: manifest.benchmarkId, benchmarkVersion: manifest.benchmarkVersion, passed: false, structuralErrors };
  }

  for (const item of manifest.files ?? []) {
    const path = resolve(baseDir, item.path);
    const bytes = await readFile(path);
    const actual = createHash("sha256").update(bytes).digest("hex");
    results.push({ path: item.path, expected: item.sha256, actual, passed: actual === item.sha256 });
  }

  const failures = results.filter((item) => !item.passed);
  return {
    benchmarkId: manifest.benchmarkId,
    benchmarkVersion: manifest.benchmarkVersion,
    files: results.length,
    passed: failures.length === 0,
    failures,
  };
}

let manifestPaths;
if (manifestArg) {
  manifestPaths = [resolve(manifestArg)];
} else {
  const benchmarksRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directories = await readdir(benchmarksRoot, { withFileTypes: true });
  manifestPaths = directories
    .filter((entry) => entry.isDirectory() && /^BM-(0[1-9]|1[0-8])$/.test(entry.name))
    .map((entry) => join(benchmarksRoot, entry.name, "manifest.json"))
    .sort();
}

const reports = [];
for (const manifestPath of manifestPaths) reports.push(await verifyManifest(manifestPath));
const passed = reports.length > 0 && reports.every((report) => report.passed);
console.log(JSON.stringify({ passed, manifests: reports.length, reports }, null, 2));
process.exit(passed ? 0 : 1);
