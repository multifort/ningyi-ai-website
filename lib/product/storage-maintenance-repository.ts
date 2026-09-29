export type StorageMaintenanceMode = "audit" | "cleanup";

export type StorageMaintenanceResult = {
  scannedFiles: number;
  referencedFiles: number;
  orphanFiles: number;
  removedFiles: number;
  removedBytes: number;
};

export interface StorageMaintenanceRepository {
  start(runId: string, mode: StorageMaintenanceMode): void;
  referencedObjectKeys(): Set<string>;
  complete(runId: string, result: StorageMaintenanceResult): void;
  fail(runId: string): void;
}
