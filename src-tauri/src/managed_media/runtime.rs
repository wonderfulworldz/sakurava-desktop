use std::{
    collections::BTreeMap,
    fmt,
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError},
        Arc, Condvar, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use rusqlite::Connection;

use super::{
    executor::{claim_bounded_with_automatic_actions, ExecutorError, ExecutorPolicy},
    lifecycle::{
        earliest_eligible_due_time_with_automatic_actions, renew_claim, ClaimRenewalOutcome,
        ClaimedIntentSnapshot, ExecutorTimestamp,
    },
    path::ManagedMediaRoot,
    processor::ManagedMediaProcessor,
    recovery::{recover, RecoveryScope},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimePolicy {
    executor: ExecutorPolicy,
    worker_capacity: u32,
    publication_recovery_limit: u32,
    wake_capacity: usize,
    safety_recheck_millis: u64,
    bounded_continuation_millis: u64,
    shutdown_deadline_millis: u64,
    panic_disable_threshold: u32,
}

impl RuntimePolicy {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        executor: ExecutorPolicy,
        worker_capacity: u32,
        publication_recovery_limit: u32,
        wake_capacity: usize,
        safety_recheck_millis: u64,
        bounded_continuation_millis: u64,
        shutdown_deadline_millis: u64,
        panic_disable_threshold: u32,
    ) -> Result<Self, RuntimeError> {
        if worker_capacity == 0
            || publication_recovery_limit == 0
            || wake_capacity == 0
            || safety_recheck_millis == 0
            || bounded_continuation_millis == 0
            || shutdown_deadline_millis == 0
            || panic_disable_threshold == 0
            || executor.claim_capacity() > worker_capacity
            || executor.claim_renewal_millis() >= executor.claim_lease_millis()
            || executor.claim_lease_millis() > i64::MAX as u64
            || executor.claim_renewal_millis() > i64::MAX as u64
            || safety_recheck_millis > i64::MAX as u64
            || bounded_continuation_millis > i64::MAX as u64
            || shutdown_deadline_millis > i64::MAX as u64
            || Instant::now()
                .checked_add(Duration::from_millis(safety_recheck_millis))
                .is_none()
            || Instant::now()
                .checked_add(Duration::from_millis(bounded_continuation_millis))
                .is_none()
            || Instant::now()
                .checked_add(Duration::from_millis(shutdown_deadline_millis))
                .is_none()
        {
            return Err(RuntimeError::InvalidPolicy);
        }
        Ok(Self {
            executor,
            worker_capacity,
            publication_recovery_limit,
            wake_capacity,
            safety_recheck_millis,
            bounded_continuation_millis,
            shutdown_deadline_millis,
            panic_disable_threshold,
        })
    }

    pub const fn executor(self) -> ExecutorPolicy {
        self.executor
    }

    pub const fn worker_capacity(self) -> u32 {
        self.worker_capacity
    }

    pub const fn publication_recovery_limit(self) -> u32 {
        self.publication_recovery_limit
    }

    pub const fn wake_capacity(self) -> usize {
        self.wake_capacity
    }

    pub const fn safety_recheck_millis(self) -> u64 {
        self.safety_recheck_millis
    }

    pub const fn bounded_continuation_millis(self) -> u64 {
        self.bounded_continuation_millis
    }

    pub const fn shutdown_deadline_millis(self) -> u64 {
        self.shutdown_deadline_millis
    }

    pub const fn panic_disable_threshold(self) -> u32 {
        self.panic_disable_threshold
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupervisorStatus {
    Inert,
    Starting,
    Running,
    Disabled,
    ShuttingDown,
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupPhase {
    Inert,
    PublicationRecovery,
    Lifecycle,
    Disabled,
    Shutdown,
    Stopped,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeSnapshot {
    pub status: SupervisorStatus,
    pub phase: StartupPhase,
    pub next_due: Option<ExecutorTimestamp>,
    pub completed_cycles: u64,
    pub active_claims: u32,
    pub shutdown_timed_out: bool,
    pub last_error: Option<String>,
}

impl RuntimeSnapshot {
    fn inert() -> Self {
        Self {
            status: SupervisorStatus::Inert,
            phase: StartupPhase::Inert,
            next_due: None,
            completed_cycles: 0,
            active_claims: 0,
            shutdown_timed_out: false,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryBoundary {
    Clean,
    MorePending,
    Conflict { operation_id: Option<String> },
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DispatchReport {
    pub claimed: u32,
    pub active_claims: u32,
    pub capacity_saturated: bool,
    pub worker_panics: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RenewalReport {
    pub active_claims: u32,
    pub lost_ownership: u32,
}

pub trait RuntimeBackend: Send + 'static {
    fn recover_publication(&mut self, maximum_operations: u32) -> Result<RecoveryBoundary, String>;

    /// Dispatches only bounded owned work. Implementations must return without
    /// waiting for blocking source, processor, or publication work.
    fn dispatch_lifecycle(
        &mut self,
        executor: ExecutorPolicy,
        worker_capacity: u32,
    ) -> Result<DispatchReport, String>;

    /// Renews active claims through deliberately short database boundaries.
    fn renew_active_claims(
        &mut self,
        now: &ExecutorTimestamp,
        lease_millis: u64,
    ) -> Result<RenewalReport, String>;

    /// Returns the earliest durable eligible time without claiming work.
    fn earliest_due(
        &mut self,
        now: &ExecutorTimestamp,
    ) -> Result<Option<ExecutorTimestamp>, String>;

    fn stop_new_claims(&mut self);
    fn active_claim_count(&mut self) -> Result<u32, String>;
}

pub trait RuntimeClock: Send + 'static {
    fn now(&mut self) -> Result<ExecutorTimestamp, String>;
}

type ConnectionFactory = Arc<dyn Fn() -> Result<Connection, String> + Send + Sync>;
type WorkerRunner =
    Arc<dyn Fn(ClaimedIntentSnapshot, Arc<AtomicBool>) -> Result<(), String> + Send + Sync>;

struct ActiveClaim {
    claimed: ClaimedIntentSnapshot,
    ownership_lost: Arc<AtomicBool>,
}

struct WorkerSlot {
    key: String,
    join: JoinHandle<Result<(), String>>,
}

/// A concrete, dependency-injected SQLite backend for the inert runtime.
///
/// Constructing this value does not register or start a runtime. The injected
/// connection factory is invoked only inside the supervisor thread, and the
/// worker runner owns all data it receives.
pub struct InertSqliteRuntimeBackend {
    connection_factory: ConnectionFactory,
    managed_root: ManagedMediaRoot,
    processor: ManagedMediaProcessor,
    claim_clock: Box<dyn FnMut() -> Result<u64, String> + Send>,
    claim_token: Box<dyn FnMut() -> Result<String, String> + Send>,
    worker_runner: WorkerRunner,
    active: BTreeMap<String, ActiveClaim>,
    workers: Vec<WorkerSlot>,
    accepting_claims: bool,
    automatic_actions_allowed: Arc<AtomicBool>,
    worker_sequence: u64,
}

impl InertSqliteRuntimeBackend {
    pub fn new<CF, CC, TG, WR>(
        connection_factory: CF,
        managed_root: ManagedMediaRoot,
        processor: ManagedMediaProcessor,
        claim_clock: CC,
        claim_token: TG,
        worker_runner: WR,
    ) -> Self
    where
        CF: Fn() -> Result<Connection, String> + Send + Sync + 'static,
        CC: FnMut() -> Result<u64, String> + Send + 'static,
        TG: FnMut() -> Result<String, String> + Send + 'static,
        WR: Fn(ClaimedIntentSnapshot, Arc<AtomicBool>) -> Result<(), String>
            + Send
            + Sync
            + 'static,
    {
        Self::new_with_automatic_actions(
            connection_factory,
            managed_root,
            processor,
            claim_clock,
            claim_token,
            worker_runner,
            Arc::new(AtomicBool::new(true)),
        )
    }

    pub fn new_with_automatic_actions<CF, CC, TG, WR>(
        connection_factory: CF,
        managed_root: ManagedMediaRoot,
        processor: ManagedMediaProcessor,
        claim_clock: CC,
        claim_token: TG,
        worker_runner: WR,
        automatic_actions_allowed: Arc<AtomicBool>,
    ) -> Self
    where
        CF: Fn() -> Result<Connection, String> + Send + Sync + 'static,
        CC: FnMut() -> Result<u64, String> + Send + 'static,
        TG: FnMut() -> Result<String, String> + Send + 'static,
        WR: Fn(ClaimedIntentSnapshot, Arc<AtomicBool>) -> Result<(), String>
            + Send
            + Sync
            + 'static,
    {
        Self {
            connection_factory: Arc::new(connection_factory),
            managed_root,
            processor,
            claim_clock: Box::new(claim_clock),
            claim_token: Box::new(claim_token),
            worker_runner: Arc::new(worker_runner),
            active: BTreeMap::new(),
            workers: Vec::new(),
            accepting_claims: true,
            automatic_actions_allowed,
            worker_sequence: 0,
        }
    }

    fn open_connection(&self) -> Result<Connection, String> {
        (self.connection_factory)()
    }

    fn reap_finished_workers(&mut self) -> Result<u32, String> {
        let mut panics = 0_u32;
        let mut first_failure = None;
        let mut index = 0;
        while index < self.workers.len() {
            if !self.workers[index].join.is_finished() {
                index += 1;
                continue;
            }
            let worker = self.workers.remove(index);
            self.active.remove(&worker.key);
            match worker.join.join() {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    if first_failure.is_none() {
                        first_failure = Some(bounded_error("managed-media worker", error));
                    }
                }
                Err(_) => panics = panics.saturating_add(1),
            }
        }
        match first_failure {
            Some(error) => Err(error),
            None => Ok(panics),
        }
    }

    fn active_key(claimed: &ClaimedIntentSnapshot) -> String {
        format!(
            "{}|{}",
            claimed.intent_id.as_str(),
            claimed.claim_token.as_str()
        )
    }
}

impl RuntimeBackend for InertSqliteRuntimeBackend {
    fn recover_publication(&mut self, maximum_operations: u32) -> Result<RecoveryBoundary, String> {
        // Publication journals owned by this process can be observed between
        // staging and activation while their lifecycle worker is still active.
        // Startup recovery remains enabled because a fresh backend has no
        // in-process claims; active work is reaped/renewed later in the cycle.
        if !self.active.is_empty() {
            return Ok(RecoveryBoundary::Clean);
        }
        let connection = self.open_connection()?;
        match recover(
            &connection,
            &self.managed_root,
            &self.processor,
            RecoveryScope::BoundedNonterminal { maximum_operations },
        ) {
            Ok(outcomes) if outcomes.len() == maximum_operations as usize => {
                Ok(RecoveryBoundary::MorePending)
            }
            Ok(_) => Ok(RecoveryBoundary::Clean),
            Err(error) => Err(error.to_string()),
        }
    }

    fn dispatch_lifecycle(
        &mut self,
        executor: ExecutorPolicy,
        worker_capacity: u32,
    ) -> Result<DispatchReport, String> {
        let worker_panics = self.reap_finished_workers()?;
        if !self.accepting_claims {
            return Ok(DispatchReport {
                active_claims: self.active.len() as u32,
                worker_panics,
                ..DispatchReport::default()
            });
        }
        let available = worker_capacity.saturating_sub(self.workers.len() as u32);
        if available == 0 {
            return Ok(DispatchReport {
                active_claims: self.active.len() as u32,
                capacity_saturated: true,
                worker_panics,
                ..DispatchReport::default()
            });
        }
        let cycle_policy = ExecutorPolicy::new(
            executor.discovery_limit(),
            executor.claim_lease_millis(),
            executor.claim_renewal_millis(),
            executor.claim_capacity().min(available),
        )
        .map_err(|error| error.to_string())?;
        let connection = self.open_connection()?;
        let batch = claim_bounded_with_automatic_actions(
            &connection,
            cycle_policy,
            &mut self.claim_clock,
            &mut self.claim_token,
            self.automatic_actions_allowed.load(Ordering::Acquire),
        )
        .map_err(|error| error.to_string())?;
        let claimed_count = batch.claims.len() as u32;
        for claimed in batch.claims {
            let key = Self::active_key(&claimed);
            let ownership_lost = Arc::new(AtomicBool::new(false));
            self.active.insert(
                key.clone(),
                ActiveClaim {
                    claimed: claimed.clone(),
                    ownership_lost: Arc::clone(&ownership_lost),
                },
            );
            let runner = Arc::clone(&self.worker_runner);
            self.worker_sequence = self.worker_sequence.saturating_add(1);
            let join = thread::Builder::new()
                .name(format!(
                    "sakurava-managed-media-worker-{}",
                    self.worker_sequence
                ))
                .spawn(move || runner(claimed, ownership_lost))
                .map_err(|error| {
                    self.active.remove(&key);
                    error.to_string()
                })?;
            self.workers.push(WorkerSlot { key, join });
        }
        Ok(DispatchReport {
            claimed: claimed_count,
            active_claims: self.active.len() as u32,
            capacity_saturated: self.workers.len() as u32 >= worker_capacity,
            worker_panics,
        })
    }

    fn renew_active_claims(
        &mut self,
        now: &ExecutorTimestamp,
        lease_millis: u64,
    ) -> Result<RenewalReport, String> {
        let _ = self.reap_finished_workers()?;
        let connection = self.open_connection()?;
        let mut lost = Vec::new();
        for (key, active) in &mut self.active {
            let expires_at = now
                .checked_add_millis(lease_millis)
                .map_err(|error| error.to_string())?;
            let outcome = renew_claim(&connection, &mut active.claimed, now, &expires_at)
                .map_err(|error| error.to_string())?;
            match outcome {
                ClaimRenewalOutcome::Renewed
                | ClaimRenewalOutcome::Settled
                | ClaimRenewalOutcome::Cancelled
                | ClaimRenewalOutcome::StaleRevision
                | ClaimRenewalOutcome::Superseded
                | ClaimRenewalOutcome::Retired => {}
                ClaimRenewalOutcome::LostOwnership
                | ClaimRenewalOutcome::Expired
                | ClaimRenewalOutcome::InvalidState => {
                    active.ownership_lost.store(true, Ordering::Release);
                    lost.push(key.clone());
                }
            }
        }
        let lost_ownership = lost.len() as u32;
        for key in lost {
            self.active.remove(&key);
        }
        Ok(RenewalReport {
            active_claims: self.active.len() as u32,
            lost_ownership,
        })
    }

    fn earliest_due(
        &mut self,
        now: &ExecutorTimestamp,
    ) -> Result<Option<ExecutorTimestamp>, String> {
        let connection = self.open_connection()?;
        earliest_eligible_due_time_with_automatic_actions(
            &connection,
            now,
            self.automatic_actions_allowed.load(Ordering::Acquire),
        )
        .map_err(|error| error.to_string())
    }

    fn stop_new_claims(&mut self) {
        self.accepting_claims = false;
    }

    fn active_claim_count(&mut self) -> Result<u32, String> {
        let _ = self.reap_finished_workers()?;
        Ok(self.active.len() as u32)
    }
}

impl<F> RuntimeClock for F
where
    F: FnMut() -> Result<ExecutorTimestamp, String> + Send + 'static,
{
    fn now(&mut self) -> Result<ExecutorTimestamp, String> {
        self()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WakeOutcome {
    Enqueued,
    Coalesced,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShutdownOutcome {
    Completed(RuntimeSnapshot),
    StillDraining(RuntimeSnapshot),
}

impl ShutdownOutcome {
    pub fn snapshot(&self) -> &RuntimeSnapshot {
        match self {
            Self::Completed(snapshot) | Self::StillDraining(snapshot) => snapshot,
        }
    }
}

impl std::ops::Deref for ShutdownOutcome {
    type Target = RuntimeSnapshot;

    fn deref(&self) -> &Self::Target {
        self.snapshot()
    }
}

#[derive(Debug)]
pub enum RuntimeError {
    InvalidPolicy,
    ThreadStart(String),
    ShutdownJoin,
}

impl fmt::Display for RuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPolicy => formatter.write_str("The injected runtime policy is invalid."),
            Self::ThreadStart(_) => {
                formatter.write_str("The managed-media supervisor could not start.")
            }
            Self::ShutdownJoin => {
                formatter.write_str("The managed-media supervisor could not join.")
            }
        }
    }
}

impl std::error::Error for RuntimeError {}

impl From<ExecutorError> for RuntimeError {
    fn from(_: ExecutorError) -> Self {
        Self::InvalidPolicy
    }
}

enum Signal {
    Wake,
    Shutdown,
}

struct SharedRuntimeState {
    snapshot: Mutex<RuntimeSnapshot>,
    changed: Condvar,
}

impl SharedRuntimeState {
    fn new() -> Self {
        Self {
            snapshot: Mutex::new(RuntimeSnapshot::inert()),
            changed: Condvar::new(),
        }
    }

    fn update(&self, update: impl FnOnce(&mut RuntimeSnapshot)) {
        let mut snapshot = self
            .snapshot
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        update(&mut snapshot);
        self.changed.notify_all();
    }

    fn snapshot(&self) -> RuntimeSnapshot {
        self.snapshot
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }
}

pub struct RuntimeControl {
    sender: SyncSender<Signal>,
    wake_pending: Arc<AtomicBool>,
    shutdown_requested: Arc<AtomicBool>,
    shared: Arc<SharedRuntimeState>,
    join: Mutex<Option<JoinHandle<()>>>,
    shutdown_deadline_millis: u64,
}

impl RuntimeControl {
    pub fn start<B, F, C>(
        policy: RuntimePolicy,
        backend_factory: F,
        clock: C,
    ) -> Result<Self, RuntimeError>
    where
        B: RuntimeBackend,
        F: FnOnce() -> Result<B, String> + Send + 'static,
        C: RuntimeClock,
    {
        let (sender, receiver) = mpsc::sync_channel(policy.wake_capacity());
        let wake_pending = Arc::new(AtomicBool::new(true));
        let shutdown_requested = Arc::new(AtomicBool::new(false));
        let shared = Arc::new(SharedRuntimeState::new());
        shared.update(|snapshot| {
            snapshot.status = SupervisorStatus::Starting;
            snapshot.phase = StartupPhase::PublicationRecovery;
        });

        let thread_wake_pending = Arc::clone(&wake_pending);
        let thread_shutdown = Arc::clone(&shutdown_requested);
        let thread_shared = Arc::clone(&shared);
        let join = thread::Builder::new()
            .name("sakurava-managed-media-supervisor".to_string())
            .spawn(move || {
                let backend = catch_unwind(AssertUnwindSafe(backend_factory));
                match backend {
                    Ok(Ok(backend)) => {
                        let panic_shared = Arc::clone(&thread_shared);
                        if catch_unwind(AssertUnwindSafe(|| {
                            supervisor_loop(
                                policy,
                                backend,
                                clock,
                                receiver,
                                thread_wake_pending,
                                thread_shutdown,
                                thread_shared,
                            )
                        }))
                        .is_err()
                        {
                            disable_runtime(
                                &panic_shared,
                                "managed-media supervisor panicked".to_string(),
                            );
                        }
                    }
                    Ok(Err(error)) => disable_runtime(&thread_shared, error),
                    Err(_) => disable_runtime(
                        &thread_shared,
                        "managed-media backend factory panicked".to_string(),
                    ),
                }
            })
            .map_err(|error| RuntimeError::ThreadStart(error.to_string()))?;

        Ok(Self {
            sender,
            wake_pending,
            shutdown_requested,
            shared,
            join: Mutex::new(Some(join)),
            shutdown_deadline_millis: policy.shutdown_deadline_millis(),
        })
    }

    pub fn wake(&self) -> WakeOutcome {
        if self.shutdown_requested.load(Ordering::Acquire)
            || matches!(
                self.snapshot().status,
                SupervisorStatus::Disabled
                    | SupervisorStatus::ShuttingDown
                    | SupervisorStatus::Stopped
            )
        {
            return WakeOutcome::Disabled;
        }
        if self.wake_pending.swap(true, Ordering::AcqRel) {
            return WakeOutcome::Coalesced;
        }
        match self.sender.try_send(Signal::Wake) {
            Ok(()) => WakeOutcome::Enqueued,
            Err(TrySendError::Full(_)) => WakeOutcome::Coalesced,
            Err(TrySendError::Disconnected(_)) => {
                self.shared
                    .update(|snapshot| set_disabled(snapshot, "wake channel disconnected"));
                WakeOutcome::Disabled
            }
        }
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        self.shared.snapshot()
    }

    pub fn shutdown(&self) -> Result<ShutdownOutcome, RuntimeError> {
        if !self.shutdown_requested.swap(true, Ordering::AcqRel) {
            let _ = self.sender.try_send(Signal::Shutdown);
        }
        let deadline = Instant::now() + Duration::from_millis(self.shutdown_deadline_millis);
        let mut snapshot = self
            .shared
            .snapshot
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        while !matches!(
            snapshot.status,
            SupervisorStatus::Stopped | SupervisorStatus::Disabled
        ) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                snapshot.shutdown_timed_out = true;
                let result = snapshot.clone();
                drop(snapshot);
                return Ok(ShutdownOutcome::StillDraining(result));
            }
            let (next, _) = self
                .shared
                .changed
                .wait_timeout(snapshot, remaining)
                .unwrap_or_else(|error| error.into_inner());
            snapshot = next;
        }
        let result = snapshot.clone();
        drop(snapshot);
        self.join_if_finished()?;
        Ok(ShutdownOutcome::Completed(result))
    }

    fn join_if_finished(&self) -> Result<(), RuntimeError> {
        let mut join = self.join.lock().unwrap_or_else(|error| error.into_inner());
        if join.as_ref().is_some_and(JoinHandle::is_finished) {
            join.take()
                .expect("finished runtime thread")
                .join()
                .map_err(|_| RuntimeError::ShutdownJoin)?;
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn wait_for(
        &self,
        timeout: Duration,
        predicate: impl Fn(&RuntimeSnapshot) -> bool,
    ) -> RuntimeSnapshot {
        let deadline = Instant::now() + timeout;
        let mut snapshot = self
            .shared
            .snapshot
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        while !predicate(&snapshot) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            let (next, _) = self
                .shared
                .changed
                .wait_timeout(snapshot, remaining)
                .unwrap_or_else(|error| error.into_inner());
            snapshot = next;
        }
        snapshot.clone()
    }
}

impl Drop for RuntimeControl {
    fn drop(&mut self) {
        self.shutdown_requested.store(true, Ordering::Release);
        let _ = self.sender.try_send(Signal::Shutdown);
        let join = self
            .join
            .get_mut()
            .unwrap_or_else(|error| error.into_inner());
        if join.as_ref().is_some_and(JoinHandle::is_finished) {
            if let Some(join) = join.take() {
                let _ = join.join();
            }
        } else {
            let _ = join.take();
        }
    }
}

fn supervisor_loop<B: RuntimeBackend, C: RuntimeClock>(
    policy: RuntimePolicy,
    mut backend: B,
    mut clock: C,
    receiver: Receiver<Signal>,
    wake_pending: Arc<AtomicBool>,
    shutdown_requested: Arc<AtomicBool>,
    shared: Arc<SharedRuntimeState>,
) {
    shared.update(|snapshot| {
        snapshot.status = SupervisorStatus::Running;
        snapshot.phase = StartupPhase::PublicationRecovery;
    });
    let mut panic_count = 0_u32;
    let mut next_due = None;
    loop {
        if shutdown_requested.load(Ordering::Acquire) {
            if shared.snapshot().status != SupervisorStatus::ShuttingDown {
                backend.stop_new_claims();
                shared.update(|snapshot| {
                    snapshot.status = SupervisorStatus::ShuttingDown;
                    snapshot.phase = StartupPhase::Shutdown;
                });
            }
            let now = match clock.now() {
                Ok(now) => now,
                Err(error) => {
                    disable_runtime(&shared, bounded_error("shutdown clock", error));
                    return;
                }
            };
            let renewal = backend.renew_active_claims(&now, policy.executor().claim_lease_millis());
            let active = match renewal {
                Ok(report) => report.active_claims,
                Err(error) => {
                    disable_runtime(&shared, bounded_error("shutdown claim renewal", error));
                    return;
                }
            };
            shared.update(|snapshot| snapshot.active_claims = active);
            if active == 0 {
                shared.update(|snapshot| {
                    snapshot.status = SupervisorStatus::Stopped;
                    snapshot.phase = StartupPhase::Stopped;
                    snapshot.active_claims = 0;
                });
                return;
            }
        } else if wake_pending.swap(false, Ordering::AcqRel) {
            let cycle = catch_unwind(AssertUnwindSafe(|| {
                run_supervisor_cycle(&mut backend, &mut clock, policy, &shared)
            }));
            match cycle {
                Ok(Ok(outcome)) => {
                    panic_count = panic_count.saturating_add(outcome.worker_panics);
                    if panic_count >= policy.panic_disable_threshold() {
                        disable_runtime(&shared, "worker panic threshold reached".to_string());
                        return;
                    }
                    if outcome.follow_up {
                        wake_pending.store(true, Ordering::Release);
                    }
                    next_due = outcome.next_due;
                }
                Ok(Err(error)) => {
                    disable_runtime(&shared, error);
                    return;
                }
                Err(_) => {
                    panic_count = panic_count.saturating_add(1);
                    if panic_count >= policy.panic_disable_threshold() {
                        disable_runtime(&shared, "supervisor operation panicked".to_string());
                        return;
                    }
                    wake_pending.store(true, Ordering::Release);
                }
            }
        }

        let active_claims = shared.snapshot().active_claims;
        let wait = match next_wait_duration(policy, &mut clock, next_due.as_ref(), active_claims) {
            Ok(wait) => wait,
            Err(error) => {
                disable_runtime(&shared, bounded_error("timer clock", error));
                return;
            }
        };
        match receiver.recv_timeout(wait) {
            Ok(Signal::Wake) => {
                wake_pending.store(true, Ordering::Release);
            }
            Ok(Signal::Shutdown) => {
                shutdown_requested.store(true, Ordering::Release);
            }
            Err(RecvTimeoutError::Timeout) => {
                wake_pending.store(true, Ordering::Release);
            }
            Err(RecvTimeoutError::Disconnected) => {
                disable_runtime(&shared, "wake channel disconnected".to_string());
                return;
            }
        }
        while let Ok(signal) = receiver.try_recv() {
            match signal {
                Signal::Wake => wake_pending.store(true, Ordering::Release),
                Signal::Shutdown => shutdown_requested.store(true, Ordering::Release),
            }
        }
    }
}

struct CycleOutcome {
    next_due: Option<ExecutorTimestamp>,
    follow_up: bool,
    worker_panics: u32,
}

fn run_supervisor_cycle(
    backend: &mut impl RuntimeBackend,
    clock: &mut impl RuntimeClock,
    policy: RuntimePolicy,
    shared: &SharedRuntimeState,
) -> Result<CycleOutcome, String> {
    shared.update(|snapshot| snapshot.phase = StartupPhase::PublicationRecovery);
    let recovery = backend
        .recover_publication(policy.publication_recovery_limit())
        .map_err(|error| bounded_error("publication recovery", error))?;
    match recovery {
        RecoveryBoundary::Conflict { operation_id } => {
            let identity = operation_id.unwrap_or_else(|| "unknown operation".to_string());
            return Err(bounded_error("publication recovery conflict", identity));
        }
        RecoveryBoundary::MorePending => {
            return Ok(CycleOutcome {
                next_due: None,
                follow_up: true,
                worker_panics: 0,
            });
        }
        RecoveryBoundary::Clean => {}
    }

    shared.update(|snapshot| snapshot.phase = StartupPhase::Lifecycle);
    let now = clock
        .now()
        .map_err(|error| bounded_error("runtime clock", error))?;
    let renewal = backend
        .renew_active_claims(&now, policy.executor().claim_lease_millis())
        .map_err(|error| bounded_error("claim renewal", error))?;
    if renewal.lost_ownership > 0 {
        return Err("claim renewal lost ownership".to_string());
    }
    let dispatch = backend
        .dispatch_lifecycle(policy.executor(), policy.worker_capacity())
        .map_err(|error| bounded_error("lifecycle dispatch", error))?;
    let next_due = backend
        .earliest_due(&now)
        .map_err(|error| bounded_error("earliest due lookup", error))?;
    shared.update(|snapshot| {
        snapshot.completed_cycles = snapshot.completed_cycles.saturating_add(1);
        snapshot.active_claims = renewal.active_claims.max(dispatch.active_claims);
        snapshot.next_due = next_due.clone();
    });
    Ok(CycleOutcome {
        next_due,
        follow_up: dispatch.capacity_saturated,
        worker_panics: dispatch.worker_panics,
    })
}

fn next_wait_duration(
    policy: RuntimePolicy,
    clock: &mut impl RuntimeClock,
    next_due: Option<&ExecutorTimestamp>,
    active_claims: u32,
) -> Result<Duration, String> {
    let safety = policy.safety_recheck_millis();
    let now = clock.now()?;
    let delay = match next_due {
        Some(due) if due > &now => due.as_millis().saturating_sub(now.as_millis()),
        Some(_) => policy.bounded_continuation_millis(),
        None => safety,
    };
    let renewal = if active_claims > 0 {
        policy.executor().claim_renewal_millis()
    } else {
        safety
    };
    Ok(Duration::from_millis(delay.min(safety).min(renewal)))
}

fn disable_runtime(shared: &SharedRuntimeState, error: String) {
    shared.update(|snapshot| set_disabled(snapshot, &error));
}

fn set_disabled(snapshot: &mut RuntimeSnapshot, error: &str) {
    snapshot.status = SupervisorStatus::Disabled;
    snapshot.phase = StartupPhase::Disabled;
    snapshot.last_error = Some(bounded_error("runtime disabled", error));
}

pub(crate) fn bounded_error(context: &str, error: impl AsRef<str>) -> String {
    let mut message = format!("{context}: {}", error.as_ref());
    const MAX_DIAGNOSTIC_BYTES: usize = 512;
    if message.len() > MAX_DIAGNOSTIC_BYTES {
        let mut boundary = MAX_DIAGNOSTIC_BYTES;
        while !message.is_char_boundary(boundary) {
            boundary -= 1;
        }
        message.truncate(boundary);
    }
    message
}
