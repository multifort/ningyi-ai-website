export type ChangePlan = {
  schemaVersion: "1.0";
  actionClass: "R" | "C" | "S" | "P";
  directTargets: string[];
  impactedTargets: Array<{ id: string; action: "rebuild_project_model" | "generate" | "calculate" | "check" | "render"; reasonPath: string[] }>;
  conflicts: Array<{ lockedTarget: string; blockedPath: string[]; code: "LOCKED_TARGET_CONFLICT" }>;
  unaffectedTargets: string[];
  modelTaskCount: number;
};
export function planChangeImpact(graph: { nodes: Array<{ id: string; kind: string }>; edges: Array<{ from: string; to: string; actions: string[] }> }, triggerType: string, directTargetIds: string[], lockedTargetIds?: string[]): ChangePlan;
