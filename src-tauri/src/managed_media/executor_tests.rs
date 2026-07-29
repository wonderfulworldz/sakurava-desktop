use std::cell::Cell;

use rusqlite::{params, Connection};

use super::{
    executor::{run_one_cycle, ExecutorDatabase, ExecutorError, ExecutorPolicy},
    identity::{LifecycleClaimToken, LifecycleIntentIdentity, ValidatedSha256},
    lifecycle::{
        claim_intent, initialize_item_generation, load_intent, queue_intent, ClaimAttemptOutcome,
        ExecutorTimestamp, ItemRevision, LifecycleAction, LifecycleError, NewLifecycleIntent,
    },
    schema,
};

const NOW_MILLIS: u64 = 1_753_747_200_000;
const LEASE_MILLIS: u64 = 60_000;

fn hash(index: u64) -> ValidatedSha256 {
    ValidatedSha256::new(format!("{index:064x}")).expect("hash")
}

fn intent_id(index: u64) -> LifecycleIntentIdentity {
    LifecycleIntentIdentity::new(format!("executor-intent-{index}")).expect("intent")
}

fn insert_work(connection: &Connection, index: u64, created_at: u64) {
    let item = hash(10_000 + index);
    let locator = hash(20_000 + index);
    let timestamp = created_at.to_string();
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token,
               source_locator_kind, locator_hash, source_availability_state,
               lifecycle_state, created_at, updated_at
             ) VALUES (?1, 'video', ?2, 'primary_visual', ?3, 'external_file',
                       ?4, 'available', 'active', ?5, ?5)",
            params![
                item.as_str(),
                format!("executor-owner-{index}"),
                format!("executor-slot-{index}"),
                locator.as_str(),
                timestamp,
            ],
        )
        .expect("item");
    initialize_item_generation(connection, &item, &timestamp).expect("generation");
    queue_intent(
        connection,
        &NewLifecycleIntent {
            intent_id: intent_id(index),
            item_id: item,
            revision: ItemRevision::new(1).expect("revision"),
            action: LifecycleAction::Generate,
            expected_locator_hash: locator,
        },
        &timestamp,
    )
    .expect("intent");
}

fn connection() -> Connection {
    let connection = Connection::open_in_memory().expect("database");
    schema::initialize_schema(&connection).expect("schema");
    connection
}

struct GuardedDatabase {
    connection: Connection,
    held: Cell<bool>,
}

impl GuardedDatabase {
    fn new() -> Self {
        Self {
            connection: connection(),
            held: Cell::new(false),
        }
    }
}

impl ExecutorDatabase for GuardedDatabase {
    fn with_connection<T, F>(&self, operation: F) -> Result<T, LifecycleError>
    where
        F: FnOnce(&Connection) -> Result<T, LifecycleError>,
    {
        assert!(!self.held.replace(true), "nested database boundary");
        let result = operation(&self.connection);
        self.held.set(false);
        result
    }
}

#[test]
fn executor_policy_requires_explicit_positive_bounds() {
    for invalid in [
        (0, LEASE_MILLIS, 30_000, 1),
        (1, 0, 30_000, 1),
        (1, LEASE_MILLIS, 0, 1),
        (1, LEASE_MILLIS, 30_000, 0),
    ] {
        assert!(matches!(
            ExecutorPolicy::new(invalid.0, invalid.1, invalid.2, invalid.3),
            Err(ExecutorError::InvalidPolicy)
        ));
    }
    let policy = ExecutorPolicy::new(4, LEASE_MILLIS, 30_000, 2).expect("policy");
    assert_eq!(policy.discovery_limit(), 4);
    assert_eq!(policy.claim_lease_millis(), LEASE_MILLIS);
    assert_eq!(policy.claim_renewal_millis(), 30_000);
    assert_eq!(policy.claim_capacity(), 2);
}

#[test]
fn one_cycle_is_bounded_deterministic_and_releases_database_before_handler() {
    let database = GuardedDatabase::new();
    insert_work(&database.connection, 1, NOW_MILLIS);
    insert_work(&database.connection, 2, NOW_MILLIS);
    insert_work(&database.connection, 3, NOW_MILLIS);
    let policy = ExecutorPolicy::new(3, LEASE_MILLIS, 30_000, 2).expect("policy");
    let mut clock_calls = 0_u64;
    let mut clock = || {
        clock_calls += 1;
        Ok(NOW_MILLIS)
    };
    let mut token_index = 0_u64;
    let mut tokens = || {
        token_index += 1;
        Ok(format!("cycle-token-{token_index}"))
    };
    let mut handled = Vec::new();
    let mut handler = |claimed: &super::lifecycle::ClaimedIntentSnapshot| {
        assert!(!database.held.get(), "handler ran inside database boundary");
        handled.push(claimed.intent_id.as_str().to_string());
        if claimed.intent_id == intent_id(2) {
            Err("synthetic handler failure".to_string())
        } else {
            Ok(())
        }
    };

    let report =
        run_one_cycle(&database, policy, &mut clock, &mut tokens, &mut handler).expect("one cycle");
    assert_eq!(report.discovered, 2);
    assert_eq!(report.successfully_claimed, 2);
    assert_eq!(report.handler_completed, 1);
    assert_eq!(report.handler_failures.len(), 1);
    assert_eq!(report.handler_failures[0].intent_id, "executor-intent-2");
    assert_eq!(
        handled,
        vec![
            "executor-intent-1".to_string(),
            "executor-intent-2".to_string()
        ]
    );
    assert_eq!(clock_calls, 3);
    assert_eq!(token_index, 2);
    assert_eq!(
        load_intent(&database.connection, &intent_id(3))
            .expect("unclaimed third")
            .attempt_count,
        0
    );
    let retry: Option<String> = database
        .connection
        .query_row(
            "SELECT retry_eligible_at FROM managed_media_lifecycle_intents
             WHERE intent_id = ?1",
            [intent_id(2).as_str()],
            |row| row.get(0),
        )
        .expect("retry state");
    assert_eq!(retry, None);
}

#[test]
fn one_cycle_reports_a_lost_race_without_invoking_the_handler() {
    let connection = connection();
    insert_work(&connection, 10, NOW_MILLIS);
    let policy = ExecutorPolicy::new(1, LEASE_MILLIS, 30_000, 1).expect("policy");
    let mut clock = || Ok(NOW_MILLIS);
    let mut raced = false;
    let mut token_generator = || {
        if !raced {
            raced = true;
            let competing_token =
                LifecycleClaimToken::new("competing-token".to_string()).expect("token");
            let now = ExecutorTimestamp::from_millis(NOW_MILLIS).expect("now");
            let expires = now.checked_add_millis(LEASE_MILLIS).expect("expiry");
            assert!(matches!(
                claim_intent(
                    &connection,
                    &intent_id(10),
                    &competing_token,
                    &now,
                    &expires,
                )
                .expect("competing claim"),
                ClaimAttemptOutcome::Claimed(_)
            ));
        }
        Ok("cycle-loser-token".to_string())
    };
    let handler_called = Cell::new(false);
    let mut handler = |_claimed: &super::lifecycle::ClaimedIntentSnapshot| {
        handler_called.set(true);
        Ok(())
    };

    let report = run_one_cycle(
        &connection,
        policy,
        &mut clock,
        &mut token_generator,
        &mut handler,
    )
    .expect("cycle");
    assert_eq!(report.discovered, 1);
    assert_eq!(report.successfully_claimed, 0);
    assert_eq!(report.lost_races, 1);
    assert!(!handler_called.get());
    assert_eq!(
        load_intent(&connection, &intent_id(10))
            .expect("intent")
            .attempt_count,
        1
    );
}

#[test]
fn one_cycle_claims_different_items_independently_and_never_retries_itself() {
    let connection = connection();
    insert_work(&connection, 20, NOW_MILLIS);
    insert_work(&connection, 21, NOW_MILLIS);
    let policy = ExecutorPolicy::new(2, LEASE_MILLIS, 30_000, 2).expect("policy");
    let mut clock = || Ok(NOW_MILLIS);
    let mut token_index = 20_u64;
    let mut tokens = || {
        token_index += 1;
        Ok(format!("independent-token-{token_index}"))
    };
    let mut calls = 0_u32;
    let mut handler = |_claimed: &super::lifecycle::ClaimedIntentSnapshot| {
        calls += 1;
        Err("no automatic retry".to_string())
    };

    let report =
        run_one_cycle(&connection, policy, &mut clock, &mut tokens, &mut handler).expect("cycle");
    assert_eq!(calls, 2);
    assert_eq!(report.successfully_claimed, 2);
    assert_eq!(report.handler_failures.len(), 2);
    for index in [20, 21] {
        let stored = load_intent(&connection, &intent_id(index)).expect("intent");
        assert_eq!(stored.attempt_count, 1);
        assert_eq!(stored.state, super::lifecycle::LifecycleState::Claimed);
    }
}
