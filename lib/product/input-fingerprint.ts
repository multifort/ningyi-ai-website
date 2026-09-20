import { createHash } from "crypto";
import { productSqlite } from "./db";

/**
 * A stable identifier for the user-controlled input that can affect a project.
 * It deliberately excludes database IDs, timestamps, processing state and
 * output-only metadata so a copied project with identical inputs has the same
 * fingerprint and a retry cannot silently look like a new input revision.
 */
export function projectInputFingerprint(solutionId: string, userId: string) {
  const intake = productSqlite.prepare("SELECT purpose_primary AS purposePrimary, need_description AS needDescription, form_data AS formData FROM intake_drafts WHERE solution_id = ? AND user_id = ?").get(solutionId, userId) as { purposePrimary: string; needDescription: string; formData: string } | undefined;
  if (!intake) return null;
  const files = productSqlite.prepare(`SELECT category, original_name AS originalName, detected_format AS detectedFormat, size_bytes AS sizeBytes, sha256
    FROM source_files WHERE solution_id = ? AND user_id = ? AND status = 'uploaded'`).all(solutionId, userId) as Array<{ category: string; originalName: string; detectedFormat: string | null; sizeBytes: number; sha256: string | null }>;
  const facts = productSqlite.prepare("SELECT text FROM project_user_facts WHERE solution_id = ? AND user_id = ? AND status = 'active'").all(solutionId, userId) as Array<{ text: string }>;
  const input = {
    schemaVersion: "project-input-fingerprint-v1",
    purposePrimary: intake.purposePrimary,
    needDescription: intake.needDescription,
    formData: parseJson(intake.formData),
    files: files.map((file) => ({ ...file, sha256: file.sha256 || null })).sort(compareJson),
    userConfirmedFacts: facts.map((fact) => fact.text).sort(),
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}

function parseJson(value: string) {
  try { return JSON.parse(value); } catch { return {}; }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
}

function compareJson(left: unknown, right: unknown) {
  return JSON.stringify(canonicalize(left)).localeCompare(JSON.stringify(canonicalize(right)));
}
