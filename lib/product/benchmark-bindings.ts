import { createHash, randomUUID } from "crypto";
import { productSqlite } from "./db";
import { benchmarkDefinition, benchmarkManifestHash, benchmarkRegistry } from "./benchmark-registry";

const benchmarkPattern = /^BM-(0[1-9]|1[0-8])$/;
export function registerBenchmarkBinding(input: { benchmarkId: string; solutionId: string }) {
  if (!benchmarkPattern.test(input.benchmarkId)) throw new Error("INVALID_BENCHMARK_ID");
  const definition = benchmarkDefinition(input.benchmarkId);
  if (!definition) throw new Error("BENCHMARK_DEFINITION_NOT_FOUND");
  const solution = productSqlite.prepare("SELECT id FROM product_solutions WHERE id = ? AND status NOT IN ('deletion_pending','deleted')").get(input.solutionId);
  if (!solution) throw new Error("BENCHMARK_SOLUTION_NOT_FOUND");
  const files = benchmarkFiles(input.solutionId);
  const missing = definition.requiredInputs.filter((requirement) => !files.some((file) => file.category === requirement.category && requirement.formats.includes(file.detectedFormat)));
  if (missing.length) throw new Error(`BENCHMARK_INPUTS_INCOMPLETE:${missing.map((item) => `${item.category}/${item.formats.join("|")}`).join(",")}`);
  const manifestHash = benchmarkManifestHash(definition);
  const computedInputFingerprint = inputFingerprint(files);
  const id = randomUUID();
  productSqlite.prepare(`INSERT INTO benchmark_bindings (id, benchmark_id, solution_id, manifest_hash, input_fingerprint)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(benchmark_id) DO UPDATE SET solution_id = excluded.solution_id,
    manifest_hash = excluded.manifest_hash, input_fingerprint = excluded.input_fingerprint, status = 'ready', updated_at = CURRENT_TIMESTAMP`).run(
      id, input.benchmarkId, input.solutionId, manifestHash, computedInputFingerprint,
    );
  return benchmarkBinding(input.benchmarkId);
}

export function benchmarkBinding(benchmarkId: string) {
  return productSqlite.prepare(`SELECT id, benchmark_id AS benchmarkId, solution_id AS solutionId, manifest_hash AS manifestHash,
    input_fingerprint AS inputFingerprint, status, created_at AS createdAt, updated_at AS updatedAt
    FROM benchmark_bindings WHERE benchmark_id = ?`).get(benchmarkId) as any;
}

export function validatedBenchmarkBinding(benchmarkId: string) {
  const binding = benchmarkBinding(benchmarkId);
  if (!binding || binding.status !== "ready") return binding || null;
  const definition = benchmarkDefinition(benchmarkId);
  if (!definition) return markStale(binding, "definition_missing");
  let currentManifestHash: string;
  try { currentManifestHash = benchmarkManifestHash(definition); }
  catch { return markStale(binding, "manifest_invalid"); }
  const currentFingerprint = inputFingerprint(benchmarkFiles(binding.solutionId));
  if (currentManifestHash !== binding.manifestHash || currentFingerprint !== binding.inputFingerprint) return markStale(binding, currentManifestHash !== binding.manifestHash ? "manifest_changed" : "inputs_changed");
  return binding;
}

export function listBenchmarkBindings() {
  return productSqlite.prepare(`SELECT id, benchmark_id AS benchmarkId, manifest_hash AS manifestHash,
    input_fingerprint AS inputFingerprint, status, created_at AS createdAt, updated_at AS updatedAt
    FROM benchmark_bindings ORDER BY benchmark_id`).all();
}

export function benchmarkReadiness() {
  return benchmarkRegistry.map((definition) => {
    const binding = benchmarkBinding(definition.benchmarkId);
    if (!binding) return { benchmarkId: definition.benchmarkId, title: definition.title, projectType: definition.projectType, status: "unbound", missingInputs: definition.requiredInputs };
    const files = benchmarkFiles(binding.solutionId);
    const missingInputs = definition.requiredInputs.filter((requirement) => !files.some((file) => file.category === requirement.category && requirement.formats.includes(file.detectedFormat)));
    const fingerprintMatches = inputFingerprint(files) === binding.inputFingerprint;
    let manifestMatches = false;
    try { manifestMatches = benchmarkManifestHash(definition) === binding.manifestHash; } catch {}
    const status = missingInputs.length ? "inputs_incomplete" : fingerprintMatches && manifestMatches ? "ready" : "stale";
    if (status !== binding.status) productSqlite.prepare("UPDATE benchmark_bindings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, binding.id);
    return { benchmarkId: definition.benchmarkId, title: definition.title, projectType: definition.projectType, status, missingInputs, manifestHash: binding.manifestHash };
  });
}

function markStale(binding: any, staleReason: string) {
  productSqlite.prepare("UPDATE benchmark_bindings SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(binding.id);
  return { ...binding, status: "stale", staleReason };
}

function benchmarkFiles(solutionId: string) {
  return productSqlite.prepare(`SELECT category, detected_format AS detectedFormat, size_bytes AS sizeBytes, sha256
    FROM source_files WHERE solution_id = ? AND status NOT IN ('waiting_upload','failed') AND sha256 IS NOT NULL ORDER BY category, detected_format, sha256`).all(solutionId) as Array<{ category: string; detectedFormat: string; sizeBytes: number; sha256: string }>;
}

function inputFingerprint(files: Array<{ category: string; detectedFormat: string; sizeBytes: number; sha256: string }>) {
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
