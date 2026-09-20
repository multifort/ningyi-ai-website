export type RecoveryStatus = {
  state: "environment_wait" | "cooldown" | "retry_wait";
  stageLabel: string;
  nextRetryAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string | null;
  headline: string;
  message: string;
};

export function solutionRecoveryStatus(solution: any, run: any, media: any, formal: any): RecoveryStatus | null {
  if (solution.stage === "quick_understanding" && run && ["retry_wait", "failed"].includes(run.status)) return recoveryCopy("资料解析", run.status, run.nextAttemptAt || repairAt(run.failedAt, "PRODUCT_SOURCE_AUTO_REPAIR_SECONDS"), run.attemptCount, Number(process.env.PRODUCT_SOURCE_MAX_ATTEMPTS || 5), run.errorCode);
  if (solution.stage === "media_analysis" && media) return recoveryCopy("图片与扫描材料识别", media.status, media.nextAttemptAt || repairAt(media.failedAt, "PRODUCT_MEDIA_AUTO_REPAIR_SECONDS"), media.attemptCount, Number(process.env.PRODUCT_MEDIA_CONFIGURATION_MAX_ATTEMPTS || 5), media.errorCode);
  if (solution.stage === "formal_analysis" && formal) {
    const section = formal.sections?.find((item: any) => item.status === "failed") || formal.sections?.find((item: any) => item.nextAttemptAt);
    if (section || formal.status === "awaiting_configuration") return recoveryCopy("正式方案内容生成", formal.status === "awaiting_configuration" ? "awaiting_configuration" : section.status, section?.nextAttemptAt || repairAt(section?.failedAt, "PRODUCT_FORMAL_AUTO_REPAIR_SECONDS"), section?.attemptCount || 0, Number(process.env.PRODUCT_FORMAL_SECTION_MAX_ATTEMPTS || 3), formal.lastErrorCode);
  }
  if (solution.stage === "rendering" && ["recovering", "blocked"].includes(solution.status)) return recoveryCopy("成果文件整理", solution.status, solution.renderNextAttemptAt || repairAt(solution.renderFailedAt, "PRODUCT_RENDER_AUTO_REPAIR_SECONDS"), solution.renderAttemptCount, Number(process.env.PRODUCT_RENDER_MAX_ATTEMPTS || 5), solution.renderErrorCode);
  return null;
}

function recoveryCopy(stageLabel: string, status: string, nextRetryAt: string | null, attemptCount: number, maxAttempts: number, errorCode?: string | null): RecoveryStatus {
  const waitingConfiguration = status === "awaiting_configuration";
  const blocked = status === "failed" || status === "blocked";
  return {
    state: waitingConfiguration ? "environment_wait" : blocked ? "cooldown" : "retry_wait",
    stageLabel, nextRetryAt: isoTimestamp(nextRetryAt), attemptCount, maxAttempts, errorCode: errorCode || null,
    headline: waitingConfiguration ? `${stageLabel}环境正在准备` : blocked ? `${stageLabel}已进入自动修复冷却` : `${stageLabel}将在稍后自动重试`,
    message: waitingConfiguration ? "系统正在等待所需能力恢复，恢复后会自动继续，你不需要重新提交材料。" : blocked ? "系统已停止连续重复消耗，将在冷却期结束后自动开启新一轮修复。" : "本次处理未通过，系统已保留当前进度并安排下一次自动尝试。",
  };
}

function repairAt(failedAt: string | null | undefined, envName: string) {
  if (!failedAt) return null;
  const seconds = Number(process.env[envName] || 6 * 60 * 60);
  const timestamp = Date.parse(isoTimestamp(failedAt) || "");
  return Number.isFinite(timestamp) ? new Date(timestamp + seconds * 1000).toISOString() : null;
}

function isoTimestamp(value: string | null | undefined) {
  if (!value) return null;
  if (value.includes("T")) return value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  return `${value.replace(" ", "T")}Z`;
}
