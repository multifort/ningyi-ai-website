import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { productSqlite } from "./db";
import { privateStorageRoot } from "./private-storage";

export async function maintainPrivateStorage(mode: "audit" | "cleanup") {
  const runId = randomUUID();
  productSqlite.prepare("INSERT INTO storage_maintenance_runs (id, mode, status) VALUES (?, ?, 'running')").run(runId, mode);
  try {
    const root = path.resolve(privateStorageRoot());
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const references = referencedPaths(root);
    const files = await walkFiles(root);
    const graceMs = Math.max(60, Number(process.env.PRODUCT_ORPHAN_GRACE_SECONDS || 86400)) * 1000;
    const cutoff = Date.now() - graceMs;
    const orphans = files.filter((file) => !references.has(file.path) && file.mtimeMs < cutoff && !file.symbolicLink).slice(0, 200);
    let removedFiles = 0, removedBytes = 0;
    if (mode === "cleanup") for (const orphan of orphans) {
      await fs.unlink(orphan.path);
      removedFiles += 1; removedBytes += orphan.size;
    }
    productSqlite.prepare(`UPDATE storage_maintenance_runs SET status = 'completed', scanned_files = ?, referenced_files = ?, orphan_files = ?, removed_files = ?, removed_bytes = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(files.length, files.filter((file) => references.has(file.path)).length, orphans.length, removedFiles, removedBytes, runId);
    return { runId, mode, scannedFiles: files.length, referencedFiles: files.filter((file) => references.has(file.path)).length, orphanFiles: orphans.length, removedFiles, removedBytes, graceSeconds: graceMs / 1000 };
  } catch (error) {
    productSqlite.prepare("UPDATE storage_maintenance_runs SET status = 'failed', error_code = 'STORAGE_MAINTENANCE_FAILED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(runId);
    throw error;
  }
}

function referencedPaths(root: string) {
  const refs = new Set<string>();
  const rows = [
    ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, id AS fileId FROM source_files WHERE storage_key IS NOT NULL").all(),
    ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, id AS fileId FROM deliverable_artifacts").all(),
    ...productSqlite.prepare("SELECT user_id AS userId, solution_id AS solutionId, artifact_id AS fileId FROM deliverable_artifact_versions").all(),
  ] as Array<{ userId: string; solutionId: string; fileId: string }>;
  for (const row of rows) if ([row.userId, row.solutionId, row.fileId].every((value) => /^[0-9a-f-]{36}$/i.test(value))) refs.add(path.join(root, row.userId, row.solutionId, row.fileId));
  return refs;
}

async function walkFiles(root: string) {
  const result: Array<{ path: string; size: number; mtimeMs: number; symbolicLink: boolean }> = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { const stat = await fs.lstat(target); result.push({ path: target, size: stat.size, mtimeMs: stat.mtimeMs, symbolicLink: true }); }
      else if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) { const stat = await fs.stat(target); result.push({ path: target, size: stat.size, mtimeMs: stat.mtimeMs, symbolicLink: false }); }
    }
  }
  return result;
}
