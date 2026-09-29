import { randomUUID } from "crypto";
import type { DeletionRun } from "./deletion-repository";
import { deletionRepository } from "./product-data-ports";
import { deletePrivateSolution } from "./private-storage";

export async function processDeletionBatch(requestedLimit = 2) {
  const limit = Math.min(10, Math.max(1, Math.floor(requestedLimit)));
  const workerId = randomUUID();
  const repository = deletionRepository();
  const repairSeconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_DELETION_AUTO_REPAIR_SECONDS || 21600)));
  const repaired = await repository.repairFailed(repairSeconds);
  const recovered = await repository.recoverExpiredLeases();
  const leaseSeconds = Math.min(3600, Math.max(60, Number(process.env.PRODUCT_DELETION_LEASE_SECONDS || 600)));
  const claimed: DeletionRun[] = [];
  for (let index = 0; index < limit; index += 1) {
    const run = await repository.claimNext(workerId, leaseSeconds);
    if (!run) break;
    claimed.push(run);
  }
  const results = await Promise.all(claimed.map((run) => executeDeletion(run, workerId, repository)));
  const finalizedAccounts = await repository.finalizeAccounts();
  return {
    workerId,
    claimed: claimed.length,
    processed: results.length,
    completed: results.filter((result) => result === "completed").length,
    retrying: results.filter((result) => result === "retry_wait").length,
    failed: results.filter((result) => result === "failed").length,
    recovered,
    repaired,
    finalizedAccounts,
  };
}

async function executeDeletion(run: DeletionRun, workerId: string, repository: ReturnType<typeof deletionRepository>): Promise<"completed" | "retry_wait" | "failed"> {
  try {
    await repository.assertLease(run.id, workerId);
    await deletePrivateSolution(run.ownerUserId, run.solutionId);
    await repository.assertLease(run.id, workerId);
    await repository.completeSolution(run, workerId);
    return "completed";
  } catch {
    const exhausted = run.attemptCount + 1 >= 5;
    const retryDelays = [5, 30, 120, 600];
    const retrySeconds = retryDelays[Math.min(run.attemptCount, retryDelays.length - 1)];
    await repository.recordFailure(run.id, workerId, exhausted, retrySeconds);
    return exhausted ? "failed" : "retry_wait";
  }
}
