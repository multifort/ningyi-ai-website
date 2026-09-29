export type PrivateObject = {
  key: string;
  size: number;
  modifiedAt: Date;
  symbolicLink: boolean;
};

export interface ObjectStoragePort {
  put(key: string, bytes: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  list(prefix: string): Promise<PrivateObject[]>;
  readiness(): Promise<boolean>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function privateObjectKey(userId: string, solutionId: string, fileId: string) {
  assertUuid(userId);
  assertUuid(solutionId);
  assertUuid(fileId);
  return `private/${userId}/${solutionId}/${fileId}`;
}

export function privateSolutionPrefix(userId: string, solutionId: string) {
  assertUuid(userId);
  assertUuid(solutionId);
  return `private/${userId}/${solutionId}`;
}

export function parsePrivateObjectKey(key: string) {
  const parts = key.split("/");
  if (parts.length !== 4 || parts[0] !== "private") throw new Error("INVALID_STORAGE_KEY");
  const [userId, solutionId, fileId] = parts.slice(1);
  try {
    assertUuid(userId);
    assertUuid(solutionId);
    assertUuid(fileId);
  } catch {
    throw new Error("INVALID_STORAGE_KEY");
  }
  return { userId, solutionId, fileId };
}

export function parsePrivateSolutionPrefix(prefix: string) {
  const parts = prefix.split("/");
  if (parts.length !== 3 || parts[0] !== "private") throw new Error("INVALID_STORAGE_PREFIX");
  try {
    assertUuid(parts[1]);
    assertUuid(parts[2]);
  } catch {
    throw new Error("INVALID_STORAGE_PREFIX");
  }
  return { userId: parts[1], solutionId: parts[2] };
}

function assertUuid(value: string) {
  if (!uuid.test(value)) throw new Error("INVALID_PRIVATE_PATH_ID");
}
