use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};
use rusqlite::{params, Connection, OptionalExtension};

use super::{
    contract::{RoleId, TierId},
    identity::{
        LifecycleClaimToken, LifecycleIntentIdentity, LifecycleTargetIdentity, OperationIdentity,
        ValidatedSha256, VariantClass,
    },
    lifecycle::{
        add_target, claim_intent, initialize_item_generation, queue_intent,
        record_desired_fingerprint, AtomicPublicationLifecycleOutcome, ClaimAttemptOutcome,
        ExecutorTimestamp, ItemRevision, LifecycleAction, NewLifecycleIntent, NewLifecycleTarget,
    },
    path::ManagedMediaRoot,
    processor::{ManagedMediaProcessor, ProcessorRequest, ProcessorResult},
    publication::{
        activate_descriptor_for_test, activate_lifecycle_publication,
        cleanup_lifecycle_publication, execute_lifecycle_publication_filesystem,
        prepare_lifecycle_publication, publish, publish_with_failure, FailurePoint,
        PublicationError, PublicationLifecycleContext, PublicationOutcome, PublicationRequest,
        RecoveryOutcome,
    },
    recovery::{recover, RecoveryScope},
    schema,
};

struct TestEnvironment {
    base: PathBuf,
    connection: Option<Connection>,
    root: ManagedMediaRoot,
    processor: ManagedMediaProcessor,
}

impl TestEnvironment {
    fn new(name: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "sakurava-managed-media-publication-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repository");
        assert!(base.is_absolute());
        assert!(base.starts_with(std::env::temp_dir()));
        assert!(!base.starts_with(repository));
        assert!(!base.starts_with(repository.join("manual-smoke")));
        assert!(!base.to_string_lossy().contains("managed-media/v1"));
        assert!(!base.exists());
        fs::create_dir_all(&base).expect("create exact disposable root");
        let root = ManagedMediaRoot::from_app_data_dir(&base).expect("validated root");
        let database_path = base.join("publication.sqlite");
        let connection = Connection::open(&database_path).expect("disposable database");
        schema::initialize_schema(&connection).expect("managed-media schema");
        println!(
            "managed-media publication disposable root: {}",
            base.display()
        );
        Self {
            base,
            connection: Some(connection),
            root,
            processor: ManagedMediaProcessor::default(),
        }
    }

    fn connection(&self) -> &Connection {
        self.connection.as_ref().expect("connection")
    }

    fn insert_item(
        &self,
        item_id: &ValidatedSha256,
        source: &ValidatedSha256,
        current: Option<&ValidatedSha256>,
    ) {
        self.connection()
            .execute(
                "INSERT INTO managed_media_items (
                   item_id, owner_kind, owner_id, slot_kind, slot_token,
                   source_locator_kind, locator_hash, current_source_fingerprint,
                   pending_source_fingerprint, source_availability_state,
                   lifecycle_state, created_at, updated_at
                 ) VALUES (?1, 'video', ?2, 'primary_visual', ?3,
                           'external_file', ?4, ?5, ?6, 'available', 'active',
                           'now', 'now')",
                params![
                    item_id.as_str(),
                    format!("owner-{}", item_id.as_str()),
                    item_id.as_str(),
                    hash('f').as_str(),
                    current.map(ValidatedSha256::as_str),
                    source.as_str(),
                ],
            )
            .expect("insert managed item");
    }

    fn set_pending(&self, item_id: &ValidatedSha256, source: &ValidatedSha256) {
        self.connection()
            .execute(
                "UPDATE managed_media_items
                 SET pending_source_fingerprint = ?2, updated_at = 'pending'
                 WHERE item_id = ?1",
                [item_id.as_str(), source.as_str()],
            )
            .expect("set pending source");
    }

    fn process(&self, seed: u8) -> ProcessorResult {
        let source = synthetic_png(seed, false);
        self.processor
            .process(ProcessorRequest {
                source_bytes: &source,
                role: RoleId::VideoTable,
                tier: TierId::Thumbnail,
            })
            .expect("synthetic processor result")
    }

    fn publish(
        &self,
        operation: &str,
        item_id: &ValidatedSha256,
        variant_id: &ValidatedSha256,
        result: &ProcessorResult,
    ) -> Result<PublicationOutcome, PublicationError> {
        publish(
            self.connection(),
            &self.root,
            &self.processor,
            request(operation, item_id, variant_id, result),
        )
    }

    fn publish_failure(
        &self,
        operation: &str,
        item_id: &ValidatedSha256,
        variant_id: &ValidatedSha256,
        result: &ProcessorResult,
        failure: FailurePoint,
    ) -> Result<PublicationOutcome, PublicationError> {
        publish_with_failure(
            self.connection(),
            &self.root,
            &self.processor,
            request(operation, item_id, variant_id, result),
            failure,
        )
    }

    fn recover(&self, operation: &str) -> Result<RecoveryOutcome, PublicationError> {
        let outcomes = recover(
            self.connection(),
            &self.root,
            &self.processor,
            RecoveryScope::Operation(OperationIdentity::new(operation).expect("operation")),
        )?;
        Ok(outcomes.into_iter().next().expect("one outcome").outcome)
    }

    fn operation_state(&self, operation: &str) -> (String, String) {
        self.connection()
            .query_row(
                "SELECT operation_state, journal_state
                 FROM managed_media_operations WHERE operation_id = ?1",
                [operation],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("operation state")
    }

    fn current_source(&self, item_id: &ValidatedSha256) -> Option<String> {
        self.connection()
            .query_row(
                "SELECT current_source_fingerprint
                 FROM managed_media_items WHERE item_id = ?1",
                [item_id.as_str()],
                |row| row.get(0),
            )
            .expect("current source")
    }

    fn pending_source(&self, item_id: &ValidatedSha256) -> Option<String> {
        self.connection()
            .query_row(
                "SELECT pending_source_fingerprint
                 FROM managed_media_items WHERE item_id = ?1",
                [item_id.as_str()],
                |row| row.get(0),
            )
            .expect("pending source")
    }

    fn variant_path(&self, variant_id: &ValidatedSha256) -> PathBuf {
        let relative: String = self
            .connection()
            .query_row(
                "SELECT relative_path FROM managed_media_variants WHERE variant_id = ?1",
                [variant_id.as_str()],
                |row| row.get(0),
            )
            .expect("variant relative path");
        self.root.resolve(relative).expect("variant path")
    }

    fn variant_exists(&self, variant_id: &ValidatedSha256) -> bool {
        self.connection()
            .query_row(
                "SELECT 1 FROM managed_media_variants WHERE variant_id = ?1",
                [variant_id.as_str()],
                |_| Ok(true),
            )
            .optional()
            .expect("variant lookup")
            .unwrap_or(false)
    }

    fn staging_path(&self, operation: &str, variant_id: &ValidatedSha256) -> PathBuf {
        self.root
            .staging_path(
                &OperationIdentity::new(operation).expect("operation"),
                variant_id,
            )
            .expect("staging path")
    }

    fn payload_relative_path(&self, operation: &str) -> PathBuf {
        let payload: String = self
            .connection()
            .query_row(
                "SELECT scope_payload_json FROM managed_media_operations
                 WHERE operation_id = ?1",
                [operation],
                |row| row.get(0),
            )
            .expect("payload");
        let value: serde_json::Value = serde_json::from_str(&payload).expect("payload json");
        self.root
            .resolve(value["relative_path"].as_str().expect("relative path"))
            .expect("final path")
    }
}

impl Drop for TestEnvironment {
    fn drop(&mut self) {
        drop(self.connection.take());
        if self.base.exists() {
            fs::remove_dir_all(&self.base).expect("remove exact disposable root");
        }
        assert!(!self.base.exists());
    }
}

fn request<'a>(
    operation: &str,
    item_id: &ValidatedSha256,
    variant_id: &ValidatedSha256,
    result: &'a ProcessorResult,
) -> PublicationRequest<'a> {
    PublicationRequest {
        operation_id: OperationIdentity::new(operation).expect("operation"),
        item_id: item_id.clone(),
        variant_id: variant_id.clone(),
        processor_result: result,
    }
}

fn prepare_claimed_lifecycle(
    environment: &TestEnvironment,
    item: &ValidatedSha256,
    result: &ProcessorResult,
    label: &str,
) -> PublicationLifecycleContext {
    initialize_item_generation(environment.connection(), item, "1000").expect("generation");
    let intent_id =
        LifecycleIntentIdentity::new(format!("publication-intent-{label}")).expect("intent");
    let target_id =
        LifecycleTargetIdentity::new(format!("publication-target-{label}")).expect("target");
    queue_intent(
        environment.connection(),
        &NewLifecycleIntent {
            intent_id: intent_id.clone(),
            item_id: item.clone(),
            revision: ItemRevision::new(1).expect("revision"),
            action: LifecycleAction::Generate,
            expected_locator_hash: hash('f'),
        },
        "1000",
    )
    .expect("queue");
    add_target(
        environment.connection(),
        &NewLifecycleTarget {
            target_id: target_id.clone(),
            intent_id: intent_id.clone(),
            item_id: item.clone(),
            revision: ItemRevision::new(1).expect("revision"),
            role: RoleId::VideoTable,
            class: VariantClass::Standard(TierId::Thumbnail),
        },
        "1000",
    )
    .expect("target");
    let now = ExecutorTimestamp::from_millis(1000).expect("now");
    let expires = ExecutorTimestamp::from_millis(10_000).expect("expiry");
    let claimed = match claim_intent(
        environment.connection(),
        &intent_id,
        &LifecycleClaimToken::new(format!("publication-claim-{label}")).expect("token"),
        &now,
        &expires,
    )
    .expect("claim")
    {
        ClaimAttemptOutcome::Claimed(claimed) => claimed,
        other => panic!("unexpected claim outcome: {other:?}"),
    };
    record_desired_fingerprint(
        environment.connection(),
        &claimed,
        &result.source_sha256,
        &now,
    )
    .expect("desired fingerprint");
    PublicationLifecycleContext { claimed, target_id }
}

fn hash(character: char) -> ValidatedSha256 {
    ValidatedSha256::new(character.to_string().repeat(64)).expect("hash")
}

fn indexed_hash(index: u32) -> ValidatedSha256 {
    ValidatedSha256::new(format!("{index:064x}")).expect("indexed hash")
}

fn synthetic_png(seed: u8, alpha: bool) -> Vec<u8> {
    let width = 384;
    let height = 256;
    let mut pixels = vec![0_u8; width * height * 4];
    for (index, pixel) in pixels.chunks_exact_mut(4).enumerate() {
        let x = (index % width) as u8;
        let y = (index / width) as u8;
        pixel.copy_from_slice(&[
            seed.wrapping_add(x),
            seed.wrapping_mul(3).wrapping_add(y),
            x.wrapping_add(y),
            if alpha && index % 11 == 0 { 160 } else { 255 },
        ]);
    }
    let mut output = Vec::new();
    PngEncoder::new(&mut output)
        .write_image(
            &pixels,
            width as u32,
            height as u32,
            ExtendedColorType::Rgba8,
        )
        .expect("synthetic PNG");
    output
}

#[test]
fn schema_capability_and_first_publication_are_journaled_and_idempotent() {
    let environment = TestEnvironment::new("first");
    schema::initialize_schema(environment.connection()).expect("idempotent schema");
    let item = hash('1');
    let variant = hash('2');
    let result = environment.process(1);
    environment.insert_item(&item, &result.source_sha256, None);

    let outcome = environment
        .publish("operation-first", &item, &variant, &result)
        .expect("publication");
    assert!(matches!(outcome, PublicationOutcome::Published { .. }));
    assert_eq!(
        environment.operation_state("operation-first"),
        ("completed".to_string(), "published".to_string())
    );
    assert_eq!(environment.current_source(&item), None);
    assert_eq!(
        environment.pending_source(&item).as_deref(),
        Some(result.source_sha256.as_str())
    );
    assert!(environment.variant_exists(&variant));
    assert!(environment.variant_path(&variant).is_file());
    assert!(!environment
        .staging_path("operation-first", &variant)
        .exists());

    let repeated = environment
        .publish("operation-first", &item, &variant, &result)
        .expect("idempotent repeat");
    assert!(matches!(
        repeated,
        PublicationOutcome::AlreadyCompleted { .. }
    ));
    assert!(matches!(
        environment.recover("operation-first").expect("recovery"),
        RecoveryOutcome::NoActionRequired
    ));
}

#[test]
fn replacement_preserves_previous_descriptor_and_file() {
    let environment = TestEnvironment::new("replacement");
    let item = hash('3');
    let old_variant = hash('4');
    let new_variant = hash('5');
    let old_result = environment.process(2);
    environment.insert_item(
        &item,
        &old_result.source_sha256,
        Some(&old_result.source_sha256),
    );
    environment
        .publish("operation-old", &item, &old_variant, &old_result)
        .expect("old publication");
    let old_path = environment.variant_path(&old_variant);

    let new_result = environment.process(3);
    environment.set_pending(&item, &new_result.source_sha256);
    environment
        .publish("operation-new", &item, &new_variant, &new_result)
        .expect("new publication");

    assert!(old_path.is_file());
    assert!(environment.variant_exists(&old_variant));
    assert!(environment.variant_exists(&new_variant));
    assert_eq!(
        environment.current_source(&item).as_deref(),
        Some(old_result.source_sha256.as_str())
    );
    assert_eq!(
        environment.pending_source(&item).as_deref(),
        Some(new_result.source_sha256.as_str())
    );
    let old_state: String = environment
        .connection()
        .query_row(
            "SELECT publication_state FROM managed_media_variants WHERE variant_id = ?1",
            [old_variant.as_str()],
            |row| row.get(0),
        )
        .expect("old state");
    assert_eq!(old_state, "published");
}

#[test]
fn staged_checksum_and_reopen_mismatches_fail_closed() {
    let environment = TestEnvironment::new("staged-mismatch");
    let item = hash('6');
    let variant = hash('7');
    let result = environment.process(4);
    environment.insert_item(&item, &result.source_sha256, None);
    assert!(matches!(
        environment.publish_failure(
            "operation-staged-mismatch",
            &item,
            &variant,
            &result,
            FailurePoint::AfterStagingWrite
        ),
        Err(PublicationError::InterruptedForVerification)
    ));
    let staging = environment.staging_path("operation-staged-mismatch", &variant);
    fs::write(&staging, b"different staged bytes").expect("tamper disposable stage");
    assert!(matches!(
        environment.recover("operation-staged-mismatch"),
        Err(PublicationError::StagedChecksumMismatch)
    ));

    let environment = TestEnvironment::new("staged-descriptor");
    let item = hash('8');
    let variant = hash('9');
    let result = environment.process(5);
    environment.insert_item(&item, &result.source_sha256, None);
    environment
        .publish_failure(
            "operation-staged-descriptor",
            &item,
            &variant,
            &result,
            FailurePoint::AfterStagedValidation,
        )
        .expect_err("controlled interruption");
    let payload: String = environment
        .connection()
        .query_row(
            "SELECT scope_payload_json FROM managed_media_operations WHERE operation_id = ?1",
            ["operation-staged-descriptor"],
            |row| row.get(0),
        )
        .expect("payload");
    let mut value: serde_json::Value = serde_json::from_str(&payload).expect("json");
    value["width"] = serde_json::json!(1);
    environment
        .connection()
        .execute(
            "UPDATE managed_media_operations SET scope_payload_json = ?2 WHERE operation_id = ?1",
            params![
                "operation-staged-descriptor",
                serde_json::to_string(&value).expect("json")
            ],
        )
        .expect("tamper disposable descriptor");
    assert!(matches!(
        environment.recover("operation-staged-descriptor"),
        Err(PublicationError::StagedValidationMismatch)
    ));
}

#[test]
fn immutable_collision_is_rejected_and_exact_final_is_idempotent() {
    let environment = TestEnvironment::new("collision");
    let item = hash('a');
    let variant = hash('b');
    let result = environment.process(6);
    environment.insert_item(&item, &result.source_sha256, None);
    environment
        .publish_failure(
            "operation-collision",
            &item,
            &variant,
            &result,
            FailurePoint::AfterStagedValidation,
        )
        .expect_err("controlled interruption");
    let final_path = environment.payload_relative_path("operation-collision");
    fs::create_dir_all(final_path.parent().expect("parent")).expect("final parent");
    fs::write(&final_path, b"unexpected immutable content").expect("collision");
    assert!(matches!(
        environment.recover("operation-collision"),
        Err(PublicationError::ImmutableFinalCollision)
    ));

    let environment = TestEnvironment::new("exact-existing");
    let item = hash('c');
    let variant = hash('d');
    let result = environment.process(7);
    environment.insert_item(&item, &result.source_sha256, None);
    environment
        .publish_failure(
            "operation-exact",
            &item,
            &variant,
            &result,
            FailurePoint::AfterStagedValidation,
        )
        .expect_err("controlled interruption");
    let final_path = environment.payload_relative_path("operation-exact");
    fs::create_dir_all(final_path.parent().expect("parent")).expect("final parent");
    fs::write(&final_path, &result.output_bytes).expect("exact final");
    assert!(matches!(
        environment
            .recover("operation-exact")
            .expect("recover exact"),
        RecoveryOutcome::CompletedImmutablePublication
    ));
    assert!(environment.variant_exists(&variant));
}

#[test]
fn descriptor_transaction_failure_rolls_back_and_recovery_completes() {
    let environment = TestEnvironment::new("transaction-rollback");
    let item = hash('e');
    let variant = indexed_hash(17);
    let result = environment.process(8);
    environment.insert_item(&item, &result.source_sha256, None);
    assert!(matches!(
        environment.publish_failure(
            "operation-rollback",
            &item,
            &variant,
            &result,
            FailurePoint::DuringDescriptorTransaction
        ),
        Err(PublicationError::InterruptedForVerification)
    ));
    assert_eq!(environment.current_source(&item), None);
    assert!(!environment.variant_exists(&variant));
    assert!(environment
        .payload_relative_path("operation-rollback")
        .is_file());
    assert_eq!(
        environment.operation_state("operation-rollback"),
        ("recovery_required".to_string(), "published".to_string())
    );
    assert!(matches!(
        environment.recover("operation-rollback").expect("recover"),
        RecoveryOutcome::FinalizedJournalState | RecoveryOutcome::CompletedDescriptorActivation
    ));
    assert!(environment.variant_exists(&variant));
    assert_eq!(environment.current_source(&item), None);
    assert_eq!(
        environment.pending_source(&item).as_deref(),
        Some(result.source_sha256.as_str())
    );
}

#[test]
fn every_supported_crash_boundary_preserves_state_and_recovers_idempotently() {
    let cases = [
        (FailurePoint::AfterJournalIntent, false),
        (FailurePoint::AfterStagingWrite, true),
        (FailurePoint::AfterStagedValidation, true),
        (FailurePoint::AfterImmutablePublication, true),
        (FailurePoint::DuringDescriptorTransaction, true),
        (FailurePoint::AfterDescriptorCommit, true),
    ];
    for (index, (failure, should_complete)) in cases.into_iter().enumerate() {
        let environment = TestEnvironment::new(&format!("crash-{index}"));
        let item = indexed_hash(100 + index as u32);
        let variant = indexed_hash(200 + index as u32);
        let result = environment.process(20 + index as u8);
        environment.insert_item(&item, &result.source_sha256, None);
        assert!(matches!(
            environment.publish_failure(
                &format!("operation-crash-{index}"),
                &item,
                &variant,
                &result,
                failure
            ),
            Err(PublicationError::InterruptedForVerification)
        ));
        assert_eq!(environment.current_source(&item), None);

        let outcome = environment
            .recover(&format!("operation-crash-{index}"))
            .expect("bounded recovery");
        if should_complete {
            assert!(matches!(
                outcome,
                RecoveryOutcome::CompletedImmutablePublication
                    | RecoveryOutcome::CompletedDescriptorActivation
                    | RecoveryOutcome::FinalizedJournalState
                    | RecoveryOutcome::RemovedExactStagingRemnant
            ));
            assert!(environment.variant_exists(&variant));
            assert_eq!(environment.current_source(&item), None);
            assert_eq!(
                environment.pending_source(&item).as_deref(),
                Some(result.source_sha256.as_str())
            );
            assert!(matches!(
                environment
                    .recover(&format!("operation-crash-{index}"))
                    .expect("repeated recovery"),
                RecoveryOutcome::NoActionRequired
            ));
        } else {
            assert_eq!(outcome, RecoveryOutcome::MarkedFailedPreservingPrevious);
            assert_eq!(
                environment.operation_state(&format!("operation-crash-{index}")),
                ("failed".to_string(), "failed".to_string())
            );
            assert!(matches!(
                environment.publish(
                    &format!("operation-crash-{index}"),
                    &item,
                    &variant,
                    &result
                ),
                Err(PublicationError::RecoveryStateConflict)
            ));
        }
    }
}

#[test]
fn failed_replacement_never_deactivates_or_deletes_last_valid_output() {
    let environment = TestEnvironment::new("last-valid-failure");
    let item = indexed_hash(250);
    let old_variant = indexed_hash(251);
    let new_variant = indexed_hash(252);
    let old_result = environment.process(70);
    environment.insert_item(
        &item,
        &old_result.source_sha256,
        Some(&old_result.source_sha256),
    );
    environment
        .publish("operation-last-valid-old", &item, &old_variant, &old_result)
        .expect("old publication");
    let old_path = environment.variant_path(&old_variant);

    let new_result = environment.process(71);
    environment.set_pending(&item, &new_result.source_sha256);
    assert!(matches!(
        environment.publish_failure(
            "operation-last-valid-new",
            &item,
            &new_variant,
            &new_result,
            FailurePoint::DuringDescriptorTransaction
        ),
        Err(PublicationError::InterruptedForVerification)
    ));
    assert_eq!(
        environment.current_source(&item).as_deref(),
        Some(old_result.source_sha256.as_str())
    );
    assert!(old_path.is_file());
    assert!(environment.variant_exists(&old_variant));
    assert!(!environment.variant_exists(&new_variant));
}

#[test]
fn operation_and_variant_identity_reuse_are_rejected() {
    let environment = TestEnvironment::new("identity-conflicts");
    let item = indexed_hash(300);
    let variant = indexed_hash(301);
    let first = environment.process(30);
    environment.insert_item(&item, &first.source_sha256, None);
    environment
        .publish("operation-identity", &item, &variant, &first)
        .expect("first publication");

    let second = environment.process(31);
    environment.set_pending(&item, &second.source_sha256);
    assert!(matches!(
        environment.publish("operation-identity", &item, &indexed_hash(302), &second),
        Err(PublicationError::OperationIdentityConflict)
    ));
    assert!(matches!(
        environment.publish("operation-variant-conflict", &item, &variant, &second),
        Err(PublicationError::VariantIdentityConflict)
            | Err(PublicationError::DescriptorTransactionFailure)
    ));
    assert!(matches!(
        environment.publish(
            "operation-missing-item",
            &indexed_hash(999),
            &indexed_hash(998),
            &second
        ),
        Err(PublicationError::ItemIdentityConflict)
    ));
}

#[test]
fn exact_cleanup_leaves_unrelated_operation_and_all_immutable_assets_untouched() {
    let environment = TestEnvironment::new("bounded-cleanup");
    let item = indexed_hash(400);
    let variant = indexed_hash(401);
    let result = environment.process(40);
    environment.insert_item(&item, &result.source_sha256, None);
    environment
        .publish_failure(
            "operation-cleanup",
            &item,
            &variant,
            &result,
            FailurePoint::AfterDescriptorCommit,
        )
        .expect_err("controlled interruption");
    let unrelated = environment
        .root
        .as_path()
        .join(".staging")
        .join("unrelated-operation");
    fs::create_dir_all(&unrelated).expect("unrelated operation");
    let unrelated_file = unrelated.join("unrelated.tmp");
    fs::write(&unrelated_file, b"untouched").expect("unrelated file");
    let final_path = environment.variant_path(&variant);
    let exact_staging = environment.staging_path("operation-cleanup", &variant);
    fs::create_dir_all(exact_staging.parent().expect("exact staging parent"))
        .expect("exact staging parent");
    fs::copy(&final_path, &exact_staging).expect("exact staging remnant");

    assert!(matches!(
        environment
            .recover("operation-cleanup")
            .expect("cleanup recovery"),
        RecoveryOutcome::RemovedExactStagingRemnant
    ));
    assert!(!exact_staging.exists());
    assert!(unrelated_file.is_file());
    assert!(final_path.is_file());
}

#[test]
fn bounded_recovery_limit_is_enforced_without_root_or_catalog_scan() {
    let environment = TestEnvironment::new("bounded-limit");
    for index in 0..3 {
        let item = indexed_hash(500 + index);
        let variant = indexed_hash(510 + index);
        let result = environment.process(50 + index as u8);
        environment.insert_item(&item, &result.source_sha256, None);
        environment
            .publish_failure(
                &format!("operation-bounded-{index}"),
                &item,
                &variant,
                &result,
                FailurePoint::AfterStagingWrite,
            )
            .expect_err("controlled interruption");
    }
    let outcomes = recover(
        environment.connection(),
        &environment.root,
        &environment.processor,
        RecoveryScope::BoundedNonterminal {
            maximum_operations: 2,
        },
    )
    .expect("bounded recovery");
    assert_eq!(outcomes.len(), 2);
    assert!(matches!(
        recover(
            environment.connection(),
            &environment.root,
            &environment.processor,
            RecoveryScope::BoundedNonterminal {
                maximum_operations: 0
            }
        ),
        Err(PublicationError::RecoveryStateConflict)
    ));
}

#[test]
fn schema_objects_remain_unchanged_and_foundation_measurements_are_bounded() {
    let environment = TestEnvironment::new("measurements");
    let schema_before: Vec<(String, String, String)> = {
        let mut statement = environment
            .connection()
            .prepare(
                "SELECT type, name, COALESCE(sql, '') FROM sqlite_master
                 WHERE name LIKE 'managed_media_%' ORDER BY type, name",
            )
            .expect("schema statement");
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .expect("schema rows")
            .collect::<rusqlite::Result<_>>()
            .expect("schema collect")
    };

    let first_result = environment.process(60);
    let first_item = indexed_hash(600);
    let first_variant = indexed_hash(601);
    environment.insert_item(&first_item, &first_result.source_sha256, None);
    let first_started = Instant::now();
    environment
        .publish(
            "operation-measure-first",
            &first_item,
            &first_variant,
            &first_result,
        )
        .expect("first measured publication");
    let first_elapsed = first_started.elapsed();

    let recovery_result = environment.process(61);
    let recovery_item = indexed_hash(602);
    let recovery_variant = indexed_hash(603);
    environment.insert_item(&recovery_item, &recovery_result.source_sha256, None);
    environment
        .publish_failure(
            "operation-measure-recovery",
            &recovery_item,
            &recovery_variant,
            &recovery_result,
            FailurePoint::AfterImmutablePublication,
        )
        .expect_err("recovery boundary");
    let recovery_started = Instant::now();
    environment
        .recover("operation-measure-recovery")
        .expect("measured recovery");
    let recovery_elapsed = recovery_started.elapsed();

    let activation_result = environment.process(62);
    let activation_item = indexed_hash(604);
    let activation_variant = indexed_hash(605);
    environment.insert_item(&activation_item, &activation_result.source_sha256, None);
    environment
        .publish_failure(
            "operation-measure-activation",
            &activation_item,
            &activation_variant,
            &activation_result,
            FailurePoint::AfterImmutablePublication,
        )
        .expect_err("activation boundary");
    let activation_started = Instant::now();
    activate_descriptor_for_test(environment.connection(), "operation-measure-activation")
        .expect("measured activation");
    let activation_elapsed = activation_started.elapsed();
    environment
        .recover("operation-measure-activation")
        .expect("activation cleanup");

    let post_activation_result = environment.process(63);
    let post_activation_item = indexed_hash(606);
    let post_activation_variant = indexed_hash(607);
    environment.insert_item(
        &post_activation_item,
        &post_activation_result.source_sha256,
        None,
    );
    environment
        .publish_failure(
            "operation-measure-post-activation",
            &post_activation_item,
            &post_activation_variant,
            &post_activation_result,
            FailurePoint::AfterDescriptorCommit,
        )
        .expect_err("post-activation boundary");
    let post_activation_started = Instant::now();
    environment
        .recover("operation-measure-post-activation")
        .expect("post-activation recovery");
    let post_activation_elapsed = post_activation_started.elapsed();

    let batch_started = Instant::now();
    for index in 0..20 {
        let result = environment.process(80 + index as u8);
        let item = indexed_hash(700 + index);
        let variant = indexed_hash(800 + index);
        environment.insert_item(&item, &result.source_sha256, None);
        environment
            .publish(
                &format!("operation-batch-{index}"),
                &item,
                &variant,
                &result,
            )
            .expect("batch publication");
    }
    let batch_elapsed = batch_started.elapsed();

    println!(
        "MEASURED first_publication_us={} descriptor_activation_us={} \
         recovery_after_final_us={} recovery_after_activation_us={} sequential_20_us={}",
        micros(first_elapsed),
        micros(activation_elapsed),
        micros(recovery_elapsed),
        micros(post_activation_elapsed),
        micros(batch_elapsed)
    );

    let schema_after: Vec<(String, String, String)> = {
        let mut statement = environment
            .connection()
            .prepare(
                "SELECT type, name, COALESCE(sql, '') FROM sqlite_master
                 WHERE name LIKE 'managed_media_%' ORDER BY type, name",
            )
            .expect("schema statement");
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .expect("schema rows")
            .collect::<rusqlite::Result<_>>()
            .expect("schema collect")
    };
    assert_eq!(schema_before, schema_after);
}

#[test]
fn lifecycle_publication_phases_activate_descriptor_target_and_generation_atomically() {
    let environment = TestEnvironment::new("lifecycle-phases");
    let result = environment.process(61);
    let item = indexed_hash(9_001);
    let variant = indexed_hash(9_002);
    environment.insert_item(&item, &result.source_sha256, None);
    let lifecycle = prepare_claimed_lifecycle(&environment, &item, &result, "phases");
    let prepared = prepare_lifecycle_publication(
        environment.connection(),
        &environment.root,
        &environment.processor,
        request("operation-phase-success", &item, &variant, &result),
        &lifecycle,
        &ExecutorTimestamp::from_millis(2_000).expect("preparation time"),
    )
    .expect("P1");
    assert!(!environment.variant_exists(&variant));
    assert_eq!(
        environment.operation_state("operation-phase-success"),
        ("running".to_string(), "staging".to_string())
    );

    execute_lifecycle_publication_filesystem(&environment.root, &environment.processor, &prepared)
        .expect("P2");
    assert!(!environment.variant_exists(&variant));
    assert!(environment
        .root
        .resolve(prepared.relative_path())
        .expect("final path")
        .exists());

    let outcome = activate_lifecycle_publication(
        environment.connection(),
        &prepared,
        &lifecycle,
        &ExecutorTimestamp::from_millis(3_000).expect("activation time"),
    )
    .expect("P3");
    assert_eq!(outcome, AtomicPublicationLifecycleOutcome::Finalized);
    assert!(environment.variant_exists(&variant));
    assert_eq!(
        environment.operation_state("operation-phase-success"),
        ("completed".to_string(), "published".to_string())
    );
    assert_eq!(
        environment
            .connection()
            .query_row(
                "SELECT target_state FROM managed_media_lifecycle_targets
                 WHERE target_id = ?1",
                [lifecycle.target_id.as_str()],
                |row| row.get::<_, String>(0),
            )
            .expect("target state"),
        "published"
    );
    assert_eq!(
        environment.current_source(&item),
        Some(result.source_sha256.as_str().to_string())
    );
    cleanup_lifecycle_publication(&environment.root, &environment.processor, &prepared)
        .expect("P4");
    assert!(!environment
        .staging_path("operation-phase-success", &variant)
        .exists());
}

#[test]
fn lifecycle_publication_rejects_replaced_claim_after_immutable_rename_without_activation() {
    let environment = TestEnvironment::new("lifecycle-stale-claim");
    let result = environment.process(62);
    let item = indexed_hash(9_011);
    let variant = indexed_hash(9_012);
    environment.insert_item(&item, &result.source_sha256, None);
    let lifecycle = prepare_claimed_lifecycle(&environment, &item, &result, "stale");
    let prepared = prepare_lifecycle_publication(
        environment.connection(),
        &environment.root,
        &environment.processor,
        request("operation-phase-stale", &item, &variant, &result),
        &lifecycle,
        &ExecutorTimestamp::from_millis(2_000).expect("preparation time"),
    )
    .expect("P1");
    execute_lifecycle_publication_filesystem(&environment.root, &environment.processor, &prepared)
        .expect("P2");
    environment
        .connection()
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET claim_token = 'replacement-claim'
             WHERE intent_id = ?1",
            [lifecycle.claimed.intent_id.as_str()],
        )
        .expect("replace claim");

    assert!(activate_lifecycle_publication(
        environment.connection(),
        &prepared,
        &lifecycle,
        &ExecutorTimestamp::from_millis(3_000).expect("activation time"),
    )
    .is_err());
    assert!(!environment.variant_exists(&variant));
    assert_eq!(environment.current_source(&item), None);
    assert_eq!(
        environment.operation_state("operation-phase-stale"),
        ("running".to_string(), "staging".to_string())
    );
    assert_eq!(
        environment
            .connection()
            .query_row(
                "SELECT target_state FROM managed_media_lifecycle_targets
                 WHERE target_id = ?1",
                [lifecycle.target_id.as_str()],
                |row| row.get::<_, String>(0),
            )
            .expect("target state"),
        "pending"
    );
    assert!(environment
        .root
        .resolve(prepared.relative_path())
        .expect("immutable final")
        .exists());
}

fn micros(duration: Duration) -> u128 {
    duration.as_micros()
}
