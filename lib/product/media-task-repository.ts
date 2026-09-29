export type MediaTask = {
  id: string;
  solutionId: string;
  sourceFileId: string;
  sourceBlockId: string;
  route: string;
  fallbackRoute: string;
  attemptCount: number;
  userId: string;
  detectedFormat: string;
  storageKey: string;
  originalName: string;
  metadataJson: string;
};

export class MediaLeaseLostError extends Error {
  constructor() { super("MEDIA_LEASE_LOST"); }
}

export interface MediaTaskRepository {
  findNext(userConcurrency: number): Promise<MediaTask | undefined>;
  claim(taskId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  complete(task: MediaTask, workerId: string, result: { canonicalText: string; contentHash: string; confidence: number; provider: string; model: string }): Promise<number>;
  scheduleFallback(taskId: string, workerId: string, route: string, fallbackRoute: string, errorCode: string): Promise<boolean>;
  recordConfigurationFailure(task: MediaTask, workerId: string, exhausted: boolean, errorCode: string, retrySeconds: number): Promise<boolean>;
  recordTerminalFailure(task: MediaTask, workerId: string, errorCode: string): Promise<{ owned: boolean; terminal: boolean }>;
  recoverStale(olderThanSeconds: number): Promise<number>;
  repairFailed(olderThanSeconds: number): Promise<number>;
  advanceToFormalAnalysis(solutionId: string): Promise<void>;
}
