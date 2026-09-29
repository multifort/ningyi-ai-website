import fs from "fs/promises";
import path from "path";
import type { Dirent } from "fs";
import type { ObjectStoragePort, PrivateObject } from "./object-storage-port";
import { parsePrivateObjectKey, parsePrivateSolutionPrefix } from "./object-storage-port";

export class LocalObjectStorage implements ObjectStoragePort {
  constructor(private readonly root: () => string) {}

  async put(key: string, bytes: Buffer) {
    const target = this.pathForKey(key);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.uploading`;
    await fs.writeFile(temporary, bytes, { mode: 0o600 });
    await fs.rename(temporary, target);
  }

  read(key: string) {
    return fs.readFile(this.pathForKey(key));
  }

  async delete(key: string) {
    await fs.rm(this.pathForKey(key), { force: true });
  }

  async deletePrefix(prefix: string) {
    const { userId, solutionId } = parsePrivateSolutionPrefix(prefix);
    await fs.rm(path.join(this.resolvedRoot(), userId, solutionId), { recursive: true, force: true });
  }

  async list(prefix: string) {
    const scope = prefix === "private" ? null : parsePrivateSolutionPrefix(prefix);
    const base = scope ? path.join(this.resolvedRoot(), scope.userId, scope.solutionId) : this.resolvedRoot();
    const result: PrivateObject[] = [];
    await this.walk(base, scope ? [scope.userId, scope.solutionId] : [], result);
    return result;
  }

  async readiness() {
    const root = this.resolvedRoot();
    const probe = path.join(root, `.readiness-${process.pid}-${Date.now()}`);
    try {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      await fs.writeFile(probe, "ready", { mode: 0o600 });
      await fs.unlink(probe);
      return true;
    } catch {
      await fs.unlink(probe).catch(() => undefined);
      return false;
    }
  }

  pathForKey(key: string) {
    const { userId, solutionId, fileId } = parsePrivateObjectKey(key);
    return path.join(this.resolvedRoot(), userId, solutionId, fileId);
  }

  private resolvedRoot() {
    return path.resolve(this.root());
  }

  private async walk(directory: string, relative: string[], result: PrivateObject[]) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const next = [...relative, entry.name];
      if (entry.isDirectory() && next.length < 3) {
        await this.walk(target, next, result);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const stat = await fs.lstat(target);
      result.push({ key: `private/${next.join("/")}`, size: stat.size, modifiedAt: stat.mtime, symbolicLink: entry.isSymbolicLink() });
    }
  }
}

function isMissing(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
