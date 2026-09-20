import { randomUUID } from "crypto";
import { productSqlite } from "./db";
import { isOperationsControlEnabled } from "./operations-controls";

const componentTypes = new Set(["model_slot", "parser", "renderer", "quality_threshold", "retention_policy"]);
type BenchmarkReport = { passed: boolean; runs: number; blockingFailures: number; reportId: string };

export function createConfigurationCandidate(input: { componentType: string; componentKey: string; version: string; config: unknown; benchmarkReport: BenchmarkReport }) {
  if (!componentTypes.has(input.componentType)) throw new Error("INVALID_COMPONENT_TYPE");
  if (!/^[a-z0-9][a-z0-9_.-]{1,80}$/i.test(input.componentKey) || !/^[a-z0-9][a-z0-9_.-]{0,40}$/i.test(input.version)) throw new Error("INVALID_RELEASE_IDENTITY");
  if (!input.config || typeof input.config !== "object" || containsSecretKey(input.config)) throw new Error("INVALID_OR_SECRET_CONFIG");
  const report = input.benchmarkReport;
  if (!report || !report.reportId || !report.passed || report.blockingFailures !== 0 || report.runs < 3) throw new Error("BENCHMARK_GATE_FAILED");
  const id = randomUUID();
  const previous = productSqlite.prepare("SELECT id FROM configuration_releases WHERE component_type = ? AND component_key = ? AND status = 'active' ORDER BY activated_at DESC LIMIT 1").get(input.componentType, input.componentKey) as { id: string } | undefined;
  productSqlite.prepare(`INSERT INTO configuration_releases
    (id, component_type, component_key, version, config_json, benchmark_report_json, previous_release_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, input.componentType, input.componentKey, input.version, JSON.stringify(input.config), JSON.stringify(report), previous?.id || null);
  return getRelease(id);
}

export function activateConfigurationRelease(id: string, rolloutPercent: number) {
  if (isOperationsControlEnabled("hold_rollout")) throw new Error("ROLLOUT_HELD_BY_OPERATIONS");
  const release = getRelease(id);
  if (!release || !["candidate", "active"].includes(release.status)) throw new Error("RELEASE_NOT_ACTIVATABLE");
  const percent = Math.min(100, Math.max(1, Math.floor(rolloutPercent)));
  productSqlite.transaction(() => {
    productSqlite.prepare("UPDATE configuration_releases SET status = 'superseded' WHERE component_type = ? AND component_key = ? AND status = 'active' AND id <> ?").run(release.componentType, release.componentKey, id);
    productSqlite.prepare("UPDATE configuration_releases SET status = 'active', rollout_percent = ?, activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP) WHERE id = ?").run(percent, id);
  })();
  return getRelease(id);
}

export function rollbackConfigurationRelease(id: string) {
  const release = getRelease(id);
  if (!release || release.status !== "active") throw new Error("RELEASE_NOT_ACTIVE");
  productSqlite.transaction(() => {
    productSqlite.prepare("UPDATE configuration_releases SET status = 'rolled_back', rollout_percent = 0, rolled_back_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    if (release.previousReleaseId) productSqlite.prepare("UPDATE configuration_releases SET status = 'active', rollout_percent = 100, activated_at = CURRENT_TIMESTAMP WHERE id = ?").run(release.previousReleaseId);
  })();
  return { rolledBack: getRelease(id), restored: release.previousReleaseId ? getRelease(release.previousReleaseId) : null };
}

export function listConfigurationReleases() {
  return productSqlite.prepare(`SELECT id, component_type AS componentType, component_key AS componentKey, version, status,
    previous_release_id AS previousReleaseId, rollout_percent AS rolloutPercent, created_at AS createdAt, activated_at AS activatedAt
    FROM configuration_releases ORDER BY created_at DESC, id DESC LIMIT 100`).all();
}

function getRelease(id: string) {
  return productSqlite.prepare(`SELECT id, component_type AS componentType, component_key AS componentKey, version, status,
    config_json AS configJson, benchmark_report_json AS benchmarkReportJson, previous_release_id AS previousReleaseId,
    rollout_percent AS rolloutPercent, created_at AS createdAt, activated_at AS activatedAt FROM configuration_releases WHERE id = ?`).get(id) as any;
}

function containsSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => /(secret|api[_-]?key|token|password|credential)/i.test(key) || containsSecretKey(child));
}
