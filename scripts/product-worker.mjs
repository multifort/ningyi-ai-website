#!/usr/bin/env node

import "./product-env.mjs";
import { randomUUID } from "node:crypto";

const origin = String(process.env.PRODUCT_APP_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");
const secret = process.env.PRODUCT_WORKER_SECRET || "";
if (!secret) {
  process.stderr.write(`${JSON.stringify({ level: "error", code: "WORKER_SECRET_REQUIRED" })}\n`);
  process.exit(1);
}

const basePollMs = boundedNumber("PRODUCT_PIPELINE_POLL_MS", 1000, 250, 60_000);
const timeoutMs = boundedNumber("PRODUCT_PIPELINE_TICK_TIMEOUT_MS", 600_000, 10_000, 900_000);
const deletionPollMs = boundedNumber("PRODUCT_DELETION_POLL_MS", 1000, 250, 60_000);
const operationsPollMs = boundedNumber("PRODUCT_OPERATIONS_POLL_MS", 60_000, 10_000, 3_600_000);
const storagePollMs = boundedNumber("PRODUCT_STORAGE_MAINTENANCE_POLL_MS", 21_600_000, 60_000, 86_400_000);
const heartbeatPollMs = boundedNumber("PRODUCT_WORKER_HEARTBEAT_MS", 15_000, 5_000, 60_000);
const fatalFailureThreshold = boundedNumber("PRODUCT_WORKER_FATAL_FAILURE_THRESHOLD", 12, 2, 100);
const workerId = randomUUID();
const startedAt = new Date().toISOString();
const capabilities = ["pipeline", "deletion", "operations", "storage_maintenance"];
const loopHealth = Object.fromEntries(capabilities.map((name) => [name, { lastSuccessAt: null, lastProgressAt: null, consecutiveFailures: 0 }]));
const limits = {
  sourceLimit: boundedNumber("PRODUCT_SOURCE_BATCH_CONCURRENCY", 2, 1, 8),
  mediaLimit: boundedNumber("PRODUCT_MEDIA_BATCH_CONCURRENCY", 4, 1, 10),
  formalLimit: boundedNumber("PRODUCT_FORMAL_BATCH_CONCURRENCY", 4, 1, 10),
  knowledgeLimit: boundedNumber("PRODUCT_KNOWLEDGE_RECONCILE_BATCH", 4, 1, 20),
  deletionLimit: boundedNumber("PRODUCT_DELETION_BATCH_CONCURRENCY", 2, 1, 10),
};
let stopped = false;
let restartRequested = false;
const wakeTimers = new Set();

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  stopped = true;
  for (const wake of wakeTimers) wake();
  process.stdout.write(`${JSON.stringify({ level: "info", event: "worker_stopping", signal })}\n`);
});

process.stdout.write(`${JSON.stringify({ level: "info", event: "worker_starting", workerId, origin })}\n`);
await waitForDependencies();
if (!stopped) process.stdout.write(`${JSON.stringify({ level: "info", event: "worker_started", workerId, origin, pollMs: basePollMs, deletionPollMs, operationsPollMs, storagePollMs, heartbeatPollMs, fatalFailureThreshold, limits })}\n`);
await Promise.all([
  pipelineLoop(),
  heartbeatLoop(),
  endpointLoop("deletion", "/api/product/internal/deletion/tick", deletionPollMs, { limit: limits.deletionLimit }),
  endpointLoop("operations", "/api/product/internal/operations/tick", operationsPollMs, { hours: 24 }),
  endpointLoop("storage_maintenance", "/api/product/internal/storage/maintenance", storagePollMs, { mode: "cleanup" }),
]);
await postStoppedHeartbeat();

async function waitForDependencies() {
  let failures = 0;
  while (!stopped) {
    try {
      const url = new URL("/api/product/internal/health?scope=dependencies", origin);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data?.dependencies?.ready) throw new Error(payload?.error?.code || `READINESS_HTTP_${response.status}`);
      process.stdout.write(`${JSON.stringify({ level: "info", event: "worker_dependencies_ready", workerId })}\n`);
      return;
    } catch (error) {
      failures += 1;
      process.stderr.write(`${JSON.stringify({ level: "error", event: "worker_dependencies_not_ready", errorCode: safeErrorCode(error), consecutiveFailures: failures })}\n`);
      await wait(Math.min(30_000, 1000 * (2 ** Math.min(failures, 5))));
    }
  }
}

async function pipelineLoop() {
  let failures = 0, idleTicks = 0, degradedTicks = 0;
  while (!stopped) {
    const started = Date.now();
    try {
      const url = new URL("/api/product/internal/pipeline/tick", origin);
      for (const [key, value] of Object.entries(limits)) url.searchParams.set(key, String(value));
      const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(timeoutMs) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.code || `PIPELINE_HTTP_${response.status}`);
      failures = 0;
      const data = payload.data;
      const processed = Number(data.source?.processed || 0) + Number(data.media?.processed || 0) + Number(data.formal?.processed || 0) + Number(data.knowledge?.processed || 0);
      markLoopSuccess("pipeline", processed);
      if (data.degraded && degradedTicks % 60 === 0) process.stderr.write(`${JSON.stringify({ level: "warning", event: "pipeline_tick_degraded", failedStages: Array.isArray(data.errors) ? data.errors.map((item) => item.stage).filter(Boolean) : [] })}\n`);
      degradedTicks = data.degraded ? degradedTicks + 1 : 0;
      if (processed > 0 || idleTicks % 60 === 0) {
        process.stdout.write(`${JSON.stringify({ level: "info", event: "pipeline_tick", elapsedMs: Date.now() - started, processed, source: data.source?.processed || 0, media: data.media?.processed || 0, formal: data.formal?.processed || 0, knowledge: data.knowledge?.processed || 0 })}\n`);
      }
      idleTicks = processed > 0 ? 0 : idleTicks + 1;
    } catch (error) {
      failures += 1;
      markLoopFailure("pipeline", failures);
      process.stderr.write(`${JSON.stringify({ level: "error", event: "pipeline_tick_failed", errorCode: safeErrorCode(error), consecutiveFailures: failures })}\n`);
      requestRestartIfExhausted("pipeline", error, failures);
    }
    if (stopped) break;
    const backoff = failures ? Math.min(30_000, basePollMs * (2 ** Math.min(failures, 5))) : basePollMs;
    const jittered = Math.round(backoff * (0.9 + Math.random() * 0.2));
    await wait(jittered);
  }
}

async function endpointLoop(name, pathname, intervalMs, query, delayFirst = false, body) {
  let failures = 0, idleTicks = 0;
  if (delayFirst) await wait(intervalMs);
  while (!stopped) {
    const started = Date.now();
    try {
      const url = new URL(pathname, origin);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
      const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.code || `${name.toUpperCase()}_HTTP_${response.status}`);
      failures = 0;
      const processed = Number(payload.data?.processed || payload.data?.removedFiles || 0);
      if (loopHealth[name]) markLoopSuccess(name, processed);
      if (processed > 0 || idleTicks % 60 === 0) process.stdout.write(`${JSON.stringify({ level: "info", event: `${name}_tick`, elapsedMs: Date.now() - started, processed })}\n`);
      idleTicks = processed > 0 ? 0 : idleTicks + 1;
    } catch (error) {
      failures += 1;
      if (loopHealth[name]) markLoopFailure(name, failures);
      process.stderr.write(`${JSON.stringify({ level: "error", event: `${name}_tick_failed`, errorCode: safeErrorCode(error), consecutiveFailures: failures })}\n`);
      if (loopHealth[name]) requestRestartIfExhausted(name, error, failures);
    }
    if (stopped) break;
    const backoff = failures ? Math.min(30_000, intervalMs * (2 ** Math.min(failures, 5))) : intervalMs;
    await wait(Math.round(backoff * (0.9 + Math.random() * 0.2)));
  }
}

async function heartbeatLoop() {
  let failures = 0;
  while (!stopped) {
    try {
      const response = await fetch(new URL("/api/product/internal/health", origin), { method: "POST", headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ workerId, status: "running", startedAt, capabilities, loopHealth }), signal: AbortSignal.timeout(10_000) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.code || `HEARTBEAT_HTTP_${response.status}`);
      failures = 0;
    } catch (error) {
      failures += 1;
      process.stderr.write(`${JSON.stringify({ level: "error", event: "heartbeat_tick_failed", errorCode: safeErrorCode(error), consecutiveFailures: failures })}\n`);
    }
    if (!stopped) await wait(heartbeatPollMs);
  }
}

function markLoopSuccess(name, processed) {
  const now = new Date().toISOString();
  loopHealth[name].lastSuccessAt = now;
  loopHealth[name].consecutiveFailures = 0;
  if (processed > 0) loopHealth[name].lastProgressAt = now;
}

function markLoopFailure(name, failures) {
  loopHealth[name].consecutiveFailures = failures;
}

function requestRestartIfExhausted(name, error, failures) {
  if (restartRequested || failures < fatalFailureThreshold) return;
  restartRequested = true;
  stopped = true;
  process.exitCode = 1;
  for (const wake of wakeTimers) wake();
  process.stderr.write(`${JSON.stringify({ level: "critical", event: "worker_restart_requested", loop: name, errorCode: safeErrorCode(error), consecutiveFailures: failures, threshold: fatalFailureThreshold })}\n`);
}

async function postStoppedHeartbeat() {
  try {
    await fetch(new URL("/api/product/internal/health", origin), { method: "POST", headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ workerId, status: "stopped", startedAt, capabilities, loopHealth }), signal: AbortSignal.timeout(5000) });
  } catch {}
}

async function wait(milliseconds) {
  if (stopped) return;
  await new Promise((resolve) => {
    let timer;
    const wake = () => {
      if (timer) clearTimeout(timer);
      wakeTimers.delete(wake);
      resolve();
    };
    wakeTimers.add(wake);
    timer = setTimeout(wake, milliseconds);
  });
}

function boundedNumber(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] || fallback);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? Math.floor(value) : fallback));
}
function safeErrorCode(error) {
  return (error instanceof Error ? error.message : String(error)).split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "PIPELINE_TICK_FAILED";
}
