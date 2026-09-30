export type FormalWork = { solutionId: string; userId: string };
export type RenderClaim = { status: "idle" } | { status: "contended"; solutionId: string } | { status: "claimed"; work: FormalWork };
export type FormalOutlineSection = { id: string; sectionIndex: number; sectionKey: string; title: string };
export type FormalSectionContextData = {
  blocks: Array<{ id: string; blockType: string; text: string }>;
  prior: Array<{ title: string; summary: string | null; structuredItemsJson: string | null }>;
  retry?: { attemptNo: number; errorCode: string | null; qualityJson: string | null };
};
export type FormalSectionClaim =
  | { status: "idle" }
  | { status: "contended" }
  | { status: "retry_exhausted" }
  | { status: "claimed"; section: { id: string; sectionIndex: number; sectionKey: string; title: string; retryCycle: number }; attemptNo: number; cycleAttemptNo: number };
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
  nextPendingSection(solutionId: string): Promise<{ id: string; sectionIndex: number; sectionKey: string; title: string; retryCycle: number } | undefined>;
  claimFormalSection(input: { solutionId: string; sectionId: string; workerId?: string; leaseSeconds: number; contextHash: string; contextManifestJson: string; callId: string; attemptId: string; provider: string; model: string; modelVersion: string; promptVersion: string; parserVersion: string; configurationHash: string; maxAttempts: number }): Promise<FormalSectionClaim>;
  sectionContextData(solutionId: string, sectionKey: string): Promise<FormalSectionContextData>;
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
