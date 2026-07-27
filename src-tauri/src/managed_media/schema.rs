use std::{collections::HashSet, io};

use rusqlite::{Connection, OptionalExtension};

pub const MANAGED_MEDIA_TABLES: [&str; 3] = [
    "managed_media_items",
    "managed_media_variants",
    "managed_media_operations",
];

const MANAGED_MEDIA_SCHEMA_SQL: &str = r#"
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

pub fn initialize_schema(connection: &Connection) -> rusqlite::Result<()> {
    validate_existing_boundary(connection)?;
    if all_tables_exist(connection)? {
        return validate_schema(connection);
    }
    initialize_with_sql(connection, MANAGED_MEDIA_SCHEMA_SQL)
}

fn initialize_with_sql(connection: &Connection, sql: &str) -> rusqlite::Result<()> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute_batch(sql)?;
    validate_schema(&transaction)?;
    transaction.commit()
}

fn validate_existing_boundary(connection: &Connection) -> rusqlite::Result<()> {
    let existing = MANAGED_MEDIA_TABLES
        .iter()
        .filter_map(|table| match object_exists(connection, "table", table) {
            Ok(true) => Some(Ok(*table)),
            Ok(false) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if !existing.is_empty() && existing.len() != MANAGED_MEDIA_TABLES.len() {
        return Err(schema_error(format!(
            "Conflicting partial managed-media schema: found {}.",
            existing.join(", ")
        )));
    }
    if existing.len() == MANAGED_MEDIA_TABLES.len() {
        validate_schema(connection)?;
    }
    Ok(())
}

fn all_tables_exist(connection: &Connection) -> rusqlite::Result<bool> {
    for table in MANAGED_MEDIA_TABLES {
        if !object_exists(connection, "table", table)? {
            return Ok(false);
        }
    }
    Ok(true)
}

pub(crate) fn validate_schema(connection: &Connection) -> rusqlite::Result<()> {
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
            let failing_sql = format!("{MANAGED_MEDIA_SCHEMA_SQL}\nCREATE TABLE invalid_sql (");
            assert!(initialize_with_sql(connection, &failing_sql).is_err());
            for table in MANAGED_MEDIA_TABLES {
                assert!(!object_exists(connection, "table", table).expect("inspect rollback"));
            }
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
}
