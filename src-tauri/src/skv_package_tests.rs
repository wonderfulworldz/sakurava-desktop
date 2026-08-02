use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use sha2::{Digest, Sha256};

use crate::{
    database::{
        backup_runtime_database, create_backup_package, prepare_database, BackupPackageType,
    },
    managed_media::path::ManagedMediaRoot,
    skv_package::{
        create_skv_v2_package, extract_skv_v2_to_owned_root, inspect_skv_v2,
        validate_extraction_root, validate_manifest_for_test, validate_package_output_root,
        SkvCompatibilityMetadata, SkvCreateInput, SkvEntryKind, SkvEntryManifest, SkvManifest,
        SkvPackageType, MAX_AGGREGATE_UNCOMPRESSED_BYTES, MAX_ENTRY_BYTES, MAX_ENTRY_COUNT,
        MAX_MANIFEST_BYTES, SKV_V2_DATABASE_ENTRY, SKV_V2_FORMAT, SKV_V2_MANAGED_PREFIX,
        SKV_V2_STATE_ENTRY, SKV_V2_VERSION,
    },
};

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);
const HEADER_BYTES: usize = 56;

struct Fixture {
    root: PathBuf,
    output_root: PathBuf,
    snapshot: PathBuf,
    managed_root: ManagedMediaRoot,
    state: Vec<u8>,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn unique_root(name: &str) -> PathBuf {
    let id = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "sakurava-skv-v2-{name}-{}-{id}",
        std::process::id()
    ))
}

fn hash_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn protected_state() -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "format": "sakurava-protected-state",
        "version": 1,
        "appearance": { "version": 1, "values": {} },
        "automaticBackup": { "version": 1, "values": {} },
        "catalogPreferences": { "version": 1, "values": {} },
        "catalogPagination": { "version": 1, "values": {} },
        "mediaAssetScope": { "version": 1, "values": {} },
        "featureState": { "version": 1, "values": {} },
        "translation": { "version": 1, "values": {} }
    }))
    .expect("state JSON")
}

fn fixture(name: &str, managed: bool) -> Fixture {
    let root = unique_root(name);
    fs::create_dir_all(&root).expect("fixture root");
    let app_data = root.join("disposable-appdata");
    let database = prepare_database(&app_data).expect("disposable database");
    let managed_root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("managed root");
    if managed {
        let bytes = b"deterministic managed mini image";
        let relative = "items/aa/item/source/video-detail/medium.jpg";
        let path = managed_root.resolve(relative).expect("managed path");
        fs::create_dir_all(path.parent().expect("managed parent")).expect("managed parent");
        fs::write(&path, bytes).expect("managed bytes");
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
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
                           'external_file', ?2, ?3, NULL, 'available', 'active',
                           '2026-08-02T00:00:00Z', '2026-08-02T00:00:00Z')",
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
                rusqlite::params![
                    "d".repeat(64),
                    item_id,
                    source_hash,
                    relative,
                    bytes.len() as i64,
                    hash_hex(bytes)
                ],
            )
            .expect("managed variant");
    }
    let output_root = root.join("package-output");
    fs::create_dir_all(&output_root).expect("output root");
    let snapshot = output_root.join("catalog-snapshot.sqlite");
    backup_runtime_database(&database, &snapshot).expect("online database snapshot");
    drop(database);
    Fixture {
        root,
        output_root,
        snapshot,
        managed_root,
        state: protected_state(),
    }
}

fn create_package(fixture: &Fixture, name: &str) -> PathBuf {
    let live_root = fixture.root.join("disposable-appdata");
    let output_root = validate_package_output_root(&fixture.output_root, Some(&live_root))
        .expect("validated output root capability");
    create_skv_v2_package(SkvCreateInput {
        output_root: &output_root,
        output_file_name: name,
        database_snapshot: &fixture.snapshot,
        managed_media_root: &fixture.managed_root,
        protected_state_snapshot: &fixture.state,
        created_at: "2026-08-02T12:34:56Z",
        backup_type: SkvPackageType::Manual,
    })
    .expect("create package")
}

fn base_manifest() -> SkvManifest {
    let empty_hash = hash_hex(&[]);
    SkvManifest {
        format: SKV_V2_FORMAT.to_string(),
        version: SKV_V2_VERSION,
        application_version: "0.0.0".to_string(),
        created_at: "2026-08-02T12:34:56Z".to_string(),
        backup_type: SkvPackageType::Manual,
        compression: "none".to_string(),
        compatibility: SkvCompatibilityMetadata {
            minimum_application_version: "0.0.0".to_string(),
            sqlite_user_version: 0,
            schema_migration_count: 0,
            schema_migrations_sha256: empty_hash.clone(),
        },
        aggregate_uncompressed_size: 0,
        entries: vec![
            SkvEntryManifest {
                path: SKV_V2_DATABASE_ENTRY.to_string(),
                kind: SkvEntryKind::CatalogDatabase,
                uncompressed_size: 0,
                stored_size: 0,
                sha256: empty_hash.clone(),
            },
            SkvEntryManifest {
                path: SKV_V2_STATE_ENTRY.to_string(),
                kind: SkvEntryKind::ProtectedState,
                uncompressed_size: 0,
                stored_size: 0,
                sha256: empty_hash,
            },
        ],
    }
}

fn header_manifest_len(bytes: &[u8]) -> usize {
    u32::from_le_bytes(bytes[20..24].try_into().expect("manifest length")) as usize
}

fn write_container(path: &Path, manifest: &SkvManifest, payload: &[u8]) {
    let manifest_bytes = serde_json::to_vec(manifest).expect("manifest JSON");
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"SAKURAVA-SKV2\0\0\0");
    bytes.extend_from_slice(&SKV_V2_VERSION.to_le_bytes());
    bytes.extend_from_slice(&(manifest_bytes.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&Sha256::digest(&manifest_bytes));
    bytes.extend_from_slice(&manifest_bytes);
    bytes.extend_from_slice(payload);
    fs::write(path, bytes).expect("test container");
}

#[test]
fn writes_inspects_and_extracts_deterministic_v2_with_protected_contents() {
    let fixture = fixture("round-trip", true);
    let first = create_package(&fixture, "first.skv");
    let second = create_package(&fixture, "second.SKV");
    assert_eq!(fs::read(&first).unwrap(), fs::read(&second).unwrap());

    let inspection = inspect_skv_v2(&first).expect("inspect");
    assert_eq!(inspection.manifest.format, SKV_V2_FORMAT);
    assert_eq!(inspection.manifest.version, 2);
    assert_eq!(
        inspection.manifest.application_version,
        env!("CARGO_PKG_VERSION")
    );
    assert_eq!(inspection.manifest.backup_type, SkvPackageType::Manual);
    assert!(inspection.package_size > 0);
    assert!(inspection
        .manifest
        .entries
        .iter()
        .any(|entry| entry.path == SKV_V2_DATABASE_ENTRY));
    assert!(inspection
        .manifest
        .entries
        .iter()
        .any(|entry| entry.path == SKV_V2_STATE_ENTRY));
    assert!(inspection
        .manifest
        .entries
        .iter()
        .any(|entry| entry.path.starts_with(SKV_V2_MANAGED_PREFIX)));
    assert!(!inspection
        .manifest
        .entries
        .iter()
        .any(|entry| { entry.path.contains("external") || entry.path.contains("manual-smoke") }));

    let extraction = fixture.root.join("owned-extraction");
    let extraction_root =
        validate_extraction_root(&extraction, None).expect("validated extraction capability");
    extract_skv_v2_to_owned_root(&first, &extraction_root).expect("extract");
    assert!(extraction.join(SKV_V2_DATABASE_ENTRY).is_file());
    assert!(extraction.join(SKV_V2_STATE_ENTRY).is_file());

    let renamed = fixture
        .output_root
        .join("extension-alone-is-not-validation.bin");
    fs::copy(&first, &renamed).expect("renamed valid package");
    inspect_skv_v2(&renamed).expect("identity validates without extension trust");
}

#[test]
fn rejects_unsupported_single_file_versions_and_invalid_identity() {
    let fixture = fixture("versions", false);
    let package = create_package(&fixture, "versions.skv");
    let original = fs::read(&package).expect("package bytes");
    for version in [1_u32, 3_u32] {
        let mut bytes = original.clone();
        bytes[16..20].copy_from_slice(&version.to_le_bytes());
        let candidate = fixture.output_root.join(format!("version-{version}.skv"));
        fs::write(&candidate, bytes).expect("version fixture");
        assert_eq!(
            inspect_skv_v2(&candidate)
                .expect_err("version rejection")
                .code,
            "unsupported_version"
        );
    }
    let mut bytes = original;
    bytes[0] = b'X';
    let invalid = fixture.output_root.join("invalid-identity.skv");
    fs::write(&invalid, bytes).expect("identity fixture");
    assert_eq!(
        inspect_skv_v2(&invalid)
            .expect_err("identity rejection")
            .code,
        "unsupported_format"
    );
}

#[test]
fn rejects_truncation_bad_hash_and_incorrect_container_size() {
    let fixture = fixture("integrity", false);
    let package = create_package(&fixture, "integrity.skv");
    let original = fs::read(&package).expect("package bytes");

    let truncated = fixture.output_root.join("truncated.skv");
    fs::write(&truncated, &original[..original.len() - 1]).expect("truncated fixture");
    assert_eq!(
        inspect_skv_v2(&truncated)
            .expect_err("truncation rejection")
            .code,
        "container_size_mismatch"
    );

    let mut corrupt = original.clone();
    *corrupt.last_mut().expect("payload") ^= 0xff;
    let corrupt_path = fixture.output_root.join("bad-hash.skv");
    fs::write(&corrupt_path, corrupt).expect("corrupt fixture");
    assert_eq!(
        inspect_skv_v2(&corrupt_path)
            .expect_err("hash rejection")
            .code,
        "entry_hash_mismatch"
    );

    let mut trailing = original;
    trailing.push(0);
    let trailing_path = fixture.output_root.join("trailing.skv");
    fs::write(&trailing_path, trailing).expect("trailing fixture");
    assert_eq!(
        inspect_skv_v2(&trailing_path)
            .expect_err("trailing rejection")
            .code,
        "container_size_mismatch"
    );
}

#[test]
fn rejects_malformed_missing_and_oversized_manifests() {
    let fixture = fixture("manifest", false);
    let malformed = fixture.output_root.join("malformed.skv");
    let bytes = b"{broken";
    let mut container = Vec::new();
    container.extend_from_slice(b"SAKURAVA-SKV2\0\0\0");
    container.extend_from_slice(&SKV_V2_VERSION.to_le_bytes());
    container.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    container.extend_from_slice(&Sha256::digest(bytes));
    container.extend_from_slice(bytes);
    fs::write(&malformed, container).expect("malformed manifest");
    assert_eq!(
        inspect_skv_v2(&malformed)
            .expect_err("manifest rejection")
            .code,
        "malformed_manifest"
    );

    let package = create_package(&fixture, "base.skv");
    let mut missing = fs::read(&package).expect("base bytes");
    missing[20..24].copy_from_slice(&0_u32.to_le_bytes());
    let missing_path = fixture.output_root.join("missing-manifest.skv");
    fs::write(&missing_path, missing).expect("missing manifest");
    assert_eq!(
        inspect_skv_v2(&missing_path)
            .expect_err("missing manifest rejection")
            .code,
        "manifest_too_large"
    );

    let mut oversized = fs::read(&package).expect("base bytes");
    oversized[20..24].copy_from_slice(&((MAX_MANIFEST_BYTES + 1) as u32).to_le_bytes());
    let oversized_path = fixture.output_root.join("oversized-manifest.skv");
    fs::write(&oversized_path, oversized).expect("oversized manifest");
    assert_eq!(
        inspect_skv_v2(&oversized_path)
            .expect_err("oversized manifest rejection")
            .code,
        "manifest_too_large"
    );
}

#[test]
fn manifest_contract_rejects_paths_duplicates_unknown_entries_and_limits() {
    let mut cases = Vec::new();
    for path in [
        "/catalog/sakurava.sqlite",
        "catalog/../sakurava.sqlite",
        "catalog\\sakurava.sqlite",
        "C:/catalog/sakurava.sqlite",
        "catalog//sakurava.sqlite",
        "Catalog/sakurava.sqlite",
    ] {
        let mut manifest = base_manifest();
        manifest.entries[0].path = path.to_string();
        cases.push(manifest);
    }
    let mut duplicate = base_manifest();
    duplicate.entries[1] = duplicate.entries[0].clone();
    cases.push(duplicate);
    let mut executable = base_manifest();
    executable.entries.insert(
        1,
        SkvEntryManifest {
            path: "managed-media/v1/items/unsafe.exe".to_string(),
            kind: SkvEntryKind::ManagedMedia,
            uncompressed_size: 0,
            stored_size: 0,
            sha256: hash_hex(&[]),
        },
    );
    cases.push(executable);
    for manifest in cases {
        assert!(validate_manifest_for_test(&manifest).is_err());
    }

    let mut compressed = base_manifest();
    compressed.entries[0].uncompressed_size = 2;
    compressed.entries[0].stored_size = 1;
    compressed.aggregate_uncompressed_size = 2;
    assert_eq!(
        validate_manifest_for_test(&compressed)
            .expect_err("compression rejection")
            .code,
        "compression_not_allowed"
    );

    let mut oversized = base_manifest();
    oversized.entries[0].uncompressed_size = MAX_ENTRY_BYTES + 1;
    oversized.entries[0].stored_size = MAX_ENTRY_BYTES + 1;
    oversized.aggregate_uncompressed_size = MAX_ENTRY_BYTES + 1;
    assert_eq!(
        validate_manifest_for_test(&oversized)
            .expect_err("entry limit")
            .code,
        "entry_too_large"
    );

    let mut aggregate = base_manifest();
    aggregate.entries[0].uncompressed_size = MAX_ENTRY_BYTES;
    aggregate.entries[0].stored_size = MAX_ENTRY_BYTES;
    aggregate.entries[1].uncompressed_size = MAX_AGGREGATE_UNCOMPRESSED_BYTES;
    aggregate.entries[1].stored_size = MAX_AGGREGATE_UNCOMPRESSED_BYTES;
    aggregate.aggregate_uncompressed_size = u64::MAX;
    assert!(validate_manifest_for_test(&aggregate).is_err());

    let mut excessive = base_manifest();
    excessive.entries = vec![excessive.entries[0].clone(); MAX_ENTRY_COUNT + 1];
    assert_eq!(
        validate_manifest_for_test(&excessive)
            .expect_err("entry count")
            .code,
        "entry_count_exceeded"
    );
}

#[test]
fn rejects_invalid_state_and_managed_file_changes_before_publication() {
    let mut fixture = fixture("source-change", true);
    let output_root = validate_package_output_root(&fixture.output_root, None)
        .expect("validated output root capability");
    fixture.state = br#"{"format":"wrong","version":1}"#.to_vec();
    let error = create_skv_v2_package(SkvCreateInput {
        output_root: &output_root,
        output_file_name: "invalid-state.skv",
        database_snapshot: &fixture.snapshot,
        managed_media_root: &fixture.managed_root,
        protected_state_snapshot: &fixture.state,
        created_at: "2026-08-02T12:34:56Z",
        backup_type: SkvPackageType::Manual,
    })
    .expect_err("state rejection");
    assert_eq!(error.code, "invalid_state_snapshot");

    fixture.state = protected_state();
    let managed_path = fixture
        .managed_root
        .resolve("items/aa/item/source/video-detail/medium.jpg")
        .expect("managed path");
    fs::write(&managed_path, b"changed managed bytes").expect("change managed source");
    let error = create_skv_v2_package(SkvCreateInput {
        output_root: &output_root,
        output_file_name: "changed-managed.skv",
        database_snapshot: &fixture.snapshot,
        managed_media_root: &fixture.managed_root,
        protected_state_snapshot: &fixture.state,
        created_at: "2026-08-02T12:34:56Z",
        backup_type: SkvPackageType::Manual,
    })
    .expect_err("managed mismatch");
    assert_eq!(error.code, "managed_media_mismatch");
    assert!(!fixture.output_root.join("changed-managed.skv").exists());
}

#[test]
fn extraction_rejects_semantically_corrupt_database_and_partial_managed_set() {
    let fixture = fixture("semantic", true);
    let package = create_package(&fixture, "semantic.skv");
    let bytes = fs::read(&package).expect("package bytes");
    let manifest_len = header_manifest_len(&bytes);
    let manifest: SkvManifest =
        serde_json::from_slice(&bytes[HEADER_BYTES..HEADER_BYTES + manifest_len]).unwrap();
    let payload = &bytes[HEADER_BYTES + manifest_len..];

    let database_index = manifest
        .entries
        .iter()
        .position(|entry| entry.path == SKV_V2_DATABASE_ENTRY)
        .unwrap();
    let database_offset: usize = manifest.entries[..database_index]
        .iter()
        .map(|entry| entry.stored_size as usize)
        .sum();
    let mut corrupt_manifest = manifest.clone();
    let corrupt_database = b"not a sqlite database".to_vec();
    corrupt_manifest.entries[database_index].uncompressed_size = corrupt_database.len() as u64;
    corrupt_manifest.entries[database_index].stored_size = corrupt_database.len() as u64;
    corrupt_manifest.entries[database_index].sha256 = hash_hex(&corrupt_database);
    let mut corrupt_payload = payload.to_vec();
    let old_len = manifest.entries[database_index].stored_size as usize;
    corrupt_payload.splice(
        database_offset..database_offset + old_len,
        corrupt_database.clone(),
    );
    corrupt_manifest.aggregate_uncompressed_size = corrupt_manifest
        .entries
        .iter()
        .map(|entry| entry.uncompressed_size)
        .sum();
    let corrupt_path = fixture.output_root.join("semantic-corrupt.skv");
    write_container(&corrupt_path, &corrupt_manifest, &corrupt_payload);
    let corrupt_extraction = fixture.root.join("corrupt-extraction");
    let corrupt_root = validate_extraction_root(&corrupt_extraction, None)
        .expect("validated corrupt extraction capability");
    let error = extract_skv_v2_to_owned_root(&corrupt_path, &corrupt_root)
        .expect_err("corrupt database rejection");
    assert!(matches!(
        error.code,
        "database_open_failed" | "database_check_failed"
    ));

    let managed_index = manifest
        .entries
        .iter()
        .position(|entry| entry.kind == SkvEntryKind::ManagedMedia)
        .unwrap();
    let managed_offset: usize = manifest.entries[..managed_index]
        .iter()
        .map(|entry| entry.stored_size as usize)
        .sum();
    let managed_len = manifest.entries[managed_index].stored_size as usize;
    let mut partial_manifest = manifest.clone();
    partial_manifest.entries.remove(managed_index);
    partial_manifest.aggregate_uncompressed_size = partial_manifest
        .entries
        .iter()
        .map(|entry| entry.uncompressed_size)
        .sum();
    let mut partial_payload = payload.to_vec();
    partial_payload.drain(managed_offset..managed_offset + managed_len);
    let partial_path = fixture.output_root.join("partial-managed.skv");
    write_container(&partial_path, &partial_manifest, &partial_payload);
    let partial_extraction = fixture.root.join("partial-extraction");
    let partial_root = validate_extraction_root(&partial_extraction, None)
        .expect("validated partial extraction capability");
    assert_eq!(
        extract_skv_v2_to_owned_root(&partial_path, &partial_root)
            .expect_err("partial managed set rejection")
            .code,
        "managed_media_set_mismatch"
    );
}

#[cfg(windows)]
fn verbatim_path(path: &Path) -> PathBuf {
    PathBuf::from(format!(r"\\?\{}", path.display()))
}

#[test]
fn validated_root_capability_enforces_collision_matrix_and_accepts_siblings() {
    let fixture = fixture("root-capability", false);
    let output = &fixture.output_root;

    assert_eq!(
        validate_package_output_root(output, Some(output))
            .expect_err("ordinary equality rejection")
            .code,
        "live_root_collision"
    );

    #[cfg(windows)]
    {
        let verbatim_output = verbatim_path(output);
        assert_eq!(
            validate_package_output_root(output, Some(&verbatim_output))
                .expect_err("ordinary candidate versus verbatim live root")
                .code,
            "live_root_collision"
        );
        assert_eq!(
            validate_package_output_root(&verbatim_output, Some(output))
                .expect_err("verbatim candidate versus ordinary live root")
                .code,
            "live_root_collision"
        );
        let trailing = PathBuf::from(format!("{}\\", output.display()));
        assert_eq!(
            validate_package_output_root(&trailing, Some(output))
                .expect_err("trailing separator equality")
                .code,
            "live_root_collision"
        );
        let alternate_separators = PathBuf::from(output.to_string_lossy().replace('\\', "/"));
        assert_eq!(
            validate_package_output_root(&alternate_separators, Some(output))
                .expect_err("separator representation equality")
                .code,
            "live_root_collision"
        );
    }

    assert_eq!(
        validate_package_output_root(output, Some(&fixture.root))
            .expect_err("candidate child of live root")
            .code,
        "live_root_collision"
    );
    assert_eq!(
        validate_package_output_root(&fixture.root, Some(output))
            .expect_err("candidate ancestor of live root")
            .code,
        "live_root_collision"
    );

    let prefix_root = fixture.root.join("prefixes");
    let live = prefix_root.join("App");
    let sibling = prefix_root.join("Application");
    fs::create_dir_all(&live).expect("live prefix fixture");
    fs::create_dir_all(&sibling).expect("sibling prefix fixture");
    validate_package_output_root(&sibling, Some(&live)).expect("unrelated sibling accepted");

    let live_app_data = fixture.root.join("disposable-appdata");
    validate_package_output_root(output, Some(&live_app_data))
        .expect("safe unrelated output root accepted");
    let unsafe_extraction = fixture.root.join("unsafe-extraction");
    assert_eq!(
        validate_extraction_root(&unsafe_extraction, Some(&fixture.root))
            .expect_err("new extraction child of live root")
            .code,
        "live_root_collision"
    );
}

#[test]
fn root_and_managed_file_links_are_rejected_when_measurable() {
    let fixture = fixture("root-safety", true);
    let linked_root = fixture.root.join("linked-output-root");
    #[cfg(windows)]
    let root_linked = std::os::windows::fs::symlink_dir(&fixture.output_root, &linked_root);
    #[cfg(unix)]
    let root_linked = std::os::unix::fs::symlink(&fixture.output_root, &linked_root);
    if root_linked.is_ok() {
        assert!(matches!(
            validate_package_output_root(&linked_root, None)
                .expect_err("root link rejection")
                .code,
            "reparse_path_rejected" | "owned_root_invalid"
        ));
    }

    let source = fixture
        .managed_root
        .resolve("items/aa/item/source/video-detail/medium.jpg")
        .unwrap();
    let target = fixture.root.join("outside-managed.jpg");
    fs::write(&target, b"deterministic managed mini image").unwrap();
    fs::remove_file(&source).unwrap();
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(&target, &source);
    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(&target, &source);
    if linked.is_err() {
        return;
    }
    let output_root = validate_package_output_root(&fixture.output_root, None)
        .expect("validated output root capability");
    let error = create_skv_v2_package(SkvCreateInput {
        output_root: &output_root,
        output_file_name: "linked.skv",
        database_snapshot: &fixture.snapshot,
        managed_media_root: &fixture.managed_root,
        protected_state_snapshot: &fixture.state,
        created_at: "2026-08-02T12:34:56Z",
        backup_type: SkvPackageType::Manual,
    })
    .expect_err("link rejection");
    assert!(matches!(
        error.code,
        "managed_path_invalid" | "unsafe_file_type"
    ));
}

#[test]
fn legacy_directory_v1_remains_independent_read_only_input() {
    let root = unique_root("legacy-v1");
    let app_data = root.join("disposable-appdata");
    let database = prepare_database(&app_data).expect("legacy database");
    let package =
        create_backup_package(&database, BackupPackageType::Manual, None).expect("legacy package");
    let package_path = PathBuf::from(&package.package_path);
    let manifest_path = package_path.join("manifest.json");
    let database_path = package_path.join("sakurava.sqlite");
    let manifest_before = fs::read(&manifest_path).expect("legacy manifest");
    let database_before = hash_hex(&fs::read(&database_path).expect("legacy database"));
    let manifest: serde_json::Value = serde_json::from_slice(&manifest_before).unwrap();
    assert_eq!(manifest["format"], "sakurava-backup-directory");
    assert_eq!(manifest["version"], 1);
    assert_eq!(
        inspect_skv_v2(&package_path)
            .expect_err("directory is not v2")
            .code,
        "unsafe_file_type"
    );
    assert_eq!(fs::read(&manifest_path).unwrap(), manifest_before);
    assert_eq!(
        hash_hex(&fs::read(&database_path).unwrap()),
        database_before
    );
    drop(database);
    let _ = fs::remove_dir_all(root);
}
