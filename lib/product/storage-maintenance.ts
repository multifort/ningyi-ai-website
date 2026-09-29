import { randomUUID } from "crypto";
import { productSqlite } from "./db";
import { deletePrivateFile, listAllPrivateFiles } from "./private-storage";

export async function maintainPrivateStorage(mode: "audit" | "cleanup") {
  const runId = randomUUID();
  productSqlite.prepare("INSERT INTO storage_maintenance_runs (id, mode, status) VALUES (?, ?, 'running')").run(runId, mode);
  try {
    const references = referencedKeys();
    const files = await listAllPrivateFiles();
    const graceMs = Math.max(60, Number(process.env.PRODUCT_ORPHAN_GRACE_SECONDS || 86400)) * 1000;
    const cutoff = Date.now() - graceMs;
    const orphans = files.filter((file) => !references.has(file.key) && file.modifiedAt.getTime() < cutoff && !file.symbolicLink).slice(0, 200);
    let removedFiles = 0, removedBytes = 0;
    if (mode === "cleanup") for (const orphan of orphans) {
      await deletePrivateFile(orphan.key);
      removedFiles += 1; removedBytes += orphan.size;
    }
    productSqlite.prepare(`UPDATE storage_maintenance_runs SET status = 'completed', scanned_files = ?, referenced_files = ?, orphan_files = ?, removed_files = ?, removed_bytes = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(files.length, files.filter((file) => references.has(file.key)).length, orphans.length, removedFiles, removedBytes, runId);
    return { runId, mode, scannedFiles: files.length, referencedFiles: files.filter((file) => references.has(file.key)).length, orphanFiles: orphans.length, removedFiles, removedBytes, graceSeconds: graceMs / 1000 };
  } catch (error) {
    productSqlite.prepare("UPDATE storage_maintenance_runs SET status = 'failed', error_code = 'STORAGE_MAINTENANCE_FAILED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(runId);
    throw error;
  }
}

function referencedKeys() {
  const refs = new Set<string>();
  const rows = [
    ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, id AS fileId FROM source_files WHERE storage_key IS NOT NULL").all(),
    ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, id AS fileId FROM deliverable_artifacts").all(),
    ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, artifact_id AS fileId FROM deliverable_artifact_versions").all(),
  ] as Array<{ userId: string; solutionId: string; fileId: string }>;
  for (const row of rows) refs.add(`private/${row.userId}/${row.solutionId}/${row.fileId}`);
  return refs;
}
