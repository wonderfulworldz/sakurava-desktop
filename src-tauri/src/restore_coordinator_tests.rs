use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::params;
use sha2::{Digest, Sha256};

use crate::{
    database::{
        allocate_sakurava_ref, create_backup_package, prepare_database,
        register_current_sakurava_ref_alias, BackupPackageType, RuntimeDatabase,
    },
    managed_media::path::ManagedMediaRoot,
    restore_coordinator::{
        active_journal_for_test, begin_restore, complete_recovery, complete_restore,
        create_backup_package_v2, has_unresolved_restore,
        import_selected_backup_package_v2_or_legacy, recover_before_database_open, recovery_status,
        rollback_after_state_failure,
    },
};

struct Fixture {
    root: PathBuf,
    database: RuntimeDatabase,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn unique_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "sakurava-restore-coordinator-{name}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ))
}

fn fixture(name: &str) -> Fixture {
    let root = unique_root(name);
    fs::create_dir_all(&root).expect("root");
    let database = prepare_database(&root).expect("database");
    Fixture { root, database }
}

fn protected_state(selected_language: Option<&str>) -> String {
    let raw = |value: Option<&str>| {
        serde_json::json!({
            "present": value.is_some(),
            "raw": value,
        })
    };
    serde_json::json!({
        "format": "sakurava-protected-state",
        "version": 1,
        "appearance": { "version": 1, "values": {
            "sakurava.appearance.theme.v1": raw(None),
            "sakurava.appearance.accent.v1": raw(None),
            "sakurava.appearance.density.v1": raw(None),
            "sakurava.appearance.uiScale.v1": raw(None)
        }},
        "automaticBackup": { "version": 1, "values": {
            "sakurava.backupRecovery.v1": raw(None)
        }},
        "catalogPreferences": { "version": 1, "values": {
            "sakurava.catalogPreferences.v1": raw(None)
        }},
        "catalogPagination": { "version": 1, "values": {} },
        "mediaAssetScope": { "version": 1, "values": {
            "sakurava.mediaAssetRoots.v1": raw(None)
        }},
        "featureState": { "version": 1, "values": {} },
        "translation": { "version": 1, "values": {
            "sakurava.language.selected.v1": raw(selected_language),
            "sakurava.customLanguages.v1": raw(None),
            "sakurava.languageOverrides.v1": raw(None),
            "sakurava.translationTransaction.v1": raw(None)
        }}
    })
    .to_string()
}

fn insert_video(database: &RuntimeDatabase, id: &str, title: &str) {
    let connection = database.connection();
    let connection = connection.lock().expect("connection");
    let reference = allocate_sakurava_ref(&connection, "V", "2608").expect("allocate ref");
    connection
        .execute(
            "INSERT INTO videos (id, sakuravaRef, title, createdAt, updatedAt) VALUES (?1, ?2, ?3, '2026-08-03T00:00:00Z', '2026-08-03T00:00:00Z')",
            params![id, &reference, title],
        )
        .expect("insert video");
    register_current_sakurava_ref_alias(&connection, "V", &reference).expect("register ref");
}

fn video_exists(database: &RuntimeDatabase, id: &str) -> bool {
    let connection = database.connection();
    let connection = connection.lock().expect("connection");
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM videos WHERE id = ?1)",
            [id],
            |row| row.get(0),
        )
        .expect("video exists")
}

fn install_managed_media(database: &RuntimeDatabase, bytes: &[u8]) -> PathBuf {
    let relative = "items/aa/item/source/video-detail/medium.jpg";
    let managed_root =
        ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir).expect("managed root");
    let path = managed_root.resolve(relative).expect("managed path");
    fs::create_dir_all(path.parent().expect("managed parent")).expect("managed parent");
    fs::write(&path, bytes).expect("managed bytes");
    let checksum = format!("{:x}", Sha256::digest(bytes));
    let connection = database.connection();
    let connection = connection.lock().expect("connection");
    let item_id = "a".repeat(64);
    let locator_hash = "b".repeat(64);
    let source_hash = "c".repeat(64);
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token,
               source_locator_kind, locator_hash, current_source_fingerprint,
               pending_source_fingerprint, source_availability_state,
               lifecycle_state, created_at, updated_at
             ) VALUES (?1, 'video', 'video-1', 'primary_visual', 'primary',
                       'external_file', ?2, ?3, NULL, 'missing', 'active',
                       '2026-08-03T00:00:00Z', '2026-08-03T00:00:00Z')",
            [&item_id, &locator_hash, &source_hash],
        )
        .expect("managed item");
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
                       'baseline-jpeg', 'image-0.25.10', ?4, 1280, 720, ?5, ?6,
                       'published', 'now', 'now', 'now', 'now')",
            params![
                "d".repeat(64),
                item_id,
                source_hash,
                relative,
                bytes.len() as i64,
                checksum
            ],
        )
        .expect("managed variant");
    path
}

fn import_v2_target(live: &RuntimeDatabase, name: &str) -> String {
    let source = fixture(&format!("{name}-source"));
    insert_video(&source.database, "restored", "Restored");
    install_managed_media(&source.database, b"restored managed mini image");
    let package = create_backup_package_v2(
        &source.database,
        BackupPackageType::Manual,
        None,
        protected_state(Some("ja")),
    )
    .expect("source package");
    import_selected_backup_package_v2_or_legacy(live, Some(PathBuf::from(package.package_path)))
        .expect("import")
        .package_name
        .expect("import name")
}

fn begin_valid_restore(
    fixture: &Fixture,
    name: &str,
) -> crate::restore_coordinator::RestoreStateTransition {
    let package_name = import_v2_target(&fixture.database, name);
    begin_restore(
        &fixture.database,
        &package_name,
        "2608",
        protected_state(None),
    )
    .expect("begin restore")
}

#[test]
fn clean_disposable_root_has_no_restore_journal() {
    let fixture = fixture("clean");
    assert!(!has_unresolved_restore(&fixture.database.paths.app_data_dir).expect("status"));
    assert_eq!(
        active_journal_for_test(&fixture.database.paths.app_data_dir).expect("journal"),
        None
    );
}

#[test]
fn valid_v2_restore_coordinates_database_state_and_completion_cleanup() {
    let fixture = fixture("v2-success");
    insert_video(&fixture.database, "original", "Original");
    let transition = begin_valid_restore(&fixture, "v2-success");
    assert!(video_exists(&fixture.database, "restored"));
    assert!(!video_exists(&fixture.database, "original"));
    let restored_media = ManagedMediaRoot::from_app_data_dir(&fixture.database.paths.app_data_dir)
        .expect("managed root")
        .resolve("items/aa/item/source/video-detail/medium.jpg")
        .expect("managed path");
    assert_eq!(
        fs::read(restored_media).expect("restored media"),
        b"restored managed mini image"
    );
    assert!(transition.protected_state.contains("ja"));
    assert!(fixture.database.ensure_restore_resolved().is_err());
    let result = complete_restore(
        &fixture.database,
        &transition.operation_id,
        &transition.expected_state_sha256,
    )
    .expect("complete");
    assert!(result.database_restored);
    assert!(!has_unresolved_restore(&fixture.database.paths.app_data_dir).expect("resolved"));
}

#[test]
fn protected_state_failure_rolls_database_and_media_back_to_safety_state() {
    let fixture = fixture("state-rollback");
    insert_video(&fixture.database, "original", "Original");
    let original_media = install_managed_media(&fixture.database, b"original managed mini image");
    let transition = begin_valid_restore(&fixture, "state-rollback");
    let rollback = rollback_after_state_failure(&fixture.database, &transition.operation_id)
        .expect("rollback");
    assert!(rollback.rollback_succeeded);
    assert!(video_exists(&fixture.database, "original"));
    assert!(!video_exists(&fixture.database, "restored"));
    assert_eq!(
        fs::read(original_media).expect("rolled-back media"),
        b"original managed mini image"
    );
    assert_eq!(rollback.transition.mode, "rollback");
    complete_recovery(
        &fixture.database,
        &rollback.transition.operation_id,
        "rollback",
        &rollback.transition.expected_state_sha256,
    )
    .expect("rollback acknowledgement");
    assert!(!has_unresolved_restore(&fixture.database.paths.app_data_dir).expect("resolved"));
}

#[test]
fn restart_recovery_reenters_target_state_idempotently_from_durable_artifacts() {
    let fixture = fixture("restart-resume");
    let transition = begin_valid_restore(&fixture, "restart-resume");
    recover_before_database_open(&fixture.database.paths.app_data_dir).expect("pre-open recovery");
    let first = recovery_status(&fixture.database).expect("first status");
    let second = recovery_status(&fixture.database).expect("second status");
    assert_eq!(first, second);
    assert_eq!(
        first.transition.as_ref().expect("transition").operation_id,
        transition.operation_id
    );
    let pending = first.transition.expect("pending transition");
    complete_recovery(
        &fixture.database,
        &pending.operation_id,
        &pending.mode,
        &pending.expected_state_sha256,
    )
    .expect("complete recovery");
    assert!(recovery_status(&fixture.database)
        .expect("final status")
        .transition
        .is_none());
}

#[test]
fn restart_recovery_reopens_the_database_from_journal_and_owned_artifacts() {
    let root = unique_root("restart-reopen");
    fs::create_dir_all(&root).expect("root");
    let database = prepare_database(&root).expect("database");
    let package_name = import_v2_target(&database, "restart-reopen");
    let transition = begin_restore(&database, &package_name, "2608", protected_state(None))
        .expect("begin restore");
    drop(database);

    recover_before_database_open(&root).expect("startup recovery");
    let reopened = prepare_database(&root).expect("reopened database");
    assert!(video_exists(&reopened, "restored"));
    let status = recovery_status(&reopened).expect("recovery status");
    let pending = status.transition.expect("pending transition");
    assert_eq!(pending.operation_id, transition.operation_id);
    complete_recovery(
        &reopened,
        &pending.operation_id,
        &pending.mode,
        &pending.expected_state_sha256,
    )
    .expect("complete recovery");
    drop(reopened);
    fs::remove_dir_all(root).expect("fixture cleanup");
}

#[test]
fn failed_post_apply_validation_can_roll_back_all_backend_domains() {
    let fixture = fixture("post-apply-rollback");
    insert_video(&fixture.database, "original", "Original");
    let original_media = install_managed_media(&fixture.database, b"original managed mini image");
    let transition = begin_valid_restore(&fixture, "post-apply-rollback");
    let live_media = ManagedMediaRoot::from_app_data_dir(&fixture.database.paths.app_data_dir)
        .expect("managed root")
        .resolve("items/aa/item/source/video-detail/medium.jpg")
        .expect("managed path");
    fs::write(&live_media, b"corrupt after apply").expect("failure injection");
    let error = complete_restore(
        &fixture.database,
        &transition.operation_id,
        &transition.expected_state_sha256,
    )
    .expect_err("post-apply validation fails");
    assert_eq!(error.code, "post_apply_validation_failed");
    let rollback = rollback_after_state_failure(&fixture.database, &transition.operation_id)
        .expect("rollback");
    assert!(rollback.rollback_succeeded);
    assert!(video_exists(&fixture.database, "original"));
    assert_eq!(
        fs::read(original_media).expect("rolled-back media"),
        b"original managed mini image"
    );
}

#[test]
fn unresolved_restore_blocks_a_second_restore_and_catalog_mutation_gate() {
    let fixture = fixture("blocked-second");
    let transition = begin_valid_restore(&fixture, "blocked-second");
    let second = begin_restore(
        &fixture.database,
        "missing.skv",
        "2608",
        protected_state(None),
    )
    .expect_err("second restore blocked");
    assert_eq!(second.code, "recovery_unresolved");
    assert!(fixture.database.ensure_restore_resolved().is_err());
    rollback_after_state_failure(&fixture.database, &transition.operation_id).expect("rollback");
}

#[test]
fn missing_safety_artifact_and_corrupt_journal_fail_closed() {
    let fixture = fixture("corrupt-recovery");
    let transition = begin_valid_restore(&fixture, "corrupt-recovery");
    let active = fixture
        .database
        .paths
        .app_data_dir
        .join(".restore-recovery-v1")
        .join("active");
    fs::remove_file(
        active
            .join("safety-package")
            .join("sakurava-restore-safety.skv"),
    )
    .expect("remove safety artifact");
    assert!(recover_before_database_open(&fixture.database.paths.app_data_dir).is_err());
    fs::write(active.join("journal.json"), b"{broken").expect("corrupt journal");
    assert!(has_unresolved_restore(&fixture.database.paths.app_data_dir).is_err());
    assert!(!transition.operation_id.is_empty());
}

#[test]
fn legacy_v1_restores_only_database_and_preserves_protected_state_domain() {
    let live = fixture("legacy-live");
    insert_video(&live.database, "original", "Original");
    let source = fixture("legacy-source");
    insert_video(&source.database, "restored", "Restored");
    let package = create_backup_package(
        &source.database,
        BackupPackageType::Manual,
        Some("legacy".to_string()),
    )
    .expect("legacy package");
    let imported = import_selected_backup_package_v2_or_legacy(
        &live.database,
        Some(PathBuf::from(package.package_path)),
    )
    .expect("import legacy")
    .package_name
    .expect("legacy name");
    let transition = begin_restore(
        &live.database,
        &imported,
        "2608",
        protected_state(Some("fr")),
    )
    .expect("legacy begin");
    assert!(transition.protected_state.contains("fr"));
    assert!(video_exists(&live.database, "restored"));
    complete_restore(
        &live.database,
        &transition.operation_id,
        &transition.expected_state_sha256,
    )
    .expect("legacy complete");
}

#[test]
fn cleanup_is_bounded_to_the_exact_owned_active_root() {
    let fixture = fixture("cleanup-boundary");
    let sibling = fixture
        .database
        .paths
        .app_data_dir
        .join(".restore-recovery-v1")
        .join("keep.txt");
    fs::create_dir_all(sibling.parent().expect("parent")).expect("recovery root");
    fs::write(&sibling, b"keep").expect("sibling");
    let transition = begin_valid_restore(&fixture, "cleanup-boundary");
    complete_restore(
        &fixture.database,
        &transition.operation_id,
        &transition.expected_state_sha256,
    )
    .expect("complete");
    assert_eq!(fs::read(&sibling).expect("sibling preserved"), b"keep");
}

#[test]
fn invalid_state_receipt_cannot_complete_or_remove_recovery_evidence() {
    let fixture = fixture("receipt-mismatch");
    let transition = begin_valid_restore(&fixture, "receipt-mismatch");
    let error = complete_restore(&fixture.database, &transition.operation_id, &"0".repeat(64))
        .expect_err("receipt mismatch");
    assert_eq!(error.code, "state_receipt_mismatch");
    assert!(has_unresolved_restore(&fixture.database.paths.app_data_dir).expect("still active"));
}

#[test]
fn safety_package_creation_failure_causes_no_live_database_mutation() {
    let fixture = fixture("safety-failure");
    insert_video(&fixture.database, "original", "Original");
    let package_name = import_v2_target(&fixture.database, "safety-failure");
    let recovery_root = fixture
        .database
        .paths
        .app_data_dir
        .join(".restore-recovery-v1");
    fs::write(&recovery_root, b"not a directory").expect("blocking recovery path");
    let error = begin_restore(
        &fixture.database,
        &package_name,
        "2608",
        protected_state(None),
    )
    .expect_err("workspace creation fails");
    assert_eq!(error.code, "preview_workspace_failed");
    assert!(video_exists(&fixture.database, "original"));
    assert!(!video_exists(&fixture.database, "restored"));
}

fn _assert_path_is_disposable(path: &Path) {
    assert!(path.starts_with(std::env::temp_dir()));
}
