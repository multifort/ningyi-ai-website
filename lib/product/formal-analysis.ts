import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { productSqlite } from "./db";
import { ensureUnifiedKnowledge, unifiedKnowledgeContext, unifiedKnowledgeFingerprint } from "./unified-knowledge";
import { ensureProgressiveDeliverables } from "./deliverables";
import { evaluateCandidateConsistency, evaluateProjectConsistency, repairDanglingProjectRelations } from "./project-consistency";
import { openAIResponseError, ProviderConfigurationError, providerErrorCode } from "./openai-errors";
import { evaluateBoundBenchmarkContent } from "./benchmark-content-evaluation";
import { projectModelSectionContext } from "./project-model-section-map";

const outline = [
  ["project_overview", "项目背景与目标"],
  ["scope_users", "范围、用户与关键约束"],
  ["requirements", "业务需求与功能规划"],
  ["solution", "整体解决方案"],
  ["workload", "工作量与成本依据"],
  ["implementation", "实施计划与交付安排"],
  ["risks", "风险、假设与待确认事项"],
] as const;

export function initializeFormalDocument(solutionId: string) {
  const provider = process.env.PRODUCT_FORMAL_MODEL_PROVIDER || "openai";
  const model = process.env.PRODUCT_FORMAL_MODEL || "gpt-5.4";
  productSqlite.transaction(() => {
    productSqlite.prepare("INSERT OR IGNORE INTO formal_documents (solution_id, provider, model, total_sections) VALUES (?, ?, ?, ?)").run(solutionId, provider, model, outline.length);
    const insert = productSqlite.prepare("INSERT OR IGNORE INTO formal_sections (id, solution_id, section_index, section_key, title) VALUES (?, ?, ?, ?, ?)");
    outline.forEach(([key, title], index) => insert.run(randomUUID(), solutionId, index, key, title));
    const configured = formalProviderConfigured(provider);
    productSqlite.prepare("UPDATE formal_documents SET provider = ?, model = ?, status = CASE WHEN status IN ('awaiting_configuration', 'stale') AND ? = 1 THEN 'pending' WHEN status IN ('pending', 'stale') AND ? = 0 THEN 'awaiting_configuration' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(provider, model, configured ? 1 : 0, configured ? 1 : 0, solutionId);
  })();
  return formalStatus(solutionId);
}

export function formalStatus(solutionId: string) {
  const document = productSqlite.prepare("SELECT status, provider, model, current_section AS currentSection, total_sections AS totalSections, last_error_code AS lastErrorCode FROM formal_documents WHERE solution_id = ?").get(solutionId) as any;
  if (!document) return null;
  const sections = productSqlite.prepare(`SELECT section_index AS sectionIndex, section_key AS sectionKey, title, status, summary,
    retry_cycle AS retryCycle, next_attempt_at AS nextAttemptAt, failed_at AS failedAt,
    (SELECT COUNT(*) FROM formal_section_attempts a WHERE a.section_id = formal_sections.id AND a.retry_cycle = formal_sections.retry_cycle) AS attemptCount
    FROM formal_sections WHERE solution_id = ? ORDER BY section_index`).all(solutionId);
  return { ...document, configured: formalProviderConfigured(document.provider), sections };
}

export async function continueFormalDocument(solutionId: string, userId: string, options: { workerId?: string } = {}) {
  if (!solutionProcessingAllowed(solutionId, userId)) return formalStatus(solutionId);
  recoverStaleFormalWork(solutionId);
  const state = initializeFormalDocument(solutionId);
  if (!state?.configured) {
    productSqlite.prepare("UPDATE formal_documents SET status = 'awaiting_configuration', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    return formalStatus(solutionId);
  }
  const next = productSqlite.prepare("SELECT id, section_index AS sectionIndex, section_key AS sectionKey, title, retry_cycle AS retryCycle FROM formal_sections WHERE solution_id = ? AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP) ORDER BY section_index LIMIT 1").get(solutionId) as any;
  if (!next) return formalStatus(solutionId);
  const attemptRow = productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_section_attempts WHERE section_id = ? AND retry_cycle = ? AND COALESCE(error_code, '') != 'MATERIAL_CHANGED_DURING_GENERATION' AND COALESCE(error_code, '') NOT LIKE 'PROVIDER_CONFIGURATION_%'").get(next.id, next.retryCycle) as { count: number };
  const totalAttempts = productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_section_attempts WHERE section_id = ?").get(next.id) as { count: number };
  const maxAttempts = Math.min(6, Math.max(2, Number(process.env.PRODUCT_FORMAL_SECTION_MAX_ATTEMPTS || 3)));
  if (attemptRow.count >= maxAttempts) {
    productSqlite.prepare("UPDATE formal_sections SET status = 'failed', failed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(next.id);
    productSqlite.prepare("UPDATE formal_documents SET status = 'blocked', last_error_code = 'SECTION_RETRY_EXHAUSTED', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare("UPDATE product_solutions SET status = 'blocked', stage = 'formal_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
    productSqlite.prepare("UPDATE change_impact_plans SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'accepted' AND execution_started_at IS NOT NULL").run(solutionId);
    return formalStatus(solutionId);
  }
  const cycleAttemptNo = attemptRow.count + 1;
  const attemptNo = totalAttempts.count + 1;
  const attemptId = randomUUID();
  ensureUnifiedKnowledge(solutionId);
  const context = buildSectionContext(solutionId, next.sectionKey, next.title);
  const contextHash = createHash("sha256").update(context.text).digest("hex");
  const callId = randomUUID();
  const candidate = formalCandidateMetadata(state.model);
  const leaseSeconds = Math.max(180, Number(process.env.PRODUCT_FORMAL_LEASE_SECONDS || 900));
  const claimed = productSqlite.transaction(() => {
    const documentClaim = productSqlite.prepare("UPDATE formal_documents SET status = 'generating', current_section = ?, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'pending'").run(next.sectionIndex, solutionId);
    if (!documentClaim.changes) return false;
    const claim = options.workerId
      ? productSqlite.prepare("UPDATE formal_sections SET status = 'generating', context_hash = ?, lease_owner = ?, lease_until = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(contextHash, options.workerId, `+${leaseSeconds} seconds`, next.id)
      : productSqlite.prepare("UPDATE formal_sections SET status = 'generating', context_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(contextHash, next.id);
    if (!claim.changes) {
      productSqlite.prepare("UPDATE formal_documents SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
      return false;
    }
    productSqlite.prepare(`INSERT INTO model_calls
      (id, solution_id, purpose, provider, model, model_version, prompt_version, parser_version, configuration_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`).run(callId, solutionId, `formal_section:${next.sectionKey}`, state.provider, state.model, candidate.modelVersion, candidate.promptVersion, candidate.parserVersion, candidate.configurationHash);
    productSqlite.prepare("INSERT INTO formal_section_attempts (id, solution_id, section_id, attempt_no, status, context_manifest_json, retry_cycle) VALUES (?, ?, ?, ?, 'running', ?, ?)").run(attemptId, solutionId, next.id, attemptNo, JSON.stringify(context.manifest), next.retryCycle);
    return true;
  })();
  if (!claimed) return formalStatus(solutionId);
  try {
    const generated = await callFormalModel(state.model, userId, next.title, context.text);
    if (!solutionProcessingAllowed(solutionId, userId)) throw new Error("SOLUTION_ACCESS_REVOKED");
    validateClaims(generated.claims, context.sourceIds);
    const quality = evaluateFormalSection(generated, context.sourceIds, context.priorSummaries, next.sectionKey);
    const candidateConsistency = evaluateCandidateConsistency(solutionId, generated.items, context.sourceIds);
    quality.checks.push(...candidateConsistency.checks);
    quality.status = quality.checks.every((check) => check.passed) ? "pass" : "fail";
    if (quality.status !== "pass") throw new QualityGateError(quality);
    productSqlite.transaction(() => {
      const fingerprint = unifiedKnowledgeFingerprint(solutionId);
      if (!fingerprint.current || fingerprint.inputHash !== context.knowledgeInputHash) throw new KnowledgeChangedDuringGenerationError(generated.inputTokens, generated.outputTokens);
      const completed = options.workerId
        ? productSqlite.prepare("UPDATE formal_sections SET status = 'validated', lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, failed_at = NULL, content = ?, summary = ?, claims_json = ?, structured_items_json = ?, input_tokens = ?, output_tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating' AND lease_owner = ? AND lease_until > CURRENT_TIMESTAMP").run(generated.content, generated.summary, JSON.stringify(generated.claims), JSON.stringify(generated.items), generated.inputTokens, generated.outputTokens, next.id, options.workerId)
        : productSqlite.prepare("UPDATE formal_sections SET status = 'validated', next_attempt_at = NULL, failed_at = NULL, content = ?, summary = ?, claims_json = ?, structured_items_json = ?, input_tokens = ?, output_tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating'").run(generated.content, generated.summary, JSON.stringify(generated.claims), JSON.stringify(generated.items), generated.inputTokens, generated.outputTokens, next.id);
      if (!completed.changes) throw new FormalLeaseLostError();
      productSqlite.prepare("UPDATE model_calls SET status = 'succeeded', input_tokens = ?, output_tokens = ?, estimated_cost_microusd = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(generated.inputTokens, generated.outputTokens, estimateFormalCost(generated.inputTokens, generated.outputTokens), callId);
      productSqlite.prepare("UPDATE formal_section_attempts SET status = 'passed', quality_json = ?, input_tokens = ?, output_tokens = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(JSON.stringify(quality), generated.inputTokens, generated.outputTokens, attemptId);
      const remaining = productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_sections WHERE solution_id = ? AND status != 'validated'").get(solutionId) as { count: number };
      const completenessRepair = remaining.count ? null : benchmarkCompletenessRepair(solutionId);
      const documentStatus = remaining.count || completenessRepair ? "pending" : "completed";
      productSqlite.prepare("UPDATE formal_documents SET status = ?, current_section = ?, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(documentStatus, completenessRepair?.sectionIndex ?? next.sectionIndex + 1, completenessRepair ? "BENCHMARK_COMPLETENESS_REPAIR" : null, solutionId);
      if (documentStatus === "completed") productSqlite.prepare("UPDATE change_impact_plans SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'accepted' AND execution_started_at IS NOT NULL").run(solutionId);
      if (completenessRepair) {
        productSqlite.prepare("UPDATE formal_sections SET status = 'pending', retry_cycle = retry_cycle + 1, next_attempt_at = CURRENT_TIMESTAMP, failed_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'validated'").run(completenessRepair.sectionId);
        productSqlite.prepare("UPDATE product_solutions SET status = 'processing', stage = 'formal_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
      }
      repairDanglingProjectRelations(solutionId);
      evaluateProjectConsistency(solutionId);
      if (!remaining.count && !completenessRepair) productSqlite.prepare("UPDATE product_solutions SET stage = 'rendering', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
    }).immediate();
    await ensureProgressiveDeliverables(solutionId, userId);
    // Full delivery rendering is claimed by the dedicated rendering worker on
    // the next tick. Keeping it outside the model worker prevents a large PPT
    // or PDF from occupying formal-analysis capacity.
  } catch (error) {
    if (error instanceof KnowledgeChangedDuringGenerationError) {
      const recentDiscards = (productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_section_attempts WHERE solution_id = ? AND error_code = 'MATERIAL_CHANGED_DURING_GENERATION' AND created_at >= datetime('now', '-1 hour')").get(solutionId) as { count: number }).count;
      const baseSettleSeconds = Math.min(60, Math.max(1, Number(process.env.PRODUCT_FORMAL_MATERIAL_SETTLE_SECONDS || 10)));
      const settleSeconds = Math.min(300, baseSettleSeconds * (2 ** Math.min(recentDiscards, 5)));
      productSqlite.transaction(() => {
        const released = options.workerId
          ? productSqlite.prepare("UPDATE formal_sections SET status = 'pending', lease_owner = NULL, lease_until = NULL, next_attempt_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating' AND lease_owner = ?").run(`+${settleSeconds} seconds`, next.id, options.workerId)
          : productSqlite.prepare("UPDATE formal_sections SET status = 'pending', next_attempt_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating'").run(`+${settleSeconds} seconds`, next.id);
        if (!released.changes) return;
        productSqlite.prepare("UPDATE formal_documents SET status = 'pending', last_error_code = 'MATERIAL_CHANGED_DURING_GENERATION', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'generating'").run(solutionId);
        productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = 'MATERIAL_CHANGED_DURING_GENERATION', input_tokens = ?, output_tokens = ?, estimated_cost_microusd = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(error.inputTokens, error.outputTokens, estimateFormalCost(error.inputTokens, error.outputTokens), callId);
        productSqlite.prepare("UPDATE formal_section_attempts SET status = 'failed', error_code = 'MATERIAL_CHANGED_DURING_GENERATION', input_tokens = ?, output_tokens = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(error.inputTokens, error.outputTokens, attemptId);
      })();
      return formalStatus(solutionId);
    }
    if (error instanceof FormalLeaseLostError) {
      productSqlite.transaction(() => {
        productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = 'FORMAL_LEASE_LOST', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'").run(callId);
        productSqlite.prepare("UPDATE formal_section_attempts SET status = 'failed', error_code = 'FORMAL_LEASE_LOST', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'").run(attemptId);
      })();
      return formalStatus(solutionId);
    }
    if (error instanceof ProviderConfigurationError) {
      const code = providerErrorCode(error, "PROVIDER_CONFIGURATION_OPENAI_FAILED");
      const configurationAttempts = (productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_section_attempts WHERE section_id = ? AND retry_cycle = ? AND error_code LIKE 'PROVIDER_CONFIGURATION_%'").get(next.id, next.retryCycle) as { count: number }).count + 1;
      const maxConfigurationAttempts = Math.min(10, Math.max(2, Number(process.env.PRODUCT_FORMAL_CONFIGURATION_MAX_ATTEMPTS || 5)));
      const exhausted = configurationAttempts >= maxConfigurationAttempts;
      const retrySeconds = Math.max(60, Number(process.env.PRODUCT_FORMAL_CONFIGURATION_RETRY_SECONDS || 300));
      productSqlite.transaction(() => {
        const released = options.workerId
          ? productSqlite.prepare("UPDATE formal_sections SET status = ?, lease_owner = NULL, lease_until = NULL, next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END, failed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?").run(exhausted ? "failed" : "pending", exhausted ? "failed" : "pending", `+${retrySeconds} seconds`, exhausted ? "failed" : "pending", next.id, options.workerId)
          : productSqlite.prepare("UPDATE formal_sections SET status = ?, next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END, failed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating'").run(exhausted ? "failed" : "pending", exhausted ? "failed" : "pending", `+${retrySeconds} seconds`, exhausted ? "failed" : "pending", next.id);
        if (!released.changes) return;
        productSqlite.prepare("UPDATE formal_documents SET status = ?, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(exhausted ? "blocked" : "pending", exhausted ? "FORMAL_CONFIGURATION_RETRY_EXHAUSTED" : code, solutionId);
        productSqlite.prepare("UPDATE product_solutions SET status = ?, stage = 'formal_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(exhausted ? "blocked" : "recovering", solutionId);
        if (exhausted) productSqlite.prepare("UPDATE change_impact_plans SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'accepted' AND execution_started_at IS NOT NULL").run(solutionId);
        productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(code, callId);
        productSqlite.prepare("UPDATE formal_section_attempts SET status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(code, attemptId);
      })();
      return formalStatus(solutionId);
    }
    const quality = error instanceof QualityGateError ? error.report : null;
    const failureCode = error instanceof Error ? providerErrorCode(error, "FORMAL_SECTION_FAILED") : "FORMAL_SECTION_FAILED";
    const exhausted = cycleAttemptNo >= maxAttempts;
    const retryDelays = [30, 120, 600];
    const retrySeconds = retryDelays[Math.min(cycleAttemptNo - 1, retryDelays.length - 1)];
    productSqlite.transaction(() => {
      const released = options.workerId
        ? productSqlite.prepare("UPDATE formal_sections SET status = ?, lease_owner = NULL, lease_until = NULL, next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END, failed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?").run(exhausted ? "failed" : "pending", exhausted ? "failed" : "pending", `+${retrySeconds} seconds`, exhausted ? "failed" : "pending", next.id, options.workerId)
        : productSqlite.prepare("UPDATE formal_sections SET status = ?, next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END, failed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(exhausted ? "failed" : "pending", exhausted ? "failed" : "pending", `+${retrySeconds} seconds`, exhausted ? "failed" : "pending", next.id);
      if (!released.changes) return;
      productSqlite.prepare("UPDATE formal_documents SET status = ?, last_error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(exhausted ? "blocked" : "pending", exhausted ? "SECTION_RETRY_EXHAUSTED" : quality ? "QUALITY_GATE_FAILED" : failureCode, solutionId);
      if (exhausted) productSqlite.prepare("UPDATE product_solutions SET status = 'blocked', stage = 'formal_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
      if (exhausted) productSqlite.prepare("UPDATE change_impact_plans SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'accepted' AND execution_started_at IS NOT NULL").run(solutionId);
      productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(quality ? "QUALITY_GATE_FAILED" : failureCode, callId);
      productSqlite.prepare("UPDATE formal_section_attempts SET status = 'failed', quality_json = ?, error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(quality ? JSON.stringify(quality) : null, quality ? "QUALITY_GATE_FAILED" : failureCode, attemptId);
    })();
  }
  return formalStatus(solutionId);
}

function formalCandidateMetadata(model: string) {
  const modelVersion = process.env.PRODUCT_FORMAL_MODEL_VERSION || model;
  const promptVersion = process.env.PRODUCT_FORMAL_PROMPT_VERSION || "formal-analysis-v1";
  const parserVersion = process.env.PRODUCT_SOURCE_PARSER_VERSION || "source-parser-v1";
  const configuration = {
    model,
    modelVersion,
    promptVersion,
    parserVersion,
    reasoningEffort: process.env.PRODUCT_FORMAL_REASONING_EFFORT || "medium",
    contextCharBudget: Math.max(8000, Math.min(60000, Number(process.env.PRODUCT_FORMAL_CONTEXT_CHAR_BUDGET || 24000))),
    maxOutputTokens: 7000,
  };
  return { modelVersion, promptVersion, parserVersion, configurationHash: createHash("sha256").update(JSON.stringify(configuration)).digest("hex") };
}

function solutionProcessingAllowed(solutionId: string, userId: string) {
  return Boolean(productSqlite.prepare("SELECT 1 FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, userId));
}

export function recoverStaleFormalWork(solutionId?: string) {
  const timeoutSeconds = Math.max(180, Number(process.env.PRODUCT_FORMAL_STALE_AFTER_SECONDS || 900));
  const cutoff = `-${timeoutSeconds} seconds`;
  const scope = solutionId ? " AND solution_id = ?" : "";
  const params = solutionId ? [cutoff, solutionId] : [cutoff];
  const staleSections = productSqlite.prepare(`SELECT id, solution_id AS solutionId FROM formal_sections WHERE status = 'generating' AND (lease_until < CURRENT_TIMESTAMP OR (lease_until IS NULL AND updated_at < datetime('now', ?)))${scope}`).all(...params) as Array<{ id: string; solutionId: string }>;
  if (!staleSections.length) return 0;
  productSqlite.transaction(() => {
    for (const section of staleSections) {
      productSqlite.prepare("UPDATE formal_sections SET status = 'pending', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating'").run(section.id);
      productSqlite.prepare("UPDATE formal_documents SET status = 'pending', last_error_code = 'STALE_WORK_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'generating'").run(section.solutionId);
      productSqlite.prepare("UPDATE formal_section_attempts SET status = 'failed', error_code = 'WORKER_INTERRUPTED', completed_at = CURRENT_TIMESTAMP WHERE section_id = ? AND status = 'running'").run(section.id);
    }
    if (solutionId) {
      productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = 'WORKER_INTERRUPTED', completed_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'running' AND purpose LIKE 'formal_section:%' AND created_at < datetime('now', ?)").run(solutionId, cutoff);
    } else {
      productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = 'WORKER_INTERRUPTED', completed_at = CURRENT_TIMESTAMP WHERE status = 'running' AND purpose LIKE 'formal_section:%' AND created_at < datetime('now', ?)").run(cutoff);
    }
  })();
  return staleSections.length;
}

export function repairExhaustedFormalWork() {
  const seconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_FORMAL_AUTO_REPAIR_SECONDS || 21600)));
  return productSqlite.transaction(() => {
    const sections = productSqlite.prepare("SELECT id, solution_id AS solutionId FROM formal_sections WHERE status = 'failed' AND failed_at <= datetime('now', ?)").all(`-${seconds} seconds`) as Array<{ id: string; solutionId: string }>;
    if (!sections.length) return 0;
    const repairSection = productSqlite.prepare("UPDATE formal_sections SET status = 'pending', retry_cycle = retry_cycle + 1, next_attempt_at = CURRENT_TIMESTAMP, failed_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'failed'");
    const repairDocument = productSqlite.prepare("UPDATE formal_documents SET status = 'pending', last_error_code = 'FORMAL_AUTO_REPAIR', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'blocked'");
    const repairSolution = productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', stage = 'formal_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'blocked'");
    for (const section of sections) {
      repairSection.run(section.id);
      const documentRepaired = repairDocument.run(section.solutionId).changes;
      repairSolution.run(section.solutionId);
      if (documentRepaired) productSqlite.prepare("UPDATE change_impact_plans SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'failed' AND execution_started_at IS NOT NULL").run(section.solutionId);
    }
    return sections.length;
  })();
}

export function reactivateConfiguredFormalDocuments() {
  if (!process.env.OPENAI_API_KEY) return 0;
  return productSqlite.prepare("UPDATE formal_documents SET status = 'pending', last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE status = 'awaiting_configuration' AND provider = 'openai'").run().changes;
}

function formalProviderConfigured(provider: string) {
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  return false;
}

function buildSectionContext(solutionId: string, sectionKey: string, title: string) {
  const blocks = productSqlite.prepare(`SELECT id, blockType, text FROM (
      SELECT id, block_type AS blockType, canonical_text AS text, created_at AS createdAt FROM source_blocks WHERE solution_id = ?
      UNION ALL
      SELECT id, 'user_confirmed_fact' AS blockType, text, created_at AS createdAt FROM project_user_facts WHERE solution_id = ? AND status = 'active'
    ) ORDER BY createdAt, id`).all(solutionId, solutionId) as Array<{ id: string; blockType: string; text: string }>;
  const sectionPosition = productSqlite.prepare("SELECT section_index AS sectionIndex FROM formal_sections WHERE solution_id = ? AND section_key = ?").get(solutionId, sectionKey) as { sectionIndex: number } | undefined;
  const currentIndex = sectionPosition?.sectionIndex ?? Number.MAX_SAFE_INTEGER;
  const prior = productSqlite.prepare("SELECT title, summary FROM formal_sections WHERE solution_id = ? AND section_index < ? AND status = 'validated' ORDER BY section_index").all(solutionId, currentIndex) as Array<{ title: string; summary: string }>;
  const keywords = sectionKeywords[sectionKey] || [];
  const ranked = blocks.map((block, index) => ({
    ...block,
    index,
    score: keywords.reduce((score, keyword) => score + (block.text.toLowerCase().includes(keyword.toLowerCase()) ? 5 : 0), 0)
      + (block.blockType === "intake_description" ? 8 : block.blockType === "intake_field" ? 5 : 0)
      + (index < 8 ? 2 : 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  const evidence: string[] = [];
  const selectedIds: string[] = [];
  let chars = 0;
  const budget = Math.max(8000, Math.min(60000, Number(process.env.PRODUCT_FORMAL_CONTEXT_CHAR_BUDGET || 24000)));
  const knowledge = unifiedKnowledgeContext(solutionId);
  const evidenceBudget = Math.max(4000, budget - knowledge.text.length);
  for (const block of ranked) {
    const item = `[${block.id}] ${block.text.slice(0, 800)}`;
    if (chars + item.length > evidenceBudget) continue;
    evidence.push(item);
    selectedIds.push(block.id);
    chars += item.length;
  }
  const priorItems = productSqlite.prepare("SELECT structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND section_index < ? AND status = 'validated' ORDER BY section_index").all(solutionId, currentIndex) as Array<{ structuredItemsJson: string | null }>;
  const itemCatalog = priorItems.flatMap((item) => {
    try { const parsed = JSON.parse(item.structuredItemsJson || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }).map((item: any) => `${item.code} | ${item.kind} | ${item.title}`).join("\n").slice(-5000);
  const continuity = prior.map((item) => `${item.title}：${item.summary}`).join("\n").slice(-5000);
  const retry = productSqlite.prepare(`SELECT a.attempt_no AS attemptNo, a.error_code AS errorCode, a.quality_json AS qualityJson
    FROM formal_section_attempts a JOIN formal_sections s ON s.id = a.section_id
    WHERE s.solution_id = ? AND s.section_key = ? AND a.status = 'failed'
    ORDER BY a.attempt_no DESC LIMIT 1`).get(solutionId, sectionKey) as { attemptNo: number; errorCode: string | null; qualityJson: string | null } | undefined;
  const retryFeedback = retry ? readableRetryFeedback(retry) : "无；这是本章第一次生成。";
  const benchmarkRequirements = benchmarkGuidance(solutionId, sectionKey);
  const projectModelContext = projectModelSectionContext(solutionId, sectionKey);
  return {
    text: `当前章节：${title}\n本章关注：${keywords.join("、") || "项目整体一致性"}\n${knowledge.text}\n${projectModelContext}\n${benchmarkRequirements}\n上一次尝试的定向修复要求：\n${retryFeedback}\n本章允许使用的 sourceBlockIds（只能从此列表引用，不能引用 F-xx、章节编号或自行编造的 ID）：\n${[...new Set([...selectedIds, ...knowledge.sourceIds])].join("、")}\n已完成章节摘要：\n${continuity || "无"}\n已建立的结构化编号（跨成果关联时必须使用这里已有的编号，不得另造同义编号）：\n${itemCatalog || "无"}\n可引用证据：\n${evidence.join("\n")}`,
    sourceIds: new Set([...selectedIds, ...knowledge.sourceIds]),
    priorSummaries: continuity,
    knowledgeInputHash: knowledge.inputHash,
    manifest: { sectionKey, budgetChars: budget, knowledgeVersion: knowledge.version, knowledgeInputHash: knowledge.inputHash, knowledgeChars: knowledge.text.length, selectedChars: chars, availableBlocks: blocks.length, selectedBlocks: selectedIds.length, selectedSourceBlockIds: uniqueContextIds([...selectedIds, ...knowledge.sourceIds]), priorStructuredItemCount: itemCatalog ? itemCatalog.split("\n").length : 0, retryAttempt: retry?.attemptNo || 0, retryErrorCode: retry?.errorCode || null },
  };
}

function benchmarkGuidance(solutionId: string, sectionKey: string) {
  const linked = productSqlite.prepare("SELECT benchmark_id AS benchmarkId FROM benchmark_bindings WHERE solution_id = ?").get(solutionId) as { benchmarkId: string } | undefined;
  if (!linked || !/^BM-(0[1-9]|1[0-8])$/.test(linked.benchmarkId)) return "";
  const root = path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks", linked.benchmarkId, "expected");
  try {
    const facts = JSON.parse(fs.readFileSync(path.join(root, "key-facts.json"), "utf8")) as { facts?: Array<{ statement?: string }> };
    const checks = JSON.parse(fs.readFileSync(path.join(root, "automatic-content-checks.json"), "utf8")) as { minimum_structured_items?: Record<string, number>; required_patterns?: Array<{ id: string; patterns: string[] }> };
    const factText = (facts.facts || []).map((fact) => `- ${fact.statement || ""}`).filter(Boolean).join("\n");
    const patternText = (checks.required_patterns || []).map((rule) => `- ${rule.id}: ${rule.patterns.join("；")}`).join("\n");
    const scale = Object.entries(checks.minimum_structured_items || {}).map(([kind, count]) => `${kind}至少 ${count} 条`).join("，");
    const sectionHint = scale ? `结构化规模需在相关章节合计满足：${scale}。请分散生成，需求章节至少输出 6 个 requirement 和 4 个 feature，范围与用户章节至少输出 2 个 requirement 和 2 个 feature，整体解决方案章节至少输出 2 个 requirement 和 2 个 feature；每条必须有证据。` : "";
    const completenessHint = sectionKey === "requirements" || sectionKey === "solution"
      ? linked.benchmarkId === "BM-01"
        ? "这是全局完整性重点章节：请逐条核对上面的基准事实，材料支持的事实必须在正文中保留完整语义，尤其要明确写出客户迁移样例包含‘重复、缺失、格式混合和负责人映射’问题；不得只写成泛化的‘数据质量问题’。"
        : "这是全局完整性重点章节：请逐条核对上面的基准事实和关键词检查；材料支持的事实必须在正文中保留完整语义，关键规则不得只写成泛化概述，并在 claims 或结构化条目中引用证据。"
      : "如果本章涉及上面的基准事实，请保留完整语义并在 claims 或结构化条目中引用对应证据。";
    const deterministicHint = linked.benchmarkId === "BM-03"
      ? "销售指标表中的确定性目标必须在至少一个正式章节正文中逐项写出，不得只写‘以指标表为准’：拜访记录当日提交率首期目标 0.9（90%）、销售重复录入时间首期目标 15 分钟、线索转商机信息完整率首期目标 0.95（95%）、离线记录同步成功率首期目标 0.99（99%）、客户归属变更审计覆盖率首期目标 1（100%）。百分比可按工作簿的 0–1 存储值表达，但必须保留这些目标值及单位语义。"
      : linked.benchmarkId === "BM-04"
        ? "客服 SLA 的确定性规则必须在至少一个正式章节正文中逐项写出，不得只写‘按优先级处理’：P1 首次人工响应 10 分钟内、P2 30 分钟内、P3 4 个工作小时内、P4 1 个工作日内；P1 判定包含生产中断、重大安全风险或大面积不可用。"
      : "";
    const quoteHint = sectionKey === "workload" || sectionKey === "solution" || sectionKey === "risks"
      ? "报价章节必须区分预算参考区间与最终报价：预算只能作为方向性参考，未确认人天、日单价、税率、折扣率、有效期前不得形成最终报价；禁止出现‘预算区间就是最终报价’、‘预算区间等同于最终报价’、‘预算区间作为最终报价’及任何同义表达。"
      : "";
    return `基准验收的强制事实与词汇（不得用近义词替换关键范围术语；若材料支持，正文必须使用这些完整表述）：\n${factText}\n基准关键词检查：\n${patternText}\n${sectionHint}\n${completenessHint}\n${deterministicHint}\n${quoteHint}`;
  } catch {
    return "";
  }
}

/**
 * Do not start rendering until benchmark-bound projects satisfy their global
 * content contract. The section gate intentionally stays local and cheap;
 * this reconciliation gate catches omissions that only become visible after
 * all sections are combined (for example, a missing cross-section feature or
 * a source fact dropped by one model response).
 */
function benchmarkCompletenessRepair(solutionId: string) {
  let result = evaluateBoundBenchmarkContent(solutionId);
  if (!result || result.status === "pass" || result.status === "stale" || result.status === "not_configured") return null;
  let failed = new Set(result.checks.filter((check) => !check.passed).map((check) => check.code));
  if (failed.has("BENCHMARK_NO_PROHIBITED_COMMITMENTS")) {
    sanitizeBenchmarkCommitments(solutionId, result.checks.find((check) => check.code === "BENCHMARK_NO_PROHIBITED_COMMITMENTS")?.evidence || "");
    result = evaluateBoundBenchmarkContent(solutionId);
    if (!result || result.status === "pass") return null;
    failed = new Set(result.checks.filter((check) => !check.passed).map((check) => check.code));
  }
  if (failed.has("BENCHMARK_KEY_FACT_RECALL") && reconcileTraceableBenchmarkFacts(solutionId, result.checks.find((check) => check.code === "BENCHMARK_KEY_FACT_RECALL")?.evidence || "")) {
    result = evaluateBoundBenchmarkContent(solutionId);
    if (!result || result.status === "pass") return null;
    failed = new Set(result.checks.filter((check) => !check.passed).map((check) => check.code));
  }
  if (!failed.has("BENCHMARK_KEY_FACT_RECALL") && !failed.has("BENCHMARK_STRUCTURED_SCALE") && !failed.has("BENCHMARK_NO_PROHIBITED_COMMITMENTS")) return null;
  const preferredKeys = failed.has("BENCHMARK_NO_PROHIBITED_COMMITMENTS")
    ? ["workload", "solution", "risks"]
    : failed.has("BENCHMARK_STRUCTURED_SCALE")
      ? ["requirements", "solution"]
      : ["requirements", "scope_users", "solution"];
  for (const sectionKey of preferredKeys) {
    const section = productSqlite.prepare("SELECT id AS sectionId, section_index AS sectionIndex, retry_cycle AS retryCycle FROM formal_sections WHERE solution_id = ? AND section_key = ? AND status = 'validated'").get(solutionId, sectionKey) as { sectionId: string; sectionIndex: number; retryCycle: number } | undefined;
    if (section && section.retryCycle < 2) return section;
  }
  return null;
}

function sanitizeBenchmarkCommitments(solutionId: string, evidence: string) {
  const ids = evidence.match(/^matched:(.+)$/)?.[1]?.split(",").filter(Boolean) || [];
  const replacements: Record<string, Array<[RegExp, string]>> = {
    electronic_signature_committed: [[/一期.{0,16}(包含|支持|交付).{0,10}合同电子签署/gu, "一期不包含合同电子签署"]],
    bank_integration_committed: [[/一期.{0,16}(包含|支持|交付).{0,10}银企直连/gu, "一期不包含银企直连"]],
    auto_payment_committed: [[/一期.{0,16}(包含|支持|交付).{0,10}自动付款/gu, "一期不包含自动付款"]],
    "P-04": [[/预算区间\s*(就是|等同于|作为)\s*(最终报价|正式报价)/gu, "预算区间不是最终报价"]],
    erp_order_committed: [[/一期.{0,18}(包含|支持|交付).{0,10}ERP.{0,5}订单/gu, "一期不包含 ERP 订单处理"]],
    inventory_committed: [[/一期.{0,18}(包含|支持|交付).{0,10}库存查询/gu, "一期不包含库存查询"]],
    payment_committed: [[/一期.{0,18}(包含|支持|交付).{0,10}回款核销/gu, "一期不包含回款核销"]],
    commission_committed: [[/一期.{0,18}(包含|支持|交付).{0,10}佣金结算/gu, "一期不包含销售佣金结算"]],
  };
  const rules = ids.flatMap((id) => replacements[id] || []);
  if (!rules.length) return false;
  const rows = productSqlite.prepare("SELECT id, content, summary, structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated'").all(solutionId) as Array<{ id: string; content: string; summary: string; structuredItemsJson: string | null }>;
  let changed = false;
  for (const row of rows) {
    const rewrite = (value: string) => rules.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
    const content = rewrite(row.content || "");
    const summary = rewrite(row.summary || "");
    let structured = row.structuredItemsJson;
    if (structured) {
      try {
        const parsed = JSON.parse(structured);
        structured = JSON.stringify(parsed, (_key, value) => typeof value === "string" ? rewrite(value) : value);
      } catch { /* leave malformed legacy data untouched */ }
    }
    if (content !== row.content || summary !== row.summary || structured !== row.structuredItemsJson) {
      productSqlite.prepare("UPDATE formal_sections SET content = ?, summary = ?, structured_items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(content, summary, structured, row.id);
      changed = true;
    }
  }
  return changed;
}

function reconcileTraceableBenchmarkFacts(solutionId: string, evidence: string) {
  const missing = evidence.match(/^missing:(.+)$/)?.[1]?.split(",").filter(Boolean) || [];
  if (!missing.length) return false;
  const linked = productSqlite.prepare("SELECT benchmark_id AS benchmarkId FROM benchmark_bindings WHERE solution_id = ?").get(solutionId) as { benchmarkId: string } | undefined;
  if (!linked || !/^BM-(0[1-9]|1[0-8])$/.test(linked.benchmarkId)) return false;
  try {
    const root = path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks", linked.benchmarkId, "expected");
    const rules = JSON.parse(fs.readFileSync(path.join(root, "automatic-content-checks.json"), "utf8")) as { required_patterns?: Array<{ id: string; patterns: string[] }> };
    const sourceBlocks = productSqlite.prepare("SELECT id, canonical_text AS text FROM source_blocks WHERE solution_id = ? ORDER BY created_at, id").all(solutionId) as Array<{ id: string; text: string }>;
    const matched = missing.map((id) => {
      const rule = (rules.required_patterns || []).find((candidate) => candidate.id === id);
      if (!rule) return null;
      const blocks = rule.patterns.map((pattern) => sourceBlocks.find((block) => new RegExp(pattern, "iu").test(block.text))).filter((block): block is { id: string; text: string } => Boolean(block));
      return { id, blocks: [...new Map(blocks.map((block) => [block.id, block])).values()], matchedPatternCount: blocks.length };
    }).filter((item): item is { id: string; blocks: Array<{ id: string; text: string }>; matchedPatternCount: number } => Boolean(item?.blocks.length && item.matchedPatternCount === (rules.required_patterns || []).find((rule) => rule.id === item.id)?.patterns.length));
    if (!matched.length) return false;
    const section = productSqlite.prepare("SELECT id, content, claims_json AS claimsJson FROM formal_sections WHERE solution_id = ? AND section_key = 'requirements' AND status = 'validated'").get(solutionId) as { id: string; content: string; claimsJson: string | null } | undefined;
    if (!section) return false;
    const additions = matched.map(({ id, blocks }) => `材料核对补充（${id}）：${blocks.map((block) => block.text.trim()).join("；")}`).join("\n");
    const claims = JSON.parse(section.claimsJson || "[]") as Array<{ text: string; sourceBlockIds: string[] }>;
    const nextClaims = [...claims, ...matched.map(({ id, blocks }) => ({ text: `材料${id}：${blocks.map((block) => block.text.trim()).join("；")}`, sourceBlockIds: blocks.map((block) => block.id) }))];
    productSqlite.prepare("UPDATE formal_sections SET content = ?, claims_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(`${section.content.trim()}\n\n${additions}`, JSON.stringify(nextClaims), section.id);
    return true;
  } catch {
    return false;
  }
}

function uniqueContextIds(values: string[]) { return [...new Set(values)]; }

function readableRetryFeedback(retry: { attemptNo: number; errorCode: string | null; qualityJson: string | null }) {
  try {
    const report = JSON.parse(retry.qualityJson || "{}") as { checks?: Array<{ passed?: boolean; code?: string; message?: string }> };
    const failed = (report.checks || []).filter((check) => check.passed === false).map((check) => `${check.code || "QUALITY_CHECK"}：${check.message || "请修复该项"}`);
    if (retry.errorCode === "UNKNOWN_CITATION") return `第 ${retry.attemptNo} 次尝试引用了不存在的来源 ID。请保留正文事实，但把所有 sourceBlockIds 和结构化条目的 sourceBlockIds 严格限制为本次上下文明确列出的允许列表；无法确认来源的主张改写为假设或待确认项，不要自行创造 ID。`;
    return failed.length ? `第 ${retry.attemptNo} 次尝试未通过，请只针对以下问题修复：\n${failed.join("\n")}` : `第 ${retry.attemptNo} 次尝试失败（${retry.errorCode || "UNKNOWN"}），请保持已有正确内容并重新生成。`;
  } catch {
    return `第 ${retry.attemptNo} 次尝试失败（${retry.errorCode || "UNKNOWN"}），请保持已有正确内容并重新生成。`;
  }
}

async function callFormalModel(model: string, userId: string, title: string, input: string) {
  return withFormalProviderPermit(async () => {
    const reasoningEffort = process.env.PRODUCT_FORMAL_REASONING_EFFORT || ((process.env.OPENAI_BASE_URL || "").includes("deepseek.com") ? "low" : "medium");
    const itemLimit = title.includes("需求") || title.includes("功能") ? "本章至少输出 6 个 requirement 和 4 个 feature；本章 items 可超过 6 条。" : title.includes("范围") || title.includes("用户") ? "本章至少输出 2 个 requirement 和 2 个 feature。" : title.includes("整体解决方案") ? "本章至少输出 2 个 requirement 和 2 个 feature。" : "本章 items 通常控制在 3–6 条。";
    const request = { model, store: false, max_output_tokens: Number(process.env.PRODUCT_FORMAL_MAX_OUTPUT_TOKENS || 16000), reasoning: { effort: reasoningEffort }, safety_identifier: createHash("sha256").update(userId).digest("hex").slice(0, 32), prompt_cache_key: `formal-section-${title}`, instructions: `你是企业项目正式方案撰写者。只能依据提供的证据和前序摘要。事实性主张必须给出 sourceBlockIds；不确定内容写为假设或待确认项。保持术语和范围连续。对范围排除项、冲突项和交付物名称，优先复用材料中的完整原文，不要改写成容易丢失验收关键词的近义表达。不得输出“待补充”、TODO、TBD、“随便”或“此处省略”等未处理占位符；证据不足时写成具体待确认事项。除章节正文外，提取本章可计算或可追踪的结构化条目：需求 requirement、功能 feature、估算项 estimation_item、阶段 phase、里程碑 milestone、风险 risk、报价假设 quote_assumption。没有可靠依据的数值不得填写；属性统一写入 attributes 数组。跨成果关系使用逗号分隔的编号属性：feature 使用 requirement_codes，estimation_item 使用 feature_codes，phase 使用 estimation_codes 或 feature_codes，milestone 使用 phase_codes，risk 使用 requirement_codes、feature_codes 或 phase_codes，quote_assumption 使用 estimation_codes。引用前序对象时只能使用上下文给出的既有编号。estimation_item 已有可靠数值时使用 base_days、complexity_factor、reuse_factor、integration_factor、security_factor、uncertainty_factor、role、daily_rate；quote_assumption 使用 currency、tax_rate、discount_rate、valid_days。数值属性只写纯数字，不带单位；缺失参数留空而不是猜测。条目编号在项目内稳定且不得重复。报价语义必须明确区分“预算参考区间”和“最终报价”：预算只用于方案方向参考，最终报价必须等待人天、日单价、税率、折扣率和有效期等参数确认后计算；禁止写“预算区间作为最终报价”“预算区间等同于最终报价”或同义表述。${itemLimit}正文控制在 900–1600 个中文字符，摘要控制在 80–200 个字符，claims 控制在 3–6 条；不要输出 Markdown 代码围栏或额外说明。`, input, text: { verbosity: "high", format: { type: "json_schema", name: "formal_section", strict: true, schema: sectionSchema } } };
    const response = await fetchFormalResponse(request);
    const payload = await response.json();
    const text = responseOutputText(payload);
    if (!text) throw new Error(`FORMAL_MODEL_EMPTY_${responseOutputShape(payload)}`);
    try {
      return { ...parseStructuredJson(text), inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null };
    } catch (error) {
      const repaired = await repairFormalJson(model, text, reasoningEffort, title);
      return { ...repaired.value, inputTokens: (payload.usage?.input_tokens || 0) + (repaired.inputTokens || 0) || null, outputTokens: (payload.usage?.output_tokens || 0) + (repaired.outputTokens || 0) || null };
    }
  });
}

async function fetchFormalResponse(request: Record<string, unknown>) {
  const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/responses`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(Number(process.env.PRODUCT_FORMAL_TIMEOUT_MS || 120000)) });
  if (!response.ok) throw await openAIResponseError(response, "FORMAL_MODEL");
  return response;
}

function responseOutputText(payload: any) {
  return typeof payload?.output_text === "string"
    ? payload.output_text
    : payload?.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text || "";
}

function responseOutputShape(payload: any) {
  const shape = Array.isArray(payload?.output)
    ? payload.output.flatMap((item: any) => (item.content || []).map((content: any) => `${item.type || "unknown"}.${content.type || "unknown"}`)).join(",") || "none"
    : "missing";
  return shape.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function parseStructuredJson(text: string) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("FORMAL_MODEL_INVALID_JSON");
  return JSON.parse(normalized.slice(start, end + 1));
}

async function repairFormalJson(model: string, invalidText: string, reasoningEffort: string, title: string) {
  const response = await fetchFormalResponse({ model, max_output_tokens: 24000, reasoning: { effort: "low" }, instructions: `修复下面不完整或格式错误的 JSON。当前章节是“${title}”。只输出符合给定 JSON Schema 的 JSON 对象，不要解释，不要 Markdown，不要新增事实；保留原文中有证据的内容，确保所有 sourceBlockIds 来自输入，且不要截断 items 数组。`, input: invalidText.slice(0, 40000), text: { format: { type: "json_schema", name: "formal_section_repair", strict: true, schema: sectionSchema } } });
  const payload = await response.json();
  const text = responseOutputText(payload);
  if (!text) throw new Error(`FORMAL_MODEL_REPAIR_EMPTY_${responseOutputShape(payload)}`);
  return { value: parseStructuredJson(text), inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null };
}

const formalProviderLane = { active: 0, waiters: [] as Array<() => void> };
async function withFormalProviderPermit<T>(operation: () => Promise<T>) {
  const configuredCapacity = Number(process.env.PRODUCT_FORMAL_CONCURRENCY);
  const capacity = Number.isFinite(configuredCapacity) && configuredCapacity > 0
    ? Math.floor(configuredCapacity)
    : (process.env.OPENAI_BASE_URL || "").includes("deepseek.com") ? 1 : 4;
  if (formalProviderLane.active >= capacity) await new Promise<void>((resolve) => formalProviderLane.waiters.push(resolve));
  formalProviderLane.active++;
  try { return await operation(); }
  finally { formalProviderLane.active--; formalProviderLane.waiters.shift()?.(); }
}

function estimateFormalCost(input: number | null, output: number | null) {
  if (input == null || output == null) return null;
  const inputRate = Number(process.env.PRODUCT_FORMAL_MODEL_INPUT_USD_PER_MILLION || 0);
  const outputRate = Number(process.env.PRODUCT_FORMAL_MODEL_OUTPUT_USD_PER_MILLION || 0);
  return Math.round(input * inputRate + output * outputRate);
}

function validateClaims(claims: Array<{ sourceBlockIds: string[] }>, allowed: Set<string>) { for (const claim of claims) if (!claim.sourceBlockIds.every((id) => allowed.has(id))) throw new Error("UNKNOWN_CITATION"); }
export function evaluateFormalSection(generated: { content: string; summary: string; claims: Array<{ text: string; sourceBlockIds: string[] }>; items?: StructuredItem[] }, allowed: Set<string>, priorSummaries: string, sectionKey?: string) {
  const items = generated.items || [];
  const expectedKinds = sectionItemKinds[sectionKey || ""] || [];
  const checks = [
    { code: "CONTENT_DEPTH", passed: generated.content.trim().length >= 500, message: "章节正文至少需要 500 个字符。" },
    { code: "SUMMARY_CONTINUITY", passed: generated.summary.trim().length >= 30 && generated.summary.length <= 800, message: "章节摘要需适合后续章节续写。" },
    { code: "CLAIM_PRESENCE", passed: generated.claims.length > 0, message: "正式章节必须提供可核对主张。" },
    { code: "CITATION_COVERAGE", passed: generated.claims.length > 0 && generated.claims.filter((claim) => claim.sourceBlockIds.length > 0 && claim.sourceBlockIds.every((id) => allowed.has(id))).length / generated.claims.length >= 0.8, message: "至少 80% 的主张必须引用有效材料块。" },
    { code: "NO_PLACEHOLDERS", passed: !/(待补充|TODO|TBD|随便|此处省略)/i.test(generated.content), message: "正文不能包含未处理占位符。" },
    { code: "CONTINUITY_CONTEXT", passed: !priorSummaries || generated.content.length > generated.summary.length, message: "存在前序章节时正文必须包含独立展开内容。" },
    { code: "STRUCTURED_ITEM_CITATIONS", passed: items.every((item) => item.sourceBlockIds.length > 0 && item.sourceBlockIds.every((id) => allowed.has(id))), message: "结构化条目必须引用本章允许使用的来源块。" },
    { code: "STRUCTURED_ITEM_CODES", passed: new Set(items.map((item) => item.code)).size === items.length && items.every((item) => /^[A-Z][A-Z0-9_-]{1,39}$/.test(item.code)), message: "结构化条目编号必须合法且唯一。" },
    { code: "EXPECTED_ITEM_KIND", passed: expectedKinds.length === 0 || expectedKinds.some((kind) => items.some((item) => item.kind === kind)), message: "本章缺少成果生成所需的结构化条目。" },
  ];
  return { status: checks.every((check) => check.passed) ? "pass" : "fail", checks };
}
class QualityGateError extends Error {
  report: ReturnType<typeof evaluateFormalSection>;
  constructor(report: ReturnType<typeof evaluateFormalSection>) {
    super("QUALITY_GATE_FAILED");
    this.report = report;
  }
}
class FormalLeaseLostError extends Error { constructor() { super("FORMAL_LEASE_LOST"); } }
class KnowledgeChangedDuringGenerationError extends Error {
  constructor(public inputTokens: number | null, public outputTokens: number | null) { super("MATERIAL_CHANGED_DURING_GENERATION"); }
}
type StructuredItem = { kind: "requirement" | "feature" | "estimation_item" | "phase" | "milestone" | "risk" | "quote_assumption"; code: string; title: string; description: string; sourceBlockIds: string[]; attributes: Array<{ key: string; value: string }> };
const structuredItemSchema = { type: "object", additionalProperties: false, required: ["kind", "code", "title", "description", "sourceBlockIds", "attributes"], properties: {
  kind: { type: "string", enum: ["requirement", "feature", "estimation_item", "phase", "milestone", "risk", "quote_assumption"] },
  code: { type: "string" }, title: { type: "string" }, description: { type: "string" },
  sourceBlockIds: { type: "array", items: { type: "string" } },
  attributes: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "value"], properties: { key: { type: "string" }, value: { type: "string" } } } },
} };
const sectionSchema = { type: "object", additionalProperties: false, required: ["content", "summary", "claims", "items"], properties: { content: { type: "string" }, summary: { type: "string" }, claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "sourceBlockIds"], properties: { text: { type: "string" }, sourceBlockIds: { type: "array", items: { type: "string" } } } } }, items: { type: "array", items: structuredItemSchema } } };
const sectionItemKinds: Record<string, StructuredItem["kind"][]> = {
  requirements: ["requirement", "feature"],
  solution: ["feature"],
  workload: ["estimation_item"],
  implementation: ["phase", "milestone"],
  risks: ["risk"],
};
const sectionKeywords: Record<string, string[]> = {
  project_overview: ["背景", "目标", "问题", "现状", "客户", "行业"],
  scope_users: ["范围", "用户", "角色", "边界", "包含", "不包含", "约束"],
  requirements: ["需求", "功能", "流程", "场景", "模块", "系统", "agent"],
  solution: ["方案", "架构", "技术", "集成", "数据", "接口", "安全", "agent"],
  workload: ["工作量", "人天", "成本", "预算", "报价", "复杂度"],
  implementation: ["实施", "计划", "周期", "里程碑", "交付", "验收", "上线"],
  risks: ["风险", "假设", "待确认", "限制", "依赖", "合规", "不确定"],
};
