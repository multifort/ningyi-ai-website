import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { productSqlite } from "./db";

export type ProductUser = { id: string; username: string; status: string; sessionVersion: number };

export function normalizeUsername(username: string) {
  return username.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

export function validateCredentials(username: string, password: string) {
  const normalized = normalizeUsername(username);
  const errors: string[] = [];
  if (!/^[\p{L}\p{N}_-]{3,40}$/u.test(username.normalize("NFKC").trim())) errors.push("USERNAME_FORMAT_INVALID");
  if (Buffer.byteLength(password, "utf8") < 8 || Buffer.byteLength(password, "utf8") > 72) errors.push("PASSWORD_LENGTH_INVALID");
  return { normalized, errors };
}

export async function registerProductUser(username: string, password: string): Promise<ProductUser> {
  const display = username.normalize("NFKC").trim();
  const { normalized, errors } = validateCredentials(display, password);
  if (errors.length) throw Object.assign(new Error("INVALID_CREDENTIALS_FORMAT"), { code: errors[0] });
  const existing = productSqlite.prepare("SELECT id FROM product_users WHERE username_normalized = ?").get(normalized);
  if (existing) throw Object.assign(new Error("USERNAME_TAKEN"), { code: "USERNAME_TAKEN" });
  const user = { id: randomUUID(), username: display, status: "active", sessionVersion: 1 };
  const passwordHash = await bcrypt.hash(password, 12);
  productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash, status) VALUES (?, ?, ?, ?, 'active')").run(user.id, user.username, normalized, passwordHash);
  return user;
}

export async function authenticateProductUser(username: string, password: string): Promise<ProductUser | null> {
  const normalized = normalizeUsername(username);
  const row = productSqlite.prepare("SELECT id, username, password_hash, status, session_version AS sessionVersion FROM product_users WHERE username_normalized = ?").get(normalized) as { id: string; username: string; password_hash: string; status: string; sessionVersion: number } | undefined;
  if (!row || row.status !== "active") {
    await bcrypt.compare(password, "$2b$12$Jq9XwFQPrv4vtqJU3K5hIu9VNgW6CqYHZVKxjQpWYRLMUekU6nXcK");
    return null;
  }
  if (!(await bcrypt.compare(password, row.password_hash))) return null;
  return { id: row.id, username: row.username, status: row.status, sessionVersion: row.sessionVersion };
}

export async function verifyProductUserPassword(userId: string, password: string): Promise<boolean> {
  const row = productSqlite.prepare("SELECT password_hash, status FROM product_users WHERE id = ?").get(userId) as { password_hash: string; status: string } | undefined;
  if (!row || row.status !== "active") {
    await bcrypt.compare(password, "$2b$12$Jq9XwFQPrv4vtqJU3K5hIu9VNgW6CqYHZVKxjQpWYRLMUekU6nXcK");
    return false;
  }
  return bcrypt.compare(password, row.password_hash);
}

export async function changeProductUserPassword(userId: string, currentPassword: string, nextPassword: string) {
  if (Buffer.byteLength(nextPassword, "utf8") < 8 || Buffer.byteLength(nextPassword, "utf8") > 72) {
    throw Object.assign(new Error("PASSWORD_LENGTH_INVALID"), { code: "PASSWORD_LENGTH_INVALID" });
  }
  if (!(await verifyProductUserPassword(userId, currentPassword))) {
    throw Object.assign(new Error("INVALID_CURRENT_PASSWORD"), { code: "INVALID_CURRENT_PASSWORD" });
  }
  const passwordHash = await bcrypt.hash(nextPassword, 12);
  productSqlite.prepare("UPDATE product_users SET password_hash = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'").run(passwordHash, userId);
  const user = productSqlite.prepare("SELECT session_version AS sessionVersion FROM product_users WHERE id = ? AND status = 'active'").get(userId) as { sessionVersion: number } | undefined;
  if (!user) throw Object.assign(new Error("PASSWORD_UPDATE_FAILED"), { code: "PASSWORD_UPDATE_FAILED" });
  return { sessionVersion: user.sessionVersion };
}
