export const PRODUCT_API_BASE = "/api/product" as const;

export type IntakeValidationRequest = {
  purposePrimary: string | null;
  needDescription: string;
  hasSelectedContentFile: boolean;
};

export type IntakeValidationError =
  | "PURPOSE_REQUIRED"
  | "DESCRIPTION_OR_CONTENT_FILE_REQUIRED";

export type IntakeValidationResponse = {
  valid: boolean;
  errors: IntakeValidationError[];
};

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; retryable: boolean };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const productApi = {
  validateIntake: `${PRODUCT_API_BASE}/intake/validate`,
  register: `${PRODUCT_API_BASE}/auth/register`,
  login: `${PRODUCT_API_BASE}/auth/login`,
  session: `${PRODUCT_API_BASE}/auth/session`,
  logout: `${PRODUCT_API_BASE}/auth/logout`,
  account: `${PRODUCT_API_BASE}/account`,
  accountDataExport: `${PRODUCT_API_BASE}/account/export`,
  changePassword: `${PRODUCT_API_BASE}/account/password`,
  handoffIntake: `${PRODUCT_API_BASE}/intake/handoff`,
  solutions: `${PRODUCT_API_BASE}/solutions`,
  deleteSolution: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}`,
  duplicateSolution: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/duplicate`,
  updateSolution: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}`,
  addMaterials: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/materials`,
  removeMaterial: (solutionId: string, fileId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/materials/${encodeURIComponent(fileId)}`,
  updateIntakeDescription: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/intake`,
  addTemplates: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/templates`,
  removeTemplate: (solutionId: string, fileId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/templates/${encodeURIComponent(fileId)}`,
  addBrands: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/brands`,
  removeBrand: (solutionId: string, fileId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/brands/${encodeURIComponent(fileId)}`,
  sourcePackage: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/source-package`,
  upload: (solutionId: string, fileId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/uploads/${encodeURIComponent(fileId)}`,
  progress: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/progress`,
  process: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/process`,
  understanding: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/understanding`,
  projectModel: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model`,
  quoteParameters: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/quote-parameters`,
  projectModelDraft: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/draft`,
  projectModelRevise: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/revise`,
  activateProjectModel: (solutionId: string, snapshotId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/${encodeURIComponent(snapshotId)}/activate`,
  rejectProjectModel: (solutionId: string, snapshotId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/${encodeURIComponent(snapshotId)}/reject`,
  projectModelEntityRevision: (solutionId: string, entityKey: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/entities/${encodeURIComponent(entityKey)}/revision`,
  projectModelImpact: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/impact`,
  acceptProjectModelImpact: (solutionId: string, planId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/impact/${encodeURIComponent(planId)}/accept`,
  executeProjectModelImpact: (solutionId: string, planId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/project-model/impact/${encodeURIComponent(planId)}/execute`,
  addUnderstandingFact: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/understanding/facts`,
  removeUnderstandingFact: (solutionId: string, factId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/understanding/facts/${encodeURIComponent(factId)}`,
  formal: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/formal`,
  deliverables: (solutionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/deliverables`,
  deliverablePackage: (solutionId: string, scope: "client" | "internal" | "archive" = "client") => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/deliverables/package?scope=${scope}`,
  createDeliverableDownload: (solutionId: string, artifactId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/deliverables/${encodeURIComponent(artifactId)}/download`,
  deliverableVersions: (solutionId: string, artifactId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/deliverables/${encodeURIComponent(artifactId)}/versions`,
  createDeliverableVersionDownload: (solutionId: string, artifactId: string, versionId: string) => `${PRODUCT_API_BASE}/solutions/${encodeURIComponent(solutionId)}/deliverables/${encodeURIComponent(artifactId)}/versions/${encodeURIComponent(versionId)}/download`,
} as const;

export function validateIntake(request: IntakeValidationRequest): IntakeValidationResponse {
  const errors: IntakeValidationError[] = [];
  if (!request.purposePrimary?.trim()) errors.push("PURPOSE_REQUIRED");
  if (!request.needDescription.trim() && !request.hasSelectedContentFile) {
    errors.push("DESCRIPTION_OR_CONTENT_FILE_REQUIRED");
  }
  return { valid: errors.length === 0, errors };
}
