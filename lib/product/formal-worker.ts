import { randomUUID } from "crypto";
import { ensurePrimaryDeliverables } from "./deliverables";
import { requiredDeliverableArtifactTypes } from "./deliverable-catalog";
import { continueFormalDocument, reactivateConfiguredFormalDocuments, recoverStaleFormalWork, repairExhaustedFormalWork } from "./formal-analysis";
import { modelExecutionWindow } from "./model-execution-window";
import { formalWorkRepository } from "./product-data-ports";

export async function processFormalBatch(requestedLimit = 1) {
  const recovered = recoverStaleFormalWork();
  const repairedFormal = repairExhaustedFormalWork();
  const reactivatedConfiguration = reactivateConfiguredFormalDocuments();
  const recoveredRendering = await recoverStaleRendering();
  const repairedRendering = await repairExhaustedRendering();
  const requeuedIncompleteDeliveries = await requeueIncompleteCompletedDeliveries();
  const workerId = `formal-${randomUUID()}`;
  const configuredLimit = Math.max(1, Number(process.env.PRODUCT_FORMAL_BATCH_CONCURRENCY || ((process.env.OPENAI_BASE_URL || "").includes("deepseek.com") ? 1 : 4)));
  const limit = Math.min(10, configuredLimit, Math.max(1, Math.floor(requestedLimit)));
  const results = await Promise.all(Array.from({ length: limit }, () => processOneFormalWork(workerId)));
  return { workerId, requested: limit, processed: results.filter((item) => item.status !== "idle" && item.status !== "contended").length, recovered, repairedFormal, reactivatedConfiguration, recoveredRendering, repairedRendering, requeuedIncompleteDeliveries, results };
}

export async function recoverStaleRendering() {
  return formalWorkRepository().recoverStaleRendering();
}

async function requeueIncompleteCompletedDeliveries() {
  const limit = Math.min(20, Math.max(1, Math.floor(Number(process.env.PRODUCT_DELIVERABLE_RECONCILE_BATCH || 4))));
  return formalWorkRepository().requeueIncompleteDeliveries(requiredDeliverableArtifactTypes, limit);
}

async function processOneFormalWork(workerId: string) {
  const configuredUserConcurrency = Number(process.env.PRODUCT_FORMAL_USER_CONCURRENCY);
  const userConcurrency = Number.isFinite(configuredUserConcurrency) && configuredUserConcurrency > 0
    ? Math.floor(configuredUserConcurrency)
    : ((process.env.OPENAI_BASE_URL || "").includes("deepseek.com") ? 1 : 2);
  const repository = formalWorkRepository();
  const next = await repository.findPendingFormal(userConcurrency);
  if (next) {
    const executionWindow = modelExecutionWindow();
    if (!executionWindow.allowed) return { status: "deferred_to_model_window", solutionId: next.solutionId, executionWindow };
  }
  if (!next) {
    const renderConcurrency = Math.max(1, Math.floor(Number(process.env.PRODUCT_RENDER_USER_CONCURRENCY || 1)));
    const leaseSeconds = Math.max(180, Number(process.env.PRODUCT_RENDER_LEASE_SECONDS || 1800));
    const claim = await repository.claimRendering(workerId, renderConcurrency, leaseSeconds);
    if (claim.status !== "claimed") return claim;
    const rendering = claim.work;
    try {
      const deliverables = await ensurePrimaryDeliverables(rendering.solutionId, rendering.userId, { workerId });
      return { status: "rendered", solutionId: rendering.solutionId, deliverableCount: deliverables.length };
    } catch (error) {
      const attemptCount = await repository.renderAttemptCount(rendering.solutionId, workerId);
      if (attemptCount == null) return { status: "render_lease_lost", solutionId: rendering.solutionId, errorCode: "RENDER_LEASE_LOST" };
      const maxAttempts = Math.min(10, Math.max(2, Number(process.env.PRODUCT_RENDER_MAX_ATTEMPTS || 5)));
      const exhausted = attemptCount >= maxAttempts;
      const delays = [5, 30, 120, 600];
      const retrySeconds = delays[Math.min(Math.max(0, attemptCount - 1), delays.length - 1)];
      const code = exhausted ? "RENDER_RETRY_EXHAUSTED" : renderErrorCode(error);
      if (!await repository.recordRenderFailure({ solutionId: rendering.solutionId, workerId, exhausted, retrySeconds, errorCode: code })) return { status: "render_lease_lost", solutionId: rendering.solutionId, errorCode: "RENDER_LEASE_LOST" };
      return { status: exhausted ? "render_failed" : "render_retry_scheduled", solutionId: rendering.solutionId, errorCode: code };
    }
  }
  const state = await continueFormalDocument(next.solutionId, next.userId, { workerId });
  return { status: "processed", solutionId: next.solutionId, document: state };
}

async function repairExhaustedRendering() {
  const seconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_RENDER_AUTO_REPAIR_SECONDS || 21600)));
  return formalWorkRepository().repairExhaustedRendering(seconds);
}

function renderErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "DELIVERABLE_RENDER_FAILED";
}
