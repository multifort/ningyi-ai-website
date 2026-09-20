import { randomUUID } from "crypto";
import { productSqlite } from "./db";

export type ProjectEvent = { id: string; type: string; summary: string; metadata: Record<string, unknown>; createdAt: string };

export function recordProjectEvent(input: { solutionId: string; userId: string; type: string; summary: string; metadata?: Record<string, unknown> }) {
  productSqlite.prepare("INSERT INTO product_project_events (id, solution_id, user_id, event_type, summary, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    randomUUID(), input.solutionId, input.userId, input.type, input.summary.slice(0, 240), JSON.stringify(input.metadata || {}), new Date().toISOString(),
  );
}

export function listProjectEvents(solutionId: string, userId: string, limit = 20): ProjectEvent[] {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const rows = productSqlite.prepare(`SELECT id, event_type AS type, summary, metadata_json AS metadataJson, created_at AS createdAt
    FROM product_project_events WHERE solution_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(solutionId, userId, safeLimit) as Array<{ id: string; type: string; summary: string; metadataJson: string; createdAt: string }>;
  return rows.map((row) => ({ id: row.id, type: row.type, summary: row.summary, metadata: parseMetadata(row.metadataJson), createdAt: row.createdAt }));
}

function parseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
