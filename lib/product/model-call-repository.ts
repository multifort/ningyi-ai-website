export type ModelCallStart = {
  id: string;
  solutionId: string;
  purpose: string;
  provider: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  parserVersion: string;
  configurationHash: string;
};

export interface ModelCallRepository {
  start(input: ModelCallStart): Promise<void>;
  succeed(id: string, usage: { inputTokens: number | null; outputTokens: number | null; estimatedCostMicrousd: number | null }): Promise<void>;
  fail(id: string, errorCode: string): Promise<void>;
}
