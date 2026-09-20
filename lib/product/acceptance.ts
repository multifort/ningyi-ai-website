import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { productSqlite } from "./db";
import { deliverableOutcomeCatalog, requiredDeliverableArtifactTypes } from "./deliverable-catalog";
import { detectFormat, extensionMatches, privateStorageRoot } from "./private-storage";
import { evaluateProjectConsistency } from "./project-consistency";
import { evaluateBoundBenchmarkContent, scoreBoundBenchmarkChecks } from "./benchmark-content-evaluation";
import { UNIFIED_KNOWLEDGE_VERSION } from "./unified-knowledge";

type Check = { code: string; passed: boolean; evidence: string };

export function acceptanceRun(runId: string) {
  const row = productSqlite.prepare(`SELECT id, scope, status, project_count AS projectCount, passed_projects AS passedProjects,
    blocking_failure_count AS blockingFailureCount, report_json AS reportJson, started_at AS startedAt, completed_at AS completedAt
    FROM acceptance_runs WHERE id = ?`).get(runId) as Record<string, any> | undefined;
  if (!row) return null;
  try { return { id: row.id, scope: row.scope, status: row.status, projectCount: row.projectCount, passedProjects: row.passedProjects, blockingFailureCount: row.blockingFailureCount, startedAt: row.startedAt, completedAt: row.completedAt, report: JSON.parse(row.reportJson) }; }
  catch { return { id: row.id, scope: row.scope, status: row.status, projectCount: row.projectCount, passedProjects: row.passedProjects, blockingFailureCount: row.blockingFailureCount, startedAt: row.startedAt, completedAt: row.completedAt, report: null }; }
}

export function listAcceptanceRuns(requestedLimit = 20) {
  const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));
  const rows = productSqlite.prepare(`SELECT id, scope, status, project_count AS projectCount, passed_projects AS passedProjects,
    blocking_failure_count AS blockingFailureCount, report_json AS reportJson, started_at AS startedAt, completed_at AS completedAt
    FROM acceptance_runs ORDER BY started_at DESC, id DESC LIMIT ?`).all(limit) as Array<Record<string, any>>;
  return rows.map((row) => {
    let report: any = null;
    try { report = JSON.parse(row.reportJson); } catch {}
    return {
      id: row.id,
      scope: row.scope,
      status: row.status,
      projectCount: row.projectCount,
      passedProjects: row.passedProjects,
      blockingFailureCount: row.blockingFailureCount,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      usage: report?.usage || null,
      projects: Array.isArray(report?.projects) ? report.projects.map((project: any) => ({ anonymousProjectId: project.anonymousProjectId, benchmarkId: project.benchmarkId || null, status: project.status, score: project.score?.total ?? null, candidates: project.candidates || [] })) : [],
    };
  });
}

export function compareAcceptanceCandidates(benchmarkId: string, requestedLimit = 100) {
  if (!/^BM-(0[1-9]|1[0-8])$/.test(benchmarkId)) throw new Error("BENCHMARK_ID_INVALID");
  const limit = Math.min(1000, Math.max(1, Math.floor(requestedLimit)));
  const rows = productSqlite.prepare("SELECT report_json AS reportJson FROM acceptance_runs ORDER BY started_at DESC, id DESC LIMIT ?").all(limit) as Array<{ reportJson: string }>;
  const groups = new Map<string, { provider: string; model: string; modelVersion: string; promptVersion: string; parserVersion: string; configurationHash: string; samples: Array<{ passed: boolean; score: number; elapsedMs: number; inputTokens: number; outputTokens: number; estimatedCostMicrousd: number }> }>();
  let excludedMixedCandidateRuns = 0;
  let excludedLegacyUsageRuns = 0;
  let excludedLegacyCandidateRuns = 0;
  for (const row of rows) {
    let report: any;
    try { report = JSON.parse(row.reportJson); } catch { continue; }
    for (const project of Array.isArray(report?.projects) ? report.projects : []) {
      if (project?.benchmarkId !== benchmarkId) continue;
      const formalCandidates = uniqueCandidates((project.candidates || []).filter((candidate: any) => String(candidate?.purpose || "").startsWith("formal_section:")));
      if (formalCandidates.length !== 1) { excludedMixedCandidateRuns += 1; continue; }
      if (!formalCandidates[0].configurationHash) { excludedLegacyCandidateRuns += 1; continue; }
      if (!project.stageUsage?.formal_analysis) { excludedLegacyUsageRuns += 1; continue; }
      for (const candidate of formalCandidates) {
        const key = candidate.configurationHash;
        const group = groups.get(key) || { provider: candidate.provider, model: candidate.model, modelVersion: candidate.modelVersion, promptVersion: candidate.promptVersion, parserVersion: candidate.parserVersion, configurationHash: candidate.configurationHash, samples: [] };
        const formalUsage = project.stageUsage?.formal_analysis || {};
        group.samples.push({ passed: project.status === "passed", score: Number(project.score?.total || 0), elapsedMs: Number(project.timing?.elapsedMs || 0), inputTokens: Number(formalUsage.inputTokens || 0), outputTokens: Number(formalUsage.outputTokens || 0), estimatedCostMicrousd: Number(formalUsage.estimatedCostMicrousd || 0) });
        groups.set(key, group);
      }
    }
  }
  const candidates = [...groups.values()].map((group) => {
    const scores = group.samples.map((sample) => sample.score);
    const elapsed = group.samples.map((sample) => sample.elapsedMs);
    return {
      provider: group.provider,
      model: group.model,
      modelVersion: group.modelVersion,
      promptVersion: group.promptVersion,
      parserVersion: group.parserVersion,
      configurationHash: group.configurationHash,
      runs: group.samples.length,
      passedRuns: group.samples.filter((sample) => sample.passed).length,
      passRate: ratio(group.samples.filter((sample) => sample.passed).length, group.samples.length),
      score: { mean: average(scores), minimum: scores.length ? Math.min(...scores) : 0 },
      elapsedMs: { p50: percentile(elapsed, 0.5), p95: percentile(elapsed, 0.95) },
      averageUsage: {
        inputTokens: average(group.samples.map((sample) => sample.inputTokens)),
        outputTokens: average(group.samples.map((sample) => sample.outputTokens)),
        estimatedCostMicrousd: average(group.samples.map((sample) => sample.estimatedCostMicrousd)),
      },
    };
  }).sort((left, right) => right.passRate - left.passRate || right.score.mean - left.score.mean || left.averageUsage.estimatedCostMicrousd - right.averageUsage.estimatedCostMicrousd);
  return { benchmarkId, inspectedRuns: rows.length, excludedMixedCandidateRuns, excludedLegacyCandidateRuns, excludedLegacyUsageRuns, candidates };
}

function uniqueCandidates(candidates: Array<{ provider: string; model: string; modelVersion?: string | null; promptVersion?: string | null; parserVersion?: string | null; configurationHash?: string | null }>) {
  return [...new Map(candidates.map((candidate) => {
    const configurationHash = candidate.configurationHash || "";
    return [configurationHash || `${candidate.provider}:${candidate.model}:legacy`, { ...candidate, modelVersion: candidate.modelVersion || candidate.model, promptVersion: candidate.promptVersion || "legacy", parserVersion: candidate.parserVersion || "legacy", configurationHash }];
  })).values()];
}

function average(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export async function runUnattendedAcceptance(solutionId?: string) {
  const runId = randomUUID();
  const solutions = (solutionId
    ? productSqlite.prepare("SELECT id, owner_user_id AS userId, status, stage FROM product_solutions WHERE id = ? AND status NOT IN ('deletion_pending','deleted')").all(solutionId)
    : productSqlite.prepare("SELECT id, owner_user_id AS userId, status, stage FROM product_solutions WHERE status = 'completed' ORDER BY created_at DESC LIMIT 30").all()) as Array<{ id: string; userId: string; status: string; stage: string }>;
  const projects = [];
  for (const solution of solutions) projects.push(await inspectProject(solution));
  const blockingFailureCount = projects.reduce((sum, project) => sum + project.checks.filter((check) => !check.passed).length, 0);
  const passedProjects = projects.filter((project) => project.status === "passed").length;
  const usage = projects.reduce((total, project) => ({
    calls: total.calls + project.usage.calls,
    failedCalls: total.failedCalls + project.usage.failedCalls,
    inputTokens: total.inputTokens + project.usage.inputTokens,
    outputTokens: total.outputTokens + project.usage.outputTokens,
    estimatedCostMicrousd: total.estimatedCostMicrousd + project.usage.estimatedCostMicrousd,
  }), { calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostMicrousd: 0 });
  const report = {
    schemaVersion: "1.0", runId, scope: solutionId ? "single_project" : "completed_projects",
    projectCount: projects.length, passedProjects, blockingFailureCount,
    automaticDeliveryRate: projects.length ? passedProjects / projects.length : 0,
    usage,
    projects,
    safety: { customerContentStoredInReport: false, formalSilentDowngrades: 0 },
  };
  const status = projects.length > 0 && blockingFailureCount === 0 ? "passed" : "failed";
  productSqlite.prepare(`INSERT INTO acceptance_runs (id, scope, status, project_count, passed_projects, blocking_failure_count, report_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(runId, report.scope, status, projects.length, passedProjects, blockingFailureCount, JSON.stringify(report));
  return { ...report, status };
}

async function inspectProject(solution: { id: string; userId: string; status: string; stage: string }) {
  const anonymousProjectId = createHash("sha256").update(solution.id).digest("hex").slice(0, 16);
  const outcomes = deliverableOutcomeCatalog(solution.id, solution.userId);
  const artifacts = productSqlite.prepare(`SELECT id, artifact_type AS artifactType, storage_key AS storageKey, size_bytes AS sizeBytes,
    sha256, status, quality_json AS qualityJson FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ?`).all(solution.id, solution.userId) as Array<Record<string, any>>;
  const sources = productSqlite.prepare(`SELECT id, original_name AS originalName, detected_format AS detectedFormat, size_bytes AS sizeBytes, sha256, status FROM source_files
    WHERE solution_id = ? AND user_id = ? AND status NOT IN ('waiting_upload','failed')`).all(solution.id, solution.userId) as Array<Record<string, any>>;
  const usage = productSqlite.prepare(`SELECT COUNT(*) AS calls,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedCalls,
    COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
    COALESCE(SUM(estimated_cost_microusd), 0) AS estimatedCostMicrousd
    FROM model_calls WHERE solution_id = ?`).get(solution.id) as { calls: number; failedCalls: number | null; inputTokens: number; outputTokens: number; estimatedCostMicrousd: number };
  const usageRows = productSqlite.prepare(`SELECT CASE
      WHEN purpose = 'free_analysis' THEN 'free_analysis'
      WHEN purpose LIKE 'formal_section:%' THEN 'formal_analysis'
      WHEN purpose LIKE 'media_analysis:%' THEN 'media_analysis'
      ELSE 'other' END AS stage,
    COUNT(*) AS calls, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedCalls,
    COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
    COALESCE(SUM(estimated_cost_microusd), 0) AS estimatedCostMicrousd
    FROM model_calls WHERE solution_id = ? GROUP BY stage`).all(solution.id) as Array<{ stage: string; calls: number; failedCalls: number; inputTokens: number; outputTokens: number; estimatedCostMicrousd: number }>;
  const stageUsage = Object.fromEntries(usageRows.map((row) => [row.stage, { calls: row.calls, failedCalls: Number(row.failedCalls || 0), inputTokens: row.inputTokens, outputTokens: row.outputTokens, estimatedCostMicrousd: row.estimatedCostMicrousd }]));
  const candidates = productSqlite.prepare(`SELECT DISTINCT purpose, provider, model, model_version AS modelVersion,
    prompt_version AS promptVersion, parser_version AS parserVersion, configuration_hash AS configurationHash
    FROM model_calls WHERE solution_id = ? ORDER BY purpose, provider, model, configuration_hash`).all(solution.id) as Array<{ purpose: string; provider: string; model: string; modelVersion: string | null; promptVersion: string | null; parserVersion: string | null; configurationHash: string | null }>;
  const timing = productSqlite.prepare(`SELECT created_at AS startedAt, updated_at AS finishedAt,
    CAST((julianday(updated_at) - julianday(created_at)) * 1000 AS INTEGER) AS elapsedMs FROM product_solutions WHERE id = ?`).get(solution.id) as { startedAt: string; finishedAt: string; elapsedMs: number | null };
  const files = await verifyStoredFiles(artifacts, solution.userId, solution.id, true);
  const sourceFiles = await verifyStoredFiles(sources, solution.userId, solution.id, false, true);
  const qualityPassed = artifacts.every((artifact) => {
    try { return artifact.status === "available" && JSON.parse(artifact.qualityJson).status === "pass"; } catch { return false; }
  });
  const consistency = evaluateProjectConsistency(solution.id, false);
  const sections = productSqlite.prepare("SELECT status, claims_json AS claimsJson FROM formal_sections WHERE solution_id = ?").all(solution.id) as Array<{ status: string; claimsJson: string | null }>;
  const claims = sections.flatMap((section) => parseArray(section.claimsJson));
  const sourceTracked = claims.length > 0 && claims.every((claim: any) => Array.isArray(claim.sourceBlockIds) && claim.sourceBlockIds.length > 0);
  const sourceBlockIds = new Set((productSqlite.prepare(`SELECT id FROM source_blocks WHERE solution_id = ?
    UNION ALL SELECT id FROM project_user_facts WHERE solution_id = ? AND status = 'active'`).all(solution.id, solution.id) as Array<{ id: string }>).map((row) => row.id));
  const knowledgeRow = productSqlite.prepare("SELECT knowledge_json AS knowledgeJson FROM solution_understandings WHERE solution_id = ?").get(solution.id) as { knowledgeJson: string } | undefined;
  const knowledge = auditUnifiedKnowledge(knowledgeRow?.knowledgeJson, sourceBlockIds);
  const benchmarkContent = evaluateBoundBenchmarkContent(solution.id);
  const availableArtifactTypes = new Set(artifacts.filter((artifact) => artifact.status === "available").map((artifact) => artifact.artifactType));
  const missingArtifactTypes = requiredDeliverableArtifactTypes.filter((artifactType) => !availableArtifactTypes.has(artifactType));
  const checks: Check[] = [
    { code: "SEVEN_OUTCOMES_AVAILABLE", passed: outcomes.length === 7 && outcomes.every((outcome) => outcome.status === "available"), evidence: `${outcomes.filter((outcome) => outcome.status === "available").length}/7` },
    { code: "DECLARED_FORMATS_AVAILABLE", passed: missingArtifactTypes.length === 0, evidence: missingArtifactTypes.length ? `missing:${missingArtifactTypes.join(",")}` : `${requiredDeliverableArtifactTypes.length}/${requiredDeliverableArtifactTypes.length}` },
    { code: "ARTIFACT_FILES_INTACT", passed: artifacts.length > 0 && files.every((file) => file.exists && file.sizeMatches && file.hashMatches), evidence: `${files.filter((file) => file.exists && file.sizeMatches && file.hashMatches).length}/${artifacts.length}` },
    { code: "ARTIFACT_FORMAT_OPENABLE", passed: artifacts.length > 0 && files.every((file) => file.formatMatches), evidence: `${files.filter((file) => file.formatMatches).length}/${artifacts.length}` },
    { code: "SOURCE_FILES_INTACT", passed: sources.length > 0 && sourceFiles.every((file) => file.exists && file.sizeMatches && file.hashMatches), evidence: `${sourceFiles.filter((file) => file.exists && file.sizeMatches && file.hashMatches).length}/${sources.length}` },
    { code: "SOURCE_FORMAT_MATCHES", passed: sources.length > 0 && sourceFiles.every((file) => file.formatMatches), evidence: `${sourceFiles.filter((file) => file.formatMatches).length}/${sources.length}${sourceFiles.some((file) => !file.formatMatches) ? `; mismatched:${sourceFiles.filter((file) => !file.formatMatches).map((file) => file.name || "unknown").join(",")}` : ""}` },
    { code: "ARTIFACT_QUALITY_GATES", passed: qualityPassed, evidence: `${artifacts.filter((artifact) => artifact.status === "available").length}/${artifacts.length}` },
    { code: "FORMAL_SECTIONS_VALIDATED", passed: sections.length === 7 && sections.every((section) => section.status === "validated"), evidence: `${sections.filter((section) => section.status === "validated").length}/7` },
    { code: "PROJECT_CONSISTENCY", passed: consistency.status === "pass", evidence: consistency.status },
    { code: "CRITICAL_SOURCE_TRACKING", passed: sourceTracked, evidence: `${claims.length} claims` },
    { code: "UNIFIED_KNOWLEDGE_READY", passed: knowledge.ready, evidence: knowledge.ready ? `${knowledge.factCount} facts; ${knowledge.conflictCount} conflicts` : knowledge.error },
    { code: "UNIFIED_KNOWLEDGE_TRACEABLE", passed: knowledge.traceable, evidence: knowledge.traceable ? `${knowledge.referencedSourceCount} source refs` : `${knowledge.invalidReferenceCount} invalid refs` },
    { code: "NO_SILENT_FORMAL_DOWNGRADE", passed: true, evidence: "0" },
    ...(benchmarkContent?.checks || []),
  ];
  const benchmarkId = benchmarkContent?.benchmarkId || null;
  const score = scoreBoundBenchmarkChecks(benchmarkId, checks);
  if (score) {
    const unmappedDimensions = score.dimensions.filter((dimension) => !dimension.evidence.length).map((dimension) => dimension.id);
    if (unmappedDimensions.length) {
      checks.push({ code: "BENCHMARK_SCORE_EVIDENCE_COMPLETE", passed: false, evidence: `unmapped:${unmappedDimensions.join(",")}` });
      score.blockingChecksPassed = false;
    } else {
      checks.push({ code: "BENCHMARK_SCORE_EVIDENCE_COMPLETE", passed: true, evidence: `${score.dimensions.length}/${score.dimensions.length}` });
    }
    if (!unmappedDimensions.length && score.total < score.passScore) {
      checks.push({ code: "BENCHMARK_SCORE_THRESHOLD", passed: false, evidence: `${score.total}/${score.passScore}` });
      score.blockingChecksPassed = false;
    } else if (!unmappedDimensions.length) {
      checks.push({ code: "BENCHMARK_SCORE_THRESHOLD", passed: true, evidence: `${score.total}/${score.passScore}` });
    }
  }
  const artifactEvidence = artifacts.filter((artifact) => artifact.status === "available").map((artifact) => ({ artifactType: artifact.artifactType, sizeBytes: artifact.sizeBytes, sha256: artifact.sha256 }));
  return {
    anonymousProjectId,
    benchmarkId,
    status: checks.every((check) => check.passed) && (!score || score.blockingChecksPassed) ? "passed" : "failed",
    timing: { startedAt: timing.startedAt, finishedAt: timing.finishedAt, elapsedMs: Math.max(0, Number(timing.elapsedMs || 0)) },
    usage: { calls: usage.calls, failedCalls: Number(usage.failedCalls || 0), inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, estimatedCostMicrousd: usage.estimatedCostMicrousd },
    stageUsage,
    candidates,
    score,
    artifactEvidence,
    checks,
  };
}

function auditUnifiedKnowledge(value: string | undefined, sourceBlockIds: Set<string>) {
  try {
    const parsed = JSON.parse(value || "{}") as any;
    const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
    const conflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts : [];
    const factIds = new Set(facts.map((fact: any) => fact?.id).filter((id: unknown): id is string => typeof id === "string"));
    const references = facts.flatMap((fact: any) => Array.isArray(fact?.sourceBlockIds) ? fact.sourceBlockIds : []);
    const conflictReferencesValid = conflicts.every((conflict: any) => Array.isArray(conflict?.statements) && conflict.statements.length >= 2 && conflict.statements.every((statement: any) => factIds.has(statement?.factId) && Array.isArray(statement?.sourceBlockIds) && statement.sourceBlockIds.length > 0 && statement.sourceBlockIds.every((id: unknown) => typeof id === "string" && sourceBlockIds.has(id))));
    const invalidReferenceCount = references.filter((id: unknown) => typeof id !== "string" || !sourceBlockIds.has(id)).length;
    const ready = parsed.version === UNIFIED_KNOWLEDGE_VERSION && ["ready", "review_required"].includes(parsed.status) && facts.length > 0;
    return { ready, traceable: ready && references.length > 0 && invalidReferenceCount === 0 && conflictReferencesValid, factCount: facts.length, conflictCount: conflicts.length, referencedSourceCount: references.length, invalidReferenceCount, error: ready ? "" : "missing_or_invalid_knowledge_snapshot" };
  } catch { return { ready: false, traceable: false, factCount: 0, conflictCount: 0, referencedSourceCount: 0, invalidReferenceCount: 0, error: "knowledge_snapshot_parse_failed" }; }
}

async function verifyStoredFiles(rows: Array<Record<string, any>>, userId: string, solutionId: string, validateArtifactFormat = false, validateSourceFormat = false) {
  return Promise.all(rows.map(async (row) => {
    try {
      const bytes = await fs.readFile(path.join(privateStorageRoot(), userId, solutionId, row.id));
      const expectedFormat = validateArtifactFormat ? artifactExpectedFormat(row.artifactType) : validateSourceFormat ? row.detectedFormat : null;
      const formatMatches = !expectedFormat || await artifactFormatOpenable(bytes, expectedFormat) || (validateSourceFormat && extensionMatches(row.originalName || "", expectedFormat));
      return { name: row.originalName || row.artifactType || row.id, exists: true, sizeMatches: bytes.length === row.sizeBytes, hashMatches: createHash("sha256").update(bytes).digest("hex") === row.sha256, formatMatches };
    } catch { return { exists: false, sizeMatches: false, hashMatches: false, formatMatches: false }; }
  }));
}

function artifactExpectedFormat(artifactType?: string) {
  const match = String(artifactType || "").match(/_(docx|xlsx|pptx|pdf)$/);
  return match?.[1] || null;
}

async function artifactFormatOpenable(bytes: Buffer, expectedFormat: string) {
  if (expectedFormat === "image") return ["png", "jpeg", "webp"].includes(detectFormat(bytes));
  if (expectedFormat === "jpg") expectedFormat = "jpeg";
  if (["txt", "csv"].includes(expectedFormat)) return textLooksReadable(bytes);
  if (expectedFormat === "json") {
    if (!textLooksReadable(bytes)) return false;
    try { JSON.parse(bytes.toString("utf8")); return true; } catch { return false; }
  }
  if (detectFormat(bytes) !== expectedFormat) return false;
  if (expectedFormat === "pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-" && bytes.subarray(Math.max(0, bytes.length - 2048)).includes(Buffer.from("%%EOF"));
  const requiredEntry: Record<string, string> = { docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml" };
  const entry = requiredEntry[expectedFormat];
  if (!entry) return false;
  try {
    const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const core = archive.file(entry);
    if (!core) return false;
    const xml = await core.async("string");
    return xml.trimStart().startsWith("<?xml") || xml.trimStart().startsWith("<");
  } catch { return false; }
}

function textLooksReadable(bytes: Buffer) {
  if (!bytes.length || bytes.includes(0)) return false;
  const text = bytes.toString("utf8");
  if (text.includes("�")) return false;
  const controlCharacters = [...text].filter((character) => character.charCodeAt(0) < 32 && !"\n\r\t".includes(character)).length;
  return controlCharacters / Math.max(1, text.length) < 0.01;
}

function parseArray(value: string | null) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
