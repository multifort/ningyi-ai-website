#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

const origin = String(process.env.PRODUCT_APP_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");
const workerSecret = process.env.PRODUCT_WORKER_SECRET || "";
const scope = valueAfter("--scope") || "pilot";
const existingCampaignId = valueAfter("--campaign-id");
const benchmarkOverride = valueAfter("--benchmark");
const maxAttempts = positiveInteger(valueAfter("--max-attempts"), 60);
const probeFaults = process.argv.includes("--probe-faults");

if (!process.argv.includes("--execute") || process.env.PRODUCT_BENCHMARK_EXECUTE !== "1") fail("CAMPAIGN_EXECUTION_GUARD_REQUIRED");
if (!workerSecret) fail("WORKER_SECRET_REQUIRED");
if (!existingCampaignId && !["pilot", "full"].includes(scope)) fail("CAMPAIGN_SCOPE_INVALID");
if (!process.env.PRODUCT_BENCHMARK_USERNAME || String(process.env.PRODUCT_BENCHMARK_PASSWORD || "").length < 8) fail("BENCHMARK_CREDENTIALS_REQUIRED");

let campaign = existingCampaignId
  ? await campaignApi(`?id=${encodeURIComponent(existingCampaignId)}`)
  : await campaignApi("", { scope, targetConsecutiveRuns: 30 });

if (campaign.status !== "collecting") fail("CAMPAIGN_NOT_COLLECTING", { campaignId: campaign.id, campaignStatus: campaign.status });
output({ status: existingCampaignId ? "campaign_resumed" : "campaign_started", campaign });

let attempts = 0;
while (campaign.consecutivePasses < campaign.targetConsecutiveRuns && attempts < maxAttempts) {
  attempts += 1;
  const benchmarkId = benchmarkOverride || benchmarkFor(campaign.scope, campaign.totalRuns);
  const result = await runBenchmark(campaign.id, benchmarkId);
  if (result.exitCode !== 0 || result.payload?.status !== "passed") {
    fail("CAMPAIGN_RUN_FAILED", { campaignId: campaign.id, benchmarkId, attempt: attempts, run: result.payload, childExitCode: result.exitCode });
  }
  campaign = result.payload.campaign;
  output({ status: "campaign_progress", campaignId: campaign.id, benchmarkId, attempt: attempts, consecutivePasses: campaign.consecutivePasses, targetConsecutiveRuns: campaign.targetConsecutiveRuns, totalRuns: campaign.totalRuns });
}

if (campaign.consecutivePasses < campaign.targetConsecutiveRuns) fail("CAMPAIGN_MAX_ATTEMPTS_REACHED", { campaignId: campaign.id, attempts, campaign });
if (probeFaults) {
  const probed = await campaignApi("", { action: "probe_faults", campaignId: campaign.id, confirmation: "RUN_ISOLATED_FAULT_PROBES" });
  campaign = probed.campaign;
  output({ status: "fault_probes_complete", campaignId: campaign.id, probes: probed.probes.map((probe) => ({ faultCode: probe.faultCode, passed: probe.passed })), campaign });
}
output({ status: campaign.status === "passed" ? "campaign_passed" : "campaign_runs_complete", campaignId: campaign.id, attempts, campaign, next: campaign.status === "passed" ? null : "Run again with --probe-faults after enabling PRODUCT_ACCEPTANCE_FAULT_PROBES=1 on the service." });

async function runBenchmark(campaignId, benchmarkId) {
  const script = path.resolve(process.cwd(), "scripts", "product-benchmark-run.mjs");
  const args = [script, "--benchmark", benchmarkId, "--execute", "--campaign-id", campaignId];
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "inherit"] });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
  let payload = null;
  try { payload = JSON.parse(line); } catch { payload = { status: "failed", code: "BENCHMARK_OUTPUT_INVALID", outputTail: line.slice(-500) }; }
  return { exitCode, payload };
}

async function campaignApi(query = "", json) {
  const response = await fetch(`${origin}/api/product/internal/acceptance/campaign${query}`, {
    method: json ? "POST" : "GET",
    headers: { authorization: `Bearer ${workerSecret}`, ...(json ? { "content-type": "application/json" } : {}) },
    body: json ? JSON.stringify(json) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) fail(payload?.error?.code || `HTTP_${response.status}`);
  return payload.data;
}

function valueAfter(flag) { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : ""; }
function benchmarkFor(campaignScope, offset) {
  const count = campaignScope === "pilot" ? 1 : 18;
  return `BM-${String((offset % count) + 1).padStart(2, "0")}`;
}
function positiveInteger(value, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function output(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function fail(code, details = {}) { output({ status: "failed", code, ...details }); process.exit(1); }
