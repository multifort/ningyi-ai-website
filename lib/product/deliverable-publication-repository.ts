export type ExistingArtifact = {
  id: string;
  solutionId: string;
  userId: string;
  artifactType: string;
  displayName: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  qualityJson: string;
  contentFingerprint: string | null;
  renderFingerprint: string | null;
  contentVersion: number;
  renderVersion: number;
};

export type ArtifactPublication = {
  artifactId: string;
  solutionId: string;
  userId: string;
  artifactType: string;
  displayName: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  qualityJson: string;
  contentFingerprint: string;
  renderFingerprint: string;
  contentVersion: number;
  renderVersion: number;
  existing?: ExistingArtifact;
};

export type DeliverableSummary = {
  id: string;
  artifactType: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  contentVersion: number;
  renderVersion: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  historyCount: number;
};

export type PresentationSourceRemoval = {
  sourceFileId: string;
  solutionId: string;
  userId: string;
  artifactTypes?: string[];
  eventType: "template_removed" | "brand_removed";
  eventSummary: string;
};

export interface DeliverablePublicationRepository {
  assertRenderLease(solutionId: string, workerId?: string): Promise<void>;
  findExisting(solutionId: string, artifactType: string): Promise<ExistingArtifact | undefined>;
  restoreAvailable(artifactId: string, userId: string, solutionId: string, workerId?: string): Promise<void>;
  publish(input: ArtifactPublication, workerId?: string): Promise<void>;
  contentSections(solutionId: string, titles: string[]): Promise<unknown[]>;
  templateProfile(solutionId: string, expectedFormat: string): Promise<unknown>;
  listAvailable(solutionId: string, userId: string): Promise<DeliverableSummary[]>;
  hasCompleteFormalDocument(solutionId: string): Promise<boolean>;
  invalidateAvailable(solutionId: string, userId: string, artifactTypes?: string[]): Promise<number>;
  removePresentationSource(input: PresentationSourceRemoval): Promise<boolean>;
  availableRenderFingerprints(solutionId: string, userId: string): Promise<Array<{ id: string; artifactType: string; renderFingerprint: string | null }>>;
  supersedeArtifact(artifactId: string): Promise<void>;
}
