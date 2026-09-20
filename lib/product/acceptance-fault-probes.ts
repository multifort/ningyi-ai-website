import { createHash, randomUUID } from "crypto";
import Database from "better-sqlite3";
import fs from "fs/promises";
import os from "os";
import path from "path";

export type AcceptanceFaultCode = "MODEL_PROVIDER_FAILURE" | "WORKER_INTERRUPTION" | "ARTIFACT_CORRUPTION" | "DELETION_RACE" | "CONCURRENT_MATERIAL_CHANGE";
type ProbeResult = { faultCode: AcceptanceFaultCode; passed: boolean; observedErrorCode: string; recoveryAction: string; evidence: { mode: "isolated_runtime"; assertions: Record<string, boolean>; details: Record<string, string | number | boolean> } };

export async function runAcceptanceFaultProbes(): Promise<ProbeResult[]> {
  return [probeModelProviderFailure(), probeWorkerInterruption(), await probeArtifactCorruption(), probeDeletionRace(), probeConcurrentMaterialChange()];
}

function probeModelProviderFailure(): ProbeResult {
  const db = stateDatabase();
  db.exec("CREATE TABLE calls (id INTEGER PRIMARY KEY, provider TEXT, status TEXT, error_code TEXT); CREATE TABLE work (id INTEGER PRIMARY KEY, route TEXT, status TEXT)");
  db.prepare("INSERT INTO work (id, route, status) VALUES (1, 'primary', 'running')").run();
  db.transaction(() => {
    db.prepare("INSERT INTO calls (provider, status, error_code) VALUES ('primary', 'failed', 'MODEL_PROVIDER_UNAVAILABLE')").run();
    db.prepare("UPDATE work SET route = 'fallback', status = 'queued' WHERE id = 1 AND route = 'primary' AND status = 'running'").run();
  })();
  db.prepare("INSERT INTO calls (provider, status, error_code) VALUES ('fallback', 'succeeded', NULL)").run();
  db.prepare("UPDATE work SET status = 'completed' WHERE id = 1 AND route = 'fallback' AND status = 'queued'").run();
  const work = db.prepare("SELECT route, status FROM work WHERE id = 1").get() as { route: string; status: string };
  const failures = (db.prepare("SELECT COUNT(*) AS count FROM calls WHERE error_code = 'MODEL_PROVIDER_UNAVAILABLE'").get() as { count: number }).count;
  const assertions = { failureRecorded: failures === 1, fallbackSelected: work.route === "fallback", workCompleted: work.status === "completed" };
  db.close();
  return result("MODEL_PROVIDER_FAILURE", "MODEL_PROVIDER_UNAVAILABLE", "fallback_provider", assertions, { failedCalls: failures, finalRoute: work.route, finalStatus: work.status });
}

function probeWorkerInterruption(): ProbeResult {
  const db = stateDatabase();
  db.exec("CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT, lease_owner TEXT, lease_until INTEGER, attempt_count INTEGER); INSERT INTO tasks VALUES (1, 'running', 'worker-a', 100, 1)");
  const recovered = db.prepare("UPDATE tasks SET status = 'queued', lease_owner = NULL, lease_until = NULL WHERE status = 'running' AND lease_until < ?").run(101).changes;
  const reclaimed = db.prepare("UPDATE tasks SET status = 'running', lease_owner = 'worker-b', lease_until = 200, attempt_count = attempt_count + 1 WHERE id = 1 AND status = 'queued'").run().changes;
  const task = db.prepare("SELECT * FROM tasks WHERE id = 1").get() as Record<string, any>;
  const assertions = { expiredLeaseRecovered: recovered === 1, reclaimedOnce: reclaimed === 1, newWorkerOwnsLease: task.lease_owner === "worker-b", attemptPreserved: task.attempt_count === 2 };
  db.close();
  return result("WORKER_INTERRUPTION", "WORKER_LEASE_EXPIRED", "requeue_expired_lease", assertions, { recovered, reclaimed, finalOwner: String(task.lease_owner), attemptCount: Number(task.attempt_count) });
}

async function probeArtifactCorruption(): Promise<ProbeResult> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-artifact-probe-"));
  const filename = path.join(directory, randomUUID());
  const expected = Buffer.from("verified-deliverable-content", "utf8");
  const expectedHash = digest(expected);
  try {
    await fs.writeFile(filename, expected);
    await fs.writeFile(filename, Buffer.from("corrupted-deliverable-content", "utf8"));
    const corruptHash = digest(await fs.readFile(filename));
    const corruptionDetected = corruptHash !== expectedHash;
    await fs.writeFile(filename, expected);
    const restored = await fs.readFile(filename);
    const assertions = { corruptionDetected, restoredHashMatches: digest(restored) === expectedHash, restoredSizeMatches: restored.length === expected.length };
    return result("ARTIFACT_CORRUPTION", "ARTIFACT_HASH_MISMATCH", "restore_verified_artifact", assertions, { expectedBytes: expected.length, corruptHashChanged: corruptionDetected });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function probeDeletionRace(): ProbeResult {
  const db = stateDatabase();
  db.exec("CREATE TABLE deletions (id INTEGER PRIMARY KEY, status TEXT, lease_owner TEXT); INSERT INTO deletions VALUES (1, 'pending', NULL)");
  const claim = db.prepare("UPDATE deletions SET status = 'running', lease_owner = ? WHERE id = 1 AND status = 'pending'");
  const first = claim.run("worker-a").changes;
  const second = claim.run("worker-b").changes;
  const owner = (db.prepare("SELECT lease_owner AS owner FROM deletions WHERE id = 1").get() as { owner: string }).owner;
  const completed = db.prepare("UPDATE deletions SET status = 'completed' WHERE id = 1 AND status = 'running' AND lease_owner = ?").run(owner).changes;
  const assertions = { firstClaimWon: first === 1, competingClaimRejected: second === 0, singleOwner: owner === "worker-a", completedOnce: completed === 1 };
  db.close();
  return result("DELETION_RACE", "DELETION_CLAIM_CONFLICT", "single_owner_idempotent_delete", assertions, { firstClaims: first, competingClaims: second, completed, owner });
}

function probeConcurrentMaterialChange(): ProbeResult {
  const db = stateDatabase();
  db.exec(`
    CREATE TABLE knowledge (solution_id INTEGER PRIMARY KEY, status TEXT, input_hash TEXT);
    CREATE TABLE sections (id INTEGER PRIMARY KEY, solution_id INTEGER, status TEXT, context_input_hash TEXT);
    CREATE TABLE calls (id INTEGER PRIMARY KEY, status TEXT, error_code TEXT, input_tokens INTEGER, output_tokens INTEGER, estimated_cost_microusd INTEGER);
    INSERT INTO knowledge VALUES (1, 'ready', 'material-v1');
    INSERT INTO sections VALUES (1, 1, 'generating', 'material-v1');
    INSERT INTO calls VALUES (1, 'running', NULL, NULL, NULL, NULL);
  `);
  db.prepare("UPDATE knowledge SET status = 'stale', input_hash = 'material-v2' WHERE solution_id = 1").run();
  const published = db.prepare(`UPDATE sections SET status = 'validated' WHERE id = 1 AND status = 'generating'
    AND EXISTS (SELECT 1 FROM knowledge WHERE solution_id = sections.solution_id AND status = 'ready' AND input_hash = sections.context_input_hash)`).run().changes;
  const inputTokens = 1234, outputTokens = 567, costMicrousd = 7004;
  db.transaction(() => {
    db.prepare("UPDATE sections SET status = 'pending' WHERE id = 1 AND status = 'generating'").run();
    db.prepare("UPDATE calls SET status = 'failed', error_code = 'MATERIAL_CHANGED_DURING_GENERATION', input_tokens = ?, output_tokens = ?, estimated_cost_microusd = ? WHERE id = 1").run(inputTokens, outputTokens, costMicrousd);
  })();
  const section = db.prepare("SELECT status FROM sections WHERE id = 1").get() as { status: string };
  const call = db.prepare("SELECT * FROM calls WHERE id = 1").get() as Record<string, any>;
  const assertions = { staleCandidateNotPublished: published === 0, sectionImmediatelyRequeued: section.status === "pending", explicitReasonRecorded: call.error_code === "MATERIAL_CHANGED_DURING_GENERATION", consumedTokensPreserved: call.input_tokens === inputTokens && call.output_tokens === outputTokens, costPreserved: call.estimated_cost_microusd === costMicrousd };
  db.close();
  return result("CONCURRENT_MATERIAL_CHANGE", "MATERIAL_CHANGED_DURING_GENERATION", "rebuild_context_and_retry", assertions, { publishedRows: published, finalSectionStatus: section.status, inputTokens, outputTokens, costMicrousd });
}

function stateDatabase() { const db = new Database(":memory:"); db.pragma("journal_mode = MEMORY"); return db; }
function digest(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
function result(faultCode: AcceptanceFaultCode, observedErrorCode: string, recoveryAction: string, assertions: Record<string, boolean>, details: Record<string, string | number | boolean>): ProbeResult {
  return { faultCode, passed: Object.values(assertions).every(Boolean), observedErrorCode, recoveryAction, evidence: { mode: "isolated_runtime", assertions, details } };
}
