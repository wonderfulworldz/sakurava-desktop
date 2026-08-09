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
        register_current_sakurava_ref_alias, BackupPackagePreviewCounts, BackupPackageType,
        RuntimeDatabase,
    },
    managed_media::path::ManagedMediaRoot,
    restore_coordinator::{
        active_journal_for_test, begin_restore, complete_recovery, complete_restore,
        create_backup_package_v2, has_unresolved_restore,
        import_selected_backup_package_v2_or_legacy, preview_backup_package_v2_or_legacy,
        recover_before_database_open, recovery_status, rollback_after_state_failure,
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct CatalogSnapshot {
    counts: [i64; 6],
    identities: Vec<String>,
}

impl CatalogSnapshot {
    fn empty() -> Self {
        Self {
            counts: [0; 6],
            identities: Vec::new(),
        }
    }
}

fn catalog_snapshot(database: &RuntimeDatabase) -> CatalogSnapshot {
    let connection = database.connection();
    let connection = connection.lock().expect("connection");
    let tables = [
        ("videos", "id"),
        ("images", "id"),
        ("performers", "id"),
        ("managedCategories", "key"),
        ("glossary_entries", "id"),
        ("credits", "id"),
    ];
    let mut counts = [0; 6];
    let mut identities = Vec::new();
    for (index, (table, identity_column)) in tables.iter().enumerate() {
        counts[index] = connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .expect("catalog count");
        let mut statement = connection
            .prepare(&format!(
                "SELECT {identity_column} || ':' || sakuravaRef FROM {table} ORDER BY {identity_column}"
            ))
            .expect("identity statement");
        identities.extend(
            statement
                .query_map([], |row| row.get::<_, String>(0))
                .expect("identity query")
                .map(|row| format!("{table}:{}", row.expect("identity row"))),
        );
    }
    CatalogSnapshot { counts, identities }
}

fn preview_counts(counts: &BackupPackagePreviewCounts) -> [i64; 6] {
    [
        counts.videos,
        counts.images,
        counts.performers,
        counts.categories,
        counts.glossary,
        counts.credits,
    ]
}

fn allocate_fixture_ref(connection: &rusqlite::Connection, section: &str) -> String {
    let reference = allocate_sakurava_ref(connection, section, "2608").expect("allocate ref");
    register_current_sakurava_ref_alias(connection, section, &reference).expect("register ref");
    reference
}

fn populate_exact_snapshot_fixture(database: &RuntimeDatabase) -> CatalogSnapshot {
    let connection = database.connection();
    let connection = connection.lock().expect("connection");
    let category_ref = allocate_fixture_ref(&connection, "C");
    let glossary_ref = allocate_fixture_ref(&connection, "G");
    let performer_ref = allocate_fixture_ref(&connection, "P");
    let video_ref = allocate_fixture_ref(&connection, "V");
    let image_ref = allocate_fixture_ref(&connection, "I");
    let credit_ref = allocate_fixture_ref(&connection, "R");
    let timestamp = "2026-08-10T00:00:00Z";

    connection
        .execute(
            "INSERT INTO managedCategories (key, sakuravaRef, name, rPlus, createdAt, updatedAt)
             VALUES ('fixture-category', ?1, 'Fixture Category', 0, ?2, ?2)",
            params![category_ref, timestamp],
        )
        .expect("insert category");
    connection
        .execute(
            "INSERT INTO glossary_entries (id, sakuravaRef, term, definition, rPlus, created_at, updated_at)
             VALUES ('fixture-glossary', ?1, 'Fixture Term', 'Fixture Definition', 0, 1, 1)",
            [glossary_ref.clone()],
        )
        .expect("insert glossary");
    connection
        .execute(
            "INSERT INTO performers (id, sakuravaRef, name, categoriesJson, glossaryRefsJson, rPlus, createdAt, updatedAt)
             VALUES ('fixture-performer', ?1, 'Fixture Performer', '[\"Fixture Category\"]', ?2, 0, ?3, ?3)",
            params![performer_ref, serde_json::json!([glossary_ref]).to_string(), timestamp],
        )
        .expect("insert performer");
    connection
        .execute(
            "INSERT INTO videos (id, sakuravaRef, title, categoriesJson, relatedPerformersJson, glossaryRefsJson, rPlus, createdAt, updatedAt)
             VALUES ('fixture-video', ?1, 'Fixture Video', '[\"Fixture Category\"]', '[\"fixture-performer\"]', ?2, 0, ?3, ?3)",
            params![video_ref, serde_json::json!([glossary_ref]).to_string(), timestamp],
        )
        .expect("insert video");
    connection
        .execute(
            "INSERT INTO images (id, sakuravaRef, title, categoriesJson, relatedPerformersJson, relatedVideosJson, glossaryRefsJson, rPlus, createdAt, updatedAt)
             VALUES ('fixture-image', ?1, 'Fixture Image', '[\"Fixture Category\"]', '[\"fixture-performer\"]', '[\"fixture-video\"]', ?2, 0, ?3, ?3)",
            params![image_ref, serde_json::json!([glossary_ref]).to_string(), timestamp],
        )
        .expect("insert image");
    connection
        .execute(
            "INSERT INTO credits (id, sakuravaRef, workType, workId, performerId, characterName, billingOrder, createdAt, updatedAt)
             VALUES ('fixture-credit', ?1, 'video', 'fixture-video', 'fixture-performer', 'Fixture Role', 1, ?2, ?2)",
            params![credit_ref, timestamp],
        )
        .expect("insert credit");
    drop(connection);
    catalog_snapshot(database)
}

fn clear_exact_snapshot_fixture(database: &RuntimeDatabase) -> CatalogSnapshot {
    let connection = database.connection();
    let connection = connection.lock().expect("connection");
    connection
        .execute_batch(
            "DELETE FROM credits;
             DELETE FROM videos;
             DELETE FROM images;
             DELETE FROM performers;
             DELETE FROM managedCategories;
             DELETE FROM glossary_entries;",
        )
        .expect("clear catalog fixture");
    drop(connection);
    catalog_snapshot(database)
}

fn sha256_file(path: &Path) -> String {
    format!(
        "{:x}",
        Sha256::digest(fs::read(path).expect("package bytes"))
    )
}

fn restore_exact_package(
    database: &RuntimeDatabase,
    package_name: &str,
) -> crate::database::BackupPackageRestoreResult {
    let transition = begin_restore(database, package_name, "2608", protected_state(Some("fr")))
        .expect("begin exact snapshot restore");
    assert_eq!(transition.protected_state, protected_state(Some("ja")));
    let result = complete_restore(
        database,
        &transition.operation_id,
        &transition.expected_state_sha256,
    )
    .expect("complete exact snapshot restore");
    assert!(result.database_restored);
    assert!(!result.rollback_attempted);
    assert!(!result.rollback_succeeded);
    assert!(result.errors.is_empty());
    assert!(!has_unresolved_restore(&database.paths.app_data_dir).expect("restore resolved"));
    result
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
fn populated_backup_restores_exact_snapshot() {
    let root = unique_root("populated-exact-snapshot");
    fs::create_dir_all(&root).expect("root");
    let database = prepare_database(&root).expect("database");
    let backup_state = populate_exact_snapshot_fixture(&database);
    assert_eq!(backup_state.counts, [1, 1, 1, 1, 1, 1]);

    let package = create_backup_package_v2(
        &database,
        BackupPackageType::Manual,
        Some("populated exact snapshot".to_string()),
        protected_state(Some("ja")),
    )
    .expect("populated package");
    let package_path = PathBuf::from(&package.package_path);
    let package_sha256 = sha256_file(&package_path);
    let preview = preview_backup_package_v2_or_legacy(&database, &package.package_name)
        .expect("populated preview");
    assert_eq!(
        preview_counts(&preview.database.counts),
        backup_state.counts
    );
    assert_eq!(preview.database.quick_check, "ok");
    assert!(preview.database.required_schema_present);

    let mutated_state = clear_exact_snapshot_fixture(&database);
    assert_eq!(mutated_state, CatalogSnapshot::empty());
    let result = restore_exact_package(&database, &package.package_name);
    let immediate_state = catalog_snapshot(&database);
    assert_eq!(immediate_state, backup_state);

    println!(
        "scenario=A root={} package={} package_sha256={} package_version={} before={:?} mutated={:?} immediate={:?} restored_package={}",
        root.display(),
        package_path.display(),
        package_sha256,
        package.manifest.version,
        backup_state,
        mutated_state,
        immediate_state,
        result.restored_package_name
    );

    drop(database);
    recover_before_database_open(&root).expect("reopen recovery");
    let reopened = prepare_database(&root).expect("reopened database");
    let reopened_state = catalog_snapshot(&reopened);
    assert_eq!(reopened_state, backup_state);
    println!("scenario=A reopened={reopened_state:?}");
    drop(reopened);
    fs::remove_dir_all(root).expect("fixture cleanup");
}

#[test]
fn empty_backup_removes_later_catalog_state() {
    let root = unique_root("empty-exact-snapshot");
    fs::create_dir_all(&root).expect("root");
    let database = prepare_database(&root).expect("database");
    let backup_state = catalog_snapshot(&database);
    assert_eq!(backup_state, CatalogSnapshot::empty());

    let package = create_backup_package_v2(
        &database,
        BackupPackageType::Manual,
        Some("empty exact snapshot".to_string()),
        protected_state(Some("ja")),
    )
    .expect("empty package");
    let package_path = PathBuf::from(&package.package_path);
    let package_sha256 = sha256_file(&package_path);
    let preview = preview_backup_package_v2_or_legacy(&database, &package.package_name)
        .expect("empty preview");
    assert_eq!(
        preview_counts(&preview.database.counts),
        backup_state.counts
    );
    assert_eq!(preview.database.quick_check, "ok");
    assert!(preview.database.required_schema_present);

    let populated_state = populate_exact_snapshot_fixture(&database);
    assert_eq!(populated_state.counts, [1, 1, 1, 1, 1, 1]);
    let result = restore_exact_package(&database, &package.package_name);
    let immediate_state = catalog_snapshot(&database);
    assert_eq!(immediate_state, backup_state);

    println!(
        "scenario=B root={} package={} package_sha256={} package_version={} before={:?} populated={:?} immediate={:?} restored_package={}",
        root.display(),
        package_path.display(),
        package_sha256,
        package.manifest.version,
        backup_state,
        populated_state,
        immediate_state,
        result.restored_package_name
    );

    drop(database);
    recover_before_database_open(&root).expect("reopen recovery");
    let reopened = prepare_database(&root).expect("reopened database");
    let reopened_state = catalog_snapshot(&reopened);
    assert_eq!(reopened_state, backup_state);
    println!("scenario=B reopened={reopened_state:?}");
    drop(reopened);
    fs::remove_dir_all(root).expect("fixture cleanup");
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
fn logical_database_mismatch_fails_and_remains_rollback_capable() {
    let fixture = fixture("logical-database-mismatch");
    insert_video(&fixture.database, "original", "Original");
    let package = create_backup_package_v2(
        &fixture.database,
        BackupPackageType::Manual,
        Some("logical mismatch target".to_string()),
        protected_state(Some("ja")),
    )
    .expect("target package");
    clear_exact_snapshot_fixture(&fixture.database);
    insert_video(&fixture.database, "current", "Current safety state");
    let transition = begin_restore(
        &fixture.database,
        &package.package_name,
        "2608",
        protected_state(Some("fr")),
    )
    .expect("begin logical mismatch restore");
    assert!(video_exists(&fixture.database, "original"));
    assert!(!video_exists(&fixture.database, "current"));
    {
        let connection = fixture.database.connection();
        let connection = connection.lock().expect("connection");
        assert_eq!(
            connection
                .execute(
                    "UPDATE videos SET title = 'Unexpected post-apply mutation' WHERE id = 'original'",
                    [],
                )
                .expect("change authoritative field"),
            1
        );
    }

    let error = complete_restore(
        &fixture.database,
        &transition.operation_id,
        &transition.expected_state_sha256,
    )
    .expect_err("logical database mismatch must fail");
    assert_eq!(error.code, "post_apply_validation_failed");
    assert!(error.message.contains("database content"));

    let rollback = rollback_after_state_failure(&fixture.database, &transition.operation_id)
        .expect("rollback after logical mismatch");
    assert!(rollback.rollback_succeeded);
    assert!(!video_exists(&fixture.database, "original"));
    assert!(video_exists(&fixture.database, "current"));
    complete_recovery(
        &fixture.database,
        &rollback.transition.operation_id,
        "rollback",
        &rollback.transition.expected_state_sha256,
    )
    .expect("rollback completion");
    assert!(!has_unresolved_restore(&fixture.database.paths.app_data_dir).expect("resolved"));
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
