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
        add_target, claim_discovered_intent, claim_intent, complete_retirement,
        discover_lifecycle_work, finalize_generation, initialize_item_generation,
        intent_transition_allowed, load_intent, load_target, queue_intent, reclaim_expired_intent,
        record_desired_fingerprint, record_target_outcome, release_claim_for_retry, renew_claim,
        request_cancellation, target_transition_allowed, transition_intent,
        validate_claim_ownership, ClaimAttemptOutcome, ClaimLossReason, ClaimOwnershipStatus,
        ClaimRenewalOutcome, ClaimedIntentSnapshot, ExecutorTimestamp, FailureClass,
        FinalizationOutcome, ItemRevision, LifecycleAction, LifecycleError, LifecycleState,
        NewLifecycleIntent, NewLifecycleTarget, PersistedWriteOutcome, TargetOutcome, TargetState,
        WorkClaimKind,
    },
    path::ManagedMediaRoot,
    processor::{ManagedMediaProcessor, ProcessorRequest, ProcessorResult, ProcessorVariant},
    publication::{publish, PublicationRequest},
    recovery::{recover, RecoveryScope},
    schema,
};

const NOW: &str = "1753747200000";
const RETRY: &str = "1753747260000";
const LATER: &str = "1753747500000";
const EXPIRES: &str = "1753747800000";

fn timestamp(value: &str) -> ExecutorTimestamp {
    ExecutorTimestamp::parse(value).expect("canonical timestamp")
}

fn claimed(outcome: ClaimAttemptOutcome) -> ClaimedIntentSnapshot {
    match outcome {
        ClaimAttemptOutcome::Claimed(claimed) => claimed,
        ClaimAttemptOutcome::NotClaimed(reason) => panic!("expected claim, got {reason:?}"),
    }
}

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
fn canonical_executor_timestamps_round_trip_order_and_reject_noncanonical_values() {
    let earlier = ExecutorTimestamp::parse(NOW).expect("earlier");
    let later = ExecutorTimestamp::parse(LATER).expect("later");
    assert_eq!(earlier.as_str(), NOW);
    assert_eq!(
        ExecutorTimestamp::from_millis(earlier.as_millis())
            .expect("round trip")
            .as_str(),
        NOW
    );
    assert!(earlier < later);
    assert_eq!(NOW.cmp(LATER), earlier.cmp(&later));
    for invalid in [
        "",
        "-1",
        "01",
        "1.0",
        "2026-07-29T00:00:00Z",
        "9223372036854775808",
    ] {
        assert!(matches!(
            ExecutorTimestamp::parse(invalid),
            Err(LifecycleError::InvalidTimestamp)
        ));
    }
    assert!(matches!(
        ExecutorTimestamp::from_millis(i64::MAX as u64 + 1),
        Err(LifecycleError::InvalidTimestamp)
    ));
}

#[test]
fn discovery_is_bounded_ordered_read_only_and_filters_ineligible_work() {
    let connection = connection();
    for index in 1..=8 {
        let item = hash(1_000 + index);
        let locator = hash(2_000 + index);
        insert_item(&connection, &item, &locator, None);
        queue_intent(
            &connection,
            &new_intent(1_000 + index, &item, 1, &locator),
            if index <= 2 { NOW } else { RETRY },
        )
        .expect("queue");
    }
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'retry_wait', retry_eligible_at = ?2
             WHERE intent_id = ?1",
            (intent_id(1_003).as_str(), EXPIRES),
        )
        .expect("future retry");
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'retry_wait', retry_eligible_at = ?2
             WHERE intent_id = ?1",
            (intent_id(1_004).as_str(), RETRY),
        )
        .expect("due retry");
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'recovery_required' WHERE intent_id = ?1",
            [intent_id(1_005).as_str()],
        )
        .expect("recovery");
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET cancellation_requested = 1 WHERE intent_id = ?1",
            [intent_id(1_006).as_str()],
        )
        .expect("cancelled");
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'failed' WHERE intent_id = ?1",
            [intent_id(1_007).as_str()],
        )
        .expect("terminal");
    connection
        .execute(
            "UPDATE managed_media_items SET lifecycle_state = 'retired' WHERE item_id = ?1",
            [hash(1_008).as_str()],
        )
        .expect("retired");

    let before: Vec<(String, String, i64)> = {
        let mut statement = connection
            .prepare(
                "SELECT intent_id, lifecycle_state, attempt_count
                 FROM managed_media_lifecycle_intents ORDER BY intent_id",
            )
            .expect("snapshot");
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .expect("rows")
            .collect::<rusqlite::Result<_>>()
            .expect("snapshot rows")
    };
    let work =
        discover_lifecycle_work(&connection, &timestamp(RETRY), 3).expect("bounded discovery");
    assert_eq!(work.len(), 3);
    assert_eq!(
        work.iter()
            .map(|candidate| candidate.intent_id.as_str())
            .collect::<Vec<_>>(),
        vec!["intent-1001", "intent-1002", "intent-1004"]
    );
    assert_eq!(work[2].claim_kind, WorkClaimKind::Initial);
    let after: Vec<(String, String, i64)> = {
        let mut statement = connection
            .prepare(
                "SELECT intent_id, lifecycle_state, attempt_count
                 FROM managed_media_lifecycle_intents ORDER BY intent_id",
            )
            .expect("snapshot");
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .expect("rows")
            .collect::<rusqlite::Result<_>>()
            .expect("snapshot rows")
    };
    assert_eq!(after, before);
    assert!(matches!(
        discover_lifecycle_work(&connection, &timestamp(RETRY), 0),
        Err(LifecycleError::InvalidPolicy)
    ));
    assert_eq!(
        discover_lifecycle_work(&connection, &timestamp(EXPIRES), 20)
            .expect("later discovery")
            .iter()
            .map(|candidate| candidate.intent_id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "intent-1001",
            "intent-1002",
            "intent-1004",
            "intent-1005",
            "intent-1003"
        ]
    );
}

#[test]
fn claim_renewal_reclaim_and_result_writes_enforce_current_owner() {
    let connection = connection();
    let item = hash(3_001);
    let locator = hash(3_002);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(3_001, &item, 1, &locator), NOW).expect("queue");
    add_target(&connection, &new_target(3_001, 3_001, &item, 1), NOW).expect("target");
    assert!(matches!(
        claim_intent(
            &connection,
            &intent_id(3_001),
            &claim_id(3_001),
            &timestamp(NOW),
            &timestamp(NOW),
        ),
        Err(LifecycleError::InvalidTimestamp)
    ));
    let mut owner = claimed(
        claim_intent(
            &connection,
            &intent_id(3_001),
            &claim_id(3_001),
            &timestamp(NOW),
            &timestamp(RETRY),
        )
        .expect("claim"),
    );
    assert_eq!(owner.attempt_count, 1);
    assert_eq!(
        validate_claim_ownership(&connection, &owner, &timestamp(NOW)).expect("owned"),
        ClaimOwnershipStatus::Owned
    );
    assert_eq!(
        renew_claim(&connection, &mut owner, &timestamp(NOW), &timestamp(LATER),).expect("renew"),
        ClaimRenewalOutcome::Renewed
    );
    assert_eq!(
        load_intent(&connection, &intent_id(3_001))
            .expect("intent")
            .attempt_count,
        1
    );
    assert_eq!(
        record_desired_fingerprint(&connection, &owner, &hash(3_003), &timestamp(RETRY))
            .expect("fingerprint"),
        PersistedWriteOutcome::Applied
    );
    assert_eq!(
        record_desired_fingerprint(&connection, &owner, &hash(3_003), &timestamp(RETRY))
            .expect("idempotent fingerprint"),
        PersistedWriteOutcome::AlreadyApplied
    );
    assert!(matches!(
        record_desired_fingerprint(&connection, &owner, &hash(3_004), &timestamp(RETRY)),
        Err(LifecycleError::StructuralConflict)
    ));
    let target_outcome = TargetOutcome {
        state: TargetState::SkippedIneligible,
        publication_operation_id: None,
        result_variant_id: None,
        failure_class: None,
        failure_summary: None,
    };
    assert_eq!(
        record_target_outcome(
            &connection,
            &owner,
            &target_id(3_001),
            &target_outcome,
            &timestamp(RETRY),
        )
        .expect("target outcome"),
        PersistedWriteOutcome::Applied
    );
    assert_eq!(
        record_target_outcome(
            &connection,
            &owner,
            &target_id(3_001),
            &target_outcome,
            &timestamp(RETRY),
        )
        .expect("idempotent target outcome"),
        PersistedWriteOutcome::AlreadyApplied
    );

    assert!(matches!(
        reclaim_expired_intent(
            &connection,
            &owner.intent_id,
            &claim_id(3_002),
            &timestamp(RETRY),
            &timestamp(EXPIRES),
        )
        .expect("nonexpired reclaim"),
        ClaimAttemptOutcome::NotClaimed(_)
    ));
    let replacement = claimed(
        reclaim_expired_intent(
            &connection,
            &owner.intent_id,
            &claim_id(3_002),
            &timestamp(LATER),
            &timestamp(EXPIRES),
        )
        .expect("expired reclaim"),
    );
    assert_eq!(replacement.attempt_count, 2);
    assert_eq!(
        validate_claim_ownership(&connection, &owner, &timestamp(LATER)).expect("old ownership"),
        ClaimOwnershipStatus::LostOwnership
    );
    assert!(matches!(
        record_desired_fingerprint(&connection, &owner, &hash(3_003), &timestamp(LATER)),
        Err(LifecycleError::LostOwnership)
    ));
}

#[test]
fn discovered_claim_rechecks_cancellation_retirement_revision_and_race_predicates() {
    for (index, expected) in [
        (4_001_u64, ClaimLossReason::Cancelled),
        (4_002, ClaimLossReason::Retired),
        (4_003, ClaimLossReason::StaleRevision),
    ] {
        let connection = connection();
        let item = hash(4_000 + index);
        let locator = hash(5_000 + index);
        insert_item(&connection, &item, &locator, None);
        queue_intent(&connection, &new_intent(index, &item, 1, &locator), NOW).expect("queue");
        let candidate = discover_lifecycle_work(&connection, &timestamp(NOW), 1)
            .expect("discover")
            .remove(0);
        match expected {
            ClaimLossReason::Cancelled => {
                request_cancellation(&connection, &intent_id(index), &timestamp(NOW))
                    .expect("cancel");
            }
            ClaimLossReason::Retired => {
                connection
                    .execute(
                        "UPDATE managed_media_items SET lifecycle_state = 'retired'
                         WHERE item_id = ?1",
                        [item.as_str()],
                    )
                    .expect("retire");
            }
            ClaimLossReason::StaleRevision => {
                connection
                    .execute(
                        "UPDATE managed_media_item_generations SET desired_revision = 2
                         WHERE managed_item_id = ?1",
                        [item.as_str()],
                    )
                    .expect("advance revision");
            }
            _ => unreachable!("fixture reason"),
        }
        assert_eq!(
            claim_discovered_intent(
                &connection,
                &candidate,
                &claim_id(index),
                &timestamp(NOW),
                &timestamp(EXPIRES),
            )
            .expect("claim outcome"),
            ClaimAttemptOutcome::NotClaimed(expected)
        );
        assert_eq!(
            load_intent(&connection, &intent_id(index))
                .expect("intent")
                .attempt_count,
            0
        );
    }

    let connection = connection();
    let item = hash(4_100);
    let locator = hash(4_101);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(4_100, &item, 1, &locator), NOW).expect("queue");
    let candidate = discover_lifecycle_work(&connection, &timestamp(NOW), 1)
        .expect("discover")
        .remove(0);
    claimed(
        claim_intent(
            &connection,
            &intent_id(4_100),
            &claim_id(4_100),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("racing claim"),
    );
    assert_eq!(
        claim_discovered_intent(
            &connection,
            &candidate,
            &claim_id(4_101),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("lost race"),
        ClaimAttemptOutcome::NotClaimed(ClaimLossReason::LostRace)
    );
    assert_eq!(
        load_intent(&connection, &intent_id(4_100))
            .expect("intent")
            .attempt_count,
        1
    );
}

#[test]
fn active_same_item_claim_blocks_new_work_until_expiry_without_blocking_other_items() {
    let connection = connection();
    let item = hash(4_200);
    let locator = hash(4_201);
    insert_item(&connection, &item, &locator, None);
    queue_intent(&connection, &new_intent(4_200, &item, 1, &locator), NOW).expect("first");
    claimed(
        claim_intent(
            &connection,
            &intent_id(4_200),
            &claim_id(4_200),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("first claim"),
    );
    connection
        .execute(
            "UPDATE managed_media_item_generations SET desired_revision = 2
             WHERE managed_item_id = ?1",
            [item.as_str()],
        )
        .expect("advance desired revision");
    connection
        .execute(
            "INSERT INTO managed_media_lifecycle_intents (
               intent_id, managed_item_id, desired_revision, lifecycle_action,
               expected_locator_hash, lifecycle_state, created_at, updated_at
             ) VALUES (?1, ?2, 2, 'generate', ?3, 'queued', ?4, ?4)",
            (
                intent_id(4_201).as_str(),
                item.as_str(),
                locator.as_str(),
                RETRY,
            ),
        )
        .expect("second intent");
    let other_item = hash(4_202);
    let other_locator = hash(4_203);
    insert_item(&connection, &other_item, &other_locator, None);
    queue_intent(
        &connection,
        &new_intent(4_202, &other_item, 1, &other_locator),
        RETRY,
    )
    .expect("other intent");

    assert_eq!(
        discover_lifecycle_work(&connection, &timestamp(RETRY), 10)
            .expect("active claim discovery")
            .iter()
            .map(|candidate| candidate.intent_id.as_str())
            .collect::<Vec<_>>(),
        vec!["intent-4202"]
    );
    connection
        .execute(
            "UPDATE managed_media_lifecycle_intents SET claim_expires_at = ?2
             WHERE intent_id = ?1",
            (intent_id(4_200).as_str(), RETRY),
        )
        .expect("expire claim");
    assert_eq!(
        discover_lifecycle_work(&connection, &timestamp(RETRY), 10)
            .expect("expired claim discovery")
            .iter()
            .map(|candidate| candidate.intent_id.as_str())
            .collect::<Vec<_>>(),
        vec!["intent-4201", "intent-4202"]
    );
}

#[test]
fn renewal_and_write_guards_report_cancelled_superseded_retired_stale_and_terminal_states() {
    let setup = |index: u64| {
        let connection = connection();
        let item = hash(6_000 + index);
        let locator = hash(7_000 + index);
        insert_item(&connection, &item, &locator, None);
        queue_intent(&connection, &new_intent(index, &item, 1, &locator), NOW).expect("queue");
        let owner = claimed(
            claim_intent(
                &connection,
                &intent_id(index),
                &claim_id(index),
                &timestamp(NOW),
                &timestamp(EXPIRES),
            )
            .expect("claim"),
        );
        (connection, item, owner)
    };

    let (cancelled_connection, _, mut cancelled) = setup(4_300);
    request_cancellation(
        &cancelled_connection,
        &cancelled.intent_id,
        &timestamp(RETRY),
    )
    .expect("cancel");
    assert_eq!(
        renew_claim(
            &cancelled_connection,
            &mut cancelled,
            &timestamp(RETRY),
            &timestamp(EXPIRES).checked_add_millis(1).expect("expiry"),
        )
        .expect("renewal outcome"),
        ClaimRenewalOutcome::Cancelled
    );
    assert!(matches!(
        record_desired_fingerprint(
            &cancelled_connection,
            &cancelled,
            &hash(8_300),
            &timestamp(RETRY),
        ),
        Err(LifecycleError::Cancelled)
    ));

    let (superseded_connection, _, mut superseded) = setup(4_301);
    superseded_connection
        .execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'superseded', claim_token = NULL,
                 claim_expires_at = NULL, failure_class = 'stale',
                 failure_summary = 'synthetic supersession'
             WHERE intent_id = ?1",
            [superseded.intent_id.as_str()],
        )
        .expect("supersede");
    assert_eq!(
        renew_claim(
            &superseded_connection,
            &mut superseded,
            &timestamp(RETRY),
            &timestamp(EXPIRES).checked_add_millis(1).expect("expiry"),
        )
        .expect("renewal outcome"),
        ClaimRenewalOutcome::Superseded
    );

    let (retired_connection, retired_item, mut retired) = setup(4_302);
    retired_connection
        .execute(
            "UPDATE managed_media_items SET lifecycle_state = 'retired' WHERE item_id = ?1",
            [retired_item.as_str()],
        )
        .expect("retire");
    assert_eq!(
        renew_claim(
            &retired_connection,
            &mut retired,
            &timestamp(RETRY),
            &timestamp(EXPIRES).checked_add_millis(1).expect("expiry"),
        )
        .expect("renewal outcome"),
        ClaimRenewalOutcome::Retired
    );

    let (stale_connection, stale_item, mut stale) = setup(4_303);
    stale_connection
        .execute(
            "UPDATE managed_media_item_generations SET desired_revision = 2
             WHERE managed_item_id = ?1",
            [stale_item.as_str()],
        )
        .expect("advance revision");
    assert_eq!(
        renew_claim(
            &stale_connection,
            &mut stale,
            &timestamp(RETRY),
            &timestamp(EXPIRES).checked_add_millis(1).expect("expiry"),
        )
        .expect("renewal outcome"),
        ClaimRenewalOutcome::StaleRevision
    );

    let (terminal_connection, _, mut terminal) = setup(4_304);
    transition_intent(
        &terminal_connection,
        &terminal.intent_id,
        Some(&terminal.claim_token),
        LifecycleState::Failed,
        Some(FailureClass::Terminal),
        Some("synthetic terminal state"),
        &timestamp(RETRY),
    )
    .expect("terminal");
    assert_eq!(
        renew_claim(
            &terminal_connection,
            &mut terminal,
            &timestamp(RETRY),
            &timestamp(EXPIRES).checked_add_millis(1).expect("expiry"),
        )
        .expect("renewal outcome"),
        ClaimRenewalOutcome::InvalidState
    );
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
    let first_claim = claimed(
        claim_intent(
            &connection,
            &intent_id(1),
            &claim_id(1),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("claim"),
    );
    release_claim_for_retry(
        &connection,
        &first_claim,
        &timestamp(RETRY),
        "temporary processor failure",
        &timestamp(NOW),
    )
    .expect("retry wait");
    assert!(matches!(
        claim_intent(
            &connection,
            &intent_id(1),
            &claim_id(2),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("not due"),
        ClaimAttemptOutcome::NotClaimed(_)
    ));
    claimed(
        claim_intent(
            &connection,
            &intent_id(1),
            &claim_id(2),
            &timestamp(RETRY),
            &timestamp(EXPIRES),
        )
        .expect("eligible retry claim"),
    );
    request_cancellation(&connection, &intent_id(1), &timestamp(LATER)).expect("cancel request");
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
    claimed(
        claim_intent(
            &connection,
            &intent_id(12),
            &claim_id(12),
            &timestamp(NOW),
            &timestamp(RETRY),
        )
        .expect("claim"),
    );
    assert!(matches!(
        claim_intent(
            &connection,
            &intent_id(12),
            &claim_id(13),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("competing claim"),
        ClaimAttemptOutcome::NotClaimed(_)
    ));
    assert!(matches!(
        reclaim_expired_intent(
            &connection,
            &intent_id(12),
            &claim_id(13),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("not expired"),
        ClaimAttemptOutcome::NotClaimed(_)
    ));
    claimed(
        reclaim_expired_intent(
            &connection,
            &intent_id(12),
            &claim_id(13),
            &timestamp(RETRY),
            &timestamp(EXPIRES),
        )
        .expect("expired claim"),
    );
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
        &timestamp(NOW),
    )
    .expect("recovery required");
    transition_intent(
        &connection,
        &intent_id(20),
        None,
        LifecycleState::Failed,
        Some(FailureClass::Terminal),
        Some("recovery failed"),
        &timestamp(LATER),
    )
    .expect("terminal failure");
    transition_intent(
        &connection,
        &intent_id(21),
        None,
        LifecycleState::Cancelled,
        Some(FailureClass::Cancelled),
        Some("operator cancellation"),
        &timestamp(NOW),
    )
    .expect("cancelled");
    claimed(
        claim_intent(
            &connection,
            &intent_id(22),
            &claim_id(22),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("claim"),
    );
    transition_intent(
        &connection,
        &intent_id(22),
        Some(&claim_id(22)),
        LifecycleState::CompletedWithFailures,
        Some(FailureClass::Terminal),
        Some("one target was terminal"),
        &timestamp(LATER),
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
    claimed(
        claim_intent(
            &connection,
            &intent_id(30),
            &claim_id(30),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("claim"),
    );
    assert_eq!(
        complete_retirement(
            &connection,
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent_id(30),
            &claim_id(30),
            &timestamp(LATER),
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
    ClaimedIntentSnapshot,
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
    let claim = claimed(
        claim_intent(
            environment.connection(),
            &intent,
            &claim_id(100 + index),
            &timestamp(NOW),
            &timestamp(EXPIRES),
        )
        .expect("claim"),
    );
    record_desired_fingerprint(
        environment.connection(),
        &claim,
        &result.source_sha256,
        &timestamp(NOW),
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
        &claim,
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-101".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        &timestamp(NOW),
    )
    .expect("target publication");
    assert_eq!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim.claim_token,
            &timestamp(LATER),
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
            &claim.claim_token,
            &timestamp(LATER),
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
        &claim,
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-102".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        &timestamp(NOW),
    )
    .expect("first target");
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim.claim_token,
            &timestamp(LATER),
        ),
        Err(LifecycleError::FinalizationNotReady)
    ));
    record_target_outcome(
        environment.connection(),
        &claim,
        &target_id(999),
        &TargetOutcome {
            state: TargetState::SkippedIneligible,
            publication_operation_id: None,
            result_variant_id: None,
            failure_class: None,
            failure_summary: None,
        },
        &timestamp(LATER),
    )
    .expect("skip ineligible");
    assert_eq!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim.claim_token,
            &timestamp(LATER),
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
            &claim,
            &target,
            &TargetOutcome {
                state,
                publication_operation_id: None,
                result_variant_id: None,
                failure_class: Some(failure_class),
                failure_summary: Some("deterministic target outcome".to_string()),
            },
            &timestamp(NOW),
        )
        .expect("target outcome");
        assert!(matches!(
            finalize_generation(
                environment.connection(),
                &item,
                ItemRevision::new(1).expect("revision"),
                &intent,
                &claim.claim_token,
                &timestamp(LATER),
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
        &claim,
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-130".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        &timestamp(NOW),
    )
    .expect("target publication");
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &hash(999),
            ItemRevision::new(1).expect("revision"),
            &intent,
            &claim.claim_token,
            &timestamp(LATER),
        ),
        Err(LifecycleError::IdentityConflict)
    ));
    assert!(matches!(
        finalize_generation(
            environment.connection(),
            &item,
            ItemRevision::new(2).expect("revision"),
            &intent,
            &claim.claim_token,
            &timestamp(LATER),
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
            &claim.claim_token,
            &timestamp(LATER),
        ),
        Err(LifecycleError::Retired)
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
            &claim.claim_token,
            &timestamp(LATER),
        ),
        Err(LifecycleError::StaleRevision)
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
            &_claim,
            &target,
            &TargetOutcome {
                state: TargetState::Published,
                publication_operation_id: Some("operation-103".to_string()),
                result_variant_id: Some(hash(9999)),
                failure_class: None,
                failure_summary: None,
            },
            &timestamp(NOW),
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
        &claim,
        &target,
        &TargetOutcome {
            state: TargetState::Published,
            publication_operation_id: Some("operation-104".to_string()),
            result_variant_id: Some(variant),
            failure_class: None,
            failure_summary: None,
        },
        &timestamp(NOW),
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
            &claim.claim_token,
            &timestamp(LATER),
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
