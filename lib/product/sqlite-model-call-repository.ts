import { productSqlite } from "./db";
import type { ModelCallRepository, ModelCallStart } from "./model-call-repository";

export class SqliteModelCallRepository implements ModelCallRepository {
  async start(input: ModelCallStart) {
    productSqlite.prepare(`INSERT INTO model_calls
      (id, solution_id, purpose, provider, model, model_version, prompt_version, parser_version, configuration_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`).run(input.id, input.solutionId, input.purpose, input.provider, input.model, input.modelVersion, input.promptVersion, input.parserVersion, input.configurationHash);
  }

  async succeed(id: string, usage: { inputTokens: number | null; outputTokens: number | null; estimatedCostMicrousd: number | null }) {
    productSqlite.prepare("UPDATE model_calls SET status = 'succeeded', input_tokens = ?, output_tokens = ?, estimated_cost_microusd = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(usage.inputTokens, usage.outputTokens, usage.estimatedCostMicrousd, id);
  }

  async fail(id: string, errorCode: string) {
    productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(errorCode, id);
  }
}
