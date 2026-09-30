import { randomUUID } from "crypto";
import { productSqlite } from "./db";
import type { ArtifactPublication, DeliverablePublicationRepository, ExistingArtifact } from "./deliverable-publication-repository";

export class SqliteDeliverablePublicationRepository implements DeliverablePublicationRepository {
  async assertRenderLease(solutionId: string, workerId?: string) {
    this.assertRenderLeaseSync(solutionId, workerId);
  }

  async findExisting(solutionId: string, artifactType: string) {
    return productSqlite.prepare(`SELECT id, solution_id AS solutionId, user_id AS userId, artifact_type AS artifactType,
      display_name AS displayName, mime_type AS mimeType, storage_key AS storageKey, size_bytes AS sizeBytes, sha256,
      quality_json AS qualityJson, content_fingerprint AS contentFingerprint, render_fingerprint AS renderFingerprint,
      content_version AS contentVersion, render_version AS renderVersion
      FROM deliverable_artifacts WHERE solution_id = ? AND artifact_type = ?`).get(solutionId, artifactType) as ExistingArtifact | undefined;
  }

  async restoreAvailable(artifactId: string, userId: string, solutionId: string, workerId?: string) {
    productSqlite.transaction(() => {
      this.assertRenderLeaseSync(solutionId, workerId);
      productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'available', published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").run(artifactId, userId);
    }).immediate();
  }

  async publish(input: ArtifactPublication, workerId?: string) {
    productSqlite.transaction(() => {
      this.assertRenderLeaseSync(input.solutionId, workerId);
      if (input.existing) productSqlite.prepare(`INSERT OR IGNORE INTO deliverable_artifact_versions
        (id, artifact_id, solution_id, user_id, artifact_type, display_name, mime_type, storage_key, size_bytes, sha256, quality_json,
         content_fingerprint, render_fingerprint, content_version, render_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), input.existing.id, input.existing.solutionId, input.existing.userId, input.existing.artifactType,
        input.existing.displayName, input.existing.mimeType, input.existing.storageKey, input.existing.sizeBytes,
        input.existing.sha256, input.existing.qualityJson, input.existing.contentFingerprint, input.existing.renderFingerprint,
        input.existing.contentVersion, input.existing.renderVersion,
      );
      productSqlite.prepare(`INSERT INTO deliverable_artifacts
        (id, solution_id, user_id, artifact_type, display_name, mime_type, storage_key, size_bytes, sha256, status, quality_json,
         content_fingerprint, render_fingerprint, content_version, render_version, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(solution_id, artifact_type) DO UPDATE SET id = excluded.id, user_id = excluded.user_id, display_name = excluded.display_name,
        mime_type = excluded.mime_type, storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
        status = 'available', quality_json = excluded.quality_json, content_fingerprint = excluded.content_fingerprint,
        render_fingerprint = excluded.render_fingerprint, content_version = excluded.content_version, render_version = excluded.render_version,
        published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`).run(
        input.artifactId, input.solutionId, input.userId, input.artifactType, input.displayName, input.mimeType, input.storageKey,
        input.sizeBytes, input.sha256, input.qualityJson, input.contentFingerprint, input.renderFingerprint,
        input.contentVersion, input.renderVersion,
      );
    }).immediate();
  }

  async contentSections(solutionId: string, titles: string[]) {
    if (!titles.length) return [];
    const placeholders = titles.map(() => "?").join(", ");
    return productSqlite.prepare(`SELECT section_key AS sectionKey, title, content, summary, structured_items_json AS structuredItemsJson
      FROM formal_sections WHERE solution_id = ? AND status = 'validated' AND title IN (${placeholders}) ORDER BY section_index`).all(solutionId, ...titles);
  }

  async templateProfile(solutionId: string, expectedFormat: string) {
    return productSqlite.prepare(`SELECT tp.detected_format AS detectedFormat, tp.profile_json AS profileJson, tp.render_policy_json AS renderPolicyJson
      FROM template_profiles tp JOIN source_files sf ON sf.id = tp.source_file_id
      WHERE tp.solution_id = ? AND tp.detected_format = ? AND sf.status = 'uploaded'
      ORDER BY sf.created_at DESC, sf.id DESC LIMIT 1`).get(solutionId, expectedFormat) || { detectedFormat: expectedFormat, profileJson: null, renderPolicyJson: null };
  }

  async availableRenderFingerprints(solutionId: string, userId: string) {
    return productSqlite.prepare("SELECT id, artifact_type AS artifactType, render_fingerprint AS renderFingerprint FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available'").all(solutionId, userId) as Array<{ id: string; artifactType: string; renderFingerprint: string | null }>;
  }

  async supersedeArtifact(artifactId: string) {
    productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'available'").run(artifactId);
  }

  private assertRenderLeaseSync(solutionId: string, workerId?: string) {
    if (!workerId) return;
    const owned = productSqlite.prepare("SELECT 1 FROM product_solutions WHERE id = ? AND stage = 'rendering' AND status = 'rendering' AND render_lease_owner = ? AND render_lease_until > CURRENT_TIMESTAMP").get(solutionId, workerId);
    if (!owned) throw new Error("RENDER_LEASE_LOST");
  }
}
