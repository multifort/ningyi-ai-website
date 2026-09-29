import type { StorageMaintenanceRepository } from "./storage-maintenance-repository";
import { SqliteStorageMaintenanceRepository } from "./sqlite-storage-maintenance-repository";

const sqliteStorageMaintenance = new SqliteStorageMaintenanceRepository();

export function storageMaintenanceRepository(): StorageMaintenanceRepository {
  const driver = process.env.PRODUCT_DATA_DRIVER || "sqlite";
  if (driver !== "sqlite") throw new Error(`PRODUCT_DATA_DRIVER_UNAVAILABLE:${driver}`);
  return sqliteStorageMaintenance;
}
