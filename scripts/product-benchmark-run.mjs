#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const benchmarkId = valueAfter("--benchmark") || "BM-01";
const execute = process.argv.includes("--execute");
const startCampaignScope = valueAfter("--start-campaign");
const campaignId = valueAfter("--campaign-id");
const origin = String(process.env.PRODUCT_APP_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");
const root = path.resolve(process.cwd(), "docs", "product", "v1-design", "benchmarks", benchmarkId);
const username = process.env.PRODUCT_BENCHMARK_USERNAME || "";
const password = process.env.PRODUCT_BENCHMARK_PASSWORD || "";
const workerSecret = process.env.PRODUCT_WORKER_SECRET || "";

const manifest = await readJson(path.join(root, "manifest.json"));
const intake = await readJson(path.join(root, "intake.json"));
if (manifest.benchmarkId !== benchmarkId || intake.benchmark_id !== benchmarkId) fail("BENCHMARK_ID_MISMATCH");
const sourceEntries = manifest.files.filter((item) => typeof item.path === "string" && item.path.startsWith("sources/"));
if (!sourceEntries.length) fail("BENCHMARK_SOURCES_EMPTY");
for (const entry of manifest.files) await verifyManifestEntry(root, entry);

if (startCampaignScope) {
  if (!workerSecret) fail("WORKER_SECRET_REQUIRED");
  if (!["pilot", "full"].includes(startCampaignScope)) fail("CAMPAIGN_SCOPE_INVALID");
  const campaign = await api("/api/product/internal/acceptance/campaign", { method: "POST", worker: true, json: { scope: startCampaignScope, targetConsecutiveRuns: 30 } });
  output({ status: "campaign_started", campaign: campaign.payload.data });
  process.exit(0);
}

if (!execute) {
  output({ status: "validated", benchmarkId, manifestFiles: manifest.files.length, uploadFiles: sourceEntries.length, next: `PRODUCT_BENCHMARK_USERNAME=... PRODUCT_BENCHMARK_PASSWORD=... PRODUCT_WORKER_SECRET=... node scripts/product-benchmark-run.mjs --benchmark ${benchmarkId} --execute` });
  process.exit(0);
}
if (process.env.PRODUCT_BENCHMARK_EXECUTE !== "1") fail("BENCHMARK_EXECUTION_GUARD_REQUIRED");
if (!username || password.length < 8 || !workerSecret) fail("BENCHMARK_CREDENTIALS_REQUIRED");

let cookie = "";
const registered = await api("/api/product/auth/register", { method: "POST", json: { username, password }, allow: [201, 409] });
if (registered.response.status === 409) {
  const loggedIn = await api("/api/product/auth/login", { method: "POST", json: { username, password } });
  cookie = sessionCookie(loggedIn.response);
} else cookie = sessionCookie(registered.response);
if (!cookie) fail("BENCHMARK_SESSION_COOKIE_MISSING");

const selected = await Promise.all(sourceEntries.map(async (entry, index) => {
  const absolutePath = path.join(root, entry.path);
  const stat = await fs.stat(absolutePath);
  const category = entry.category === "template" || entry.category === "brand" ? entry.category : "content";
  return { entry, absolutePath, clientKey: `${benchmarkId}:${index}:${entry.sha256}`, category, displayName: path.basename(entry.path), sizeBytes: stat.size, declaredMime: mimeFor(entry.format) };
}));
const handoff = await api("/api/product/intake/handoff", { method: "POST", cookie, json: {
  draftId: randomUUID(),
  purposePrimary: intake.primary_goal || manifest.title,
  needDescription: intake.need_description || "",
  formData: intakeForm(intake),
  fileSelections: selected.map(({ clientKey, category, displayName, sizeBytes, declaredMime }) => ({ clientKey, category, displayName, sizeBytes, declaredMime })),
} });
const solutionId = handoff.payload.data.solutionId;
for (const upload of handoff.payload.data.uploads) {
  if (upload.status === "uploaded") continue;
  const item = selected.find((candidate) => candidate.clientKey === upload.clientKey);
  if (!item) fail("BENCHMARK_UPLOAD_MAPPING_MISSING");
  const bytes = await fs.readFile(item.absolutePath);
  const form = new FormData();
  form.append("file", new File([bytes], item.displayName, { type: item.declaredMime }));
  await api(`/api/product/solutions/${solutionId}/uploads/${upload.fileId}`, { method: "POST", cookie, body: form });
}
// Bind the benchmark before processing so generation, reconciliation and
// rendering all see its deterministic content contract.
await api("/api/product/internal/acceptance/benchmarks", { method: "POST", worker: true, json: { benchmarkId, solutionId } });
await api(`/api/product/solutions/${solutionId}/process`, { method: "POST", cookie, allow: [200, 202] });

const timeoutMs = Math.max(60_000, Number(manifest.timeoutSeconds || 1800) * 1000);
const startedAt = Date.now();
let stage = "processing";
while (Date.now() - startedAt < timeoutMs) {
  await api("/api/product/internal/pipeline/tick?sourceLimit=2&mediaLimit=4&formalLimit=4", { method: "POST", worker: true });
  const progress = await api(`/api/product/solutions/${solutionId}/progress`, { cookie });
  stage = progress.payload.data?.stage || progress.payload.data?.status || "processing";
  if (stage === "completed" || progress.payload.data?.status === "completed") break;
  if (["blocked", "failed", "deleted"].includes(stage) || ["blocked", "failed"].includes(progress.payload.data?.status)) fail(`BENCHMARK_TERMINAL_${String(stage).toUpperCase()}`, { solutionId });
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (stage !== "completed") fail("BENCHMARK_TIMEOUT", { solutionId });

const acceptance = campaignId
  ? await api("/api/product/internal/acceptance/campaign", { method: "POST", worker: true, json: { action: "tick", campaignId, benchmarkId, solutionId } })
  : await api("/api/product/internal/acceptance/run", { method: "POST", worker: true, json: { solutionId } });
const run = campaignId ? acceptance.payload.data.run : acceptance.payload.data;
output({ status: run.status, benchmarkId, solutionId, campaign: campaignId ? acceptance.payload.data.campaign : null, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), acceptance: run });
if (run.status !== "passed") process.exitCode = 1;

async function api(pathname, options = {}) {
  const headers = {};
  if (options.json) headers["content-type"] = "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  if (options.worker) headers.authorization = `Bearer ${workerSecret}`;
  const response = await fetch(`${origin}${pathname}`, { method: options.method || "GET", headers, body: options.json ? JSON.stringify(options.json) : options.body, signal: AbortSignal.timeout(660_000) });
  const payload = await response.json().catch(() => null);
  const accepted = options.allow ? options.allow.includes(response.status) : response.ok;
  if (!accepted || (payload && payload.success === false && response.status !== 409)) fail(payload?.error?.code || `HTTP_${response.status}`, { pathname });
  return { response, payload };
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie") || "";
  return value.split(";", 1)[0];
}

async function verifyManifestEntry(base, entry) {
  const absolute = path.resolve(base, entry.path);
  if (!absolute.startsWith(`${base}${path.sep}`)) fail("BENCHMARK_PATH_ESCAPE");
  const bytes = await fs.readFile(absolute).catch(() => fail("BENCHMARK_FILE_MISSING", { path: entry.path }));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.sha256) fail("BENCHMARK_HASH_MISMATCH", { path: entry.path });
}

function intakeForm(value) {
  return {
    organizationName: value.project_name || "",
    industry: value.customer_type || "",
    actualUsers: Array.isArray(value.target_users) ? value.target_users.join("、") : "",
    shapes: value.desired_product_form || [],
    desiredGoals: [value.primary_goal, value.secondary_goal].filter(Boolean),
    currentState: "",
    includedScope: Array.isArray(value.constraints) ? value.constraints.join("；") : "",
    excludedScope: "",
    budget: value.budget?.available ? `${value.budget.range_cny?.min || ""}-${value.budget.range_cny?.max || ""} 元（${value.budget.note || "暂定"}）` : "",
    timeline: `${value.schedule?.desired_start || ""} 至 ${value.schedule?.desired_go_live || ""}`,
    otherConstraints: Array.isArray(value.constraints) ? value.constraints.join("；") : "",
  };
}

function mimeFor(format) {
  return ({ docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg", txt: "text/plain", csv: "text/csv", json: "application/json" })[format] || "application/octet-stream";
}
function valueAfter(flag) { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : ""; }
async function readJson(filename) { return JSON.parse(await fs.readFile(filename, "utf8")); }
function output(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function fail(code, details = {}) { output({ status: "failed", code, ...details }); process.exit(1); }
