use rusqlite::{params, Connection};

use super::{
    schema::initialize_schema,
    status::{
        load_managed_media_progress_status, load_managed_media_statistics,
        ManagedMediaProgressStatus, ManagedMediaStatistics,
    },
};

fn connection() -> Connection {
    let connection = Connection::open_in_memory().expect("connection");
    initialize_schema(&connection).expect("schema");
    connection
}

fn insert_source(
    connection: &Connection,
    index: u8,
    owner_id: &str,
    slot_token: &str,
    locator_seed: u8,
    lifecycle_state: &str,
    intent_state: &str,
    target_states: &[&str],
) {
    let item_id = format!("{:064x}", u64::from(index) + 1);
    let locator_hash = format!("{:064x}", u64::from(locator_seed) + 100);
    let current_fingerprint = format!("{:064x}", u64::from(index) + 200);
    let pending_fingerprint = format!("{:064x}", u64::from(index) + 300);
    let (current_revision, desired_revision) = if lifecycle_state == "active" {
        (1_i64, 1_i64)
    } else {
        (0_i64, 1_i64)
    };
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token, source_locator_kind,
               locator_hash, current_source_fingerprint, pending_source_fingerprint,
               source_availability_state, lifecycle_state, created_at, updated_at
             ) VALUES (?1, 'image', ?2, 'gallery_tile', ?3, 'external_directory_entry',
               ?4, ?5, ?6, 'available', ?7, 'now', 'now')",
            params![
                item_id,
                owner_id,
                slot_token,
                locator_hash,
                if lifecycle_state == "active" {
                    Some(current_fingerprint.as_str())
                } else {
                    None
                },
                if lifecycle_state == "pending" {
                    Some(pending_fingerprint.as_str())
                } else {
                    None
                },
                lifecycle_state,
            ],
        )
        .expect("item");
    connection
        .execute(
            "INSERT INTO managed_media_item_generations (
               managed_item_id, current_revision, desired_revision, created_at, updated_at
             ) VALUES (?1, ?2, ?3, 'now', 'now')",
            params![item_id, current_revision, desired_revision],
        )
        .expect("generation");
    let intent_id = format!("intent-{index}");
    connection
        .execute(
            "INSERT INTO managed_media_lifecycle_intents (
               intent_id, managed_item_id, desired_revision, lifecycle_action,
               expected_locator_hash, desired_source_fingerprint, lifecycle_state,
               claim_token, claim_expires_at, attempt_count, cancellation_requested,
               created_at, updated_at, finished_at, retry_eligible_at
             ) VALUES (?1, ?2, 1, 'generate', ?3, ?4, ?5, ?6, ?7, 0, 0,
               'now', 'now', ?8, ?9)",
            params![
                intent_id,
                item_id,
                locator_hash,
                if lifecycle_state == "active" {
                    current_fingerprint.as_str()
                } else {
                    pending_fingerprint.as_str()
                },
                intent_state,
                if intent_state == "claimed" {
                    Some("status-claim")
                } else {
                    None
                },
                if intent_state == "claimed" {
                    Some("4102444800000")
                } else {
                    None
                },
                if intent_state == "completed" {
                    Some("now")
                } else {
                    None
                },
                if intent_state == "retry_wait" {
                    Some("4102444800000")
                } else {
                    None
                },
            ],
        )
        .expect("intent");

    for (target_index, target_state) in target_states.iter().enumerate() {
        let target_id = format!("target-{index}-{target_index}");
        let operation_id = format!("operation-{index}-{target_index}");
        let variant_id = format!(
            "{:064x}",
            u64::from(index) * 100 + target_index as u64 + 1_000
        );
        let tier = match target_index {
            0 => "THUMBNAIL",
            1 => "MEDIUM",
            _ => "LARGE",
        };
        if *target_state == "published" {
            connection
                .execute(
                    "INSERT INTO managed_media_operations (
                       operation_id, scope_kind, scope_payload_json, operation_state,
                       cancellation_requested, total_count, completed_count, succeeded_count,
                       skipped_count, failed_count, journal_state, created_at, updated_at, finished_at
                     ) VALUES (?1, 'media_item', '{}', 'completed', 0, 1, 1, 1, 0, 0,
                       'published', 'now', 'now', 'now')",
                    [&operation_id],
                )
                .expect("operation");
            connection
                .execute(
                    "INSERT INTO managed_media_variants (
                       variant_id, managed_item_id, role_id, family, variant_class,
                       standard_tier, source_fingerprint, profile_version, output_format,
                       format_version, encoder_version, relative_path, width, height,
                       byte_length, checksum, publication_state, validated_at, published_at,
                       created_at, updated_at
                     ) VALUES (?1, ?2, 'image_gallery_tile', 'SQUARE_1_1', 'standard', ?3,
                       ?4, 'managed-media-profile-v1', 'png', 'v1', 'test', ?5, 320, 320,
                       1, ?6, 'published', 'now', 'now', 'now', 'now')",
                    params![
                        variant_id,
                        item_id,
                        tier,
                        if lifecycle_state == "active" {
                            current_fingerprint.as_str()
                        } else {
                            pending_fingerprint.as_str()
                        },
                        format!("status/{index}-{target_index}.png"),
                        format!(
                            "{:064x}",
                            u64::from(index) * 100 + target_index as u64 + 2_000
                        ),
                    ],
                )
                .expect("variant");
        }
        connection
            .execute(
                "INSERT INTO managed_media_lifecycle_targets (
                   target_id, intent_id, managed_item_id, desired_revision, role_id,
                   variant_class, standard_tier, target_state, publication_operation_id,
                   result_variant_id, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, 1, 'image_gallery_tile', 'standard', ?4, ?5,
                   ?6, ?7, 'now', 'now')",
                params![
                    target_id,
                    intent_id,
                    item_id,
                    tier,
                    target_state,
                    if *target_state == "published" {
                        Some(operation_id.as_str())
                    } else {
                        None
                    },
                    if *target_state == "published" {
                        Some(variant_id.as_str())
                    } else {
                        None
                    },
                ],
            )
            .expect("target");
    }
}

#[test]
fn no_current_sources_reports_no_work() {
    let connection = connection();
    assert_eq!(
        load_managed_media_progress_status(&connection).expect("status"),
        ManagedMediaProgressStatus {
            ready: 0,
            total: 0,
            processing: false,
        }
    );
}

#[test]
fn statistics_are_source_level_and_sum_only_published_variant_bytes() {
    let connection = connection();
    insert_source(
        &connection,
        1,
        "image-ready",
        "gallery-ready",
        1,
        "active",
        "completed",
        &["published", "skipped_ineligible", "published"],
    );
    insert_source(
        &connection,
        2,
        "image-pending",
        "gallery-pending",
        2,
        "pending",
        "retry_wait",
        &["pending"],
    );
    connection
        .execute("UPDATE managed_media_variants SET byte_length = 11", [])
        .expect("published sizes");
    connection
        .execute(
            "UPDATE managed_media_variants SET publication_state = 'staged', byte_length = 99
             WHERE variant_id = (SELECT variant_id FROM managed_media_variants LIMIT 1)",
            [],
        )
        .expect("staged size");

    assert_eq!(
        load_managed_media_statistics(&connection).expect("statistics"),
        ManagedMediaStatistics {
            ready_count: 1,
            source_count: 2,
            pending_count: 1,
            published_storage_bytes: 11,
        }
    );
}

#[test]
fn statistics_exclude_superseded_intents_from_pending_sources() {
    let connection = connection();
    insert_source(
        &connection,
        1,
        "image-superseded",
        "gallery-superseded",
        1,
        "pending",
        "queued",
        &["pending"],
    );
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'superseded'
             WHERE intent_id = 'intent-1'",
            [],
        )
        .expect("supersede intent");

    assert_eq!(
        load_managed_media_statistics(&connection)
            .expect("statistics")
            .pending_count,
        0,
    );
}

#[test]
fn source_level_progress_counts_ready_and_processing_once_per_source() {
    let connection = connection();
    insert_source(
        &connection,
        1,
        "image-ready",
        "gallery-ready",
        1,
        "active",
        "completed",
        &["published", "skipped_ineligible", "published"],
    );
    insert_source(
        &connection,
        2,
        "image-pending",
        "gallery-pending",
        2,
        "pending",
        "queued",
        &["pending", "pending", "pending"],
    );

    assert_eq!(
        load_managed_media_progress_status(&connection).expect("status"),
        ManagedMediaProgressStatus {
            ready: 1,
            total: 2,
            processing: true,
        }
    );
}

#[test]
fn catalog_growth_recomputes_the_current_source_total() {
    let connection = connection();
    insert_source(
        &connection,
        1,
        "image-ready",
        "gallery-ready",
        1,
        "active",
        "completed",
        &["published"],
    );
    let before = load_managed_media_progress_status(&connection).expect("before");
    insert_source(
        &connection,
        2,
        "image-new",
        "gallery-new",
        2,
        "pending",
        "claimed",
        &["claimed"],
    );
    let after = load_managed_media_progress_status(&connection).expect("after");

    assert_eq!((before.ready, before.total), (1, 1));
    assert_eq!((after.ready, after.total, after.processing), (1, 2, true));
}

#[test]
fn retired_and_duplicate_history_do_not_inflate_current_progress() {
    let connection = connection();
    insert_source(
        &connection,
        1,
        "image-1",
        "gallery-authoritative",
        9,
        "active",
        "completed",
        &["published"],
    );
    insert_source(
        &connection,
        2,
        "image-1",
        "gallery-duplicate",
        9,
        "pending",
        "queued",
        &["pending"],
    );
    insert_source(
        &connection,
        3,
        "image-retired",
        "gallery-retired",
        3,
        "retired",
        "retired",
        &["superseded"],
    );

    assert_eq!(
        load_managed_media_progress_status(&connection).expect("status"),
        ManagedMediaProgressStatus {
            ready: 1,
            total: 1,
            processing: false,
        }
    );
}
