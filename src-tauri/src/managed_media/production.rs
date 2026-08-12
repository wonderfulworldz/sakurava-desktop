use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::Connection;

use crate::database::RuntimeDatabase;

use super::{
    acquisition::{
        AcquisitionPolicy, FailureDisposition, LocalGenerationOrchestrator, OrchestrationFailure,
    },
    catalog_lifecycle::{resolve_claimed_source_locator, SqliteOwnerSourceProvider},
    executor::ExecutorPolicy,
    identity::SourceLocatorKind,
    lifecycle::{ClaimedIntentSnapshot, ExecutorTimestamp, LifecycleAction},
    path::ManagedMediaRoot,
    processor::ManagedMediaProcessor,
    runtime::{
        InertSqliteRuntimeBackend, RuntimeControl, RuntimeError, RuntimePolicy, RuntimeSnapshot,
        ShutdownOutcome, WakeOutcome,
    },
};

pub(crate) const DISCOVERY_LIMIT: u32 = 1;
pub(crate) const CLAIM_LEASE_MILLIS: u64 = 300_000;
pub(crate) const CLAIM_RENEWAL_MILLIS: u64 = 30_000;
pub(crate) const CLAIM_CAPACITY: u32 = 1;
pub(crate) const WORKER_CAPACITY: u32 = 1;
pub(crate) const PUBLICATION_RECOVERY_LIMIT: u32 = 4;
pub(crate) const WAKE_CAPACITY: usize = 1;
pub(crate) const SAFETY_RECHECK_MILLIS: u64 = 30_000;
pub(crate) const BOUNDED_CONTINUATION_MILLIS: u64 = 250;
pub(crate) const SHUTDOWN_DEADLINE_MILLIS: u64 = 2_000;
pub(crate) const PANIC_DISABLE_THRESHOLD: u32 = 1;
pub(crate) const MAXIMUM_SOURCE_BYTES: u64 = 268_435_456;
pub(crate) const READ_CHUNK_BYTES: usize = 262_144;

const RETRY_ONE_MILLIS: u64 = 60_000;
const RETRY_TWO_MILLIS: u64 = 5 * 60_000;
const RETRY_THREE_MILLIS: u64 = 30 * 60_000;
const SQLITE_BUSY_TIMEOUT_MILLIS: u64 = 5_000;

pub struct ProductionManagedMediaRuntime {
    control: RuntimeControl,
}

impl ProductionManagedMediaRuntime {
    pub fn start(database: &RuntimeDatabase) -> Result<Self, String> {
        let policy = production_runtime_policy()?;
        let database_path = database.paths.database_file.clone();
        let managed_root = ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir)?;
        let backend_database_path = database_path.clone();
        let worker_database_path = database_path;
        let backend_root = managed_root.clone();
        let worker_root = managed_root;
        let backend_processor = ManagedMediaProcessor::default();
        let worker_processor = backend_processor.clone();

        let control = RuntimeControl::start(
            policy,
            move || {
                let connection_path = backend_database_path.clone();
                let job_database_path = worker_database_path.clone();
                let job_root = worker_root.clone();
                let job_processor = worker_processor.clone();
                let mut claim_sequence = 0_u64;
                Ok(InertSqliteRuntimeBackend::new(
                    move || open_managed_media_connection(&connection_path),
                    backend_root,
                    backend_processor,
                    current_epoch_millis,
                    move || {
                        claim_sequence = claim_sequence.saturating_add(1);
                        let nanos = current_epoch_nanos()?;
                        Ok(format!(
                            "managed-runtime-{}-{nanos}-{claim_sequence}",
                            std::process::id()
                        ))
                    },
                    move |claimed, ownership_lost| {
                        run_claimed_job(
                            &job_database_path,
                            &job_root,
                            &job_processor,
                            claimed,
                            ownership_lost,
                        )
                    },
                ))
            },
            || {
                current_epoch_millis().and_then(|millis| {
                    ExecutorTimestamp::from_millis(millis).map_err(|e| e.to_string())
                })
            },
        )
        .map_err(|error| error.to_string())?;

        Ok(Self { control })
    }

    pub fn wake(&self) -> WakeOutcome {
        self.control.wake()
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        self.control.snapshot()
    }

    pub fn shutdown(&self) -> Result<ShutdownOutcome, RuntimeError> {
        self.control.shutdown()
    }
}

impl Drop for ProductionManagedMediaRuntime {
    fn drop(&mut self) {
        let _ = self.control.shutdown();
    }
}

pub(crate) fn production_runtime_policy() -> Result<RuntimePolicy, String> {
    let executor = ExecutorPolicy::new(
        DISCOVERY_LIMIT,
        CLAIM_LEASE_MILLIS,
        CLAIM_RENEWAL_MILLIS,
        CLAIM_CAPACITY,
    )
    .map_err(|error| error.to_string())?;
    RuntimePolicy::new(
        executor,
        WORKER_CAPACITY,
        PUBLICATION_RECOVERY_LIMIT,
        WAKE_CAPACITY,
        SAFETY_RECHECK_MILLIS,
        BOUNDED_CONTINUATION_MILLIS,
        SHUTDOWN_DEADLINE_MILLIS,
        PANIC_DISABLE_THRESHOLD,
    )
    .map_err(|error| error.to_string())
}

fn run_claimed_job(
    database_path: &Path,
    managed_root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    claimed: ClaimedIntentSnapshot,
    ownership_lost: Arc<AtomicBool>,
) -> Result<(), String> {
    let connection = open_managed_media_connection(database_path)?;
    let allowed_path = if claimed.action == LifecycleAction::Retire {
        database_path.to_path_buf()
    } else {
        let mut provider = SqliteOwnerSourceProvider::new(&connection);
        match resolve_claimed_source_locator(
            &connection,
            &claimed.intent_id,
            &claimed.item_id,
            claimed.revision,
            &mut provider,
        ) {
            Ok(resolved)
                if matches!(
                    resolved.locator_kind,
                    SourceLocatorKind::ExternalFile | SourceLocatorKind::ExternalDirectoryEntry
                ) =>
            {
                PathBuf::from(resolved.locator)
            }
            _ => database_path.to_path_buf(),
        }
    };
    let acquisition_policy = exact_source_policy(allowed_path, database_path)?;
    let mut provider = SqliteOwnerSourceProvider::new(&connection);
    let attempt_count = claimed.attempt_count;
    let mut failure_policy = move |failure| {
        classify_production_failure(failure, attempt_count, current_epoch_millis().ok())
    };
    let mut clock = current_epoch_millis;
    let mut cancellation = move |_| Ok(ownership_lost.load(Ordering::Acquire));

    LocalGenerationOrchestrator::new(
        &connection,
        &mut provider,
        managed_root,
        processor,
        &acquisition_policy,
        &mut failure_policy,
        &mut clock,
        &mut cancellation,
    )
    .execute(&claimed)
    .map(|_| ())
    .map_err(|error| error.to_string())
}

fn open_managed_media_connection(database_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_millis(SQLITE_BUSY_TIMEOUT_MILLIS))
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn exact_source_policy(
    allowed_path: PathBuf,
    fallback_path: &Path,
) -> Result<AcquisitionPolicy, String> {
    AcquisitionPolicy::new(MAXIMUM_SOURCE_BYTES, READ_CHUNK_BYTES, vec![allowed_path])
        .or_else(|_| {
            AcquisitionPolicy::new(
                MAXIMUM_SOURCE_BYTES,
                READ_CHUNK_BYTES,
                vec![fallback_path.to_path_buf()],
            )
        })
        .map_err(|error| error.to_string())
}

pub(crate) fn classify_production_failure(
    failure: OrchestrationFailure,
    attempt_count: u64,
    now_millis: Option<u64>,
) -> FailureDisposition {
    match failure {
        OrchestrationFailure::LocatorProviderFailure
        | OrchestrationFailure::MissingLocalFile
        | OrchestrationFailure::PermissionFailure
        | OrchestrationFailure::SourceChangedDuringRead
        | OrchestrationFailure::SourceReadFailure => retry_disposition(attempt_count, now_millis),
        OrchestrationFailure::PublicationRecoverableState
        | OrchestrationFailure::PublicationFailure => FailureDisposition::RecoveryRequired,
        _ => FailureDisposition::Terminal,
    }
}

fn retry_disposition(attempt_count: u64, now_millis: Option<u64>) -> FailureDisposition {
    let delay = match attempt_count {
        1 => RETRY_ONE_MILLIS,
        2 => RETRY_TWO_MILLIS,
        3 => RETRY_THREE_MILLIS,
        _ => return FailureDisposition::Terminal,
    };
    now_millis
        .and_then(|now| now.checked_add(delay))
        .and_then(|retry_at| ExecutorTimestamp::from_millis(retry_at).ok())
        .map(FailureDisposition::RetryAt)
        .unwrap_or(FailureDisposition::Terminal)
}

fn current_epoch_millis() -> Result<u64, String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    u64::try_from(millis).map_err(|_| "System clock exceeds the supported range.".to_string())
}

fn current_epoch_nanos() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .map_err(|error| error.to_string())
}
