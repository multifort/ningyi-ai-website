import { createHash, randomUUID } from "crypto";
import { productSqlite } from "./db";
import { runUnattendedAcceptance } from "./acceptance";
import { validatedBenchmarkBinding } from "./benchmark-bindings";
import { benchmarkDefinition, benchmarkManifestHash } from "./benchmark-registry";

const requiredFaults = ["MODEL_PROVIDER_FAILURE", "WORKER_INTERRUPTION", "ARTIFACT_CORRUPTION", "DELETION_RACE", "CONCURRENT_MATERIAL_CHANGE"] as const;
const requiredBenchmarks = Array.from({ length: 18 }, (_, index) => `BM-${String(index + 1).padStart(2, "0")}`);
const pilotBenchmarks = ["BM-01"];

export function startAcceptanceCampaign(targetConsecutiveRuns = 30, scope: "pilot" | "full" = "full") {
  const target = Math.max(30, Math.floor(targetConsecutiveRuns));
  const benchmarkIds = benchmarksForScope(scope);
  const unavailable = benchmarkIds.filter((benchmarkId) => {
    const definition = benchmarkDefinition(benchmarkId);
    if (!definition) return true;
    try { benchmarkManifestHash(definition); return false; } catch { return true; }
  });
  if (unavailable.length) throw new Error(`BENCHMARK_SUITE_NOT_READY:${unavailable.join(",")}`);
  const id = randomUUID();
  productSqlite.prepare("INSERT INTO acceptance_campaigns (id, scope, target_consecutive_runs) VALUES (?, ?, ?)").run(id, scope, target);
  return campaignStatus(id);
}

export async function tickAcceptanceCampaign(campaignId: string, benchmarkId: string, solutionId?: string) {
  const campaign = rawCampaign(campaignId);
  if (!campaign || campaign.status !== "collecting") throw new Error("CAMPAIGN_NOT_COLLECTING");
  if (!benchmarksForScope(campaign.scope).includes(benchmarkId)) throw new Error("BENCHMARK_OUTSIDE_CAMPAIGN_SCOPE");
  const binding = validatedBenchmarkBinding(benchmarkId);
  if (!binding) throw new Error("BENCHMARK_NOT_BOUND");
  if (binding.status === "stale") throw new Error("BENCHMARK_BINDING_STALE");
  if (binding.status !== "ready") throw new Error("BENCHMARK_NOT_READY");
  if (solutionId && solutionId !== binding.solutionId) throw new Error("BENCHMARK_SOLUTION_MISMATCH");
  const report = await runUnattendedAcceptance(binding.solutionId);
  productSqlite.transaction(() => {
    productSqlite.prepare("INSERT INTO acceptance_campaign_runs (campaign_id, acceptance_run_id, sequence_no, status, benchmark_id, benchmark_binding_id) VALUES (?, ?, ?, ?, ?, ?)").run(campaignId, report.runId, campaign.totalRuns + 1, report.status, benchmarkId, binding.id);
    productSqlite.prepare(`UPDATE acceptance_campaigns SET total_runs = total_runs + 1,
      passed_runs = passed_runs + ?, consecutive_passes = CASE WHEN ? = 1 THEN consecutive_passes + 1 ELSE 0 END,
      last_run_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(report.status === "passed" ? 1 : 0, report.status === "passed" ? 1 : 0, report.runId, campaignId);
  })();
  finalizeIfReady(campaignId);
  return { campaign: campaignStatus(campaignId), run: report };
}

export function recordFaultEvidence(campaignId: string, input: { faultCode: string; passed: boolean; observedErrorCode: string; recoveryAction: string; evidence: unknown }) {
  if (!requiredFaults.includes(input.faultCode as any)) throw new Error("INVALID_FAULT_CODE");
  if (!rawCampaign(campaignId)) throw new Error("CAMPAIGN_NOT_FOUND");
  if (!/^[A-Z0-9_]{3,80}$/.test(input.observedErrorCode) || !/^[a-z0-9_]{3,80}$/.test(input.recoveryAction)) throw new Error("INVALID_FAULT_EVIDENCE");
  const evidence = input.evidence as { mode?: unknown; assertions?: unknown } | null;
  if (!evidence || evidence.mode !== "isolated_runtime" || !evidence.assertions || typeof evidence.assertions !== "object") throw new Error("INVALID_FAULT_EVIDENCE_SCHEMA");
  const assertions = Object.values(evidence.assertions as Record<string, unknown>);
  if (!assertions.length || assertions.some((value) => typeof value !== "boolean") || input.passed !== assertions.every(Boolean)) throw new Error("FAULT_EVIDENCE_ASSERTION_MISMATCH");
  const evidenceHash = createHash("sha256").update(JSON.stringify(input.evidence ?? null)).digest("hex");
  productSqlite.prepare(`INSERT INTO acceptance_fault_evidence
    (campaign_id, fault_code, status, evidence_hash, observed_error_code, recovery_action) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(campaign_id, fault_code) DO UPDATE SET status = excluded.status, evidence_hash = excluded.evidence_hash,
    observed_error_code = excluded.observed_error_code, recovery_action = excluded.recovery_action, created_at = CURRENT_TIMESTAMP`).run(
      campaignId, input.faultCode, input.passed ? "passed" : "failed", evidenceHash, input.observedErrorCode, input.recoveryAction,
    );
  finalizeIfReady(campaignId);
  return campaignStatus(campaignId);
}

export function campaignStatus(id: string) {
  const campaign = rawCampaign(id);
  if (!campaign) return null;
  const scopedBenchmarks = benchmarksForScope(campaign.scope);
  const faults = productSqlite.prepare("SELECT fault_code AS faultCode, status, observed_error_code AS observedErrorCode, recovery_action AS recoveryAction, created_at AS createdAt FROM acceptance_fault_evidence WHERE campaign_id = ? ORDER BY fault_code").all(id) as Array<{ faultCode: string; status: string }>;
  const coveredBenchmarks = (productSqlite.prepare("SELECT DISTINCT benchmark_id AS benchmarkId FROM acceptance_campaign_runs WHERE campaign_id = ? AND status = 'passed' AND benchmark_id IS NOT NULL ORDER BY benchmark_id").all(id) as Array<{ benchmarkId: string }>).map((item) => item.benchmarkId);
  return {
    id: campaign.id, scope: campaign.scope, status: campaign.status, targetConsecutiveRuns: campaign.targetConsecutiveRuns,
    consecutivePasses: campaign.consecutivePasses, totalRuns: campaign.totalRuns, passedRuns: campaign.passedRuns,
    runPassRate: campaign.totalRuns ? campaign.passedRuns / campaign.totalRuns : 0,
    benchmarkCoverage: { covered: coveredBenchmarks.filter((benchmarkId) => scopedBenchmarks.includes(benchmarkId)).length, required: scopedBenchmarks.length, benchmarkIds: coveredBenchmarks.filter((benchmarkId) => scopedBenchmarks.includes(benchmarkId)), missing: scopedBenchmarks.filter((benchmarkId) => !coveredBenchmarks.includes(benchmarkId)) },
    requiredFaults: requiredFaults.map((code) => ({ code, passed: faults.some((fault) => fault.faultCode === code && fault.status === "passed") })),
    faultEvidence: faults, completedAt: campaign.completedAt,
  };
}

function finalizeIfReady(id: string) {
  const status = campaignStatus(id);
  if (!status) return;
  const ready = status.consecutivePasses >= status.targetConsecutiveRuns && status.runPassRate >= 0.95 && status.benchmarkCoverage.covered === status.benchmarkCoverage.required && status.requiredFaults.every((fault) => fault.passed);
  if (ready) productSqlite.prepare("UPDATE acceptance_campaigns SET status = 'passed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'collecting'").run(id);
}

function rawCampaign(id: string) {
  return productSqlite.prepare(`SELECT id, scope, status, target_consecutive_runs AS targetConsecutiveRuns, consecutive_passes AS consecutivePasses,
    total_runs AS totalRuns, passed_runs AS passedRuns, completed_at AS completedAt FROM acceptance_campaigns WHERE id = ?`).get(id) as any;
}

function benchmarksForScope(scope: string) {
  return scope === "pilot" ? pilotBenchmarks : requiredBenchmarks;
}
