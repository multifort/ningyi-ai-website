import type { DeletionRepository } from "./deletion-repository";
import type { StorageMaintenanceRepository } from "./storage-maintenance-repository";
import { SqliteDeletionRepository } from "./sqlite-deletion-repository";
import { SqliteStorageMaintenanceRepository } from "./sqlite-storage-maintenance-repository";

const sqliteStorageMaintenance = new SqliteStorageMaintenanceRepository();
const sqliteDeletion = new SqliteDeletionRepository();

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
