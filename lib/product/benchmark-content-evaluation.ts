import fs from "fs";
import path from "path";
import { productSqlite } from "./db";
import { validatedBenchmarkBinding } from "./benchmark-bindings";

type RuleSet = {
  benchmark_id: string;
  minimum_structured_items?: Record<string, number>;
  maximum_runtime_seconds?: number;
  required_patterns: Array<{ id: string; patterns: string[] }>;
  prohibited_commitment_patterns: Array<{ id: string; pattern: string }>;
};
type AcceptanceCheck = { code: string; passed: boolean; evidence: string };

const dimensionChecks: Record<string, string[]> = {
  project_understanding: ["BENCHMARK_KEY_FACT_RECALL", "UNIFIED_KNOWLEDGE_READY"],
  requirements_features: ["BENCHMARK_STRUCTURED_SCALE", "PROJECT_CONSISTENCY"],
  conflicts_scope: ["BENCHMARK_KEY_FACT_RECALL", "BENCHMARK_NO_PROHIBITED_COMMITMENTS"],
  deterministic_data: ["BENCHMARK_FACT_DETERMINISTIC_TARGETS", "BENCHMARK_FACT_LEVEL_THRESHOLDS", "BENCHMARK_FACT_REBATE_RATES", "BENCHMARK_FACT_QUOTE_THRESHOLDS", "BENCHMARK_FACT_SUPPLIER_SCORE", "BENCHMARK_FACT_PRIORITY_SLA", "BENCHMARK_FACT_RESPONSE_COUNTING", "BENCHMARK_KEY_FACT_RECALL"],
  customer_conflict_rules: ["BENCHMARK_FACT_CUSTOMER_PERMISSION", "BENCHMARK_FACT_LEVEL_AND_CONDITION", "BENCHMARK_FACT_CONFLICT_RULE"],
  scope_boundary: ["BENCHMARK_FACT_SCOPE_BOUNDARY", "BENCHMARK_NO_PROHIBITED_COMMITMENTS"],
  offline_sync_and_data_integrity: ["BENCHMARK_FACT_OFFLINE_SYNC", "BENCHMARK_FACT_AUDIT_FIELDS"],
  permissions_and_scope: ["BENCHMARK_FACT_CUSTOMER_PERMISSION", "BENCHMARK_FACT_PHASE_ONE_BOUNDARY", "BENCHMARK_NO_PROHIBITED_COMMITMENTS"],
  priority_and_sla: ["BENCHMARK_FACT_PRIORITY_SLA"],
  escalation_and_handoff: ["BENCHMARK_FACT_HUMAN_HANDOFF", "BENCHMARK_FACT_RESPONSE_TIMER", "BENCHMARK_FACT_PRODUCTION_ESCALATION", "BENCHMARK_FACT_CUSTOMER_CONFIRMATION", "BENCHMARK_FACT_REOPEN_AUDIT"],
  privacy_and_scope: ["BENCHMARK_FACT_PHASE_ONE_BOUNDARY", "BENCHMARK_NO_PROHIBITED_COMMITMENTS"],
  mobile_ui_evidence: ["BENCHMARK_FACT_MOBILE_UI_EVIDENCE"],
  procurement_controls: ["BENCHMARK_FACT_QUOTE_THRESHOLDS", "BENCHMARK_FACT_SOLE_SOURCE_EXCEPTION", "BENCHMARK_FACT_SEGREGATION_OF_DUTIES"],
  supplier_governance: ["BENCHMARK_FACT_SUPPLIER_EXPIRY", "BENCHMARK_FACT_SUPPLIER_SCORE"],
  traceability: ["CRITICAL_SOURCE_TRACKING", "UNIFIED_KNOWLEDGE_TRACEABLE", "SOURCE_FILES_INTACT", "SOURCE_FORMAT_MATCHES"],
  deliverable_quality: ["SEVEN_OUTCOMES_AVAILABLE", "DECLARED_FORMATS_AVAILABLE", "ARTIFACT_FILES_INTACT", "ARTIFACT_FORMAT_OPENABLE", "ARTIFACT_QUALITY_GATES", "FORMAL_SECTIONS_VALIDATED", "PROJECT_CONSISTENCY"],
  runtime_cost: ["BENCHMARK_RUNTIME_LIMIT", "BENCHMARK_COST_LEDGER_COMPLETE", "NO_SILENT_FORMAL_DOWNGRADE"],
};

export function evaluateBoundBenchmarkContent(solutionId: string) {
  const linked = productSqlite.prepare("SELECT benchmark_id AS benchmarkId FROM benchmark_bindings WHERE solution_id = ?").get(solutionId) as { benchmarkId: string } | undefined;
  if (!linked) return null;
  const binding = validatedBenchmarkBinding(linked.benchmarkId);
  if (!binding || binding.solutionId !== solutionId || binding.status !== "ready") return { benchmarkId: linked.benchmarkId, status: "stale" as const, checks: [{ code: "BENCHMARK_BINDING_CURRENT", passed: false, evidence: binding?.staleReason || binding?.status || "missing" }] };
  const rules = loadRules(binding.benchmarkId);
  if (!rules) return { benchmarkId: binding.benchmarkId, status: "not_configured" as const, checks: [] };
  const rows = productSqlite.prepare("SELECT content, summary, structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated' ORDER BY section_index").all(solutionId) as Array<{ content: string; summary: string | null; structuredItemsJson: string | null }>;
  const corpus = rows.map((row) => `${row.content || ""}\n${row.summary || ""}\n${structuredText(row.structuredItemsJson)}`).join("\n").normalize("NFKC");
  const structuredItems = rows.flatMap((row) => parseStructuredItems(row.structuredItemsJson));
  const structuredCounts = structuredItems.reduce<Record<string, number>>((counts, item) => {
    const kind = typeof item?.kind === "string" ? item.kind : "unknown";
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
  const missingStructuredKinds = Object.entries(rules.minimum_structured_items || {}).filter(([kind, minimum]) => (structuredCounts[kind] || 0) < minimum).map(([kind]) => kind);
  const runtime = productSqlite.prepare("SELECT CAST((julianday(updated_at) - julianday(created_at)) * 86400 AS INTEGER) AS seconds FROM product_solutions WHERE id = ?").get(solutionId) as { seconds: number | null } | undefined;
  const runtimeSeconds = Math.max(0, Number(runtime?.seconds || 0));
  const modelUsage = productSqlite.prepare(`SELECT COUNT(*) AS calls,
    SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
    SUM(CASE WHEN status = 'succeeded' AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND estimated_cost_microusd IS NOT NULL THEN 1 ELSE 0 END) AS complete
    FROM model_calls WHERE solution_id = ? AND purpose LIKE 'formal_section:%'`).get(solutionId) as { calls: number; succeeded: number | null; complete: number | null };
  const missingFacts = rules.required_patterns.filter((rule) => !rule.patterns.every((pattern) => matches(corpus, pattern))).map((rule) => rule.id);
  const factChecks = rules.required_patterns.map((rule) => ({
    code: `BENCHMARK_FACT_${rule.id.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`,
    passed: rule.patterns.every((pattern) => matches(corpus, pattern)),
    evidence: rule.patterns.every((pattern) => matches(corpus, pattern)) ? "pass" : "missing_required_pattern",
  }));
  const prohibitedClaims = rules.prohibited_commitment_patterns.filter((rule) => hasUnnegatedMatch(corpus, rule.pattern)).map((rule) => rule.id);
  return {
    benchmarkId: binding.benchmarkId,
    status: missingFacts.length === 0 && prohibitedClaims.length === 0 && missingStructuredKinds.length === 0 ? "pass" as const : "fail" as const,
    checks: [
      { code: "BENCHMARK_KEY_FACT_RECALL", passed: missingFacts.length === 0, evidence: missingFacts.length ? `missing:${missingFacts.join(",")}` : `${rules.required_patterns.length}/${rules.required_patterns.length}` },
      ...factChecks,
      { code: "BENCHMARK_NO_PROHIBITED_COMMITMENTS", passed: prohibitedClaims.length === 0, evidence: prohibitedClaims.length ? `matched:${prohibitedClaims.join(",")}` : "0" },
      { code: "BENCHMARK_STRUCTURED_SCALE", passed: missingStructuredKinds.length === 0, evidence: missingStructuredKinds.length ? `below_minimum:${missingStructuredKinds.join(",")}` : Object.entries(structuredCounts).map(([kind, count]) => `${kind}:${count}`).join(",") },
      { code: "BENCHMARK_RUNTIME_LIMIT", passed: !rules.maximum_runtime_seconds || runtimeSeconds <= rules.maximum_runtime_seconds, evidence: `${runtimeSeconds}s/${rules.maximum_runtime_seconds || "unlimited"}s` },
      { code: "BENCHMARK_COST_LEDGER_COMPLETE", passed: Number(modelUsage.succeeded || 0) >= 7 && Number(modelUsage.complete || 0) === Number(modelUsage.succeeded || 0), evidence: `${Number(modelUsage.complete || 0)}/${Number(modelUsage.succeeded || 0)} complete; ${modelUsage.calls} calls` },
    ],
  };
}

export function scoreBoundBenchmarkChecks(benchmarkId: string | null, checks: AcceptanceCheck[]) {
  if (!benchmarkId || !/^BM-(0[1-9]|1[0-8])$/.test(benchmarkId)) return null;
  const filename = path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks", benchmarkId, "expected", "scoring-rubric.json");
  let rubric: { pass_score?: number; weights?: Record<string, number> };
  try { rubric = JSON.parse(fs.readFileSync(filename, "utf8")); } catch { return null; }
  const checkMap = new Map(checks.map((check) => [check.code, check]));
  const dimensions = Object.entries(rubric.weights || {}).map(([id, weight]) => {
    const codes = dimensionChecks[id] || [];
    const evidenceChecks = codes.map((code) => checkMap.get(code)).filter(Boolean) as AcceptanceCheck[];
    const raw = evidenceChecks.length ? Number((evidenceChecks.filter((check) => check.passed).length / evidenceChecks.length * 100).toFixed(2)) : 0;
    return { id, raw, weight, weighted: Number((raw * weight).toFixed(2)), evidence: evidenceChecks.map((check) => `${check.code}:${check.passed ? "pass" : "fail"}`) };
  });
  const total = Number(dimensions.reduce((sum, dimension) => sum + dimension.weighted, 0).toFixed(2));
  return { dimensions, total, passScore: Number(rubric.pass_score || 100), blockingChecksPassed: checks.every((check) => check.passed) };
}

function loadRules(benchmarkId: string): RuleSet | null {
  if (!/^BM-(0[1-9]|1[0-8])$/.test(benchmarkId)) return null;
  const filename = path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks", benchmarkId, "expected", "automatic-content-checks.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(filename, "utf8")) as RuleSet;
    return parsed.benchmark_id === benchmarkId && Array.isArray(parsed.required_patterns) && Array.isArray(parsed.prohibited_commitment_patterns) ? parsed : null;
  } catch { return null; }
}

function matches(corpus: string, pattern: string) {
  try { return new RegExp(pattern, "iu").test(corpus); } catch { return false; }
}

function hasUnnegatedMatch(corpus: string, pattern: string) {
  try {
    const expression = new RegExp(pattern, "giu");
    for (const match of corpus.matchAll(expression)) {
      const index = match.index ?? 0;
      const boundary = Math.max(corpus.lastIndexOf("。", index), corpus.lastIndexOf("！", index), corpus.lastIndexOf("？", index), corpus.lastIndexOf("；", index), corpus.lastIndexOf("\n", index));
      const prefix = corpus.slice(Math.max(boundary + 1, index - 24), index);
      const clauseEndCandidates = ["。", "！", "？", "；", "\n"].map((mark) => corpus.indexOf(mark, index)).filter((value) => value >= 0);
      const clauseEnd = clauseEndCandidates.length ? Math.min(...clauseEndCandidates) : corpus.length;
      const clause = corpus.slice(boundary + 1, clauseEnd);
      if (!/(?:不(?:承诺|得|应|允许|自动)|不得默认包含|未(?:承诺|纳入)|若(?:默认|擅自)(?:包含|启用))/u.test(prefix)
        && !/(?:若|如果|假如)[^。；\n]{0,24}(?:理解为|视为|包含|提供|支持|自动|计入|暂停)/u.test(clause)) return true;
    }
  } catch { return false; }
  return false;
}

function structuredText(value: string | null) {
  if (!value) return "";
  try {
    const items = JSON.parse(value);
    if (!Array.isArray(items)) return "";
    return items.map((item) => `${item?.code || ""} ${item?.title || ""} ${item?.description || ""} ${Array.isArray(item?.attributes) ? item.attributes.map((attribute: any) => `${attribute?.key || ""} ${attribute?.value || ""}`).join(" ") : ""}`).join("\n");
  } catch { return ""; }
}

function parseStructuredItems(value: string | null): any[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
