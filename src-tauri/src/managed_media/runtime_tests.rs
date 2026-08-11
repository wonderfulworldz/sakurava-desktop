use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU32, AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection};

use super::{
    executor::ExecutorPolicy,
    identity::{LifecycleIntentIdentity, ValidatedSha256},
    lifecycle::{
        initialize_item_generation, queue_intent, ExecutorTimestamp, ItemRevision, LifecycleAction,
        NewLifecycleIntent,
    },
    path::ManagedMediaRoot,
    processor::ManagedMediaProcessor,
    runtime::{
        bounded_error, DispatchReport, InertSqliteRuntimeBackend, RecoveryBoundary, RenewalReport,
        RuntimeBackend, RuntimeControl, RuntimePolicy, ShutdownOutcome, StartupPhase,
        SupervisorStatus, WakeOutcome,
    },
    schema,
};

const FIXTURE_DISCOVERY_LIMIT: u32 = 2;
const FIXTURE_LEASE_MILLIS: u64 = 1_000;
const FIXTURE_RENEWAL_MILLIS: u64 = 200;
const FIXTURE_CLAIM_CAPACITY: u32 = 1;
const FIXTURE_WORKER_CAPACITY: u32 = 1;
const FIXTURE_RECOVERY_LIMIT: u32 = 2;
const FIXTURE_WAKE_CAPACITY: usize = 1;
const FIXTURE_SAFETY_MILLIS: u64 = 20;
const FIXTURE_CONTINUATION_MILLIS: u64 = 5;
const FIXTURE_SHUTDOWN_MILLIS: u64 = 100;
const FIXTURE_PANIC_THRESHOLD: u32 = 1;

struct RuntimeTestRoot(PathBuf);

impl RuntimeTestRoot {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "sakurava-managed-media-runtime-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        assert!(!path.exists());
        fs::create_dir_all(&path).expect("temporary root");
        Self(path)
    }

    fn path(&self) -> &std::path::Path {
        &self.0
    }
}

impl Drop for RuntimeTestRoot {
    fn drop(&mut self) {
        if self.0.exists() {
            fs::remove_dir_all(&self.0).expect("remove exact runtime test root");
        }
    }
}

fn policy() -> RuntimePolicy {
    let executor = ExecutorPolicy::new(
        FIXTURE_DISCOVERY_LIMIT,
        FIXTURE_LEASE_MILLIS,
        FIXTURE_RENEWAL_MILLIS,
        FIXTURE_CLAIM_CAPACITY,
    )
    .expect("executor policy");
    RuntimePolicy::new(
        executor,
        FIXTURE_WORKER_CAPACITY,
        FIXTURE_RECOVERY_LIMIT,
        FIXTURE_WAKE_CAPACITY,
        FIXTURE_SAFETY_MILLIS,
        FIXTURE_CONTINUATION_MILLIS,
        FIXTURE_SHUTDOWN_MILLIS,
        FIXTURE_PANIC_THRESHOLD,
    )
    .expect("runtime policy")
}

fn clock() -> impl super::runtime::RuntimeClock {
    let mut now = 1_753_747_200_000_u64;
    move || {
        now = now.saturating_add(1);
        ExecutorTimestamp::from_millis(now).map_err(|error| error.to_string())
    }
}

#[derive(Default)]
struct BackendState {
    events: Vec<&'static str>,
    recovery: Vec<RecoveryBoundary>,
    active: u32,
    dispatches: u32,
    renewals: u32,
    stop_calls: u32,
    saturated: bool,
    worker_panics: u32,
    renewal_lost_ownership: u32,
    recovery_error: Option<String>,
    due_error: Option<String>,
    retain_active_on_stop: bool,
    due: Option<ExecutorTimestamp>,
}

struct TestBackend {
    state: Arc<(Mutex<BackendState>, Condvar)>,
}

impl RuntimeBackend for TestBackend {
    fn recover_publication(&mut self, maximum_operations: u32) -> Result<RecoveryBoundary, String> {
        assert_eq!(maximum_operations, FIXTURE_RECOVERY_LIMIT);
        let (state, changed) = &*self.state;
        let mut state = state.lock().expect("state");
        state.events.push("recovery");
        if let Some(error) = state.recovery_error.take() {
            return Err(error);
        }
        let outcome = if state.recovery.is_empty() {
            RecoveryBoundary::Clean
        } else {
            state.recovery.remove(0)
        };
        changed.notify_all();
        Ok(outcome)
    }

    fn dispatch_lifecycle(
        &mut self,
        executor: ExecutorPolicy,
        worker_capacity: u32,
    ) -> Result<DispatchReport, String> {
        assert_eq!(executor.claim_capacity(), FIXTURE_CLAIM_CAPACITY);
        assert_eq!(worker_capacity, FIXTURE_WORKER_CAPACITY);
        let (state, changed) = &*self.state;
        let mut state = state.lock().expect("state");
        state.events.push("dispatch");
        state.dispatches += 1;
        let report = DispatchReport {
            claimed: state.active,
            active_claims: state.active,
            capacity_saturated: state.saturated,
            worker_panics: state.worker_panics,
        };
        changed.notify_all();
        Ok(report)
    }

    fn renew_active_claims(
        &mut self,
        _now: &ExecutorTimestamp,
        lease_millis: u64,
    ) -> Result<RenewalReport, String> {
        assert_eq!(lease_millis, FIXTURE_LEASE_MILLIS);
        let (state, changed) = &*self.state;
        let mut state = state.lock().expect("state");
        state.events.push("renew");
        state.renewals += 1;
        changed.notify_all();
        Ok(RenewalReport {
            active_claims: state.active,
            lost_ownership: state.renewal_lost_ownership,
        })
    }

    fn earliest_due(
        &mut self,
        _now: &ExecutorTimestamp,
    ) -> Result<Option<ExecutorTimestamp>, String> {
        let (state, _) = &*self.state;
        let mut state = state.lock().expect("state");
        state.events.push("due");
        if let Some(error) = state.due_error.take() {
            return Err(error);
        }
        Ok(state.due.clone())
    }

    fn stop_new_claims(&mut self) {
        let (state, changed) = &*self.state;
        let mut state = state.lock().expect("state");
        state.events.push("stop");
        state.stop_calls += 1;
        if !state.retain_active_on_stop {
            state.active = 0;
        }
        changed.notify_all();
    }

    fn active_claim_count(&mut self) -> Result<u32, String> {
        Ok(self.state.0.lock().expect("state").active)
    }
}

fn start_with_state(state: Arc<(Mutex<BackendState>, Condvar)>) -> RuntimeControl {
    RuntimeControl::start(policy(), move || Ok(TestBackend { state }), clock()).expect("runtime")
}

#[test]
fn runtime_policy_rejects_zero_capacity_and_contradictory_lease_values() {
    let executor = ExecutorPolicy::new(1, 100, 100, 1).expect("executor");
    assert!(RuntimePolicy::new(executor, 1, 1, 1, 1, 1, 1, 1).is_err());
    let executor = ExecutorPolicy::new(1, 100, 50, 2).expect("executor");
    assert!(RuntimePolicy::new(executor, 1, 1, 1, 1, 1, 1, 1).is_err());
    let executor = ExecutorPolicy::new(1, 100, 50, 1).expect("executor");
    assert!(RuntimePolicy::new(executor, 1, 0, 1, 1, 1, 1, 1).is_err());
    assert!(RuntimePolicy::new(executor, 1, 1, 1, 1, 1, u64::MAX, 1).is_err());
}

#[test]
fn runtime_is_inert_until_explicit_start_and_factory_failure_disables_it() {
    let control = RuntimeControl::start::<TestBackend, _, _>(
        policy(),
        || Err("fixture database unavailable".to_string()),
        clock(),
    )
    .expect("control");
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Disabled
    });
    assert_eq!(snapshot.phase, StartupPhase::Disabled);
    assert!(snapshot
        .last_error
        .as_deref()
        .is_some_and(|error| error.contains("fixture database unavailable")));
    assert_eq!(control.wake(), WakeOutcome::Disabled);
    let stopped = control.shutdown().expect("shutdown");
    assert_eq!(stopped.status, SupervisorStatus::Disabled);
}

#[test]
fn backend_factory_panic_is_contained_as_a_disabled_runtime() {
    let control = RuntimeControl::start::<TestBackend, _, _>(
        policy(),
        || panic!("fixture backend factory panic"),
        clock(),
    )
    .expect("control");
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Disabled
    });
    assert!(snapshot
        .last_error
        .as_deref()
        .is_some_and(|error| error.contains("factory panicked")));
    assert!(matches!(
        control.shutdown().expect("shutdown"),
        ShutdownOutcome::Completed(_)
    ));
}

#[test]
fn database_and_timer_failures_disable_new_claiming() {
    let database_state = Arc::new((
        Mutex::new(BackendState {
            recovery_error: Some("fixture database failure".to_string()),
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(database_state);
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Disabled
    });
    assert!(snapshot
        .last_error
        .as_deref()
        .is_some_and(|error| error.contains("fixture database failure")));
    control.shutdown().expect("database failure shutdown");

    let timer_state = Arc::new((Mutex::new(BackendState::default()), Condvar::new()));
    let calls = Arc::new(AtomicU32::new(0));
    let timer_calls = Arc::clone(&calls);
    let control = RuntimeControl::start(
        policy(),
        move || Ok(TestBackend { state: timer_state }),
        move || {
            let call = timer_calls.fetch_add(1, Ordering::SeqCst);
            if call >= 1 {
                Err("fixture timer failure".to_string())
            } else {
                ExecutorTimestamp::from_millis(1_753_747_200_000).map_err(|error| error.to_string())
            }
        },
    )
    .expect("control");
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Disabled
    });
    assert!(snapshot
        .last_error
        .as_deref()
        .is_some_and(|error| error.contains("fixture timer failure")));
    control.shutdown().expect("timer failure shutdown");
}

#[test]
fn recovery_precedes_dispatch_and_more_pending_schedules_follow_up() {
    let state = Arc::new((
        Mutex::new(BackendState {
            recovery: vec![RecoveryBoundary::MorePending, RecoveryBoundary::Clean],
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(Arc::clone(&state));
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.completed_cycles >= 1
    });
    assert_eq!(snapshot.status, SupervisorStatus::Running);
    let events = state.0.lock().expect("state").events.clone();
    assert_eq!(&events[..3], &["recovery", "recovery", "dispatch"]);
    control.shutdown().expect("shutdown");
}

#[test]
fn unresolved_recovery_conflict_disables_claiming_with_bounded_identity() {
    let state = Arc::new((
        Mutex::new(BackendState {
            recovery: vec![RecoveryBoundary::Conflict {
                operation_id: Some("operation-fixture".to_string()),
            }],
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(Arc::clone(&state));
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Disabled
    });
    assert_eq!(state.0.lock().expect("state").dispatches, 0);
    assert!(snapshot
        .last_error
        .as_deref()
        .is_some_and(|error| error.contains("operation-fixture")));
    control.shutdown().expect("shutdown");
}

#[test]
fn duplicate_wakes_coalesce_and_sender_never_blocks() {
    let state = Arc::new((Mutex::new(BackendState::default()), Condvar::new()));
    let control = start_with_state(state);
    let _ = control.wake();
    let second = control.wake();
    assert!(matches!(
        second,
        WakeOutcome::Coalesced | WakeOutcome::Enqueued
    ));
    control.shutdown().expect("shutdown");
}

#[test]
fn capacity_saturation_schedules_bounded_follow_up_and_safety_recheck() {
    let state = Arc::new((
        Mutex::new(BackendState {
            saturated: true,
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(Arc::clone(&state));
    let _ = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.completed_cycles >= 2
    });
    assert!(state.0.lock().expect("state").dispatches >= 2);
    control.shutdown().expect("shutdown");
}

#[test]
fn active_claims_are_renewed_before_idempotent_shutdown_stops() {
    let state = Arc::new((
        Mutex::new(BackendState {
            active: 1,
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(Arc::clone(&state));
    let _ = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.completed_cycles >= 1
    });
    let stopped = control.shutdown().expect("shutdown");
    assert_eq!(stopped.status, SupervisorStatus::Stopped);
    let state = state.0.lock().expect("state");
    assert!(state.renewals >= 1);
    assert_eq!(state.stop_calls, 1);
    drop(state);
    let stopped_again = control.shutdown().expect("second shutdown");
    assert_eq!(stopped_again.status, SupervisorStatus::Stopped);
}

#[test]
fn renewal_continues_while_an_independent_worker_is_blocked() {
    let worker_gate = Arc::new((Mutex::new(false), Condvar::new()));
    let worker_gate_thread = Arc::clone(&worker_gate);
    let worker = thread::spawn(move || {
        let (released, changed) = &*worker_gate_thread;
        let mut released = released.lock().expect("worker gate");
        while !*released {
            released = changed.wait(released).expect("worker wait");
        }
    });
    let state = Arc::new((
        Mutex::new(BackendState {
            active: 1,
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(Arc::clone(&state));
    let _ = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.completed_cycles >= 1 && snapshot.active_claims == 1
    });
    assert!(state.0.lock().expect("state").renewals >= 1);
    {
        let (released, changed) = &*worker_gate;
        *released.lock().expect("worker gate") = true;
        changed.notify_all();
    }
    worker.join().expect("worker");
    state.0.lock().expect("state").active = 0;
    control.shutdown().expect("shutdown");
}

#[test]
fn renewal_ownership_loss_disables_further_claims() {
    let state = Arc::new((
        Mutex::new(BackendState {
            active: 1,
            renewal_lost_ownership: 1,
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(state);
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Disabled
    });
    assert!(snapshot
        .last_error
        .as_deref()
        .is_some_and(|error| error.contains("lost ownership")));
    control.shutdown().expect("shutdown");
}

#[test]
fn bounded_shutdown_preserves_active_durable_work_without_forcing_worker_exit() {
    let state = Arc::new((
        Mutex::new(BackendState {
            active: 1,
            retain_active_on_stop: true,
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(Arc::clone(&state));
    let _ = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.completed_cycles >= 1
    });
    let stopped = control.shutdown().expect("bounded shutdown");
    assert!(matches!(stopped, ShutdownOutcome::StillDraining(_)));
    assert_eq!(stopped.status, SupervisorStatus::ShuttingDown);
    assert_eq!(stopped.active_claims, 1);
    assert!(stopped.shutdown_timed_out);
    assert_eq!(state.0.lock().expect("state").stop_calls, 1);
    state.0.lock().expect("state").active = 0;
    let drained = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Stopped
    });
    assert_eq!(drained.active_claims, 0);
    assert!(matches!(
        control.shutdown().expect("completed shutdown"),
        ShutdownOutcome::Completed(_)
    ));
}

#[test]
fn worker_panic_report_disables_further_claims_without_process_panic() {
    let state = Arc::new((
        Mutex::new(BackendState {
            worker_panics: 1,
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(state);
    let snapshot = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.status == SupervisorStatus::Disabled
    });
    assert_eq!(snapshot.phase, StartupPhase::Disabled);
    control.shutdown().expect("shutdown");
}

#[test]
fn ordinary_worker_error_disables_the_supervisor_instead_of_being_discarded() {
    let temporary = RuntimeTestRoot::new();
    let database_path = temporary.path().join("worker-error.sqlite");
    let connection = Connection::open(&database_path).expect("database");
    schema::initialize_schema(&connection).expect("schema");
    let item =
        ValidatedSha256::new(format!("{:064x}", 81_u64)).expect("managed-media item identity");
    let locator =
        ValidatedSha256::new(format!("{:064x}", 82_u64)).expect("source locator identity");
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token,
               source_locator_kind, locator_hash, source_availability_state,
               lifecycle_state, created_at, updated_at
             ) VALUES (?1, 'video', 'worker-error-owner', 'primary_visual',
                       'primary_visual', 'external_file', ?2, 'available',
                       'active', ?3, ?3)",
            params![item.as_str(), locator.as_str(), "1753747200000"],
        )
        .expect("item");
    initialize_item_generation(&connection, &item, "1753747200000").expect("generation");
    queue_intent(
        &connection,
        &NewLifecycleIntent {
            intent_id: LifecycleIntentIdentity::new("worker-error-intent").expect("intent"),
            item_id: item,
            revision: ItemRevision::new(1).expect("revision"),
            action: LifecycleAction::Generate,
            expected_locator_hash: locator,
        },
        "1753747200000",
    )
    .expect("queue");
    drop(connection);

    let open_path = database_path.clone();
    let managed_root = ManagedMediaRoot::from_app_data_dir(temporary.path()).expect("managed root");
    let shared_clock = Arc::new(AtomicU64::new(1_753_747_200_000));
    let claim_clock = Arc::clone(&shared_clock);
    let supervisor_clock = Arc::clone(&shared_clock);
    let control = RuntimeControl::start(
        policy(),
        move || {
            Ok(InertSqliteRuntimeBackend::new(
                move || Connection::open(&open_path).map_err(|error| error.to_string()),
                managed_root,
                ManagedMediaProcessor::default(),
                move || Ok(claim_clock.fetch_add(1, Ordering::SeqCst).saturating_add(1)),
                || Ok("worker-error-claim".to_string()),
                |_claimed, _ownership_lost| Err("fixture ordinary worker failure".to_string()),
            ))
        },
        move || {
            ExecutorTimestamp::from_millis(
                supervisor_clock
                    .fetch_add(1, Ordering::SeqCst)
                    .saturating_add(1),
            )
            .map_err(|error| error.to_string())
        },
    )
    .expect("runtime");
    let snapshot = control.wait_for(Duration::from_secs(2), |snapshot| {
        snapshot
            .last_error
            .as_deref()
            .is_some_and(|error| error.contains("fixture ordinary worker failure"))
    });
    assert_eq!(snapshot.status, SupervisorStatus::Disabled);
    assert!(
        snapshot
            .last_error
            .as_deref()
            .is_some_and(|error| error.contains("fixture ordinary worker failure")),
        "unexpected runtime diagnostic: {:?}",
        snapshot.last_error
    );
    control.shutdown().expect("shutdown");
}

#[test]
fn concrete_inert_backend_bounds_workers_and_renews_registered_claims() {
    let temporary = RuntimeTestRoot::new();
    let database_path = temporary.path().join("runtime.sqlite");
    let connection = Connection::open(&database_path).expect("database");
    schema::initialize_schema(&connection).expect("schema");
    let item =
        ValidatedSha256::new(format!("{:064x}", 71_u64)).expect("managed-media item identity");
    let locator =
        ValidatedSha256::new(format!("{:064x}", 72_u64)).expect("source locator identity");
    connection
        .execute(
            "INSERT INTO managed_media_items (
               item_id, owner_kind, owner_id, slot_kind, slot_token,
               source_locator_kind, locator_hash, source_availability_state,
               lifecycle_state, created_at, updated_at
             ) VALUES (?1, 'video', 'runtime-owner', 'primary_visual',
                       'runtime-slot', 'external_file', ?2, 'available',
                       'active', ?3, ?3)",
            params![item.as_str(), locator.as_str(), "1753747200000"],
        )
        .expect("item");
    initialize_item_generation(&connection, &item, "1753747200000").expect("generation");
    queue_intent(
        &connection,
        &NewLifecycleIntent {
            intent_id: LifecycleIntentIdentity::new("runtime-intent").expect("intent"),
            item_id: item,
            revision: ItemRevision::new(1).expect("revision"),
            action: LifecycleAction::Generate,
            expected_locator_hash: locator,
        },
        "1753747200000",
    )
    .expect("queue");
    drop(connection);

    let worker_gate = Arc::new((Mutex::new(false), Condvar::new()));
    let runner_gate = Arc::clone(&worker_gate);
    let open_path = database_path.clone();
    let managed_root = ManagedMediaRoot::from_app_data_dir(temporary.path()).expect("managed root");
    let mut backend = InertSqliteRuntimeBackend::new(
        move || Connection::open(&open_path).map_err(|error| error.to_string()),
        managed_root,
        ManagedMediaProcessor::default(),
        || Ok(1_753_747_200_010_u64),
        || Ok("runtime-claim-token".to_string()),
        move |_claimed, ownership_lost| {
            let (released, changed) = &*runner_gate;
            let mut released = released.lock().expect("worker gate");
            while !*released && !ownership_lost.load(Ordering::Acquire) {
                let (next, _) = changed
                    .wait_timeout(released, Duration::from_millis(10))
                    .expect("worker wait");
                released = next;
            }
            Ok(())
        },
    );
    let dispatch = backend
        .dispatch_lifecycle(policy().executor(), 1)
        .expect("dispatch");
    assert_eq!(dispatch.claimed, 1);
    assert_eq!(dispatch.active_claims, 1);
    assert!(dispatch.capacity_saturated);
    let renewal = backend
        .renew_active_claims(
            &ExecutorTimestamp::from_millis(1_753_747_200_100).expect("renewal time"),
            FIXTURE_LEASE_MILLIS,
        )
        .expect("renewal");
    assert_eq!(renewal.active_claims, 1);
    assert_eq!(renewal.lost_ownership, 0);
    {
        let (released, changed) = &*worker_gate;
        *released.lock().expect("worker gate") = true;
        changed.notify_all();
    }
    for _ in 0..100 {
        if backend.active_claim_count().expect("active count") == 0 {
            break;
        }
        thread::sleep(Duration::from_millis(5));
    }
    assert_eq!(backend.active_claim_count().expect("final active count"), 0);
}

#[test]
fn bounded_diagnostics_preserve_utf8_boundaries() {
    let diagnostic = bounded_error("fixture", "é".repeat(400));
    assert!(diagnostic.len() <= 512);
    assert!(diagnostic.is_char_boundary(diagnostic.len()));
    assert!(diagnostic.starts_with("fixture: "));
}

#[test]
fn drop_signals_shutdown_without_waiting_for_active_work() {
    let state = Arc::new((
        Mutex::new(BackendState {
            active: 1,
            retain_active_on_stop: true,
            ..BackendState::default()
        }),
        Condvar::new(),
    ));
    let control = start_with_state(Arc::clone(&state));
    let _ = control.wait_for(Duration::from_secs(1), |snapshot| {
        snapshot.completed_cycles >= 1
    });
    let started = Instant::now();
    drop(control);
    assert!(started.elapsed() < Duration::from_millis(50));
    state.0.lock().expect("state").active = 0;
    state.1.notify_all();
    thread::sleep(Duration::from_millis(FIXTURE_RENEWAL_MILLIS + 20));
}
