export type StorageMaintenanceMode = "audit" | "cleanup";

export type StorageMaintenanceResult = {
  scannedFiles: number;
  referencedFiles: number;
  orphanFiles: number;
  removedFiles: number;
  removedBytes: number;
};

export interface StorageMaintenanceRepository {
  start(runId: string, mode: StorageMaintenanceMode): Promise<void>;
  referencedObjectKeys(): Promise<Set<string>>;
  complete(runId: string, result: StorageMaintenanceResult): Promise<void>;
  fail(runId: string): Promise<void>;
}
