use std::{fs, path::PathBuf};

use rusqlite::Connection;
use sha2::Digest;

use super::{
    descriptors::{resolve_descriptor_batch, ManagedMediaDescriptorRequest},
    schema::initialize_schema,
};
use crate::managed_media::path::ManagedMediaRoot;

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

fn request() -> ManagedMediaDescriptorRequest {
    ManagedMediaDescriptorRequest {
        request_id: "video-1:primary".to_string(),
        owner_kind: "video".to_string(),
        owner_id: "video-1".to_string(),
        slot_kind: "primary_visual".to_string(),
        slot_token: Some("primary_visual".to_string()),
        source_path: Some("C:/media/original.jpg".to_string()),
        role_id: "video_collection_full_card".to_string(),
        intent: "ordinary_role".to_string(),
        css_width: 160.0,
        css_height: 90.0,
        device_pixel_ratio: 1.0,
    }
}

fn insert_video(connection: &Connection) {
    connection
        .execute(
            "CREATE TABLE videos (id TEXT PRIMARY KEY, sakuravaRef TEXT, coverPath TEXT)",
            [],
        )
        .expect("video table");
    connection
        .execute(
            "INSERT INTO videos (id, sakuravaRef, coverPath)
             VALUES ('video-1', 'V-1', 'C:/media/original.jpg')",
            [],
        )
        .expect("video");
}

#[test]
fn resolves_original_when_no_managed_item_exists() {
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    insert_video(&connection);
    let app_data = unique_root("original");
    fs::create_dir_all(&app_data).expect("app data");
    let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");

    let descriptor = resolve_descriptor_batch(&connection, &root, vec![request()])
        .pop()
        .expect("descriptor");

    assert_eq!(descriptor.selected_source_class, "original");
    assert_eq!(
        descriptor.asset_path.as_deref(),
        Some("C:/media/original.jpg")
    );
    fs::remove_dir_all(app_data).expect("cleanup");
}

#[test]
fn retired_item_never_falls_back_to_original() {
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    insert_video(&connection);
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token, source_locator_kind, locator_hash,
               current_source_fingerprint, pending_source_fingerprint, source_availability_state, lifecycle_state,
               created_at, updated_at
             ) VALUES (?1, 'video', 'video-1', 'primary_visual', 'primary_visual', 'external_file', ?2,
               NULL, NULL, 'available', 'retired', 'now', 'now')",
            ["a".repeat(64), format!("{:x}", sha2::Sha256::digest(b"C:/media/original.jpg"))],
        )
        .expect("item");
    let app_data = unique_root("retired");
    fs::create_dir_all(&app_data).expect("app data");
    let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");

    let descriptor = resolve_descriptor_batch(&connection, &root, vec![request()])
        .pop()
        .expect("descriptor");

    assert!(descriptor.placeholder);
    assert_eq!(descriptor.fallback_reason, "owner_or_slot_retired");
    fs::remove_dir_all(app_data).expect("cleanup");
}

#[test]
fn invalid_request_is_isolated_to_its_own_placeholder() {
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    insert_video(&connection);
    let app_data = unique_root("invalid");
    fs::create_dir_all(&app_data).expect("app data");
    let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");
    let mut invalid = request();
    invalid.request_id = "invalid request".to_string();

    let descriptors = resolve_descriptor_batch(&connection, &root, vec![invalid, request()]);

    assert!(descriptors[0].placeholder);
    assert_eq!(descriptors[0].fallback_reason, "invalid_request_id");
    assert_eq!(descriptors[1].selected_source_class, "original");
    fs::remove_dir_all(app_data).expect("cleanup");
}

#[test]
fn selects_a_current_managed_standard_output_before_the_original() {
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    insert_video(&connection);
    let item_id = "a".repeat(64);
    let variant_id = "b".repeat(64);
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token, source_locator_kind, locator_hash,
               current_source_fingerprint, pending_source_fingerprint, source_availability_state, lifecycle_state,
               created_at, updated_at
             ) VALUES (?1, 'video', 'video-1', 'primary_visual', 'primary_visual', 'external_file', ?2,
               ?3, NULL, 'available', 'active', 'now', 'now')",
            [
                &item_id,
                &format!("{:x}", sha2::Sha256::digest(b"C:/media/original.jpg")),
                &"c".repeat(64),
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
            "INSERT INTO managed_media_variants (
               variant_id, managed_item_id, role_id, family, variant_class, standard_tier,
               source_fingerprint, profile_version, output_format, format_version, encoder_version,
               relative_path, width, height, byte_length, checksum, publication_state,
               validated_at, published_at, created_at, updated_at
             ) VALUES (?1, ?2, 'video_collection_full_card', 'LANDSCAPE_16_9', 'standard', 'THUMBNAIL',
               ?3, 'managed-media-profile-v1', 'jpg', 'v1', 'test', 'items/current.jpg', 320, 180, 1,
               ?4, 'published', 'now', 'now', 'now', 'now')",
            [&variant_id, &item_id, &"c".repeat(64), &"d".repeat(64)],
        )
        .expect("variant");
    connection
        .execute(
            "INSERT INTO managed_media_lifecycle_intents (
               intent_id, managed_item_id, desired_revision, lifecycle_action, expected_locator_hash,
               desired_source_fingerprint, lifecycle_state, claim_token, claim_expires_at, retry_eligible_at,
               attempt_count, cancellation_requested, superseded_by_intent_id, failure_class, failure_summary,
               created_at, updated_at, finished_at
             ) VALUES ('intent_current', ?1, 1, 'generate', ?2, ?3, 'completed', NULL, NULL, NULL,
               0, 0, NULL, NULL, NULL, 'now', 'now', 'now')",
            [
                &item_id,
                &format!("{:x}", sha2::Sha256::digest(b"C:/media/original.jpg")),
                &"c".repeat(64),
            ],
        )
        .expect("intent");
    connection
        .execute(
            "INSERT INTO managed_media_operations (
               operation_id, scope_kind, scope_payload_json, operation_state, cancellation_requested,
               total_count, completed_count, succeeded_count, skipped_count, failed_count, failure_summary,
               journal_state, created_at, updated_at, finished_at
             ) VALUES ('op_current', 'media_item', '{}', 'completed', 0, 1, 1, 1, 0, 0, NULL,
               'published', 'now', 'now', 'now')",
            [],
        )
        .expect("operation");
    connection
        .execute(
            "INSERT INTO managed_media_lifecycle_targets (
               target_id, intent_id, managed_item_id, desired_revision, role_id, variant_class, standard_tier,
               target_state, publication_operation_id, result_variant_id, failure_class, failure_summary,
               created_at, updated_at
             ) VALUES ('target_current', 'intent_current', ?1, 1, 'video_collection_full_card', 'standard',
               'THUMBNAIL', 'published', 'op_current', ?2, NULL, NULL, 'now', 'now')",
            [&item_id, &variant_id],
        )
        .expect("target");
    let app_data = unique_root("current");
    let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");
    let output = root.resolve("items/current.jpg").expect("output path");
    fs::create_dir_all(output.parent().expect("parent")).expect("output parent");
    fs::write(&output, [1_u8]).expect("output");

    let descriptor = resolve_descriptor_batch(&connection, &root, vec![request()])
        .pop()
        .expect("descriptor");

    assert_eq!(descriptor.selected_source_class, "managed_standard");
    assert_eq!(descriptor.tier.as_deref(), Some("THUMBNAIL"));
    assert!(descriptor.asset_path.as_deref().is_some_and(|path| path
        .ends_with("items\\current.jpg")
        || path.ends_with("items/current.jpg")));
    fs::remove_dir_all(app_data).expect("cleanup");
}
