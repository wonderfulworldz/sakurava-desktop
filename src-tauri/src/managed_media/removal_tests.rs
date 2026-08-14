use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use super::{
    catalog_lifecycle::{queue_missing_or_outdated, reconcile_owner_mutation, OwnerSources},
    path::ManagedMediaRoot,
    recovery::{recover, RecoveryScope},
    removal::{execute_internal, preview, RemovalExecuteRequest, RemovalFailurePoint},
    schema,
};
use crate::{
    commands::require_removal_automatic_policy,
    managed_media::production::AutomaticActionsPolicyState,
};

const NOW: &str = "2026-08-14T00:00:00Z";

struct Fixture {
    connection: Connection,
    app_data: PathBuf,
    root: ManagedMediaRoot,
}

impl Fixture {
    fn new(name: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let app_data = std::env::temp_dir().join(format!("sakurava-removal-{name}-{unique}"));
        fs::create_dir_all(&app_data).unwrap();
        let root = ManagedMediaRoot::from_app_data_dir(&app_data).unwrap();
        let connection = Connection::open_in_memory().unwrap();
        schema::initialize_schema(&connection).unwrap();
        connection.execute_batch(
            "CREATE TABLE videos (id TEXT PRIMARY KEY, coverPath TEXT NOT NULL);
             CREATE TABLE images (id TEXT PRIMARY KEY, coverPath TEXT NOT NULL, galleryImagePathsJson TEXT NOT NULL);
             CREATE TABLE performers (id TEXT PRIMARY KEY, coverPath TEXT NOT NULL, performerThumbnailPathsJson TEXT NOT NULL);
             CREATE TABLE managedCategories (key TEXT PRIMARY KEY, thumbnailPath TEXT NOT NULL);
             CREATE TABLE glossary_entries (id TEXT PRIMARY KEY, thumbnail_path TEXT NOT NULL);"
        ).unwrap();
        Self {
            connection,
            app_data,
            root,
        }
    }

    fn add_video(
        &mut self,
        owner_id: &str,
        readable_original: bool,
        managed_present: bool,
    ) -> (String, String) {
        let source = self.app_data.join(format!("{owner_id}-original.jpg"));
        if readable_original {
            fs::write(&source, b"readable original").unwrap();
        }
        self.connection
            .execute(
                "INSERT INTO videos VALUES (?1, ?2)",
                params![owner_id, source.to_string_lossy()],
            )
            .unwrap();
        let owner = OwnerSources::video(owner_id, source.to_string_lossy());
        let transaction = self.connection.transaction().unwrap();
        let mut tokens = vec!["primary_visual".to_string()].into_iter();
        reconcile_owner_mutation(
            &transaction,
            None,
            Some(&owner),
            &mut || tokens.next().ok_or_else(|| "token".to_string()),
            NOW,
        )
        .unwrap();
        transaction.commit().unwrap();
        let (item_id, revision): (String, u64) = self.connection.query_row(
            "SELECT item.item_id, generation.desired_revision FROM managed_media_items item
             JOIN managed_media_item_generations generation ON generation.managed_item_id = item.item_id
             WHERE item.owner_id = ?1", [owner_id], |row| Ok((row.get(0)?, row.get(1)?))
        ).unwrap();
        let (target_id, role_id, variant_class, standard_tier): (String, String, String, Option<String>) = self.connection.query_row(
            "SELECT target_id, role_id, variant_class, standard_tier FROM managed_media_lifecycle_targets
             WHERE managed_item_id = ?1 ORDER BY target_id LIMIT 1", [&item_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        ).unwrap();
        let variant_id = format!(
            "{:064x}",
            owner_id
                .bytes()
                .fold(100_u64, |sum, byte| sum + byte as u64)
        );
        let bytes = format!("managed-{owner_id}").into_bytes();
        let checksum = format!("{:x}", Sha256::digest(&bytes));
        let relative_path = format!("items/{}/{variant_id}.jpg", &variant_id[..2]);
        let final_path = self.root.resolve(&relative_path).unwrap();
        if managed_present {
            fs::create_dir_all(final_path.parent().unwrap()).unwrap();
            fs::write(&final_path, &bytes).unwrap();
        }
        let operation_id = format!("published-{owner_id}");
        self.connection.execute(
            "INSERT INTO managed_media_operations (
               operation_id, scope_kind, scope_payload_json, operation_state,
               total_count, completed_count, succeeded_count, skipped_count, failed_count,
               journal_state, created_at, updated_at, finished_at
             ) VALUES (?1, 'media_item', '{}', 'completed', 1, 1, 1, 0, 0, 'published', ?2, ?2, ?2)",
            params![operation_id, NOW]
        ).unwrap();
        let fingerprint = "c".repeat(64);
        self.connection
            .execute(
                "INSERT INTO managed_media_variants (
               variant_id, managed_item_id, role_id, family, variant_class, standard_tier,
               source_fingerprint, profile_version, output_format, format_version,
               encoder_version, relative_path, width, height, byte_length, checksum,
               publication_state, validated_at, published_at, created_at, updated_at
             ) VALUES (?1, ?2, ?3, 'LANDSCAPE_16_9', ?4, ?5, ?6,
                       'managed-media-profile-v1', 'jpeg', 'baseline-jpeg', 'test', ?7,
                       32, 18, ?8, ?9, 'published', ?10, ?10, ?10, ?10)",
                params![
                    variant_id,
                    item_id,
                    role_id,
                    variant_class,
                    standard_tier,
                    fingerprint,
                    relative_path,
                    bytes.len() as u64,
                    checksum,
                    NOW
                ],
            )
            .unwrap();
        self.connection
            .execute(
                "UPDATE managed_media_lifecycle_targets SET target_state = 'published',
                 publication_operation_id = ?2, result_variant_id = ?3, updated_at = ?4
             WHERE target_id = ?1",
                params![target_id, operation_id, variant_id, NOW],
            )
            .unwrap();
        self.connection.execute(
            "UPDATE managed_media_lifecycle_targets SET target_state = 'skipped_ineligible', updated_at = ?3
             WHERE managed_item_id = ?1 AND desired_revision = ?2 AND target_id <> ?4",
            params![item_id, revision, NOW, target_id]
        ).unwrap();
        self.connection.execute(
            "UPDATE managed_media_lifecycle_intents SET lifecycle_state = 'completed', finished_at = ?2, updated_at = ?2
             WHERE managed_item_id = ?1", params![item_id, NOW]
        ).unwrap();
        self.connection
            .execute(
                "UPDATE managed_media_items SET current_source_fingerprint = ?2,
                 pending_source_fingerprint = NULL, source_availability_state = 'available',
                 lifecycle_state = 'active', updated_at = ?3 WHERE item_id = ?1",
                params![item_id, fingerprint, NOW],
            )
            .unwrap();
        self.connection.execute(
            "UPDATE managed_media_item_generations SET current_revision = desired_revision, updated_at = ?2
             WHERE managed_item_id = ?1", params![item_id, NOW]
        ).unwrap();
        (item_id, variant_id)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.app_data);
    }
}

#[test]
fn removal_preview_classifies_readable_protected_and_missing_candidates() {
    let mut fixture = Fixture::new("preview");
    fixture.add_video("readable", true, true);
    fixture.add_video("protected", false, true);
    fixture.add_video("missing-file", true, false);
    let preview = preview(&fixture.connection, &fixture.root, "on").unwrap();
    assert_eq!(preview.automatic_policy_state, "on");
    assert_eq!(preview.source_slot_count_considered, 3);
    assert_eq!(preview.removable_source_slot_count, 2);
    assert_eq!(preview.removable_physical_variant_count, 1);
    assert_eq!(preview.protected_original_unavailable_source_count, 1);
    assert_eq!(preview.protected_original_unavailable_variant_count, 1);
    assert_eq!(preview.already_missing_managed_file_count, 1);
}

#[test]
fn destructive_policy_rejects_unsynchronized_and_on_but_accepts_off() {
    assert!(require_removal_automatic_policy(AutomaticActionsPolicyState::Unsynchronized).is_err());
    assert!(require_removal_automatic_policy(AutomaticActionsPolicyState::On).is_err());
    assert!(require_removal_automatic_policy(AutomaticActionsPolicyState::Off).is_ok());
}

#[test]
fn removal_path_boundary_rejects_escape_before_any_filesystem_mutation() {
    let fixture = Fixture::new("path-escape");
    assert!(fixture.root.resolve("../outside.jpg").is_err());
    assert!(!fixture.app_data.join("outside.jpg").exists());
}

#[test]
fn stale_preview_rejects_without_physical_or_metadata_deletion() {
    let mut fixture = Fixture::new("stale");
    let (_, variant_id) = fixture.add_video("video", true, true);
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    fixture
        .connection
        .execute(
            "UPDATE managed_media_variants SET byte_length = byte_length + 1 WHERE variant_id = ?1",
            [&variant_id],
        )
        .unwrap();
    let result = execute_internal(
        &fixture.connection,
        &fixture.root,
        RemovalExecuteRequest {
            preview_token: preview.preview_token,
        },
        None,
    )
    .unwrap();
    assert!(result.stale);
    assert_eq!(
        fixture
            .connection
            .query_row("SELECT COUNT(*) FROM managed_media_variants", [], |row| row
                .get::<_, u64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn guarded_removal_reconciles_metadata_then_queues_one_blocked_generate() {
    let mut fixture = Fixture::new("remove");
    let (item_id, variant_id) = fixture.add_video("video", true, true);
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    let result = execute_internal(
        &fixture.connection,
        &fixture.root,
        RemovalExecuteRequest {
            preview_token: preview.preview_token,
        },
        None,
    )
    .unwrap();
    assert!(!result.stale);
    assert_eq!(result.removed_source_slot_count, 1);
    assert_eq!(result.removed_variant_count, 1);
    assert!(result.reclaimed_bytes > 0);
    assert_eq!(
        fixture
            .connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_variants WHERE variant_id = ?1",
                [&variant_id],
                |row| row.get::<_, u64>(0)
            )
            .unwrap(),
        0
    );
    let (state, generate_count): (String, u64) = fixture.connection.query_row(
        "SELECT item.lifecycle_state, COUNT(intent.intent_id) FROM managed_media_items item
         JOIN managed_media_lifecycle_intents intent ON intent.managed_item_id = item.item_id
         WHERE item.item_id = ?1 AND intent.lifecycle_action = 'generate' AND intent.lifecycle_state = 'queued'",
        [&item_id], |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap();
    assert_eq!(state, "pending");
    assert_eq!(generate_count, 1);
    assert_eq!(
        fixture
            .connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_lifecycle_targets WHERE result_variant_id = ?1",
                [&variant_id],
                |row| row.get::<_, u64>(0)
            )
            .unwrap(),
        0
    );
}

#[test]
fn precommit_crash_recovery_restores_quarantine_and_authoritative_metadata() {
    let mut fixture = Fixture::new("precommit-recovery");
    let (_, variant_id) = fixture.add_video("video", true, true);
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    let result = execute_internal(
        &fixture.connection,
        &fixture.root,
        RemovalExecuteRequest {
            preview_token: preview.preview_token,
        },
        Some(RemovalFailurePoint::AfterQuarantine),
    )
    .unwrap();
    assert_eq!(result.failed_source_slot_count, 1);
    assert_eq!(result.recovery_conflict_source_count, 1);
    let operation_id: String = fixture.connection.query_row(
        "SELECT operation_id FROM managed_media_operations WHERE scope_kind = 'targeted_variants'",
        [], |row| row.get(0)
    ).unwrap();
    recover(
        &fixture.connection,
        &fixture.root,
        &Default::default(),
        RecoveryScope::Operation(super::identity::OperationIdentity::new(operation_id).unwrap()),
    )
    .unwrap();
    assert_eq!(
        fixture
            .connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_variants WHERE variant_id = ?1",
                [&variant_id],
                |row| row.get::<_, u64>(0)
            )
            .unwrap(),
        1
    );
    let relative: String = fixture
        .connection
        .query_row(
            "SELECT relative_path FROM managed_media_variants WHERE variant_id = ?1",
            [&variant_id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(fixture.root.resolve(relative).unwrap().is_file());
}

#[test]
fn postcommit_crash_recovery_finishes_exact_quarantine_cleanup() {
    let mut fixture = Fixture::new("postcommit-recovery");
    let (_, variant_id) = fixture.add_video("video", true, true);
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    let result = execute_internal(
        &fixture.connection,
        &fixture.root,
        RemovalExecuteRequest {
            preview_token: preview.preview_token,
        },
        Some(RemovalFailurePoint::AfterDatabaseCommit),
    )
    .unwrap();
    assert_eq!(result.failed_source_slot_count, 1);
    let operation_id: String = fixture.connection.query_row(
        "SELECT operation_id FROM managed_media_operations WHERE scope_kind = 'targeted_variants'",
        [], |row| row.get(0)
    ).unwrap();
    recover(
        &fixture.connection,
        &fixture.root,
        &Default::default(),
        RecoveryScope::Operation(
            super::identity::OperationIdentity::new(operation_id.clone()).unwrap(),
        ),
    )
    .unwrap();
    assert_eq!(
        fixture
            .connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_variants WHERE variant_id = ?1",
                [&variant_id],
                |row| row.get::<_, u64>(0)
            )
            .unwrap(),
        0
    );
    assert_eq!(
        fixture
            .connection
            .query_row(
                "SELECT operation_state FROM managed_media_operations WHERE operation_id = ?1",
                [operation_id],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
        "completed"
    );
}

#[test]
fn active_claim_and_retire_work_are_preserved_as_conflicts() {
    let mut fixture = Fixture::new("conflict");
    let (item_id, _) = fixture.add_video("video", true, true);
    let intent_id: String = fixture
        .connection
        .query_row(
            "SELECT intent_id FROM managed_media_lifecycle_intents
         WHERE managed_item_id = ?1 ORDER BY desired_revision DESC LIMIT 1",
            [&item_id],
            |row| row.get(0),
        )
        .unwrap();
    fixture.connection.execute(
        "UPDATE managed_media_lifecycle_intents SET lifecycle_state = 'claimed', claim_token = 'claim', claim_expires_at = 'epoch-ms-9999999999999'
         WHERE intent_id = ?1", [intent_id]
    ).unwrap();
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    assert_eq!(preview.removable_source_slot_count, 0);
    assert_eq!(preview.conflicting_nonterminal_lifecycle_work_count, 1);
    assert_eq!(
        fixture
            .connection
            .query_row("SELECT COUNT(*) FROM managed_media_variants", [], |row| row
                .get::<_, u64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn retired_items_are_not_removal_candidates_or_converted_to_generate() {
    let mut fixture = Fixture::new("retired");
    let (item_id, _) = fixture.add_video("video", true, true);
    fixture.connection.execute(
        "UPDATE managed_media_items SET lifecycle_state = 'retired' WHERE item_id = ?1",
        [&item_id],
    ).unwrap();
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    assert_eq!(preview.source_slot_count_considered, 0);
    assert_eq!(preview.removable_source_slot_count, 0);
    assert_eq!(fixture.connection.query_row(
        "SELECT COUNT(*) FROM managed_media_lifecycle_intents
         WHERE managed_item_id = ?1 AND lifecycle_action = 'generate' AND lifecycle_state = 'queued'",
        [&item_id], |row| row.get::<_, u64>(0)
    ).unwrap(), 0);
}

#[test]
fn unexpected_managed_file_type_is_rejected_without_metadata_deletion() {
    let mut fixture = Fixture::new("unsafe-type");
    let (_, variant_id) = fixture.add_video("video", true, true);
    let relative: String = fixture
        .connection
        .query_row(
            "SELECT relative_path FROM managed_media_variants WHERE variant_id = ?1",
            [&variant_id],
            |row| row.get(0),
        )
        .unwrap();
    let path = fixture.root.resolve(relative).unwrap();
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    assert_eq!(preview.validation_failed_source_count, 1);
    assert_eq!(preview.removable_source_slot_count, 0);
    assert_eq!(
        fixture
            .connection
            .query_row("SELECT COUNT(*) FROM managed_media_variants", [], |row| row
                .get::<_, u64>(0))
            .unwrap(),
        1
    );
}

#[cfg(windows)]
#[test]
fn locked_file_failure_leaves_authoritative_metadata_and_file_intact() {
    use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt};

    let mut fixture = Fixture::new("locked");
    let (_, variant_id) = fixture.add_video("video", true, true);
    let relative: String = fixture
        .connection
        .query_row(
            "SELECT relative_path FROM managed_media_variants WHERE variant_id = ?1",
            [&variant_id],
            |row| row.get(0),
        )
        .unwrap();
    let path = fixture.root.resolve(relative).unwrap();
    let lock = OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&path)
        .unwrap();
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    let result = execute_internal(
        &fixture.connection,
        &fixture.root,
        RemovalExecuteRequest {
            preview_token: preview.preview_token,
        },
        None,
    )
    .unwrap();
    assert_eq!(result.failed_source_slot_count, 1);
    assert_eq!(result.locked_or_unmovable_variant_count, 1);
    assert_eq!(result.reclaimed_bytes, 0);
    assert_eq!(
        fixture
            .connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_variants WHERE variant_id = ?1",
                [&variant_id],
                |row| row.get::<_, u64>(0)
            )
            .unwrap(),
        1
    );
    assert!(path.is_file());
    drop(lock);
}

#[test]
fn explicit_manual_regenerate_supersedes_only_removal_queued_generate() {
    let mut fixture = Fixture::new("manual");
    fixture.add_video("video", true, true);
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    execute_internal(
        &fixture.connection,
        &fixture.root,
        RemovalExecuteRequest {
            preview_token: preview.preview_token,
        },
        None,
    )
    .unwrap();
    let before: String = fixture.connection.query_row(
        "SELECT intent_id FROM managed_media_lifecycle_intents WHERE lifecycle_action = 'generate' AND lifecycle_state = 'queued'",
        [], |row| row.get(0)
    ).unwrap();
    let queued = queue_missing_or_outdated(&fixture.connection, &fixture.root, NOW).unwrap();
    assert_eq!(queued.queued_count, 1);
    assert_eq!(
        fixture
            .connection
            .query_row(
                "SELECT lifecycle_state FROM managed_media_lifecycle_intents WHERE intent_id = ?1",
                [before],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
        "superseded"
    );
    assert_eq!(fixture.connection.query_row("SELECT COUNT(*) FROM managed_media_lifecycle_intents WHERE lifecycle_action = 'regenerate' AND lifecycle_state = 'queued'", [], |row| row.get::<_, u64>(0)).unwrap(), 1);
}

#[test]
fn partial_success_preserves_unavailable_original_and_reconciles_missing_file() {
    let mut fixture = Fixture::new("partial");
    fixture.add_video("removable", true, false);
    fixture.add_video("protected", false, true);
    let preview = preview(&fixture.connection, &fixture.root, "off").unwrap();
    let result = execute_internal(
        &fixture.connection,
        &fixture.root,
        RemovalExecuteRequest {
            preview_token: preview.preview_token,
        },
        None,
    )
    .unwrap();
    assert_eq!(result.removed_source_slot_count, 1);
    assert_eq!(result.already_missing_reconciled_count, 1);
    assert_eq!(result.protected_original_unavailable_source_count, 1);
    assert_eq!(
        fixture
            .connection
            .query_row("SELECT COUNT(*) FROM managed_media_variants", [], |row| row
                .get::<_, u64>(0))
            .unwrap(),
        1
    );
}
