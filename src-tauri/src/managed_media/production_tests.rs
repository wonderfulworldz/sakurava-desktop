use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder, Rgba, RgbaImage};
use rusqlite::params;

use crate::database::{prepare_database, RuntimeDatabase};

use super::{
    acquisition::{FailureDisposition, OrchestrationFailure},
    catalog_lifecycle::{reconcile_owner_mutation, OwnerSources},
    descriptors::{resolve_descriptor_batch, ManagedMediaDescriptorRequest},
    path::ManagedMediaRoot,
    production::{
        classify_production_failure, production_runtime_policy, ProductionManagedMediaRuntime,
        BOUNDED_CONTINUATION_MILLIS, CLAIM_CAPACITY, CLAIM_LEASE_MILLIS, CLAIM_RENEWAL_MILLIS,
        DISCOVERY_LIMIT, MAXIMUM_SOURCE_BYTES, PANIC_DISABLE_THRESHOLD, PUBLICATION_RECOVERY_LIMIT,
        READ_CHUNK_BYTES, SAFETY_RECHECK_MILLIS, SHUTDOWN_DEADLINE_MILLIS, WAKE_CAPACITY,
        WORKER_CAPACITY,
    },
    runtime::SupervisorStatus,
};

struct ProductionTestRoot(PathBuf);

impl ProductionTestRoot {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "sakurava-production-runtime-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("temporary root");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for ProductionTestRoot {
    fn drop(&mut self) {
        if self.0.exists() {
            fs::remove_dir_all(&self.0).expect("remove exact production test root");
        }
    }
}

fn synthetic_png(path: &Path) {
    let image = RgbaImage::from_fn(640, 640, |x, y| {
        Rgba([(x % 251) as u8, (y % 241) as u8, 0x61, 255])
    });
    let mut bytes = Vec::new();
    PngEncoder::new(&mut bytes)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .expect("encode source");
    fs::write(path, bytes).expect("write source");
}

fn prepare_image_owner_at(
    database: &RuntimeDatabase,
    owner_id: &str,
    source_path: &str,
    now: &str,
) {
    let shared = database.connection();
    let connection = shared.lock().expect("database lock");
    let transaction = connection.unchecked_transaction().expect("transaction");
    transaction
        .execute(
            "INSERT INTO images (id, title, coverPath, createdAt, updatedAt)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![
                owner_id,
                "Managed Pipeline Fixture",
                source_path,
                now
            ],
        )
        .expect("image owner");
    let owner = OwnerSources::image(owner_id, source_path, "[]");
    let mut token_sequence = 0_u64;
    reconcile_owner_mutation(
        &transaction,
        None,
        Some(&owner),
        &mut || {
            token_sequence += 1;
            Ok(format!("production-slot-{token_sequence}"))
        },
        now,
    )
    .expect("queue lifecycle work");
    transaction.commit().expect("commit owner and lifecycle");
}

fn prepare_image_owner(database: &RuntimeDatabase, owner_id: &str, source_path: &str) {
    prepare_image_owner_at(database, owner_id, source_path, "1753747200000");
}

fn retire_image_owner(database: &RuntimeDatabase, owner_id: &str, source_path: &str, now: &str) {
    let shared = database.connection();
    let connection = shared.lock().expect("database lock");
    let transaction = connection.unchecked_transaction().expect("transaction");
    let previous = OwnerSources::image(owner_id, source_path, "[]");
    reconcile_owner_mutation(
        &transaction,
        Some(&previous),
        None,
        &mut || Ok("unused-retirement-token".to_string()),
        now,
    )
    .expect("queue owner retirement");
    transaction.commit().expect("commit owner retirement");
}

fn intent_state(database: &RuntimeDatabase) -> (String, u64, Option<u64>) {
    let shared = database.connection();
    let connection = shared.lock().expect("database lock");
    connection
        .query_row(
            "SELECT lifecycle_state, attempt_count, retry_eligible_at
             FROM managed_media_lifecycle_intents
             ORDER BY created_at, intent_id LIMIT 1",
            [],
            |row| {
                let retry = row
                    .get::<_, Option<String>>(2)?
                    .and_then(|value| value.parse::<u64>().ok());
                Ok((row.get(0)?, row.get::<_, i64>(1)? as u64, retry))
            },
        )
        .expect("intent state")
}

fn wait_for_intent(
    database: &RuntimeDatabase,
    runtime: &ProductionManagedMediaRuntime,
    expected: &str,
    timeout: Duration,
) -> (String, u64, Option<u64>) {
    let deadline = Instant::now() + timeout;
    loop {
        let state = intent_state(database);
        if state.0 == expected {
            return state;
        }
        let snapshot = runtime.snapshot();
        assert_ne!(
            snapshot.status,
            SupervisorStatus::Disabled,
            "runtime disabled: {:?}",
            snapshot.last_error
        );
        assert!(Instant::now() < deadline, "intent remained in {}", state.0);
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn intent_state_for_owner_action(
    database: &RuntimeDatabase,
    owner_id: &str,
    action: &str,
) -> (String, u64, Option<u64>, Option<String>) {
    let shared = database.connection();
    let connection = shared.lock().expect("database lock");
    connection
        .query_row(
            "SELECT intent.lifecycle_state, intent.attempt_count, intent.retry_eligible_at,
                    intent.failure_summary
             FROM managed_media_lifecycle_intents intent
             JOIN managed_media_items item ON item.item_id = intent.managed_item_id
             WHERE item.owner_kind = 'image' AND item.owner_id = ?1
               AND intent.lifecycle_action = ?2
             ORDER BY CAST(intent.created_at AS INTEGER) DESC, intent.intent_id DESC LIMIT 1",
            params![owner_id, action],
            |row| {
                let retry = row
                    .get::<_, Option<String>>(2)?
                    .and_then(|value| value.parse::<u64>().ok());
                Ok((
                    row.get(0)?,
                    row.get::<_, i64>(1)? as u64,
                    retry,
                    row.get(3)?,
                ))
            },
        )
        .expect("owner intent state")
}

fn wait_for_owner_intent(
    database: &RuntimeDatabase,
    runtime: &ProductionManagedMediaRuntime,
    owner_id: &str,
    action: &str,
    expected: &str,
    timeout: Duration,
) -> (String, u64, Option<u64>, Option<String>) {
    let deadline = Instant::now() + timeout;
    loop {
        let state = intent_state_for_owner_action(database, owner_id, action);
        if state.0 == expected {
            return state;
        }
        assert!(
            !matches!(
                state.0.as_str(),
                "failed" | "cancelled" | "superseded" | "recovery_required"
            ),
            "{owner_id} {action} reached unexpected {}: {:?}",
            state.0,
            state.3
        );
        let snapshot = runtime.snapshot();
        assert_ne!(
            snapshot.status,
            SupervisorStatus::Disabled,
            "runtime disabled: {:?}",
            snapshot.last_error
        );
        assert!(
            Instant::now() < deadline,
            "{owner_id} {action} remained in {}: {:?}",
            state.0,
            state.3
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn descriptor_request(owner_id: &str, source_path: &str) -> ManagedMediaDescriptorRequest {
    ManagedMediaDescriptorRequest {
        request_id: format!("{owner_id}:primary"),
        owner_kind: "image".to_string(),
        owner_id: owner_id.to_string(),
        slot_kind: "primary_visual".to_string(),
        slot_token: Some("primary_visual".to_string()),
        source_path: Some(source_path.to_string()),
        role_id: "image_collection_full_card".to_string(),
        intent: "ordinary_role".to_string(),
        css_width: 160.0,
        css_height: 160.0,
        device_pixel_ratio: 1.0,
    }
}

#[test]
fn production_policy_matches_the_operator_approved_candidate_a_exactly() {
    let policy = production_runtime_policy().expect("production policy");
    assert_eq!(policy.executor().discovery_limit(), DISCOVERY_LIMIT);
    assert_eq!(policy.executor().claim_lease_millis(), CLAIM_LEASE_MILLIS);
    assert_eq!(
        policy.executor().claim_renewal_millis(),
        CLAIM_RENEWAL_MILLIS
    );
    assert_eq!(policy.executor().claim_capacity(), CLAIM_CAPACITY);
    assert_eq!(policy.worker_capacity(), WORKER_CAPACITY);
    assert_eq!(
        policy.publication_recovery_limit(),
        PUBLICATION_RECOVERY_LIMIT
    );
    assert_eq!(policy.wake_capacity(), WAKE_CAPACITY);
    assert_eq!(policy.safety_recheck_millis(), SAFETY_RECHECK_MILLIS);
    assert_eq!(
        policy.bounded_continuation_millis(),
        BOUNDED_CONTINUATION_MILLIS
    );
    assert_eq!(policy.shutdown_deadline_millis(), SHUTDOWN_DEADLINE_MILLIS);
    assert_eq!(policy.panic_disable_threshold(), PANIC_DISABLE_THRESHOLD);
    assert_eq!(MAXIMUM_SOURCE_BYTES, 268_435_456);
    assert_eq!(READ_CHUNK_BYTES, 262_144);
}

#[test]
fn production_failure_policy_is_bounded_and_preserves_recovery_classification() {
    for (attempt, expected_delay) in [(1, 60_000), (2, 300_000), (3, 1_800_000)] {
        let disposition = classify_production_failure(
            OrchestrationFailure::MissingLocalFile,
            attempt,
            Some(1_000),
        );
        assert!(matches!(
            disposition,
            FailureDisposition::RetryAt(ref retry_at)
                if retry_at.as_millis() == 1_000 + expected_delay
        ));
    }
    assert_eq!(
        classify_production_failure(OrchestrationFailure::MissingLocalFile, 4, Some(1_000)),
        FailureDisposition::Terminal
    );
    assert_eq!(
        classify_production_failure(OrchestrationFailure::MalformedLocalLocator, 1, Some(1_000)),
        FailureDisposition::Terminal
    );
    assert_eq!(
        classify_production_failure(
            OrchestrationFailure::PublicationRecoverableState,
            1,
            Some(1_000)
        ),
        FailureDisposition::RecoveryRequired
    );
}

#[test]
fn production_runtime_processes_queued_image_and_descriptor_selects_managed_mini() {
    let temporary = ProductionTestRoot::new("pipeline");
    let app_data = temporary.path().join("Sakurava");
    let source = temporary.path().join("source.png");
    synthetic_png(&source);
    let database = prepare_database(&app_data).expect("database");
    prepare_image_owner(
        &database,
        "image-managed-pipeline",
        &source.display().to_string(),
    );

    let runtime = ProductionManagedMediaRuntime::start(&database).expect("runtime");
    wait_for_intent(&database, &runtime, "completed", Duration::from_secs(15));
    runtime.shutdown().expect("bounded shutdown");

    let managed_root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("managed root");
    let shared = database.connection();
    let connection = shared.lock().expect("database lock");
    let descriptor = resolve_descriptor_batch(
        &connection,
        &managed_root,
        vec![descriptor_request(
            "image-managed-pipeline",
            &source.display().to_string(),
        )],
    )
    .pop()
    .expect("descriptor");
    assert_eq!(descriptor.selected_source_class, "managed_standard");
    assert_eq!(descriptor.tier.as_deref(), Some("THUMBNAIL"));
    assert!(descriptor.managed_available);
    assert!(descriptor.original_available);
    let managed_path = descriptor.asset_path.expect("managed path");
    assert_ne!(managed_path, source.display().to_string());
    assert!(Path::new(&managed_path).is_file());
}

#[test]
fn production_runtime_survives_fast_retirement_and_processes_later_queued_generation() {
    let temporary = ProductionTestRoot::new("terminal-retirement");
    let app_data = temporary.path().join("Sakurava");
    let retired_source = temporary.path().join("retired-source.png");
    let later_source = temporary.path().join("later-source.png");
    synthetic_png(&retired_source);
    synthetic_png(&later_source);
    let database = prepare_database(&app_data).expect("database");
    let retired_source_text = retired_source.display().to_string();
    prepare_image_owner_at(
        &database,
        "image-retired-before-renewal",
        &retired_source_text,
        "1753747200000",
    );
    retire_image_owner(
        &database,
        "image-retired-before-renewal",
        &retired_source_text,
        "1753747200001",
    );
    let later_source_text = later_source.display().to_string();
    prepare_image_owner_at(
        &database,
        "image-generated-after-retirement",
        &later_source_text,
        "1753747200002",
    );

    let runtime = ProductionManagedMediaRuntime::start(&database).expect("runtime");
    wait_for_owner_intent(
        &database,
        &runtime,
        "image-retired-before-renewal",
        "retire",
        "retired",
        Duration::from_secs(5),
    );
    assert_eq!(runtime.snapshot().status, SupervisorStatus::Running);
    wait_for_owner_intent(
        &database,
        &runtime,
        "image-generated-after-retirement",
        "generate",
        "completed",
        Duration::from_secs(15),
    );
    assert_eq!(runtime.snapshot().status, SupervisorStatus::Running);
    runtime.shutdown().expect("bounded shutdown");

    let managed_root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("managed root");
    let shared = database.connection();
    let connection = shared.lock().expect("database lock");
    let descriptor = resolve_descriptor_batch(
        &connection,
        &managed_root,
        vec![descriptor_request(
            "image-generated-after-retirement",
            &later_source_text,
        )],
    )
    .pop()
    .expect("descriptor");
    assert_eq!(descriptor.selected_source_class, "managed_standard");
    assert!(descriptor.managed_available);
}

#[test]
fn production_runtime_schedules_missing_source_without_busy_retry_and_keeps_placeholder() {
    let temporary = ProductionTestRoot::new("missing-source");
    let app_data = temporary.path().join("Sakurava");
    let missing = temporary.path().join("missing.png");
    let database = prepare_database(&app_data).expect("database");
    prepare_image_owner(
        &database,
        "image-missing-source",
        &missing.display().to_string(),
    );

    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis() as u64;
    let runtime = ProductionManagedMediaRuntime::start(&database).expect("runtime");
    let state = wait_for_intent(&database, &runtime, "retry_wait", Duration::from_secs(5));
    assert_eq!(state.1, 1);
    let retry_at = state.2.expect("retry timestamp");
    assert!(retry_at >= started_at + 60_000);
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(intent_state(&database).1, 1);
    runtime.shutdown().expect("bounded shutdown");

    let managed_root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("managed root");
    let shared = database.connection();
    let connection = shared.lock().expect("database lock");
    let descriptor = resolve_descriptor_batch(
        &connection,
        &managed_root,
        vec![descriptor_request(
            "image-missing-source",
            &missing.display().to_string(),
        )],
    )
    .pop()
    .expect("descriptor");
    assert!(descriptor.placeholder);
    assert_eq!(descriptor.fallback_reason, "owner_or_slot_retired");
}

#[test]
fn production_runtime_terminally_rejects_non_absolute_source_without_access() {
    let temporary = ProductionTestRoot::new("unsafe-source");
    let app_data = temporary.path().join("Sakurava");
    let database = prepare_database(&app_data).expect("database");
    prepare_image_owner(&database, "image-unsafe-source", "relative-source.png");

    let runtime = ProductionManagedMediaRuntime::start(&database).expect("runtime");
    let state = wait_for_intent(&database, &runtime, "failed", Duration::from_secs(5));
    assert_eq!(state.1, 1);
    assert!(state.2.is_none());
    assert_eq!(runtime.snapshot().status, SupervisorStatus::Running);
    runtime.shutdown().expect("bounded shutdown");
}
