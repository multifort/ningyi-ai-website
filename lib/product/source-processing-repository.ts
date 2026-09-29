export type StoredSourceFile = {
  id: string;
  originalName: string;
  detectedFormat: string;
  storageKey: string;
  category: string;
};

export type SourceIntake = {
  purposePrimary: string;
  needDescription: string;
  formData: string;
};

export type PersistedSourceBlock = {
  id: string;
  sourceFileId: string | null;
  blockType: string;
  canonicalText: string;
  locator: unknown;
  contentHash: string;
  sourceFormat?: string;
  warnings?: string[];
  confidence?: number;
  structuredData?: unknown;
  parser?: unknown;
};

export type MediaAnalysisRoute = {
  sourceFileId: string;
  sourceBlockId: string;
  route: string;
  fallbackRoute: string;
  status: string;
  requiresModel: boolean;
  reasonCodes: string[];
  signals: Record<string, unknown>;
  inputHash: string;
};

export type SourceFact = { id: string; text: string; sourceBlockId?: string };
export type SourceTask = { solutionId: string; userId: string };
export type SourceTaskClaim = { status: "idle" } | { status: "contended"; solutionId: string } | { status: "claimed"; task: SourceTask };
export type SourceQueueResult = { status: string; attemptCount: number; enqueued: boolean };

export interface SourceProcessingRepository {
  startInline(runId: string, solutionId: string, userId: string): Promise<void>;
  loadInput(solutionId: string, userId: string): Promise<{ files: StoredSourceFile[]; intake: SourceIntake }>;
  commitParsed(input: {
    solutionId: string;
    workerId?: string;
    blocks: PersistedSourceBlock[];
    mediaRoutes: MediaAnalysisRoute[];
    facts: SourceFact[];
    summary: string;
    pendingMedia: boolean;
  }): Promise<void>;
  attemptCount(solutionId: string): Promise<number>;
  recordFailure(solutionId: string, workerId: string | undefined, exhausted: boolean, retrySeconds: number): Promise<void>;
  enqueue(runId: string, solutionId: string, userId: string): Promise<SourceQueueResult>;
  claimNext(workerId: string, userConcurrency: number, leaseSeconds: number): Promise<SourceTaskClaim>;
  recoverStale(olderThanSeconds: number): Promise<number>;
  repairFailed(olderThanSeconds: number): Promise<number>;
}
