#!/usr/bin/env node

import "./product-env.mjs";
const key = process.env.OPENAI_API_KEY || "";
const model = process.env.PRODUCT_PROVIDER_CHECK_MODEL || process.env.PRODUCT_FREE_MODEL || "gpt-5-nano";
const baseUrl = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

if (!key || key.length < 20) fail("PROVIDER_KEY_MISSING", null, false);

try {
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, store: false, input: "Reply with exactly OK.", max_output_tokens: 32 }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = safeCode(payload?.error?.code || payload?.error?.type || `HTTP_${response.status}`);
    const code = response.status === 401 || response.status === 403
      ? "PROVIDER_AUTHENTICATION_FAILED"
      : response.status === 429 && ["credit_balance_exhausted", "insufficient_quota"].includes(providerCode.toLowerCase())
        ? "PROVIDER_CREDITS_EXHAUSTED"
        : response.status === 429 ? "PROVIDER_RATE_LIMITED" : `PROVIDER_HTTP_${response.status}`;
    fail(code, response.status, response.status === 429 && code === "PROVIDER_RATE_LIMITED");
  }
  const output = String(payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text || "").trim();
  if (output !== "OK") fail("PROVIDER_UNEXPECTED_OUTPUT", response.status, false);
  process.stdout.write(`${JSON.stringify({ level: "info", event: "product_provider_check", status: "ready", model: payload.model || model, requestId: payload.id || null, usage: { inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null } })}\n`);
} catch (error) {
  if (process.exitCode) throw error;
  fail(error?.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_FAILED", null, true);
}

function fail(code, httpStatus, retryable) {
  process.stderr.write(`${JSON.stringify({ level: "error", event: "product_provider_check", status: "failed", model, httpStatus, errorCode: code, retryable })}\n`);
  process.exit(1);
}

function safeCode(value) {
  return String(value || "unknown").replace(/[^a-z0-9_]/gi, "_").slice(0, 80);
}
