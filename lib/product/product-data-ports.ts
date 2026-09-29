import type { DeletionRepository } from "./deletion-repository";
import type { StorageMaintenanceRepository } from "./storage-maintenance-repository";
import { SqliteDeletionRepository } from "./sqlite-deletion-repository";
import { SqliteSourceProcessingRepository } from "./sqlite-source-processing-repository";
import { SqliteStorageMaintenanceRepository } from "./sqlite-storage-maintenance-repository";
import type { SourceProcessingRepository } from "./source-processing-repository";

const sqliteStorageMaintenance = new SqliteStorageMaintenanceRepository();
const sqliteDeletion = new SqliteDeletionRepository();
const sqliteSourceProcessing = new SqliteSourceProcessingRepository();

function assertSqliteDriver() {
  const driver = process.env.PRODUCT_DATA_DRIVER || "sqlite";
  if (driver !== "sqlite") throw new Error(`PRODUCT_DATA_DRIVER_UNAVAILABLE:${driver}`);
}

export function storageMaintenanceRepository(): StorageMaintenanceRepository {
  assertSqliteDriver();
  return sqliteStorageMaintenance;
}

export function deletionRepository(): DeletionRepository {
  assertSqliteDriver();
  return sqliteDeletion;
}

export function sourceProcessingRepository(): SourceProcessingRepository {
  assertSqliteDriver();
  return sqliteSourceProcessing;
}
