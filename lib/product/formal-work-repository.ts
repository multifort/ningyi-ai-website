export type FormalWork = { solutionId: string; userId: string };
export type RenderClaim = { status: "idle" } | { status: "contended"; solutionId: string } | { status: "claimed"; work: FormalWork };
export type FormalOutlineSection = { id: string; sectionIndex: number; sectionKey: string; title: string };
export type FormalDocumentState = {
  status: string;
  provider: string;
  model: string;
  currentSection: number;
  totalSections: number;
  lastErrorCode: string | null;
  sections: Array<{
    sectionIndex: number;
    sectionKey: string;
    title: string;
    status: string;
    summary: string | null;
    retryCycle: number;
    nextAttemptAt: string | null;
    failedAt: string | null;
    attemptCount: number;
  }>;
};

export interface FormalWorkRepository {
  initializeDocument(input: { solutionId: string; provider: string; model: string; configured: boolean; outline: FormalOutlineSection[] }): Promise<void>;
  documentState(solutionId: string): Promise<FormalDocumentState | undefined>;
  markAwaitingConfiguration(solutionId: string): Promise<void>;
  processingAllowed(solutionId: string, userId: string): Promise<boolean>;
  recoverStaleFormal(solutionId: string | undefined, staleAfterSeconds: number): Promise<number>;
  repairExhaustedFormal(olderThanSeconds: number): Promise<number>;
  reactivateConfiguredFormal(provider: string): Promise<number>;
  recoverStaleRendering(): Promise<number>;
  repairExhaustedRendering(olderThanSeconds: number): Promise<number>;
  requeueIncompleteDeliveries(requiredArtifactTypes: readonly string[], limit: number): Promise<number>;
  findPendingFormal(userConcurrency: number): Promise<FormalWork | undefined>;
  claimRendering(workerId: string, userConcurrency: number, leaseSeconds: number): Promise<RenderClaim>;
  renderAttemptCount(solutionId: string, workerId: string): Promise<number | undefined>;
  recordRenderFailure(input: { solutionId: string; workerId: string; exhausted: boolean; retrySeconds: number; errorCode: string }): Promise<boolean>;
}
