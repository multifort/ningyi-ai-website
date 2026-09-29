export type DeletionRun = {
  id: string;
  solutionId: string;
  ownerUserId: string;
  attemptCount: number;
};

export interface DeletionRepository {
  repairFailed(olderThanSeconds: number): Promise<number>;
  recoverExpiredLeases(): Promise<number>;
  claimNext(workerId: string, leaseSeconds: number): Promise<DeletionRun | undefined>;
  assertLease(runId: string, workerId: string): Promise<void>;
  completeSolution(run: DeletionRun, workerId: string): Promise<void>;
  recordFailure(runId: string, workerId: string, exhausted: boolean, retrySeconds: number): Promise<void>;
  finalizeAccounts(): Promise<number>;
}
