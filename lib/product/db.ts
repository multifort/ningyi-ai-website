import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const productSqlite = new Database(process.env.PRODUCT_DB_PATH || path.join(dataDir, "product.db"));
// Next.js may evaluate route modules concurrently while collecting build data.
// Give another initializer time to finish its short schema/WAL transaction
// instead of failing the build immediately with SQLITE_BUSY.
productSqlite.pragma("busy_timeout = 10000");
productSqlite.pragma("foreign_keys = ON");
productSqlite.pragma("journal_mode = WAL");

productSqlite.exec(`
  CREATE TABLE IF NOT EXISTS product_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_login_throttles (
    throttle_key TEXT PRIMARY KEY,
    failure_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_solutions (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES product_users(id),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'preparing',
    stage TEXT NOT NULL DEFAULT 'awaiting_input',
    render_lease_owner TEXT,
    render_lease_until TEXT,
    render_attempt_count INTEGER NOT NULL DEFAULT 0,
    render_next_attempt_at TEXT,
    render_error_code TEXT,
    render_failed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS intake_drafts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES product_users(id),
    solution_id TEXT NOT NULL UNIQUE REFERENCES product_solutions(id),
    purpose_primary TEXT NOT NULL,
    need_description TEXT NOT NULL,
    form_data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'bound',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS source_files (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    client_key TEXT NOT NULL,
    category TEXT NOT NULL,
    original_name TEXT NOT NULL,
    declared_mime TEXT,
    detected_format TEXT,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT,
    storage_key TEXT,
    status TEXT NOT NULL DEFAULT 'waiting_upload',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(solution_id, client_key)
  );

  CREATE TABLE IF NOT EXISTS project_user_facts (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS project_user_facts_by_solution ON project_user_facts(solution_id, status, created_at);

  CREATE TABLE IF NOT EXISTS product_project_events (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS product_project_events_by_solution ON product_project_events(solution_id, user_id, created_at);

  CREATE TABLE IF NOT EXISTS processing_runs (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    run_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    lease_owner TEXT,
    lease_until TEXT,
    next_attempt_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(solution_id, run_type)
  );

  CREATE TABLE IF NOT EXISTS source_blocks (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    source_file_id TEXT REFERENCES source_files(id),
    block_type TEXT NOT NULL,
    canonical_text TEXT NOT NULL,
    locator_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    source_format TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS media_analysis_tasks (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    source_file_id TEXT NOT NULL REFERENCES source_files(id),
    source_block_id TEXT NOT NULL UNIQUE REFERENCES source_blocks(id),
    route TEXT NOT NULL,
    fallback_route TEXT NOT NULL,
    status TEXT NOT NULL,
    requires_model INTEGER NOT NULL DEFAULT 0,
    reason_codes_json TEXT NOT NULL,
    signals_json TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    lease_owner TEXT,
    lease_until TEXT,
    next_attempt_at TEXT,
    failed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS template_profiles (
    source_file_id TEXT PRIMARY KEY REFERENCES source_files(id),
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    detected_format TEXT NOT NULL,
    status TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL,
    render_policy_json TEXT NOT NULL DEFAULT '{}',
    fallback_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS brand_profiles (
    source_file_id TEXT PRIMARY KEY REFERENCES source_files(id),
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    detected_format TEXT NOT NULL,
    status TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    fallback_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS brand_profiles_by_solution ON brand_profiles(solution_id, user_id, created_at);

  CREATE TABLE IF NOT EXISTS solution_understandings (
    solution_id TEXT PRIMARY KEY REFERENCES product_solutions(id),
    summary TEXT NOT NULL,
    facts_json TEXT NOT NULL,
    knowledge_json TEXT NOT NULL DEFAULT '{}',
    source_block_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS free_analyses (
    solution_id TEXT PRIMARY KEY REFERENCES product_solutions(id),
    analysis_json TEXT NOT NULL,
    origin TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost_microusd INTEGER,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS model_calls (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    purpose TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    model_version TEXT,
    prompt_version TEXT,
    parser_version TEXT,
    configuration_hash TEXT,
    status TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost_microusd INTEGER,
    error_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS formal_documents (
    solution_id TEXT PRIMARY KEY REFERENCES product_solutions(id),
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    current_section INTEGER NOT NULL DEFAULT 0,
    total_sections INTEGER NOT NULL DEFAULT 7,
    last_error_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS formal_sections (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    section_index INTEGER NOT NULL,
    section_key TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    content TEXT,
    summary TEXT,
    claims_json TEXT,
    context_hash TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    retry_cycle INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    failed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(solution_id, section_key)
  );

  CREATE TABLE IF NOT EXISTS project_model_snapshots (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'active', 'superseded', 'rejected')),
    parent_snapshot_id TEXT REFERENCES project_model_snapshots(id) ON DELETE SET NULL,
    model_json TEXT NOT NULL,
    model_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TEXT,
    UNIQUE(solution_id, version),
    UNIQUE(solution_id, id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_active_project_model_per_solution
    ON project_model_snapshots(solution_id) WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS project_model_entities (
    snapshot_id TEXT NOT NULL REFERENCES project_model_snapshots(id) ON DELETE CASCADE,
    entity_key TEXT NOT NULL,
    entity_kind TEXT NOT NULL,
    title TEXT NOT NULL,
    model_locked INTEGER NOT NULL DEFAULT 0 CHECK (model_locked IN (0, 1)),
    entity_json TEXT NOT NULL,
    PRIMARY KEY(snapshot_id, entity_key)
  );
  CREATE INDEX IF NOT EXISTS project_model_entities_by_kind ON project_model_entities(snapshot_id, entity_kind);

  CREATE TABLE IF NOT EXISTS project_model_relations (
    snapshot_id TEXT NOT NULL REFERENCES project_model_snapshots(id) ON DELETE CASCADE,
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    strength TEXT NOT NULL,
    rationale TEXT,
    PRIMARY KEY(snapshot_id, from_key, to_key, relation_type),
    FOREIGN KEY(snapshot_id, from_key) REFERENCES project_model_entities(snapshot_id, entity_key),
    FOREIGN KEY(snapshot_id, to_key) REFERENCES project_model_entities(snapshot_id, entity_key)
  );
  CREATE INDEX IF NOT EXISTS project_model_relations_by_target ON project_model_relations(snapshot_id, to_key);

  CREATE TABLE IF NOT EXISTS project_model_locks (
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    entity_key TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES product_users(id),
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(solution_id, entity_key)
  );

  CREATE TABLE IF NOT EXISTS quote_parameter_overrides (
    solution_id TEXT NOT NULL REFERENCES product_solutions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES product_users(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    parameter_key TEXT NOT NULL,
    value REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(solution_id, item_code, parameter_key)
  );

  CREATE TABLE IF NOT EXISTS change_impact_plans (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    base_snapshot_id TEXT REFERENCES project_model_snapshots(id),
    action_class TEXT NOT NULL CHECK (action_class IN ('R', 'C', 'S', 'P')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'blocked', 'accepted', 'completed', 'failed')),
    plan_json TEXT NOT NULL,
    execution_started_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS change_impact_plans_by_solution ON change_impact_plans(solution_id, created_at);

  CREATE TABLE IF NOT EXISTS formal_section_attempts (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    section_id TEXT NOT NULL REFERENCES formal_sections(id),
    attempt_no INTEGER NOT NULL,
    status TEXT NOT NULL,
    quality_json TEXT,
    context_manifest_json TEXT,
    retry_cycle INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    UNIQUE(section_id, attempt_no)
  );

  CREATE TABLE IF NOT EXISTS deliverable_artifacts (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    artifact_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    quality_json TEXT NOT NULL,
    content_fingerprint TEXT,
    render_fingerprint TEXT,
    content_version INTEGER NOT NULL DEFAULT 1,
    render_version INTEGER NOT NULL DEFAULT 1,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(solution_id, artifact_type)
  );

  CREATE TABLE IF NOT EXISTS deliverable_artifact_versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    solution_id TEXT NOT NULL REFERENCES product_solutions(id),
    user_id TEXT NOT NULL REFERENCES product_users(id),
    artifact_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    quality_json TEXT NOT NULL,
    content_fingerprint TEXT,
    render_fingerprint TEXT,
    content_version INTEGER NOT NULL,
    render_version INTEGER NOT NULL,
    archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(solution_id, artifact_type, content_version, render_version)
  );

  CREATE TABLE IF NOT EXISTS project_consistency_reports (
    solution_id TEXT PRIMARY KEY REFERENCES product_solutions(id),
    status TEXT NOT NULL,
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS solution_deletion_runs (
    id TEXT PRIMARY KEY,
    solution_id TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    manifest_json TEXT NOT NULL,
    error_code TEXT,
    lease_owner TEXT,
    lease_until TEXT,
    next_attempt_at TEXT,
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS account_deletion_runs (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL UNIQUE REFERENCES product_users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    error_code TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS storage_maintenance_runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    scanned_files INTEGER NOT NULL DEFAULT 0,
    referenced_files INTEGER NOT NULL DEFAULT 0,
    orphan_files INTEGER NOT NULL DEFAULT 0,
    removed_files INTEGER NOT NULL DEFAULT 0,
    removed_bytes INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS operations_snapshots (
    id TEXT PRIMARY KEY,
    window_from TEXT NOT NULL,
    window_to TEXT NOT NULL,
    status TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS operations_controls (
    control_key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    reason_code TEXT,
    source_snapshot_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'running',
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    health_json TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stopped_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS configuration_releases (
    id TEXT PRIMARY KEY,
    component_type TEXT NOT NULL,
    component_key TEXT NOT NULL,
    version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    config_json TEXT NOT NULL,
    benchmark_report_json TEXT NOT NULL,
    previous_release_id TEXT,
    rollout_percent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TEXT,
    rolled_back_at TEXT,
    UNIQUE(component_type, component_key, version)
  );
  CREATE TABLE IF NOT EXISTS provider_billing_calibrations (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    period_from TEXT NOT NULL,
    period_to TEXT NOT NULL,
    estimated_cost_microusd INTEGER NOT NULL,
    actual_cost_microusd INTEGER NOT NULL,
    variance_ratio REAL NOT NULL,
    invoice_reference_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, model, period_from, period_to)
  );
  CREATE TABLE IF NOT EXISTS acceptance_runs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    status TEXT NOT NULL,
    project_count INTEGER NOT NULL DEFAULT 0,
    passed_projects INTEGER NOT NULL DEFAULT 0,
    blocking_failure_count INTEGER NOT NULL DEFAULT 0,
    report_json TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS acceptance_campaigns (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'full',
    status TEXT NOT NULL DEFAULT 'collecting',
    target_consecutive_runs INTEGER NOT NULL DEFAULT 30,
    consecutive_passes INTEGER NOT NULL DEFAULT 0,
    total_runs INTEGER NOT NULL DEFAULT 0,
    passed_runs INTEGER NOT NULL DEFAULT 0,
    last_run_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS acceptance_campaign_runs (
    campaign_id TEXT NOT NULL REFERENCES acceptance_campaigns(id),
    acceptance_run_id TEXT NOT NULL REFERENCES acceptance_runs(id),
    sequence_no INTEGER NOT NULL,
    status TEXT NOT NULL,
    benchmark_id TEXT,
    benchmark_binding_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(campaign_id, acceptance_run_id),
    UNIQUE(campaign_id, sequence_no)
  );
  CREATE TABLE IF NOT EXISTS acceptance_fault_evidence (
    campaign_id TEXT NOT NULL REFERENCES acceptance_campaigns(id),
    fault_code TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence_hash TEXT NOT NULL,
    observed_error_code TEXT NOT NULL,
    recovery_action TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(campaign_id, fault_code)
  );
  CREATE TABLE IF NOT EXISTS benchmark_bindings (
    id TEXT PRIMARY KEY,
    benchmark_id TEXT NOT NULL UNIQUE,
    solution_id TEXT NOT NULL UNIQUE REFERENCES product_solutions(id),
    manifest_hash TEXT NOT NULL,
    input_fingerprint TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const templateProfileColumns = productSqlite.pragma("table_info(template_profiles)") as Array<{ name: string }>;
ensureColumn("product_users", "session_version", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("model_calls", "model_version", "TEXT");
ensureColumn("model_calls", "prompt_version", "TEXT");
ensureColumn("model_calls", "parser_version", "TEXT");
ensureColumn("model_calls", "configuration_hash", "TEXT");
ensureColumn("worker_heartbeats", "health_json", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("solution_understandings", "knowledge_json", "TEXT NOT NULL DEFAULT '{}'");
const deletionRunColumns = productSqlite.pragma("table_info(solution_deletion_runs)") as Array<{ name: string }>;
if (!deletionRunColumns.some((column) => column.name === "lease_owner")) productSqlite.exec("ALTER TABLE solution_deletion_runs ADD COLUMN lease_owner TEXT");
if (!deletionRunColumns.some((column) => column.name === "lease_until")) productSqlite.exec("ALTER TABLE solution_deletion_runs ADD COLUMN lease_until TEXT");
ensureColumn("solution_deletion_runs", "next_attempt_at", "TEXT");
const processingRunColumns = productSqlite.pragma("table_info(processing_runs)") as Array<{ name: string }>;
ensureColumn("processing_runs", "next_attempt_at", "TEXT");
const productSolutionColumns = productSqlite.pragma("table_info(product_solutions)") as Array<{ name: string }>;
if (!productSolutionColumns.some((column) => column.name === "render_lease_owner")) productSqlite.exec("ALTER TABLE product_solutions ADD COLUMN render_lease_owner TEXT");
if (!productSolutionColumns.some((column) => column.name === "render_lease_until")) productSqlite.exec("ALTER TABLE product_solutions ADD COLUMN render_lease_until TEXT");
if (!productSolutionColumns.some((column) => column.name === "render_attempt_count")) productSqlite.exec("ALTER TABLE product_solutions ADD COLUMN render_attempt_count INTEGER NOT NULL DEFAULT 0");
if (!productSolutionColumns.some((column) => column.name === "render_next_attempt_at")) productSqlite.exec("ALTER TABLE product_solutions ADD COLUMN render_next_attempt_at TEXT");
if (!productSolutionColumns.some((column) => column.name === "render_error_code")) productSqlite.exec("ALTER TABLE product_solutions ADD COLUMN render_error_code TEXT");
if (!productSolutionColumns.some((column) => column.name === "render_failed_at")) productSqlite.exec("ALTER TABLE product_solutions ADD COLUMN render_failed_at TEXT");
if (!templateProfileColumns.some((column) => column.name === "render_policy_json")) {
  productSqlite.exec("ALTER TABLE template_profiles ADD COLUMN render_policy_json TEXT NOT NULL DEFAULT '{}'");
}
const formalAttemptColumns = productSqlite.pragma("table_info(formal_section_attempts)") as Array<{ name: string }>;
if (!formalAttemptColumns.some((column) => column.name === "context_manifest_json")) {
  productSqlite.exec("ALTER TABLE formal_section_attempts ADD COLUMN context_manifest_json TEXT");
}
const formalSectionColumns = productSqlite.pragma("table_info(formal_sections)") as Array<{ name: string }>;
if (!formalSectionColumns.some((column) => column.name === "structured_items_json")) {
  productSqlite.exec("ALTER TABLE formal_sections ADD COLUMN structured_items_json TEXT");
}
if (!formalSectionColumns.some((column) => column.name === "lease_owner")) {
  productSqlite.exec("ALTER TABLE formal_sections ADD COLUMN lease_owner TEXT");
}
if (!formalSectionColumns.some((column) => column.name === "lease_until")) {
  productSqlite.exec("ALTER TABLE formal_sections ADD COLUMN lease_until TEXT");
}
ensureColumn("formal_sections", "retry_cycle", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("formal_sections", "next_attempt_at", "TEXT");
ensureColumn("formal_sections", "failed_at", "TEXT");
ensureColumn("formal_section_attempts", "retry_cycle", "INTEGER NOT NULL DEFAULT 0");
const deliverableArtifactColumns = productSqlite.pragma("table_info(deliverable_artifacts)") as Array<{ name: string }>;
for (const [name, definition] of [
  ["content_fingerprint", "TEXT"],
  ["render_fingerprint", "TEXT"],
  ["content_version", "INTEGER NOT NULL DEFAULT 1"],
  ["render_version", "INTEGER NOT NULL DEFAULT 1"],
  ["published_at", "TEXT"],
] as const) {
  if (!deliverableArtifactColumns.some((column) => column.name === name)) productSqlite.exec(`ALTER TABLE deliverable_artifacts ADD COLUMN ${name} ${definition}`);
}
const acceptanceCampaignRunColumns = productSqlite.pragma("table_info(acceptance_campaign_runs)") as Array<{ name: string }>;
ensureColumn("acceptance_campaigns", "scope", "TEXT NOT NULL DEFAULT 'full'");
if (!acceptanceCampaignRunColumns.some((column) => column.name === "benchmark_id")) {
  productSqlite.exec("ALTER TABLE acceptance_campaign_runs ADD COLUMN benchmark_id TEXT");
}
if (!acceptanceCampaignRunColumns.some((column) => column.name === "benchmark_binding_id")) {
  productSqlite.exec("ALTER TABLE acceptance_campaign_runs ADD COLUMN benchmark_binding_id TEXT");
}
const sourceBlockColumns = productSqlite.pragma("table_info(source_blocks)") as Array<{ name: string }>;
if (!sourceBlockColumns.some((column) => column.name === "source_format")) {
  productSqlite.exec("ALTER TABLE source_blocks ADD COLUMN source_format TEXT");
}
if (!sourceBlockColumns.some((column) => column.name === "metadata_json")) {
  productSqlite.exec("ALTER TABLE source_blocks ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
}
productSqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS source_blocks_knowledge_stale_after_insert
  AFTER INSERT ON source_blocks BEGIN
    UPDATE solution_understandings SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id = NEW.solution_id;
  END;
  CREATE TRIGGER IF NOT EXISTS source_blocks_knowledge_stale_after_update
  AFTER UPDATE OF canonical_text, content_hash, source_format, metadata_json ON source_blocks BEGIN
    UPDATE solution_understandings SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id IN (OLD.solution_id, NEW.solution_id);
  END;
  CREATE TRIGGER IF NOT EXISTS source_blocks_knowledge_stale_after_delete
  AFTER DELETE ON source_blocks BEGIN
    UPDATE solution_understandings SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id = OLD.solution_id;
  END;
`);
for (const table of ["processing_runs", "media_analysis_tasks"] as const) {
  const columns = productSqlite.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "lease_owner")) productSqlite.exec(`ALTER TABLE ${table} ADD COLUMN lease_owner TEXT`);
  if (!columns.some((column) => column.name === "lease_until")) productSqlite.exec(`ALTER TABLE ${table} ADD COLUMN lease_until TEXT`);
}
const mediaTaskColumns = productSqlite.pragma("table_info(media_analysis_tasks)") as Array<{ name: string }>;
ensureColumn("media_analysis_tasks", "next_attempt_at", "TEXT");
ensureColumn("media_analysis_tasks", "failed_at", "TEXT");
ensureColumn("change_impact_plans", "execution_started_at", "TEXT");

function ensureColumn(table: string, name: string, definition: string) {
  const columns = productSqlite.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (columns.some((column) => column.name === name)) return;
  try { productSqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`); }
  catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
  }
}
