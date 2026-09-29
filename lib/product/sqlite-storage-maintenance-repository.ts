import { productSqlite } from "./db";
import type { StorageMaintenanceMode, StorageMaintenanceRepository, StorageMaintenanceResult } from "./storage-maintenance-repository";

export class SqliteStorageMaintenanceRepository implements StorageMaintenanceRepository {
  start(runId: string, mode: StorageMaintenanceMode) {
    productSqlite.prepare("INSERT INTO storage_maintenance_runs (id, mode, status) VALUES (?, ?, 'running')").run(runId, mode);
  }

  referencedObjectKeys() {
    const refs = new Set<string>();
    const rows = [
      ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, id AS fileId FROM source_files WHERE storage_key IS NOT NULL").all(),
      ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, id AS fileId FROM deliverable_artifacts").all(),
      ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, artifact_id AS fileId FROM deliverable_artifact_versions").all(),
    ] as Array<{ userId: string; solutionId: string; fileId: string }>;
    for (const row of rows) refs.add(`private/${row.userId}/${row.solutionId}/${row.fileId}`);
    return refs;
  }

  complete(runId: string, result: StorageMaintenanceResult) {
    productSqlite.prepare(`UPDATE storage_maintenance_runs SET status = 'completed', scanned_files = ?, referenced_files = ?, orphan_files = ?, removed_files = ?, removed_bytes = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      result.scannedFiles,
      result.referencedFiles,
      result.orphanFiles,
      result.removedFiles,
      result.removedBytes,
      runId,
    );
  }

  fail(runId: string) {
    productSqlite.prepare("UPDATE storage_maintenance_runs SET status = 'failed', error_code = 'STORAGE_MAINTENANCE_FAILED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(runId);
  }
}
