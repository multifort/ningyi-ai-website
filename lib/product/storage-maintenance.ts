import { randomUUID } from "crypto";
import { storageMaintenanceRepository } from "./product-data-ports";
import { deletePrivateFile, listAllPrivateFiles } from "./private-storage";

export async function maintainPrivateStorage(mode: "audit" | "cleanup") {
  const runId = randomUUID();
  const repository = storageMaintenanceRepository();
  await repository.start(runId, mode);
  try {
    const references = await repository.referencedObjectKeys();
    const files = await listAllPrivateFiles();
    const graceMs = Math.max(60, Number(process.env.PRODUCT_ORPHAN_GRACE_SECONDS || 86400)) * 1000;
    const cutoff = Date.now() - graceMs;
    const orphans = files.filter((file) => !references.has(file.key) && file.modifiedAt.getTime() < cutoff && !file.symbolicLink).slice(0, 200);
    let removedFiles = 0, removedBytes = 0;
    if (mode === "cleanup") for (const orphan of orphans) {
      await deletePrivateFile(orphan.key);
      removedFiles += 1; removedBytes += orphan.size;
    }
    const result = { scannedFiles: files.length, referencedFiles: files.filter((file) => references.has(file.key)).length, orphanFiles: orphans.length, removedFiles, removedBytes };
    await repository.complete(runId, result);
    return { runId, mode, ...result, graceSeconds: graceMs / 1000 };
  } catch (error) {
    await repository.fail(runId);
    throw error;
  }
}
