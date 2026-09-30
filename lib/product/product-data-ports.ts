import type { DeletionRepository } from "./deletion-repository";
import type { DeliverablePublicationRepository } from "./deliverable-publication-repository";
import type { FormalWorkRepository } from "./formal-work-repository";
import type { MediaTaskRepository } from "./media-task-repository";
import type { ModelCallRepository } from "./model-call-repository";
import type { StorageMaintenanceRepository } from "./storage-maintenance-repository";
import { SqliteDeletionRepository } from "./sqlite-deletion-repository";
import { SqliteDeliverablePublicationRepository } from "./sqlite-deliverable-publication-repository";
import { SqliteFormalWorkRepository } from "./sqlite-formal-work-repository";
import { SqliteMediaTaskRepository } from "./sqlite-media-task-repository";
import { SqliteModelCallRepository } from "./sqlite-model-call-repository";
import { SqliteSourceProcessingRepository } from "./sqlite-source-processing-repository";
import { SqliteStorageMaintenanceRepository } from "./sqlite-storage-maintenance-repository";
import type { SourceProcessingRepository } from "./source-processing-repository";

const sqliteStorageMaintenance = new SqliteStorageMaintenanceRepository();
const sqliteDeletion = new SqliteDeletionRepository();
const sqliteDeliverablePublication = new SqliteDeliverablePublicationRepository();
const sqliteFormalWork = new SqliteFormalWorkRepository();
const sqliteSourceProcessing = new SqliteSourceProcessingRepository();
const sqliteMediaTask = new SqliteMediaTaskRepository();
const sqliteModelCall = new SqliteModelCallRepository();

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

export function mediaTaskRepository(): MediaTaskRepository {
  assertSqliteDriver();
  return sqliteMediaTask;
}

export function modelCallRepository(): ModelCallRepository {
  assertSqliteDriver();
  return sqliteModelCall;
}

export function formalWorkRepository(): FormalWorkRepository {
  assertSqliteDriver();
  return sqliteFormalWork;
}

export function deliverablePublicationRepository(): DeliverablePublicationRepository {
  assertSqliteDriver();
  return sqliteDeliverablePublication;
}
