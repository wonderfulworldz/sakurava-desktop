use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};
use rusqlite::{params, Connection};

use super::{
    contract::{RoleId, TierId},
    identity::{
        LifecycleClaimToken, LifecycleIntentIdentity, LifecycleTargetIdentity, OperationIdentity,
        ValidatedSha256, VariantClass,
    },
    lifecycle::{
        add_target, claim_intent, complete_retirement, finalize_generation,
        initialize_item_generation, intent_transition_allowed, load_intent, load_target,
        queue_intent, reclaim_expired_intent, record_desired_fingerprint, record_target_outcome,
        release_claim_for_retry, request_cancellation, target_transition_allowed,
        transition_intent, FailureClass, FinalizationOutcome, ItemRevision, LifecycleAction,
        LifecycleError, LifecycleState, NewLifecycleIntent, NewLifecycleTarget, TargetOutcome,
        TargetState,
    },
    path::ManagedMediaRoot,
    processor::{ManagedMediaProcessor, ProcessorRequest, ProcessorResult, ProcessorVariant},
    publication::{publish, PublicationRequest},
    recovery::{recover, RecoveryScope},
    schema,
};

const NOW: &str = "2026-07-29T00:00:00Z";
const LATER: &str = "2026-07-29T00:05:00Z";
const RETRY: &str = "2026-07-29T00:01:00Z";

fn hash(index: u64) -> ValidatedSha256 {
    ValidatedSha256::new(format!("{index:064x}")).expect("hash")
}

fn intent_id(index: u64) -> LifecycleIntentIdentity {
    LifecycleIntentIdentity::new(format!("intent-{index}")).expect("intent id")
}

fn target_id(index: u64) -> LifecycleTargetIdentity {
    LifecycleTargetIdentity::new(format!("target-{index}")).expect("target id")
}

fn claim_id(index: u64) -> LifecycleClaimToken {
    LifecycleClaimToken::new(format!("claim-{index}")).expect("claim id")
}

fn connection() -> Connection {
    let connection = Connection::open_in_memory().expect("database");
    schema::initialize_schema(&connection).expect("schema");
    connection
}

fn insert_item(
    connection: &Connection,
    item_id: &ValidatedSha256,
    locator_hash: &ValidatedSha256,
    current: Option<&ValidatedSha256>,
) {
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token,
               source_locator_kind, locator_hash, current_source_fingerprint,
               pending_source_fingerprint, source_availability_state,
               lifecycle_state, created_at, updated_at
             ) VALUES (?1, 'video', ?2, 'primary_visual', ?3, 'external_file',
                       ?4, ?5, NULL, 'available', 'active', ?6, ?6)",
            params![
                item_id.as_str(),
                format!("owner-{}", item_id.as_str()),
                item_id.as_str(),
                locator_hash.as_str(),
                current.map(ValidatedSha256::as_str),
                NOW
            ],
        )
        .expect("item");
    initialize_item_generation(connection, item_id, NOW).expect("generation");
}

fn new_intent(
    index: u64,
    item_id: &ValidatedSha256,
    revision: u64,
    locator_hash: &ValidatedSha256,
) -> NewLifecycleIntent {
    NewLifecycleIntent {
        intent_id: intent_id(index),
        item_id: item_id.clone(),
        revision: ItemRevision::new(revision).expect("revision"),
        action: LifecycleAction::Generate,
        expected_locator_hash: locator_hash.clone(),
    }
}

fn new_target(
    index: u64,
    intent_index: u64,
    item_id: &ValidatedSha256,
    revision: u64,
) -> NewLifecycleTarget {
    NewLifecycleTarget {
        target_id: target_id(index),
        intent_id: intent_id(intent_index),
        item_id: item_id.clone(),
        revision: ItemRevision::new(revision).expect("revision"),
        role: RoleId::VideoTable,
        class: VariantClass::Standard(TierId::Thumbnail),
    }
}

#[test]
fn typed_identities_revisions_and_transition_maps_reject_invalid_states() {
    assert!(LifecycleIntentIdentity::new("../intent").is_err());
    assert!(LifecycleTargetIdentity::new("Target").is_err());
    assert!(LifecycleClaimToken::new("").is_err());
    assert!(ItemRevision::new(0).is_err());
    assert!(intent_transition_allowed(
        LifecycleState::Queued,
        LifecycleState::Claimed
    ));
    assert!(!intent_transition_allowed(
        LifecycleState::Completed,
        LifecycleState::Claimed
    ));
    assert!(target_transition_allowed(
        TargetState::RetryableFailure,
        TargetState::Claimed
    ));
    assert!(!target_transition_allowed(
        TargetState::Published,
        TargetState::Claimed
    ));
}

#[test]
fn queue_claim_retry_and_cancellation_are_explicit_and_persisted() {
    let connection = connection();
    let item = hash(1);
    let locator = hash(2);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(1, &item, 1, &locator), NOW).expect("queue");
    claim_intent(&connection, &intent_id(1), &claim_id(1), NOW, LATER).expect("claim");
    release_claim_for_retry(
        &connection,
        &intent_id(1),
        &claim_id(1),
        RETRY,
        "temporary processor failure",
        NOW,
    )
    .expect("retry wait");
    assert!(claim_intent(&connection, &intent_id(1), &claim_id(2), NOW, LATER).is_err());
    claim_intent(&connection, &intent_id(1), &claim_id(2), RETRY, LATER)
        .expect("eligible retry claim");
    request_cancellation(&connection, &intent_id(1), LATER).expect("cancel request");
    let stored = load_intent(&connection, &intent_id(1)).expect("intent");
    assert_eq!(stored.state, LifecycleState::Claimed);
    assert_eq!(stored.attempt_count, 2);
    assert!(stored.cancellation_requested);
}

#[test]
fn competing_claim_is_rejected_and_expired_claim_is_reclaimed_atomically() {
    let connection = connection();
    let item = hash(12);
    let locator = hash(13);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(12, &item, 1, &locator), NOW).expect("queue");
    claim_intent(&connection, &intent_id(12), &claim_id(12), NOW, RETRY).expect("claim");
    assert!(matches!(
        claim_intent(&connection, &intent_id(12), &claim_id(13), NOW, LATER),
        Err(LifecycleError::ClaimUnavailable)
    ));
    assert!(matches!(
        reclaim_expired_intent(&connection, &intent_id(12), &claim_id(13), NOW, LATER),
        Err(LifecycleError::ClaimUnavailable)
    ));
    reclaim_expired_intent(&connection, &intent_id(12), &claim_id(13), RETRY, LATER)
        .expect("expired claim");
    assert_eq!(
        load_intent(&connection, &intent_id(12))
            .expect("intent")
            .attempt_count,
        2
    );
}

#[test]
fn terminal_cancellation_and_recovery_transitions_are_typed() {
    let connection = connection();
    for index in 20..23 {
        let item = hash(index);
        let locator = hash(index + 100);
        insert_item(&connection, &item, &locator, None);
        queue_intent(&connection, &new_intent(index, &item, 1, &locator), NOW).expect("queue");
    }
    transition_intent(
        &connection,
        &intent_id(20),
        None,
        LifecycleState::RecoveryRequired,
        Some(FailureClass::RecoveryRequired),
        Some("publication evidence needs recovery"),
        NOW,
    )
    .expect("recovery required");
    transition_intent(
        &connection,
        &intent_id(20),
        None,
        LifecycleState::Failed,
        Some(FailureClass::Terminal),
        Some("recovery failed"),
        LATER,
    )
    .expect("terminal failure");
    transition_intent(
        &connection,
        &intent_id(21),
        None,
        LifecycleState::Cancelled,
        Some(FailureClass::Cancelled),
        Some("operator cancellation"),
        NOW,
    )
    .expect("cancelled");
    claim_intent(&connection, &intent_id(22), &claim_id(22), NOW, LATER).expect("claim");
    transition_intent(
        &connection,
        &intent_id(22),
        Some(&claim_id(22)),
        LifecycleState::CompletedWithFailures,
        Some(FailureClass::Terminal),
        Some("one target was terminal"),
        LATER,
    )
    .expect("completed with failures");
    assert_eq!(
        load_intent(&connection, &intent_id(20))
            .expect("failed")
            .state,
        LifecycleState::Failed
    );
    assert_eq!(
        load_intent(&connection, &intent_id(21))
            .expect("cancelled")
            .state,
        LifecycleState::Cancelled
    );
    assert_eq!(
        load_intent(&connection, &intent_id(22))
            .expect("completed with failures")
            .state,
        LifecycleState::CompletedWithFailures
    );
}

#[test]
fn retirement_advances_revision_without_deleting_last_valid_descriptor_identity() {
    let connection = connection();
    let item = hash(30);
    let locator = hash(31);
    let current = hash(32);
    insert_item(&connection, &item, &locator, Some(&current));
    let mut retirement = new_intent(30, &item, 1, &locator);
    retirement.action = LifecycleAction::Retire;
    queue_intent(&connection, &retirement, NOW).expect("retirement intent");
    claim_intent(&connection, &intent_id(30), &claim_id(30), NOW, LATER).expect("claim");
    assert_eq!(
        complete_retirement(
            &connection,
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent_id(30),
            &claim_id(30),
            LATER,
        )
        .expect("retire"),
        FinalizationOutcome::Promoted
    );
    let state: (Option<String>, String, i64) = connection
        .query_row(
            "SELECT i.current_source_fingerprint, i.lifecycle_state, g.current_revision
             FROM managed_media_items i
             JOIN managed_media_item_generations g ON g.managed_item_id = i.item_id
             WHERE i.item_id = ?1",
            [item.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("retired state");
    assert_eq!(
        state,
        (Some(current.as_str().to_string()), "retired".to_string(), 1)
    );
}

#[test]
fn newer_revision_supersedes_only_unfinished_older_generation() {
    let connection = connection();
    let item = hash(3);
    let locator = hash(4);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(3, &item, 1, &locator), NOW).expect("first");
    add_target(&connection, &new_target(3, 3, &item, 1), NOW).expect("first target");
    queue_intent(&connection, &new_intent(4, &item, 2, &locator), LATER).expect("second");
    assert_eq!(
        load_intent(&connection, &intent_id(3))
            .expect("old intent")
            .state,
        LifecycleState::Superseded
    );
    assert_eq!(
        load_target(&connection, &target_id(3))
            .expect("old target")
            .state,
        TargetState::Superseded
    );
    assert_eq!(
        load_intent(&connection, &intent_id(4))
            .expect("new intent")
            .state,
        LifecycleState::Queued
    );
}

#[test]
fn target_identity_is_unique_per_intent_role_and_variant_class() {
    let connection = connection();
    let item = hash(5);
    let locator = hash(6);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(5, &item, 1, &locator), NOW).expect("intent");
    add_target(&connection, &new_target(5, 5, &item, 1), NOW).expect("target");
    let duplicate = NewLifecycleTarget {
        target_id: target_id(6),
        ..new_target(6, 5, &item, 1)
    };
    assert!(matches!(
        add_target(&connection, &duplicate, NOW),
        Err(LifecycleError::IdentityConflict)
    ));
}

#[test]
fn critical_referential_guards_hold_when_sqlite_foreign_keys_are_disabled() {
    let connection = connection();
    connection
        .execute_batch("PRAGMA foreign_keys = OFF;")
        .expect("foreign keys off");
    assert!(connection
        .execute(
            "INSERT INTO managed_media_item_generations (
               managed_item_id, current_revision, desired_revision, created_at, updated_at
             ) VALUES (?1, 0, 0, ?2, ?2)",
            (hash(7).as_str(), NOW),
        )
        .is_err());

    let item = hash(8);
    let locator = hash(9);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(8, &item, 1, &locator), NOW).expect("intent");
    add_target(&connection, &new_target(8, 8, &item, 1), NOW).expect("target");
    assert!(connection
        .execute(
            "DELETE FROM managed_media_items WHERE item_id = ?1",
            [item.as_str()]
        )
        .is_err());
    assert!(connection
        .execute(
            "DELETE FROM managed_media_lifecycle_intents WHERE intent_id = ?1",
            [intent_id(8).as_str()]
        )
        .is_err());
}

#[test]
fn row_parsing_rejects_unknown_stored_states_without_numeric_defaults() {
    let connection = connection();
    let item = hash(10);
    let locator = hash(11);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(10, &item, 1, &locator), NOW).expect("intent");
    connection
        .execute_batch("PRAGMA ignore_check_constraints = ON;")
        .expect("test-only corruption gate");
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'future_state' WHERE intent_id = ?1",
            [intent_id(10).as_str()],
        )
        .expect("inject unknown value");
    assert!(matches!(
        load_intent(&connection, &intent_id(10)),
        Err(LifecycleError::UnknownStoredValue)
    ));
}

#[test]
fn row_parsing_rejects_invalid_persisted_fingerprint_identity() {
    let connection = connection();
    let item = hash(40);
    let locator = hash(41);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(40, &item, 1, &locator), NOW).expect("intent");
    connection
        .execute_batch("PRAGMA ignore_check_constraints = ON;")
        .expect("test-only corruption gate");
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET desired_source_fingerprint = 'not-a-hash' WHERE intent_id = ?1",
            [intent_id(40).as_str()],
        )
        .expect("inject invalid identity");
    assert!(matches!(
        load_intent(&connection, &intent_id(40)),
        Err(LifecycleError::UnknownStoredValue)
    ));
}

struct PublicationEnvironment {
    base: PathBuf,
    connection: Option<Connection>,
    root: ManagedMediaRoot,
    processor: ManagedMediaProcessor,
}

impl PublicationEnvironment {
    fn new(name: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "sakurava-managed-media-lifecycle-{name}-{}-{}",
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
        assert!(!base.exists());
        fs::create_dir_all(&base).expect("temporary root");
        let root = ManagedMediaRoot::from_app_data_dir(&base).expect("managed root");
        let connection = Connection::open(base.join("lifecycle.sqlite")).expect("database");
        schema::initialize_schema(&connection).expect("schema");
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

    fn process(&self, seed: u8) -> ProcessorResult {
        self.processor
            .process(ProcessorRequest {
                source_bytes: &synthetic_png(seed),
                role: RoleId::VideoTable,
                tier: TierId::Thumbnail,
            })
            .expect("processor")
    }

    fn publish(
        &self,
        operation_id: &str,
        item_id: &ValidatedSha256,
        variant_id: &ValidatedSha256,
        result: &ProcessorResult,
    ) {
        publish(
            self.connection(),
            &self.root,
            &self.processor,
            PublicationRequest {
                operation_id: OperationIdentity::new(operation_id).expect("operation"),
                item_id: item_id.clone(),
                variant_id: variant_id.clone(),
                processor_result: result,
            },
        )
        .expect("publish");
    }
}

impl Drop for PublicationEnvironment {
    fn drop(&mut self) {
        drop(self.connection.take());
        if self.base.exists() {
            fs::remove_dir_all(&self.base).expect("remove exact temporary root");
        }
        assert!(!self.base.exists());
    }
}

fn prepared_publication(
    environment: &PublicationEnvironment,
    index: u64,
) -> (
    ValidatedSha256,
    ValidatedSha256,
    ProcessorResult,
    LifecycleIntentIdentity,
    LifecycleTargetIdentity,
    LifecycleClaimToken,
) {
    let item = hash(100 + index);
    let locator = hash(200 + index);
    let variant = hash(300 + index);
    let result = environment.process(index as u8);
    insert_item(environment.connection(), &item, &locator, None);
    queue_intent(
        environment.connection(),
        &new_intent(100 + index, &item, 1, &locator),
        NOW,
    )
    .expect("intent");
    let class = match result.variant {
        ProcessorVariant::Standard(tier) => VariantClass::Standard(tier),
        ProcessorVariant::NativeFallback => VariantClass::NativeFallback,
    };
    add_target(
        environment.connection(),
        &NewLifecycleTarget {
            target_id: target_id(100 + index),
            intent_id: intent_id(100 + index),
            item_id: item.clone(),
            revision: ItemRevision::new(1).expect("revision"),
            role: RoleId::VideoTable,
            class,
        },
        NOW,
    )
    .expect("target");
    let intent = intent_id(100 + index);
    let target = target_id(100 + index);
    let claim = claim_id(100 + index);
    claim_intent(environment.connection(), &intent, &claim, NOW, LATER).expect("claim");
    record_desired_fingerprint(
        environment.connection(),
        &intent,
        &result.source_sha256,
        NOW,
    )
    .expect("desired fingerprint");
    environment.publish(
        &format!("operation-{}", 100 + index),
        &item,
        &variant,
        &result,
    );
    (item, variant, result, intent, target, claim)
}

#[test]
fn publication_records_variant_without_promoting_item_then_finalization_promotes_once() {
    let environment = PublicationEnvironment::new("promotion");
    let (item, variant, result, intent, target, claim) = prepared_publication(&environment, 1);
    assert_eq!(
        load_target(environment.connection(), &target)
            .expect("target")
            .class,
        VariantClass::NativeFallback
    );
    let current: Option<String> = environment
        .connection()
        .query_row(
            "SELECT current_source_fingerprint FROM managed_media_items WHERE item_id = ?1",
            [item.as_str()],
            |row| row.get(0),
        )
        .expect("current before finalization");
    assert_eq!(current, None);
    record_target_outcome(
        environment.connection(),
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-101".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        NOW,
    )
    .expect("target publication");
    assert_eq!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        )
        .expect("finalize"),
        FinalizationOutcome::Promoted
    );
    assert_eq!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        )
        .expect("idempotent finalize"),
        FinalizationOutcome::AlreadyFinalized
    );
    let state: (Option<String>, Option<String>, String, i64, i64) = environment
        .connection()
        .query_row(
            "SELECT i.current_source_fingerprint, i.pending_source_fingerprint,
                    i.lifecycle_state, g.current_revision, g.desired_revision
             FROM managed_media_items i
             JOIN managed_media_item_generations g ON g.managed_item_id = i.item_id
             WHERE i.item_id = ?1",
            [item.as_str()],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .expect("final state");
    assert_eq!(state.0.as_deref(), Some(result.source_sha256.as_str()));
    assert_eq!(state.1, None);
    assert_eq!(state.2, "active");
    assert_eq!((state.3, state.4), (1, 1));
}

#[test]
fn finalization_requires_every_target_to_have_terminal_success_evidence() {
    let environment = PublicationEnvironment::new("all-targets");
    let (item, variant, _result, intent, target, claim) = prepared_publication(&environment, 2);
    add_target(
        environment.connection(),
        &NewLifecycleTarget {
            target_id: target_id(999),
            intent_id: intent.clone(),
            item_id: item.clone(),
            revision: ItemRevision::new(1).expect("revision"),
            role: RoleId::VideoLiteCard,
            class: VariantClass::Standard(TierId::Thumbnail),
        },
        NOW,
    )
    .expect("second target");
    record_target_outcome(
        environment.connection(),
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-102".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        NOW,
    )
    .expect("first target");
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        ),
        Err(LifecycleError::FinalizationNotReady)
    ));
    record_target_outcome(
        environment.connection(),
        &target_id(999),
        &TargetOutcome {
            state: TargetState::SkippedIneligible,
            publication_operation_id: None,
            result_variant_id: None,
            failure_class: None,
            failure_summary: None,
        },
        LATER,
    )
    .expect("skip ineligible");
    assert_eq!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        )
        .expect("finalize"),
        FinalizationOutcome::Promoted
    );
}

#[test]
fn unsuccessful_target_outcomes_never_promote_current_generation() {
    let cases = [
        (TargetState::RetryableFailure, FailureClass::Retryable),
        (TargetState::TerminalFailure, FailureClass::Terminal),
        (TargetState::Cancelled, FailureClass::Cancelled),
        (TargetState::Superseded, FailureClass::Stale),
        (
            TargetState::RecoveryRequired,
            FailureClass::RecoveryRequired,
        ),
    ];
    for (index, (state, failure_class)) in cases.into_iter().enumerate() {
        let environment = PublicationEnvironment::new(&format!("target-rejection-{index}"));
        let (item, variant, _result, intent, target, claim) =
            prepared_publication(&environment, 20 + index as u64);
        record_target_outcome(
            environment.connection(),
            &target,
            &TargetOutcome {
                state,
                publication_operation_id: None,
                result_variant_id: None,
                failure_class: Some(failure_class),
                failure_summary: Some("deterministic target outcome".to_string()),
            },
            NOW,
        )
        .expect("target outcome");
        assert!(matches!(
            finalize_generation(
                environment.connection(),
                &item,
                ItemRevision::new(1).expect("revision"),
                &intent,
                &claim,
                LATER,
            ),
            Err(LifecycleError::FinalizationNotReady)
        ));
        let current: Option<String> = environment
            .connection()
            .query_row(
                "SELECT current_source_fingerprint FROM managed_media_items WHERE item_id = ?1",
                [item.as_str()],
                |row| row.get(0),
            )
            .expect("preserved current");
        assert_eq!(current, None);
        let variant_exists: bool = environment
            .connection()
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM managed_media_variants WHERE variant_id = ?1)",
                [variant.as_str()],
                |row| row.get(0),
            )
            .expect("preserved descriptor");
        assert!(variant_exists);
    }
}

#[test]
fn stale_revision_item_mismatch_supersession_and_retired_item_are_rejected() {
    let environment = PublicationEnvironment::new("stale-boundaries");
    let (item, variant, result, intent, target, claim) = prepared_publication(&environment, 30);
    record_target_outcome(
        environment.connection(),
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-130".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        NOW,
    )
    .expect("target publication");
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &hash(999),
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        ),
        Err(LifecycleError::IdentityConflict)
    ));
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(2).expect("revision"),
            &intent,
            &claim,
            LATER,
        ),
        Err(LifecycleError::IdentityConflict)
    ));
    environment
        .connection()
        .execute(
            "UPDATE managed_media_items SET lifecycle_state = 'retired' WHERE item_id = ?1",
            [item.as_str()],
        )
        .expect("retired item");
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        ),
        Err(LifecycleError::IdentityConflict)
    ));
    environment
        .connection()
        .execute(
            "UPDATE managed_media_items SET lifecycle_state = 'pending' WHERE item_id = ?1",
            [item.as_str()],
        )
        .expect("restore test state");
    let locator = hash(230);
    queue_intent(
        environment.connection(),
        &new_intent(131, &item, 2, &locator),
        LATER,
    )
    .expect("superseding revision");
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        ),
        Err(LifecycleError::FinalizationNotReady)
    ));
    let current: Option<String> = environment
        .connection()
        .query_row(
            "SELECT current_source_fingerprint FROM managed_media_items WHERE item_id = ?1",
            [item.as_str()],
            |row| row.get(0),
        )
        .expect("current");
    assert_eq!(current, None);
    assert_eq!(
        result.source_sha256.as_str(),
        load_intent(environment.connection(), &intent)
            .expect("superseded")
            .desired_source_fingerprint
            .as_deref()
            .expect("fingerprint")
    );
}

#[test]
fn mismatched_publication_evidence_is_rejected_before_target_mutation() {
    let environment = PublicationEnvironment::new("wrong-link");
    let (_item, _variant, _result, _intent, target, _claim) = prepared_publication(&environment, 3);
    assert!(matches!(
        record_target_outcome(
            environment.connection(),
            &target,
            &TargetOutcome {
                state: TargetState::Published,
                publication_operation_id: Some("operation-103".to_string()),
                result_variant_id: Some(hash(9999)),
                failure_class: None,
                failure_summary: None,
            },
            NOW,
        ),
        Err(LifecycleError::InvalidPublicationLink)
    ));
    assert_eq!(
        load_target(environment.connection(), &target)
            .expect("unchanged target")
            .state,
        TargetState::Pending
    );
}

#[test]
fn failed_finalization_rolls_back_item_generation_and_intent_state() {
    let environment = PublicationEnvironment::new("rollback");
    let (item, variant, _result, intent, target, claim) = prepared_publication(&environment, 4);
    record_target_outcome(
        environment.connection(),
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-104".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        NOW,
    )
    .expect("target publication");
    environment
        .connection()
        .execute(
            "UPDATE managed_media_items SET pending_source_fingerprint = ?2 WHERE item_id = ?1",
            (item.as_str(), hash(700).as_str()),
        )
        .expect("inject stale pending state");
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim,
            LATER,
        ),
        Err(LifecycleError::IdentityConflict)
    ));
    let state: (Option<String>, i64, String) = environment
        .connection()
        .query_row(
            "SELECT i.current_source_fingerprint, g.current_revision, l.lifecycle_state
             FROM managed_media_items i
             JOIN managed_media_item_generations g ON g.managed_item_id = i.item_id
             JOIN managed_media_lifecycle_intents l ON l.managed_item_id = i.item_id
             WHERE i.item_id = ?1",
            [item.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("rollback state");
    assert_eq!(state, (None, 0, "claimed".to_string()));
}

#[test]
fn publication_recovery_scope_remains_operation_specific() {
    let environment = PublicationEnvironment::new("recovery-separation");
    let (_item, _variant, _result, intent, _target, _claim) = prepared_publication(&environment, 5);
    assert_eq!(
        load_intent(environment.connection(), &intent)
            .expect("intent")
            .state,
        LifecycleState::Claimed
    );
    let outcomes = recover(
        environment.connection(),
        &environment.root,
        &environment.processor,
        RecoveryScope::Operation(
            OperationIdentity::new("operation-105").expect("operation identity"),
        ),
    )
    .expect("publication recovery");
    assert_eq!(outcomes.len(), 1);
    assert_eq!(
        load_intent(environment.connection(), &intent)
            .expect("unchanged lifecycle")
            .state,
        LifecycleState::Claimed
    );
}

fn synthetic_png(seed: u8) -> Vec<u8> {
    let (width, height) = (96usize, 54usize);
    let mut pixels = Vec::with_capacity(width * height * 4);
    for y in 0..height {
        for x in 0..width {
            pixels.extend_from_slice(&[
                seed.wrapping_add((x * 3) as u8),
                seed.wrapping_add((y * 5) as u8),
                seed.wrapping_add((x + y) as u8),
                255,
            ]);
        }
    }
    let mut output = Vec::new();
    PngEncoder::new(&mut output)
        .write_image(
            &pixels,
            width as u32,
            height as u32,
            ExtendedColorType::Rgba8,
        )
        .expect("PNG");
    output
}
