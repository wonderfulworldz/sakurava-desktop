use std::{
    fs,
    path::{Path, PathBuf},
};

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use super::{
    descriptors::{resolve_descriptor_batch, ManagedMediaDescriptorRequest},
    schema::initialize_schema,
};
use crate::managed_media::path::ManagedMediaRoot;

const ROLE: &str = "video_collection_full_card";

struct DescriptorEnvironment {
    connection: Connection,
    app_data: PathBuf,
    root: ManagedMediaRoot,
    source_path: PathBuf,
    item_id: String,
}

impl Drop for DescriptorEnvironment {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.app_data);
    }
}

fn unique_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "sakurava-descriptor-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ))
}

fn locator_hash(path: &Path) -> String {
    format!("{:x}", Sha256::digest(path.to_string_lossy().as_bytes()))
}

fn request(source_path: &Path, intent: &str) -> ManagedMediaDescriptorRequest {
    ManagedMediaDescriptorRequest {
        request_id: "video-1:primary".to_string(),
        owner_kind: "video".to_string(),
        owner_id: "video-1".to_string(),
        slot_kind: "primary_visual".to_string(),
        slot_token: Some("primary_visual".to_string()),
        source_path: Some(source_path.display().to_string()),
        role_id: ROLE.to_string(),
        intent: intent.to_string(),
        css_width: 160.0,
        css_height: 90.0,
        device_pixel_ratio: 1.0,
    }
}

fn insert_video(connection: &Connection, source_path: &Path) {
    connection
        .execute(
            "CREATE TABLE videos (id TEXT PRIMARY KEY, sakuravaRef TEXT, coverPath TEXT)",
            [],
        )
        .expect("video table");
    connection
        .execute(
            "INSERT INTO videos (id, sakuravaRef, coverPath) VALUES ('video-1', 'V-1', ?1)",
            [source_path.display().to_string()],
        )
        .expect("video");
}

fn environment(name: &str, source_exists: bool, lifecycle_state: &str) -> DescriptorEnvironment {
    let app_data = unique_root(name);
    fs::create_dir_all(&app_data).expect("app data");
    let source_path = app_data.join("source-original.png");
    if source_exists {
        fs::write(&source_path, b"synthetic-original").expect("source");
    }
    let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    insert_video(&connection, &source_path);
    let item_id = format!("{:064x}", 1_u8);
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token, source_locator_kind,
               locator_hash, current_source_fingerprint, pending_source_fingerprint,
               source_availability_state, lifecycle_state, created_at, updated_at
             ) VALUES (?1, 'video', 'video-1', 'primary_visual', 'primary_visual', 'external_file',
               ?2, ?3, NULL, 'available', ?4, 'now', 'now')",
            params![
                item_id,
                locator_hash(&source_path),
                "c".repeat(64),
                lifecycle_state
            ],
        )
        .expect("item");
    connection
        .execute(
            "INSERT INTO managed_media_item_generations (
               managed_item_id, current_revision, desired_revision, created_at, updated_at
             ) VALUES (?1, 1, 1, 'now', 'now')",
            [&item_id],
        )
        .expect("generation");
    connection
        .execute(
            "INSERT INTO managed_media_operations (
               operation_id, scope_kind, scope_payload_json, operation_state, cancellation_requested,
               total_count, completed_count, succeeded_count, skipped_count, failed_count,
               failure_summary, journal_state, created_at, updated_at, finished_at
             ) VALUES ('op-current', 'media_item', '{}', 'completed', 0, 1, 1, 1, 0, 0, NULL,
               'published', 'now', 'now', 'now')",
            [],
        )
        .expect("operation");
    connection
        .execute(
            "INSERT INTO managed_media_lifecycle_intents (
               intent_id, managed_item_id, desired_revision, lifecycle_action, expected_locator_hash,
               desired_source_fingerprint, lifecycle_state, claim_token, claim_expires_at,
               retry_eligible_at, attempt_count, cancellation_requested, superseded_by_intent_id,
               failure_class, failure_summary, created_at, updated_at, finished_at
             ) VALUES ('intent-current', ?1, 1, 'generate', ?2, ?3, 'completed', NULL, NULL, NULL,
               0, 0, NULL, NULL, NULL, 'now', 'now', 'now')",
            params![item_id, locator_hash(&source_path), "c".repeat(64)],
        )
        .expect("intent");
    DescriptorEnvironment {
        connection,
        app_data,
        root,
        source_path,
        item_id,
    }
}

fn add_variant(
    environment: &DescriptorEnvironment,
    index: u8,
    relative_path: &str,
    tier: &str,
    width: u32,
    height: u32,
    current: bool,
    write_file: bool,
) {
    let variant_id = format!("{:064x}", u64::from(index) + 10);
    environment
        .connection
        .execute(
            "INSERT INTO managed_media_variants (
               variant_id, managed_item_id, role_id, family, variant_class, standard_tier,
               source_fingerprint, profile_version, output_format, format_version, encoder_version,
               relative_path, width, height, byte_length, checksum, publication_state,
               validated_at, published_at, created_at, updated_at
             ) VALUES (?1, ?2, ?3, 'LANDSCAPE_16_9', 'standard', ?4, ?5,
               'managed-media-profile-v1', 'png', 'v1', 'test', ?6, ?7, ?8, 1, ?9,
               'published', 'now', 'now', 'now', 'now')",
            params![
                variant_id,
                environment.item_id,
                ROLE,
                tier,
                format!("{:064x}", u64::from(index) + 300),
                relative_path,
                width,
                height,
                format!("{:064x}", u64::from(index) + 100),
            ],
        )
        .expect("variant");
    if current {
        environment
            .connection
            .execute(
                "INSERT INTO managed_media_lifecycle_targets (
                   target_id, intent_id, managed_item_id, desired_revision, role_id, variant_class,
                   standard_tier, target_state, publication_operation_id, result_variant_id,
                   failure_class, failure_summary, created_at, updated_at
                 ) VALUES (?1, 'intent-current', ?2, 1, ?3, 'standard', ?4, 'published',
                   'op-current', ?5, NULL, NULL, 'now', 'now')",
                params![
                    format!("target-{index}"),
                    environment.item_id,
                    ROLE,
                    tier,
                    variant_id
                ],
            )
            .expect("target");
    }
    if write_file {
        let output = environment
            .root
            .resolve(relative_path)
            .expect("managed path");
        fs::create_dir_all(output.parent().expect("managed parent")).expect("managed parent");
        fs::write(output, b"synthetic-managed").expect("managed output");
    }
}

#[test]
fn resolves_an_accessible_original_when_no_managed_item_exists() {
    let app_data = unique_root("original");
    fs::create_dir_all(&app_data).expect("app data");
    let source_path = app_data.join("original.png");
    fs::write(&source_path, b"synthetic-original").expect("source");
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    insert_video(&connection, &source_path);
    let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");

    let descriptor = resolve_descriptor_batch(
        &connection,
        &root,
        vec![request(&source_path, "ordinary_role")],
    )
    .pop()
    .expect("descriptor");

    assert_eq!(descriptor.selected_source_class, "original");
    assert_eq!(descriptor.asset_path.as_deref(), source_path.to_str());
    assert!(descriptor.original_available);
    assert!(!descriptor.managed_available);
    fs::remove_dir_all(app_data).expect("cleanup");
}

#[test]
fn retired_item_never_falls_back_to_original() {
    let environment = environment("retired", true, "retired");
    let descriptor = resolve_descriptor_batch(
        &environment.connection,
        &environment.root,
        vec![request(&environment.source_path, "full_viewer")],
    )
    .pop()
    .expect("descriptor");

    assert!(descriptor.placeholder);
    assert_eq!(descriptor.fallback_reason, "owner_or_slot_retired");
}

#[test]
fn invalid_request_is_isolated_to_its_own_placeholder() {
    let app_data = unique_root("invalid");
    fs::create_dir_all(&app_data).expect("app data");
    let source_path = app_data.join("original.png");
    fs::write(&source_path, b"synthetic-original").expect("source");
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    insert_video(&connection, &source_path);
    let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");
    let mut invalid = request(&source_path, "ordinary_role");
    invalid.request_id = "invalid request".to_string();

    let descriptors = resolve_descriptor_batch(
        &connection,
        &root,
        vec![invalid, request(&source_path, "ordinary_role")],
    );

    assert!(descriptors[0].placeholder);
    assert_eq!(descriptors[0].fallback_reason, "invalid_request_id");
    assert_eq!(descriptors[1].selected_source_class, "original");
    fs::remove_dir_all(app_data).expect("cleanup");
}

#[test]
fn ordinary_rendering_uses_the_smallest_sufficient_current_managed_output() {
    let environment = environment("ordinary", true, "active");
    add_variant(
        &environment,
        1,
        "items/thumbnail.png",
        "THUMBNAIL",
        320,
        180,
        true,
        true,
    );
    add_variant(
        &environment,
        2,
        "items/medium.png",
        "MEDIUM",
        1280,
        720,
        true,
        true,
    );

    let descriptor = resolve_descriptor_batch(
        &environment.connection,
        &environment.root,
        vec![request(&environment.source_path, "ordinary_role")],
    )
    .pop()
    .expect("descriptor");

    assert_eq!(descriptor.selected_source_class, "managed_standard");
    assert_eq!(descriptor.tier.as_deref(), Some("THUMBNAIL"));
    assert!(descriptor.original_available);
    assert!(descriptor.managed_available);
}

#[test]
fn full_viewer_selects_an_accessible_original_before_managed_outputs() {
    let environment = environment("viewer-original", true, "active");
    add_variant(
        &environment,
        1,
        "items/medium.png",
        "MEDIUM",
        1280,
        720,
        true,
        true,
    );

    let descriptor = resolve_descriptor_batch(
        &environment.connection,
        &environment.root,
        vec![request(&environment.source_path, "full_viewer")],
    )
    .pop()
    .expect("descriptor");

    assert_eq!(descriptor.selected_source_class, "original");
    assert_eq!(descriptor.fallback_reason, "full_viewer_original");
    assert!(descriptor.original_available);
    assert!(!descriptor.managed_available);
}

#[test]
fn missing_original_with_stale_available_state_uses_largest_current_managed_output() {
    let environment = environment("missing-original", true, "active");
    add_variant(
        &environment,
        1,
        "items/thumbnail.png",
        "THUMBNAIL",
        320,
        180,
        true,
        true,
    );
    add_variant(
        &environment,
        2,
        "items/medium.png",
        "MEDIUM",
        1280,
        720,
        true,
        true,
    );
    fs::remove_file(&environment.source_path).expect("remove original");

    let descriptor = resolve_descriptor_batch(
        &environment.connection,
        &environment.root,
        vec![request(&environment.source_path, "full_viewer")],
    )
    .pop()
    .expect("descriptor");

    assert_eq!(descriptor.selected_source_class, "managed_standard");
    assert_eq!(descriptor.tier.as_deref(), Some("MEDIUM"));
    assert!(!descriptor.original_available);
    assert!(descriptor.managed_available);
    assert_eq!(descriptor.fallback_reason, "current_managed");
}

#[test]
fn unavailable_current_output_uses_protected_last_valid_output() {
    let environment = environment("last-valid", false, "active");
    add_variant(
        &environment,
        1,
        "items/current-missing.png",
        "MEDIUM",
        1280,
        720,
        true,
        false,
    );
    add_variant(
        &environment,
        2,
        "items/last-valid.png",
        "MEDIUM",
        1280,
        720,
        false,
        true,
    );

    let descriptor = resolve_descriptor_batch(
        &environment.connection,
        &environment.root,
        vec![request(&environment.source_path, "full_viewer")],
    )
    .pop()
    .expect("descriptor");

    assert_eq!(descriptor.selected_source_class, "managed_standard");
    assert!(descriptor.stale_last_valid);
    assert_eq!(descriptor.fallback_reason, "last_valid_managed");
    assert!(!descriptor.original_available);
    assert!(descriptor.managed_available);
}

#[test]
fn unavailable_original_and_managed_outputs_return_a_placeholder() {
    let environment = environment("unavailable", false, "active");
    add_variant(
        &environment,
        1,
        "items/current-missing.png",
        "MEDIUM",
        1280,
        720,
        true,
        false,
    );

    let descriptor = resolve_descriptor_batch(
        &environment.connection,
        &environment.root,
        vec![request(&environment.source_path, "full_viewer")],
    )
    .pop()
    .expect("descriptor");

    assert!(descriptor.placeholder);
    assert_eq!(descriptor.fallback_reason, "no_safe_media_source");
    assert!(!descriptor.original_available);
    assert!(!descriptor.managed_available);
}

#[test]
fn unauthorized_or_escaping_original_path_is_not_selectable() {
    let environment = environment("unauthorized", true, "active");
    let alternate = environment.app_data.join("other.png");
    fs::write(&alternate, b"unrelated-source").expect("alternate source");

    let descriptor = resolve_descriptor_batch(
        &environment.connection,
        &environment.root,
        vec![request(&alternate, "full_viewer")],
    )
    .pop()
    .expect("descriptor");

    assert!(descriptor.placeholder);
    assert!(!descriptor.original_available);
    assert_eq!(descriptor.fallback_reason, "no_safe_media_source");
}
