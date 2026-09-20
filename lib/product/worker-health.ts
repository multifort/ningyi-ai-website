export type WorkerHealthRow = { capabilitiesJson: string; healthJson: string };

const LOOP_NAMES = ["pipeline", "deletion", "operations", "storage_maintenance"] as const;
const MAX_CLOCK_SKEW_MS = 60_000;

export function sanitizeWorkerLoopHealth(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, { lastSuccessAt: string | null; lastProgressAt: string | null; consecutiveFailures: number }> = {};
  for (const name of LOOP_NAMES) {
    const item = (value as Record<string, any>)[name];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    result[name] = {
      lastSuccessAt: safeTimestamp(item.lastSuccessAt, now),
      lastProgressAt: safeTimestamp(item.lastProgressAt, now),
      consecutiveFailures: Math.min(1000, Math.max(0, Math.floor(Number(item.consecutiveFailures) || 0))),
    };
  }
  return result;
}

export function workerLoopHealthy(workers: WorkerHealthRow[], capability: string, loop: string, backlog: number, staleSeconds: number, now = Date.now()) {
  if (backlog === 0) return true;
  return workerCapabilityLoopHealthy(workers, capability, loop, staleSeconds, now);
}

export function workerCapabilityLoopHealthy(workers: WorkerHealthRow[], capability: string, loop: string, staleSeconds: number, now = Date.now()) {
  return workers.some((worker) => hasCapability(worker.capabilitiesJson, capability) && recentLoopSuccess(worker.healthJson, loop, staleSeconds, now));
}

function safeTimestamp(value: unknown, now: number) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now + MAX_CLOCK_SKEW_MS ? value : null;
}

function hasCapability(capabilitiesJson: string, capability: string) {
  try {
    const capabilities = JSON.parse(capabilitiesJson);
    return Array.isArray(capabilities) && capabilities.includes(capability);
  } catch {
    return false;
  }
}

function recentLoopSuccess(healthJson: string, loop: string, staleSeconds: number, now: number) {
  try {
    const value = JSON.parse(healthJson)?.[loop]?.lastSuccessAt;
    if (typeof value !== "string") return false;
    const timestamp = Date.parse(value);
    const age = now - timestamp;
    return Number.isFinite(age) && age >= -MAX_CLOCK_SKEW_MS && age <= staleSeconds * 1000;
  } catch {
    return false;
  }
}
