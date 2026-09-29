export type FormalWork = { solutionId: string; userId: string };
export type RenderClaim = { status: "idle" } | { status: "contended"; solutionId: string } | { status: "claimed"; work: FormalWork };

export interface FormalWorkRepository {
  recoverStaleRendering(): Promise<number>;
  repairExhaustedRendering(olderThanSeconds: number): Promise<number>;
  requeueIncompleteDeliveries(requiredArtifactTypes: readonly string[], limit: number): Promise<number>;
  findPendingFormal(userConcurrency: number): Promise<FormalWork | undefined>;
  claimRendering(workerId: string, userConcurrency: number, leaseSeconds: number): Promise<RenderClaim>;
  renderAttemptCount(solutionId: string, workerId: string): Promise<number | undefined>;
  recordRenderFailure(input: { solutionId: string; workerId: string; exhausted: boolean; retrySeconds: number; errorCode: string }): Promise<boolean>;
}
