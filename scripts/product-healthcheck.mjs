#!/usr/bin/env node

import "./product-env.mjs";

const origin = String(process.env.PRODUCT_APP_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");
const secret = process.env.PRODUCT_WORKER_SECRET || "";
const timeoutMs = Math.min(30_000, Math.max(1000, Number(process.env.PRODUCT_HEALTHCHECK_TIMEOUT_MS || 5000)));

if (!secret) fail("WORKER_SECRET_REQUIRED");

try {
  const response = await fetch(new URL("/api/product/internal/health", origin), {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.data?.status !== "healthy") fail(payload?.error?.code || payload?.data?.status || `HEALTH_HTTP_${response.status}`);
  process.stdout.write(`${JSON.stringify({ level: "info", event: "product_healthcheck_passed", activeWorkers: payload.data.activeWorkers })}\n`);
} catch (error) {
  fail(error instanceof Error ? error.message : "HEALTHCHECK_FAILED");
}

function fail(code) {
  process.stderr.write(`${JSON.stringify({ level: "critical", event: "product_healthcheck_failed", errorCode: safeCode(code) })}\n`);
  process.exit(1);
}

function safeCode(value) {
  return String(value).split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "HEALTHCHECK_FAILED";
}
