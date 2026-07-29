use std::{collections::HashSet, io};

use rusqlite::{Connection, OptionalExtension};

pub const MANAGED_MEDIA_BASE_TABLES: [&str; 3] = [
    "managed_media_items",
    "managed_media_variants",
    "managed_media_operations",
];

pub const MANAGED_MEDIA_TABLES: [&str; 6] = [
    "managed_media_items",
    "managed_media_variants",
    "managed_media_operations",
    "managed_media_item_generations",
    "managed_media_lifecycle_intents",
    "managed_media_lifecycle_targets",
];

const MANAGED_MEDIA_BASE_SCHEMA_SQL: &str = r#"
CREATE TABLE managed_media_items (
  item_id TEXT PRIMARY KEY NOT NULL
    CHECK (length(item_id) = 64 AND item_id NOT GLOB '*[^0-9a-f]*'),
  owner_kind TEXT NOT NULL
    CHECK (owner_kind IN ('video', 'image', 'performer', 'category', 'glossary')),
  owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
  slot_kind TEXT NOT NULL
    CHECK (slot_kind IN (
      'primary_visual', 'collection_card', 'lite_card', 'table_thumbnail',
      'gallery_tile', 'related_card', 'mini_row'
    )),
  slot_token TEXT NOT NULL CHECK (length(slot_token) > 0),
  source_locator_kind TEXT NOT NULL
    CHECK (source_locator_kind IN ('external_file', 'external_directory_entry', 'external_url')),
  locator_hash TEXT NOT NULL
    CHECK (length(locator_hash) = 64 AND locator_hash NOT GLOB '*[^0-9a-f]*'),
  current_source_fingerprint TEXT
    CHECK (
      current_source_fingerprint IS NULL OR
      (length(current_source_fingerprint) = 64 AND current_source_fingerprint NOT GLOB '*[^0-9a-f]*')
    ),
  pending_source_fingerprint TEXT
    CHECK (
      pending_source_fingerprint IS NULL OR
      (length(pending_source_fingerprint) = 64 AND pending_source_fingerprint NOT GLOB '*[^0-9a-f]*')
    ),
  source_availability_state TEXT NOT NULL
    CHECK (source_availability_state IN ('unknown', 'available', 'missing')),
  lifecycle_state TEXT NOT NULL
    CHECK (lifecycle_state IN ('pending', 'active', 'retired', 'invalid')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_kind, owner_id, slot_kind, slot_token)
);

CREATE TABLE managed_media_variants (
  variant_id TEXT PRIMARY KEY NOT NULL
    CHECK (length(variant_id) = 64 AND variant_id NOT GLOB '*[^0-9a-f]*'),
  managed_item_id TEXT NOT NULL,
  role_id TEXT NOT NULL
    CHECK (role_id IN (
      'video_collection_full_card', 'image_collection_full_card',
      'video_detail_primary', 'image_detail_primary', 'video_table', 'image_table',
      'video_lite_card', 'image_lite_card', 'performer_lite_card',
      'related_video_active', 'related_image_active', 'related_performer_active',
      'performer_collection_full_card', 'image_gallery_tile', 'category_active_card',
      'category_table', 'glossary_table', 'performer_detail_primary',
      'performer_mini_row', 'performer_table'
    )),
  family TEXT NOT NULL
    CHECK (family IN ('LANDSCAPE_16_9', 'STANDARD_4_3', 'SQUARE_1_1', 'PORTRAIT_4_5')),
  variant_class TEXT NOT NULL
    CHECK (variant_class IN ('standard', 'native_fallback')),
  standard_tier TEXT
    CHECK (standard_tier IS NULL OR standard_tier IN ('THUMBNAIL', 'MEDIUM', 'LARGE')),
  source_fingerprint TEXT NOT NULL
    CHECK (length(source_fingerprint) = 64 AND source_fingerprint NOT GLOB '*[^0-9a-f]*'),
  profile_version TEXT NOT NULL CHECK (profile_version = 'managed-media-profile-v1'),
  output_format TEXT,
  format_version TEXT,
  encoder_version TEXT,
  relative_path TEXT NOT NULL UNIQUE
    CHECK (
      length(relative_path) > 0 AND
      substr(relative_path, 1, 1) <> '/' AND
      instr(relative_path, '\') = 0 AND
      instr(relative_path, '..') = 0
    ),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  checksum TEXT NOT NULL
    CHECK (length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'),
  publication_state TEXT NOT NULL
    CHECK (publication_state IN (
      'staged', 'validated', 'published', 'superseded', 'quarantined', 'failed'
    )),
  validated_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (variant_class = 'standard' AND standard_tier IS NOT NULL) OR
    (variant_class = 'native_fallback' AND standard_tier IS NULL)
  ),
  FOREIGN KEY (managed_item_id) REFERENCES managed_media_items(item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE managed_media_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  scope_kind TEXT NOT NULL
    CHECK (scope_kind IN (
      'media_item', 'owner_record', 'bounded_selection', 'targeted_variants', 'missing_only'
    )),
  scope_payload_json TEXT NOT NULL,
  operation_state TEXT NOT NULL
    CHECK (operation_state IN (
      'queued', 'running', 'cancelling', 'completed', 'completed_with_failures',
      'cancelled', 'failed', 'recovery_required'
    )),
  cancellation_requested INTEGER NOT NULL DEFAULT 0
    CHECK (cancellation_requested IN (0, 1)),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  succeeded_count INTEGER NOT NULL DEFAULT 0 CHECK (succeeded_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  failure_summary TEXT,
  journal_state TEXT NOT NULL
    CHECK (journal_state IN (
      'not_started', 'staging', 'validated', 'publishing', 'published',
      'recovery_required', 'recovered', 'failed'
    )),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  CHECK (completed_count = succeeded_count + skipped_count + failed_count),
  CHECK (completed_count <= total_count)
);

CREATE INDEX idx_managed_media_items_owner
  ON managed_media_items (owner_kind, owner_id);
CREATE INDEX idx_managed_media_items_source
  ON managed_media_items (source_locator_kind, locator_hash);
CREATE INDEX idx_managed_media_variants_item
  ON managed_media_variants (managed_item_id);
CREATE INDEX idx_managed_media_variants_selection
  ON managed_media_variants (managed_item_id, role_id, publication_state);
CREATE UNIQUE INDEX idx_managed_media_variants_standard_identity
  ON managed_media_variants (
    managed_item_id, role_id, standard_tier, source_fingerprint, profile_version
  )
  WHERE variant_class = 'standard';
CREATE UNIQUE INDEX idx_managed_media_variants_native_identity
  ON managed_media_variants (
    managed_item_id, role_id, source_fingerprint, profile_version
  )
  WHERE variant_class = 'native_fallback';
CREATE INDEX idx_managed_media_operations_state
  ON managed_media_operations (operation_state, created_at);

CREATE TRIGGER managed_media_variants_require_item_insert
BEFORE INSERT ON managed_media_variants
WHEN NOT EXISTS (
  SELECT 1 FROM managed_media_items WHERE item_id = NEW.managed_item_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media item does not exist');
END;

CREATE TRIGGER managed_media_variants_require_item_update
BEFORE UPDATE OF managed_item_id ON managed_media_variants
WHEN NOT EXISTS (
  SELECT 1 FROM managed_media_items WHERE item_id = NEW.managed_item_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media item does not exist');
END;
"#;

const MANAGED_MEDIA_LIFECYCLE_SCHEMA_SQL: &str = r#"
CREATE TABLE managed_media_item_generations (
  managed_item_id TEXT PRIMARY KEY NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  desired_revision INTEGER NOT NULL DEFAULT 0 CHECK (desired_revision >= current_revision),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (managed_item_id) REFERENCES managed_media_items(item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE managed_media_lifecycle_intents (
  intent_id TEXT PRIMARY KEY NOT NULL
    CHECK (
      length(intent_id) BETWEEN 1 AND 128 AND
      intent_id NOT GLOB '*[^a-z0-9_-]*'
    ),
  managed_item_id TEXT NOT NULL,
  desired_revision INTEGER NOT NULL CHECK (desired_revision > 0),
  lifecycle_action TEXT NOT NULL
    CHECK (lifecycle_action IN ('generate', 'repair_missing', 'regenerate', 'retire')),
  expected_locator_hash TEXT NOT NULL
    CHECK (length(expected_locator_hash) = 64 AND expected_locator_hash NOT GLOB '*[^0-9a-f]*'),
  desired_source_fingerprint TEXT
    CHECK (
      desired_source_fingerprint IS NULL OR
      (length(desired_source_fingerprint) = 64 AND desired_source_fingerprint NOT GLOB '*[^0-9a-f]*')
    ),
  lifecycle_state TEXT NOT NULL
    CHECK (lifecycle_state IN (
      'queued', 'claimed', 'retry_wait', 'completed', 'completed_with_failures',
      'failed', 'cancelled', 'superseded', 'retired', 'recovery_required'
    )),
  claim_token TEXT
    CHECK (
      claim_token IS NULL OR
      (length(claim_token) BETWEEN 1 AND 128 AND claim_token NOT GLOB '*[^a-z0-9_-]*')
    ),
  claim_expires_at TEXT,
  retry_eligible_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  cancellation_requested INTEGER NOT NULL DEFAULT 0
    CHECK (cancellation_requested IN (0, 1)),
  superseded_by_intent_id TEXT,
  failure_class TEXT
    CHECK (failure_class IS NULL OR failure_class IN (
      'retryable', 'terminal', 'cancelled', 'stale', 'recovery_required'
    )),
  failure_summary TEXT CHECK (failure_summary IS NULL OR length(failure_summary) <= 1024),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (managed_item_id, desired_revision),
  CHECK (superseded_by_intent_id IS NULL OR superseded_by_intent_id <> intent_id),
  CHECK (
    (lifecycle_state = 'claimed' AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL) OR
    (lifecycle_state <> 'claimed' AND claim_token IS NULL AND claim_expires_at IS NULL)
  ),
  CHECK (lifecycle_state <> 'retry_wait' OR retry_eligible_at IS NOT NULL),
  FOREIGN KEY (managed_item_id) REFERENCES managed_media_items(item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (superseded_by_intent_id) REFERENCES managed_media_lifecycle_intents(intent_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE managed_media_lifecycle_targets (
  target_id TEXT PRIMARY KEY NOT NULL
    CHECK (
      length(target_id) BETWEEN 1 AND 128 AND
      target_id NOT GLOB '*[^a-z0-9_-]*'
    ),
  intent_id TEXT NOT NULL,
  managed_item_id TEXT NOT NULL,
  desired_revision INTEGER NOT NULL CHECK (desired_revision > 0),
  role_id TEXT NOT NULL
    CHECK (role_id IN (
      'video_collection_full_card', 'image_collection_full_card',
      'video_detail_primary', 'image_detail_primary', 'video_table', 'image_table',
      'video_lite_card', 'image_lite_card', 'performer_lite_card',
      'related_video_active', 'related_image_active', 'related_performer_active',
      'performer_collection_full_card', 'image_gallery_tile', 'category_active_card',
      'category_table', 'glossary_table', 'performer_detail_primary',
      'performer_mini_row', 'performer_table'
    )),
  variant_class TEXT NOT NULL CHECK (variant_class IN ('standard', 'native_fallback')),
  standard_tier TEXT
    CHECK (standard_tier IS NULL OR standard_tier IN ('THUMBNAIL', 'MEDIUM', 'LARGE')),
  target_state TEXT NOT NULL
    CHECK (target_state IN (
      'pending', 'claimed', 'published', 'skipped_ineligible', 'retryable_failure',
      'terminal_failure', 'cancelled', 'superseded', 'recovery_required'
    )),
  publication_operation_id TEXT,
  result_variant_id TEXT
    CHECK (
      result_variant_id IS NULL OR
      (length(result_variant_id) = 64 AND result_variant_id NOT GLOB '*[^0-9a-f]*')
    ),
  failure_class TEXT
    CHECK (failure_class IS NULL OR failure_class IN (
      'retryable', 'terminal', 'cancelled', 'stale', 'recovery_required'
    )),
  failure_summary TEXT CHECK (failure_summary IS NULL OR length(failure_summary) <= 1024),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (variant_class = 'standard' AND standard_tier IS NOT NULL) OR
    (variant_class = 'native_fallback' AND standard_tier IS NULL)
  ),
  CHECK (
    (target_state = 'published' AND publication_operation_id IS NOT NULL AND result_variant_id IS NOT NULL) OR
    target_state <> 'published'
  ),
  FOREIGN KEY (intent_id) REFERENCES managed_media_lifecycle_intents(intent_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (managed_item_id) REFERENCES managed_media_items(item_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (publication_operation_id) REFERENCES managed_media_operations(operation_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (result_variant_id) REFERENCES managed_media_variants(variant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_managed_media_lifecycle_intents_due
  ON managed_media_lifecycle_intents (lifecycle_state, retry_eligible_at, created_at);
CREATE INDEX idx_managed_media_lifecycle_intents_claim
  ON managed_media_lifecycle_intents (lifecycle_state, claim_expires_at);
CREATE INDEX idx_managed_media_lifecycle_intents_item_revision
  ON managed_media_lifecycle_intents (managed_item_id, desired_revision, lifecycle_state);
CREATE INDEX idx_managed_media_lifecycle_targets_intent_state
  ON managed_media_lifecycle_targets (intent_id, target_state);
CREATE INDEX idx_managed_media_lifecycle_targets_publication
  ON managed_media_lifecycle_targets (publication_operation_id)
  WHERE publication_operation_id IS NOT NULL;
CREATE UNIQUE INDEX idx_managed_media_lifecycle_targets_standard_identity
  ON managed_media_lifecycle_targets (intent_id, role_id, standard_tier)
  WHERE variant_class = 'standard';
CREATE UNIQUE INDEX idx_managed_media_lifecycle_targets_native_identity
  ON managed_media_lifecycle_targets (intent_id, role_id)
  WHERE variant_class = 'native_fallback';

CREATE TRIGGER managed_media_item_generations_require_item_insert
BEFORE INSERT ON managed_media_item_generations
WHEN NOT EXISTS (SELECT 1 FROM managed_media_items WHERE item_id = NEW.managed_item_id)
BEGIN
  SELECT RAISE(ABORT, 'managed media item does not exist');
END;

CREATE TRIGGER managed_media_item_generations_require_item_update
BEFORE UPDATE OF managed_item_id ON managed_media_item_generations
WHEN NOT EXISTS (SELECT 1 FROM managed_media_items WHERE item_id = NEW.managed_item_id)
BEGIN
  SELECT RAISE(ABORT, 'managed media item does not exist');
END;

CREATE TRIGGER managed_media_lifecycle_intents_require_generation_insert
BEFORE INSERT ON managed_media_lifecycle_intents
WHEN NOT EXISTS (
  SELECT 1 FROM managed_media_item_generations
  WHERE managed_item_id = NEW.managed_item_id AND desired_revision = NEW.desired_revision
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle generation does not match');
END;

CREATE TRIGGER managed_media_lifecycle_intents_require_generation_update
BEFORE UPDATE OF managed_item_id, desired_revision ON managed_media_lifecycle_intents
WHEN NOT EXISTS (
  SELECT 1 FROM managed_media_item_generations
  WHERE managed_item_id = NEW.managed_item_id AND desired_revision = NEW.desired_revision
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle generation does not match');
END;

CREATE TRIGGER managed_media_lifecycle_intents_require_superseder_insert
BEFORE INSERT ON managed_media_lifecycle_intents
WHEN NEW.superseded_by_intent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM managed_media_lifecycle_intents
  WHERE intent_id = NEW.superseded_by_intent_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle superseding intent does not exist');
END;

CREATE TRIGGER managed_media_lifecycle_intents_require_superseder_update
BEFORE UPDATE OF superseded_by_intent_id ON managed_media_lifecycle_intents
WHEN NEW.superseded_by_intent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM managed_media_lifecycle_intents
  WHERE intent_id = NEW.superseded_by_intent_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle superseding intent does not exist');
END;

CREATE TRIGGER managed_media_lifecycle_targets_require_intent_insert
BEFORE INSERT ON managed_media_lifecycle_targets
WHEN NOT EXISTS (
  SELECT 1 FROM managed_media_lifecycle_intents
  WHERE intent_id = NEW.intent_id
    AND managed_item_id = NEW.managed_item_id
    AND desired_revision = NEW.desired_revision
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle target does not match its intent');
END;

CREATE TRIGGER managed_media_lifecycle_targets_require_intent_update
BEFORE UPDATE OF intent_id, managed_item_id, desired_revision ON managed_media_lifecycle_targets
WHEN NOT EXISTS (
  SELECT 1 FROM managed_media_lifecycle_intents
  WHERE intent_id = NEW.intent_id
    AND managed_item_id = NEW.managed_item_id
    AND desired_revision = NEW.desired_revision
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle target does not match its intent');
END;

CREATE TRIGGER managed_media_lifecycle_targets_require_publication_insert
BEFORE INSERT ON managed_media_lifecycle_targets
WHEN NEW.publication_operation_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM managed_media_operations WHERE operation_id = NEW.publication_operation_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media publication operation does not exist');
END;

CREATE TRIGGER managed_media_lifecycle_targets_require_publication_update
BEFORE UPDATE OF publication_operation_id ON managed_media_lifecycle_targets
WHEN NEW.publication_operation_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM managed_media_operations WHERE operation_id = NEW.publication_operation_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media publication operation does not exist');
END;

CREATE TRIGGER managed_media_lifecycle_targets_require_variant_insert
BEFORE INSERT ON managed_media_lifecycle_targets
WHEN NEW.result_variant_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM managed_media_variants
  WHERE variant_id = NEW.result_variant_id
    AND managed_item_id = NEW.managed_item_id
    AND role_id = NEW.role_id
    AND variant_class = NEW.variant_class
    AND ((standard_tier IS NULL AND NEW.standard_tier IS NULL) OR standard_tier = NEW.standard_tier)
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle target variant does not match');
END;

CREATE TRIGGER managed_media_lifecycle_targets_require_variant_update
BEFORE UPDATE OF result_variant_id, managed_item_id, role_id, variant_class, standard_tier
ON managed_media_lifecycle_targets
WHEN NEW.result_variant_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM managed_media_variants
  WHERE variant_id = NEW.result_variant_id
    AND managed_item_id = NEW.managed_item_id
    AND role_id = NEW.role_id
    AND variant_class = NEW.variant_class
    AND ((standard_tier IS NULL AND NEW.standard_tier IS NULL) OR standard_tier = NEW.standard_tier)
)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle target variant does not match');
END;

CREATE TRIGGER managed_media_items_prevent_lifecycle_delete
BEFORE DELETE ON managed_media_items
WHEN EXISTS (SELECT 1 FROM managed_media_item_generations WHERE managed_item_id = OLD.item_id)
   OR EXISTS (SELECT 1 FROM managed_media_lifecycle_intents WHERE managed_item_id = OLD.item_id)
   OR EXISTS (SELECT 1 FROM managed_media_variants WHERE managed_item_id = OLD.item_id)
BEGIN
  SELECT RAISE(ABORT, 'managed media item remains referenced');
END;

CREATE TRIGGER managed_media_item_generations_prevent_intent_delete
BEFORE DELETE ON managed_media_item_generations
WHEN EXISTS (
  SELECT 1 FROM managed_media_lifecycle_intents WHERE managed_item_id = OLD.managed_item_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media generation remains referenced');
END;

CREATE TRIGGER managed_media_lifecycle_intents_prevent_target_delete
BEFORE DELETE ON managed_media_lifecycle_intents
WHEN EXISTS (SELECT 1 FROM managed_media_lifecycle_targets WHERE intent_id = OLD.intent_id)
BEGIN
  SELECT RAISE(ABORT, 'managed media lifecycle intent remains referenced');
END;

CREATE TRIGGER managed_media_operations_prevent_target_delete
BEFORE DELETE ON managed_media_operations
WHEN EXISTS (
  SELECT 1 FROM managed_media_lifecycle_targets
  WHERE publication_operation_id = OLD.operation_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media publication operation remains linked');
END;

CREATE TRIGGER managed_media_variants_prevent_target_delete
BEFORE DELETE ON managed_media_variants
WHEN EXISTS (
  SELECT 1 FROM managed_media_lifecycle_targets WHERE result_variant_id = OLD.variant_id
)
BEGIN
  SELECT RAISE(ABORT, 'managed media variant remains linked');
END;
"#;

pub fn initialize_schema(connection: &Connection) -> rusqlite::Result<()> {
    validate_existing_base_boundary(connection)?;
    if !all_base_tables_exist(connection)? {
        return initialize_with_sql(
            connection,
            &format!("{MANAGED_MEDIA_BASE_SCHEMA_SQL}\n{MANAGED_MEDIA_LIFECYCLE_SCHEMA_SQL}"),
        );
    }
    validate_base_schema(connection)?;
    validate_existing_lifecycle_boundary(connection)?;
    if all_lifecycle_tables_exist(connection)? {
        return validate_schema(connection);
    }
    initialize_with_sql(connection, MANAGED_MEDIA_LIFECYCLE_SCHEMA_SQL)
}

fn initialize_with_sql(connection: &Connection, sql: &str) -> rusqlite::Result<()> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute_batch(sql)?;
    validate_schema(&transaction)?;
    transaction.commit()
}

fn validate_existing_base_boundary(connection: &Connection) -> rusqlite::Result<()> {
    let existing = MANAGED_MEDIA_BASE_TABLES
        .iter()
        .filter_map(|table| match object_exists(connection, "table", table) {
            Ok(true) => Some(Ok(*table)),
            Ok(false) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if !existing.is_empty() && existing.len() != MANAGED_MEDIA_BASE_TABLES.len() {
        return Err(schema_error(format!(
            "Conflicting partial managed-media schema: found {}.",
            existing.join(", ")
        )));
    }
    if existing.len() == MANAGED_MEDIA_BASE_TABLES.len() {
        validate_base_schema(connection)?;
    }
    Ok(())
}

fn all_base_tables_exist(connection: &Connection) -> rusqlite::Result<bool> {
    for table in MANAGED_MEDIA_BASE_TABLES {
        if !object_exists(connection, "table", table)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn validate_existing_lifecycle_boundary(connection: &Connection) -> rusqlite::Result<()> {
    let lifecycle_tables = &MANAGED_MEDIA_TABLES[MANAGED_MEDIA_BASE_TABLES.len()..];
    let existing = lifecycle_tables
        .iter()
        .filter_map(|table| match object_exists(connection, "table", table) {
            Ok(true) => Some(Ok(*table)),
            Ok(false) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if !existing.is_empty() && existing.len() != lifecycle_tables.len() {
        return Err(schema_error(format!(
            "Conflicting partial managed-media lifecycle schema: found {}.",
            existing.join(", ")
        )));
    }
    Ok(())
}

fn all_lifecycle_tables_exist(connection: &Connection) -> rusqlite::Result<bool> {
    for table in &MANAGED_MEDIA_TABLES[MANAGED_MEDIA_BASE_TABLES.len()..] {
        if !object_exists(connection, "table", table)? {
            return Ok(false);
        }
    }
    Ok(true)
}

pub(crate) fn validate_schema(connection: &Connection) -> rusqlite::Result<()> {
    validate_base_schema(connection)?;
    validate_columns(
        connection,
        "managed_media_item_generations",
        &[
            "managed_item_id",
            "current_revision",
            "desired_revision",
            "created_at",
            "updated_at",
        ],
    )?;
    validate_columns(
        connection,
        "managed_media_lifecycle_intents",
        &[
            "intent_id",
            "managed_item_id",
            "desired_revision",
            "lifecycle_action",
            "expected_locator_hash",
            "desired_source_fingerprint",
            "lifecycle_state",
            "claim_token",
            "claim_expires_at",
            "retry_eligible_at",
            "attempt_count",
            "cancellation_requested",
            "superseded_by_intent_id",
            "failure_class",
            "failure_summary",
            "created_at",
            "updated_at",
            "finished_at",
        ],
    )?;
    validate_columns(
        connection,
        "managed_media_lifecycle_targets",
        &[
            "target_id",
            "intent_id",
            "managed_item_id",
            "desired_revision",
            "role_id",
            "variant_class",
            "standard_tier",
            "target_state",
            "publication_operation_id",
            "result_variant_id",
            "failure_class",
            "failure_summary",
            "created_at",
            "updated_at",
        ],
    )?;
    for index in [
        "idx_managed_media_lifecycle_intents_due",
        "idx_managed_media_lifecycle_intents_claim",
        "idx_managed_media_lifecycle_intents_item_revision",
        "idx_managed_media_lifecycle_targets_intent_state",
        "idx_managed_media_lifecycle_targets_publication",
        "idx_managed_media_lifecycle_targets_standard_identity",
        "idx_managed_media_lifecycle_targets_native_identity",
    ] {
        require_object(connection, "index", index)?;
    }
    for trigger in [
        "managed_media_item_generations_require_item_insert",
        "managed_media_item_generations_require_item_update",
        "managed_media_lifecycle_intents_require_generation_insert",
        "managed_media_lifecycle_intents_require_generation_update",
        "managed_media_lifecycle_intents_require_superseder_insert",
        "managed_media_lifecycle_intents_require_superseder_update",
        "managed_media_lifecycle_targets_require_intent_insert",
        "managed_media_lifecycle_targets_require_intent_update",
        "managed_media_lifecycle_targets_require_publication_insert",
        "managed_media_lifecycle_targets_require_publication_update",
        "managed_media_lifecycle_targets_require_variant_insert",
        "managed_media_lifecycle_targets_require_variant_update",
        "managed_media_items_prevent_lifecycle_delete",
        "managed_media_item_generations_prevent_intent_delete",
        "managed_media_lifecycle_intents_prevent_target_delete",
        "managed_media_operations_prevent_target_delete",
        "managed_media_variants_prevent_target_delete",
    ] {
        require_object(connection, "trigger", trigger)?;
    }
    Ok(())
}

fn validate_base_schema(connection: &Connection) -> rusqlite::Result<()> {
    validate_columns(
        connection,
        "managed_media_items",
        &[
            "item_id",
            "owner_kind",
            "owner_id",
            "slot_kind",
            "slot_token",
            "source_locator_kind",
            "locator_hash",
            "current_source_fingerprint",
            "pending_source_fingerprint",
            "source_availability_state",
            "lifecycle_state",
            "created_at",
            "updated_at",
        ],
    )?;
    validate_columns(
        connection,
        "managed_media_variants",
        &[
            "variant_id",
            "managed_item_id",
            "role_id",
            "family",
            "variant_class",
            "standard_tier",
            "source_fingerprint",
            "profile_version",
            "output_format",
            "format_version",
            "encoder_version",
            "relative_path",
            "width",
            "height",
            "byte_length",
            "checksum",
            "publication_state",
            "validated_at",
            "published_at",
            "created_at",
            "updated_at",
        ],
    )?;
    validate_columns(
        connection,
        "managed_media_operations",
        &[
            "operation_id",
            "scope_kind",
            "scope_payload_json",
            "operation_state",
            "cancellation_requested",
            "total_count",
            "completed_count",
            "succeeded_count",
            "skipped_count",
            "failed_count",
            "failure_summary",
            "journal_state",
            "created_at",
            "updated_at",
            "finished_at",
        ],
    )?;

    for index in [
        "idx_managed_media_items_owner",
        "idx_managed_media_items_source",
        "idx_managed_media_variants_item",
        "idx_managed_media_variants_selection",
        "idx_managed_media_variants_standard_identity",
        "idx_managed_media_variants_native_identity",
        "idx_managed_media_operations_state",
    ] {
        if !object_exists(connection, "index", index)? {
            return Err(schema_error(format!(
                "Managed-media schema is missing index {index}."
            )));
        }
    }
    for trigger in [
        "managed_media_variants_require_item_insert",
        "managed_media_variants_require_item_update",
    ] {
        if !object_exists(connection, "trigger", trigger)? {
            return Err(schema_error(format!(
                "Managed-media schema is missing trigger {trigger}."
            )));
        }
    }
    Ok(())
}

fn require_object(connection: &Connection, object_type: &str, name: &str) -> rusqlite::Result<()> {
    if object_exists(connection, object_type, name)? {
        Ok(())
    } else {
        Err(schema_error(format!(
            "Managed-media schema is missing {object_type} {name}."
        )))
    }
}

fn validate_columns(
    connection: &Connection,
    table: &str,
    expected: &[&str],
) -> rusqlite::Result<()> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let actual = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<HashSet<_>>>()?;
    let expected = expected
        .iter()
        .map(|column| (*column).to_string())
        .collect::<HashSet<_>>();
    if actual != expected {
        return Err(schema_error(format!(
            "Managed-media table {table} has an incompatible column set."
        )));
    }
    Ok(())
}

fn object_exists(connection: &Connection, object_type: &str, name: &str) -> rusqlite::Result<bool> {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = ?1 AND name = ?2",
            [object_type, name],
            |_| Ok(true),
        )
        .optional()
        .map(|value| value.unwrap_or(false))
}

fn schema_error(message: String) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(io::Error::new(
        io::ErrorKind::InvalidData,
        message,
    )))
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::*;

    fn hash(character: char) -> String {
        character.to_string().repeat(64)
    }

    fn unique_database(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sakurava-managed-media-schema-{name}-{}-{}.sqlite",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    fn with_database(name: &str, test: impl FnOnce(&Connection, &Path)) {
        let path = unique_database(name);
        assert!(!path.starts_with(env!("CARGO_MANIFEST_DIR")));
        let connection = Connection::open(&path).expect("temporary database");
        println!("managed-media disposable database: {}", path.display());
        test(&connection, &path);
        drop(connection);
        fs::remove_file(&path).expect("remove exact temporary database");
    }

    fn table_count(connection: &Connection, table: &str) -> i64 {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .expect("table count")
    }

    fn insert_item(connection: &Connection) {
        connection
            .execute(
                "INSERT INTO managed_media_items (
                   item_id, owner_kind, owner_id, slot_kind, slot_token,
                   source_locator_kind, locator_hash, current_source_fingerprint,
                   pending_source_fingerprint, source_availability_state,
                   lifecycle_state, created_at, updated_at
                 ) VALUES (?1, 'video', 'video-1', 'primary_visual', 'primary',
                           'external_file', ?2, ?3, NULL, 'available', 'active',
                           '2026-07-26T00:00:00Z', '2026-07-26T00:00:00Z')",
                [&hash('a'), &hash('b'), &hash('c')],
            )
            .expect("item");
    }

    #[test]
    fn creates_empty_additive_schema_and_is_idempotent() {
        with_database("fresh-idempotent", |connection, _| {
            initialize_schema(connection).expect("first initialization");
            initialize_schema(connection).expect("idempotent initialization");
            for table in MANAGED_MEDIA_TABLES {
                assert_eq!(table_count(connection, table), 0);
            }
        });
    }

    #[test]
    fn preserves_representative_existing_data() {
        with_database("existing-data", |connection, _| {
            connection
                .execute_batch(
                    "CREATE TABLE videos (
                       id TEXT PRIMARY KEY NOT NULL,
                       title TEXT NOT NULL
                     );
                     INSERT INTO videos (id, title) VALUES ('video-1', 'Existing');",
                )
                .expect("representative current data");
            initialize_schema(connection).expect("additive schema");
            let title: String = connection
                .query_row("SELECT title FROM videos WHERE id = 'video-1'", [], |row| {
                    row.get(0)
                })
                .expect("preserved row");
            assert_eq!(title, "Existing");
            for table in MANAGED_MEDIA_TABLES {
                assert_eq!(table_count(connection, table), 0);
            }
        });
    }

    #[test]
    fn rejects_conflicting_partial_schema_without_creating_more_tables() {
        with_database("partial-conflict", |connection, _| {
            connection
                .execute_batch("CREATE TABLE managed_media_items (unexpected TEXT);")
                .expect("conflicting table");
            let error = initialize_schema(connection).expect_err("controlled conflict");
            assert!(error
                .to_string()
                .contains("Conflicting partial managed-media schema"));
            assert!(
                !object_exists(connection, "table", "managed_media_variants").expect("inspect")
            );
            assert!(
                !object_exists(connection, "table", "managed_media_operations").expect("inspect")
            );
        });
    }

    #[test]
    fn induced_failure_rolls_back_every_table_created_by_the_attempt() {
        with_database("rollback", |connection, _| {
            let failing_sql = format!(
                "{MANAGED_MEDIA_BASE_SCHEMA_SQL}\n{MANAGED_MEDIA_LIFECYCLE_SCHEMA_SQL}\nCREATE TABLE invalid_sql ("
            );
            assert!(initialize_with_sql(connection, &failing_sql).is_err());
            for table in MANAGED_MEDIA_TABLES {
                assert!(!object_exists(connection, "table", table).expect("inspect rollback"));
            }
        });
    }

    #[test]
    fn upgrades_exact_prior_foundation_without_rewriting_existing_rows() {
        with_database("prior-foundation-upgrade", |connection, _| {
            connection
                .execute_batch(MANAGED_MEDIA_BASE_SCHEMA_SQL)
                .expect("prior foundation");
            insert_item(connection);
            connection
                .execute(
                    "INSERT INTO managed_media_variants (
                       variant_id, managed_item_id, role_id, family, variant_class,
                       standard_tier, source_fingerprint, profile_version, output_format,
                       format_version, encoder_version, relative_path, width, height,
                       byte_length, checksum, publication_state, validated_at, published_at,
                       created_at, updated_at
                     ) VALUES (?1, ?2, 'video_detail_primary', 'LANDSCAPE_16_9',
                               'standard', 'MEDIUM', ?3, 'managed-media-profile-v1', 'jpeg',
                               'baseline-jpeg', 'image-0.25.10', 'items/a/medium.jpg',
                               1280, 720, 12, ?4, 'published', 'now', 'now', 'now', 'now')",
                    [&hash('d'), &hash('a'), &hash('c'), &hash('e')],
                )
                .expect("prior variant");
            connection
                .execute(
                    "INSERT INTO managed_media_operations (
                       operation_id, scope_kind, scope_payload_json, operation_state,
                       cancellation_requested, total_count, completed_count,
                       succeeded_count, skipped_count, failed_count, journal_state,
                       created_at, updated_at, finished_at
                     ) VALUES ('prior-operation', 'media_item', '{}', 'completed',
                               0, 1, 1, 1, 0, 0, 'published', 'now', 'now', 'now')",
                    [],
                )
                .expect("prior operation");

            initialize_schema(connection).expect("additive lifecycle upgrade");

            assert_eq!(table_count(connection, "managed_media_items"), 1);
            assert_eq!(table_count(connection, "managed_media_variants"), 1);
            assert_eq!(table_count(connection, "managed_media_operations"), 1);
            assert_eq!(table_count(connection, "managed_media_item_generations"), 0);
            assert_eq!(
                table_count(connection, "managed_media_lifecycle_intents"),
                0
            );
            assert_eq!(
                table_count(connection, "managed_media_lifecycle_targets"),
                0
            );
            let owner: String = connection
                .query_row(
                    "SELECT owner_id FROM managed_media_items WHERE item_id = ?1",
                    [&hash('a')],
                    |row| row.get(0),
                )
                .expect("preserved item");
            assert_eq!(owner, "video-1");
        });
    }

    #[test]
    fn rejects_partial_lifecycle_upgrade_without_creating_missing_tables() {
        with_database("partial-lifecycle", |connection, _| {
            connection
                .execute_batch(MANAGED_MEDIA_BASE_SCHEMA_SQL)
                .expect("prior foundation");
            connection
                .execute_batch("CREATE TABLE managed_media_lifecycle_intents (unexpected TEXT);")
                .expect("conflicting lifecycle table");
            let error = initialize_schema(connection).expect_err("controlled conflict");
            assert!(error
                .to_string()
                .contains("Conflicting partial managed-media lifecycle schema"));
            assert!(
                !object_exists(connection, "table", "managed_media_item_generations")
                    .expect("generation absent")
            );
            assert!(
                !object_exists(connection, "table", "managed_media_lifecycle_targets")
                    .expect("targets absent")
            );
        });
    }

    #[test]
    fn constraints_reject_invalid_rows_and_protect_item_references() {
        with_database("constraints", |connection, _| {
            initialize_schema(connection).expect("schema");
            assert!(connection
                .execute(
                    "INSERT INTO managed_media_items (
                       item_id, owner_kind, owner_id, slot_kind, slot_token,
                       source_locator_kind, locator_hash, source_availability_state,
                       lifecycle_state, created_at, updated_at
                     ) VALUES ('invalid', 'video', 'video-1', 'primary_visual', 'primary',
                               'external_file', ?1, 'available', 'active', 'now', 'now')",
                    [&hash('b')],
                )
                .is_err());

            assert!(connection
                .execute(
                    "INSERT INTO managed_media_variants (
                       variant_id, managed_item_id, role_id, family, variant_class,
                       standard_tier, source_fingerprint, profile_version, relative_path,
                       width, height, byte_length, checksum, publication_state,
                       created_at, updated_at
                     ) VALUES (?1, ?2, 'video_detail_primary', 'LANDSCAPE_16_9',
                               'standard', 'MEDIUM', ?3, 'managed-media-profile-v1',
                               'items/missing/medium.future', 1280, 720, 0, ?4,
                               'published', 'now', 'now')",
                    [&hash('d'), &hash('e'), &hash('f'), &hash('1')],
                )
                .is_err());

            insert_item(connection);
            assert!(connection
                .execute(
                    "INSERT INTO managed_media_variants (
                       variant_id, managed_item_id, role_id, family, variant_class,
                       standard_tier, source_fingerprint, profile_version, relative_path,
                       width, height, byte_length, checksum, publication_state,
                       created_at, updated_at
                     ) VALUES (?1, ?2, 'video_detail_primary', 'LANDSCAPE_16_9',
                               'native_fallback', 'THUMBNAIL', ?3, 'managed-media-profile-v1',
                               'items/a/native.future', 320, 180, 0, ?4,
                               'published', 'now', 'now')",
                    [&hash('d'), &hash('a'), &hash('f'), &hash('1')],
                )
                .is_err());
            assert!(connection
                .execute(
                    "INSERT INTO managed_media_operations (
                       operation_id, scope_kind, scope_payload_json, operation_state,
                       cancellation_requested, total_count, completed_count,
                       succeeded_count, skipped_count, failed_count, journal_state,
                       created_at, updated_at
                     ) VALUES ('operation-1', 'media_item', '{}', 'completed',
                               0, 1, 1, 0, 0, 0, 'published', 'now', 'now')",
                    [],
                )
                .is_err());
        });
    }

    #[test]
    fn lifecycle_parent_protection_holds_with_foreign_keys_enabled() {
        with_database("foreign-keys-enabled", |connection, _| {
            connection
                .execute_batch("PRAGMA foreign_keys = ON;")
                .expect("foreign keys enabled");
            initialize_schema(connection).expect("schema");
            insert_item(connection);
            connection
                .execute(
                    "INSERT INTO managed_media_item_generations (
                       managed_item_id, current_revision, desired_revision, created_at, updated_at
                     ) VALUES (?1, 0, 0, 'now', 'now')",
                    [&hash('a')],
                )
                .expect("generation");
            assert!(connection
                .execute(
                    "DELETE FROM managed_media_items WHERE item_id = ?1",
                    [&hash('a')]
                )
                .is_err());
        });
    }

    #[test]
    fn lifecycle_schema_exposes_all_validated_structural_objects() {
        with_database("structural-objects", |connection, _| {
            initialize_schema(connection).expect("schema");
            for table in MANAGED_MEDIA_TABLES {
                assert!(object_exists(connection, "table", table).expect("table"));
            }
            for index in [
                "idx_managed_media_lifecycle_intents_due",
                "idx_managed_media_lifecycle_intents_claim",
                "idx_managed_media_lifecycle_intents_item_revision",
                "idx_managed_media_lifecycle_targets_intent_state",
                "idx_managed_media_lifecycle_targets_publication",
                "idx_managed_media_lifecycle_targets_standard_identity",
                "idx_managed_media_lifecycle_targets_native_identity",
            ] {
                assert!(object_exists(connection, "index", index).expect("index"));
            }
            for trigger in [
                "managed_media_item_generations_require_item_insert",
                "managed_media_lifecycle_intents_require_generation_insert",
                "managed_media_lifecycle_intents_require_superseder_update",
                "managed_media_lifecycle_targets_require_intent_insert",
                "managed_media_lifecycle_targets_require_publication_update",
                "managed_media_lifecycle_targets_require_variant_update",
                "managed_media_items_prevent_lifecycle_delete",
                "managed_media_operations_prevent_target_delete",
                "managed_media_variants_prevent_target_delete",
            ] {
                assert!(object_exists(connection, "trigger", trigger).expect("trigger"));
            }
            validate_schema(connection).expect("validated structure");
        });
    }
}
