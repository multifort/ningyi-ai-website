export type DeletionRun = {
  id: string;
  solutionId: string;
  ownerUserId: string;
  attemptCount: number;
};

export interface DeletionRepository {
  repairFailed(olderThanSeconds: number): number;
  recoverExpiredLeases(): number;
  claimNext(workerId: string, leaseSeconds: number): DeletionRun | undefined;
  assertLease(runId: string, workerId: string): void;
  completeSolution(run: DeletionRun, workerId: string): void;
  recordFailure(runId: string, workerId: string, exhausted: boolean, retrySeconds: number): void;
  finalizeAccounts(): number;
}
