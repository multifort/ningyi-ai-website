import { createHash, randomUUID } from "crypto";
import { productSqlite } from "./db";
import { isOperationsControlEnabled } from "./operations-controls";
import { openAIResponseError, providerErrorCode } from "./openai-errors";
import { modelExecutionWindow } from "./model-execution-window";

export type FreeAnalysis = { summary: string; problemStatement: string; goals: string[]; risks: string[]; missingInformation: string[]; recommendedNextStep: string };
type Fact = { id: string; text: string; sourceBlockId?: string };

export async function generateFreeAnalysis(solutionId: string, userId: string, facts: Fact[]): Promise<{ analysis: FreeAnalysis; origin: string; model: string }> {
  const provider = process.env.PRODUCT_FREE_MODEL_PROVIDER || "openai";
  const model = process.env.PRODUCT_FREE_MODEL || "gpt-5.4-nano";
  const callId = randomUUID();
  const executionWindow = modelExecutionWindow();
  const useModel = provider === "openai" && Boolean(process.env.OPENAI_API_KEY) && executionWindow.allowed && !isOperationsControlEnabled("throttle_free_analysis");
  const actualProvider = useModel ? provider : "deterministic", actualModel = useModel ? model : "rules-v1";
  const candidate = freeCandidateMetadata(actualModel, useModel);
  productSqlite.prepare(`INSERT INTO model_calls
    (id, solution_id, purpose, provider, model, model_version, prompt_version, parser_version, configuration_hash, status)
    VALUES (?, ?, 'free_analysis', ?, ?, ?, ?, ?, ?, 'running')`).run(callId, solutionId, actualProvider, actualModel, candidate.modelVersion, candidate.promptVersion, candidate.parserVersion, candidate.configurationHash);
  try {
    const result = useModel ? await callOpenAI(model, userId, facts) : { analysis: deterministicAnalysis(facts), inputTokens: null, outputTokens: null };
    const origin = useModel ? "low_cost_model" : !executionWindow.allowed ? "night_window_deterministic_fallback" : "deterministic_fallback";
    const estimatedCost = estimateCost(result.inputTokens, result.outputTokens);
    productSqlite.transaction(() => {
      productSqlite.prepare("INSERT INTO free_analyses (solution_id, analysis_json, origin, provider, model, input_tokens, output_tokens, estimated_cost_microusd) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(solution_id) DO UPDATE SET analysis_json = excluded.analysis_json, origin = excluded.origin, provider = excluded.provider, model = excluded.model, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, estimated_cost_microusd = excluded.estimated_cost_microusd, status = 'ready', updated_at = CURRENT_TIMESTAMP").run(solutionId, JSON.stringify(result.analysis), origin, useModel ? provider : "deterministic", actualModel, result.inputTokens, result.outputTokens, estimatedCost);
      productSqlite.prepare("UPDATE model_calls SET status = 'succeeded', input_tokens = ?, output_tokens = ?, estimated_cost_microusd = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(result.inputTokens, result.outputTokens, estimatedCost, callId);
    })();
    return { analysis: result.analysis, origin, model: actualModel };
  } catch (error) {
    const analysis = deterministicAnalysis(facts);
    const code = providerErrorCode(error, "FREE_MODEL_FAILED");
    productSqlite.transaction(() => {
      productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(code, callId);
      productSqlite.prepare("INSERT INTO free_analyses (solution_id, analysis_json, origin, provider, model) VALUES (?, ?, 'deterministic_fallback', 'deterministic', 'rules-v1') ON CONFLICT(solution_id) DO UPDATE SET analysis_json = excluded.analysis_json, origin = excluded.origin, provider = excluded.provider, model = excluded.model, status = 'ready', updated_at = CURRENT_TIMESTAMP").run(solutionId, JSON.stringify(analysis));
    })();
    return { analysis, origin: "deterministic_fallback", model: "rules-v1" };
  }
}

function freeCandidateMetadata(model: string, useModel: boolean) {
  const modelVersion = useModel ? (process.env.PRODUCT_FREE_MODEL_VERSION || model) : "rules-v1";
  const promptVersion = useModel ? (process.env.PRODUCT_FREE_PROMPT_VERSION || "free-analysis-v1") : "deterministic-analysis-v1";
  const parserVersion = process.env.PRODUCT_SOURCE_PARSER_VERSION || "source-parser-v1";
  const configuration = { model, modelVersion, promptVersion, parserVersion, maxOutputTokens: useModel ? 2200 : 0, factLimit: 20 };
  return { modelVersion, promptVersion, parserVersion, configurationHash: createHash("sha256").update(JSON.stringify(configuration)).digest("hex") };
}

async function callOpenAI(model: string, userId: string, facts: Fact[]) {
  const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, store: false, max_output_tokens: 2200,
      safety_identifier: createHash("sha256").update(userId).digest("hex").slice(0, 32),
      instructions: "你是企业项目方案的初步分析助手。只能根据给定事实分析，不得虚构。缺失信息必须放入 missingInformation。使用简洁中文。",
      input: `请对以下可追溯事实做免费初步分析：\n${facts.slice(0, 20).map((fact) => `[${fact.id}] ${fact.text.slice(0, 600)}`).join("\n")}`,
      text: { format: { type: "json_schema", name: "free_project_analysis", strict: true, schema: analysisSchema } },
    }), signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw await openAIResponseError(response, "FREE_MODEL");
  const payload = await response.json();
  const outputText = payload.output_text || payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OPENAI_EMPTY_OUTPUT");
  const normalized = String(outputText).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("FREE_MODEL_INVALID_JSON");
  return { analysis: JSON.parse(normalized.slice(start, end + 1)) as FreeAnalysis, inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null };
}

function deterministicAnalysis(facts: Fact[]): FreeAnalysis {
  const texts = facts.map((fact) => fact.text).filter(Boolean);
  return {
    summary: texts.length ? `已基于 ${texts.length} 条首批事实完成基础梳理；当前结果用于确认方向，正式方案会继续核对材料间的一致性。` : "当前材料缺少可提取文字，需要补充说明或可识别附件。",
    problemStatement: texts[0] || "尚未识别到明确的问题描述。",
    goals: texts.slice(1, 4),
    risks: ["材料中的范围、角色和优先级可能尚未完成交叉核对。"],
    missingInformation: ["关键用户与决策人确认", "首期范围和明确排除项", "预算、周期及验收标准"],
    recommendedNextStep: "核对初步理解中的问题、目标和缺失信息，然后进入正式方案生成。",
  };
}

function estimateCost(input: number | null, output: number | null) {
  if (input == null || output == null) return null;
  const inputRate = Number(process.env.PRODUCT_FREE_MODEL_INPUT_USD_PER_MILLION || 0);
  const outputRate = Number(process.env.PRODUCT_FREE_MODEL_OUTPUT_USD_PER_MILLION || 0);
  return Math.round(input * inputRate + output * outputRate);
}

const analysisSchema = { type: "object", additionalProperties: false, required: ["summary", "problemStatement", "goals", "risks", "missingInformation", "recommendedNextStep"], properties: { summary: { type: "string" }, problemStatement: { type: "string" }, goals: { type: "array", items: { type: "string" }, maxItems: 5 }, risks: { type: "array", items: { type: "string" }, maxItems: 5 }, missingInformation: { type: "array", items: { type: "string" }, maxItems: 6 }, recommendedNextStep: { type: "string" } } };
