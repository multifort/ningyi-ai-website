import { createHash } from "crypto";
import { productSqlite } from "./db";
import { normalizeUsername } from "./credentials";

const maximumFailures = boundedEnv("PRODUCT_LOGIN_MAX_FAILURES", 5, 2, 20);
const windowSeconds = boundedEnv("PRODUCT_LOGIN_WINDOW_SECONDS", 15 * 60, 30, 24 * 60 * 60);
const lockSeconds = boundedEnv("PRODUCT_LOGIN_LOCK_SECONDS", 15 * 60, 30, 24 * 60 * 60);

export function loginThrottleKey(username: string) {
  // The database does not need to retain a plaintext username solely to rate
  // limit failed attempts. The credential lookup still handles normalization.
  return createHash("sha256").update(`product-login-v1:${normalizeUsername(username)}`).digest("hex");
}

export function currentLoginThrottle(username: string) {
  const key = loginThrottleKey(username);
  const row = productSqlite.prepare("SELECT locked_until AS lockedUntil FROM product_login_throttles WHERE throttle_key = ?").get(key) as { lockedUntil: string | null } | undefined;
  if (!row?.lockedUntil) return null;
  const remainingSeconds = Math.ceil((Date.parse(row.lockedUntil) - Date.now()) / 1000);
  return remainingSeconds > 0 ? { remainingSeconds } : null;
}

export function recordFailedLogin(username: string) {
  const key = loginThrottleKey(username);
  const now = Date.now();
  const row = productSqlite.prepare("SELECT failure_count AS failureCount, window_started_at AS windowStartedAt FROM product_login_throttles WHERE throttle_key = ?").get(key) as { failureCount: number; windowStartedAt: string } | undefined;
  const withinWindow = row && now - Date.parse(row.windowStartedAt) < windowSeconds * 1000;
  const failures = (withinWindow ? row.failureCount : 0) + 1;
  const lockedUntil = failures >= maximumFailures ? new Date(now + lockSeconds * 1000).toISOString() : null;
  productSqlite.prepare(`INSERT INTO product_login_throttles (throttle_key, failure_count, window_started_at, locked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(throttle_key) DO UPDATE SET failure_count = excluded.failure_count, window_started_at = excluded.window_started_at,
      locked_until = excluded.locked_until, updated_at = CURRENT_TIMESTAMP`).run(key, failures, withinWindow ? row.windowStartedAt : new Date(now).toISOString(), lockedUntil);
  return lockedUntil ? { remainingSeconds: lockSeconds } : null;
}

export function clearLoginThrottle(username: string) {
  productSqlite.prepare("DELETE FROM product_login_throttles WHERE throttle_key = ?").run(loginThrottleKey(username));
}

function boundedEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback;
}
