use std::fmt;

use rusqlite::Connection;

use super::{
    identity::LifecycleClaimToken,
    lifecycle::{
        claim_discovered_intent, discover_lifecycle_work, ClaimAttemptOutcome, ClaimLossReason,
        ClaimedIntentSnapshot, ExecutorTimestamp, LifecycleError,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExecutorPolicy {
    discovery_limit: u32,
    claim_lease_millis: u64,
    claim_renewal_millis: u64,
    claim_capacity: u32,
}

impl ExecutorPolicy {
    pub fn new(
        discovery_limit: u32,
        claim_lease_millis: u64,
        claim_renewal_millis: u64,
        claim_capacity: u32,
    ) -> Result<Self, ExecutorError> {
        if discovery_limit == 0
            || claim_lease_millis == 0
            || claim_renewal_millis == 0
            || claim_capacity == 0
        {
            return Err(ExecutorError::InvalidPolicy);
        }
        Ok(Self {
            discovery_limit,
            claim_lease_millis,
            claim_renewal_millis,
            claim_capacity,
        })
    }

    pub const fn discovery_limit(self) -> u32 {
        self.discovery_limit
    }

    pub const fn claim_lease_millis(self) -> u64 {
        self.claim_lease_millis
    }

    pub const fn claim_renewal_millis(self) -> u64 {
        self.claim_renewal_millis
    }

    pub const fn claim_capacity(self) -> u32 {
        self.claim_capacity
    }
}

pub trait ExecutorDatabase {
    fn with_connection<T, F>(&self, operation: F) -> Result<T, LifecycleError>
    where
        F: FnOnce(&Connection) -> Result<T, LifecycleError>;
}

impl ExecutorDatabase for Connection {
    fn with_connection<T, F>(&self, operation: F) -> Result<T, LifecycleError>
    where
        F: FnOnce(&Connection) -> Result<T, LifecycleError>,
    {
        operation(self)
    }
}

pub trait ExecutorClock {
    fn now_millis(&mut self) -> Result<u64, String>;
}

impl<F> ExecutorClock for F
where
    F: FnMut() -> Result<u64, String>,
{
    fn now_millis(&mut self) -> Result<u64, String> {
        self()
    }
}

pub trait ClaimTokenGenerator {
    fn next_token(&mut self) -> Result<String, String>;
}

impl<F> ClaimTokenGenerator for F
where
    F: FnMut() -> Result<String, String>,
{
    fn next_token(&mut self) -> Result<String, String> {
        self()
    }
}

pub trait IntentHandler {
    fn handle(&mut self, claimed: &ClaimedIntentSnapshot) -> Result<(), String>;
}

impl<F> IntentHandler for F
where
    F: FnMut(&ClaimedIntentSnapshot) -> Result<(), String>,
{
    fn handle(&mut self, claimed: &ClaimedIntentSnapshot) -> Result<(), String> {
        self(claimed)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandlerFailure {
    pub intent_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExecutorCycleReport {
    pub discovered: u32,
    pub successfully_claimed: u32,
    pub reclaimed_expired: u32,
    pub lost_races: u32,
    pub skipped_cancelled: u32,
    pub skipped_stale: u32,
    pub skipped_superseded: u32,
    pub skipped_retired: u32,
    pub skipped_invalid_state: u32,
    pub handler_completed: u32,
    pub handler_failures: Vec<HandlerFailure>,
}

#[derive(Debug)]
pub enum ExecutorError {
    InvalidPolicy,
    InvalidClock(String),
    InvalidClaimToken(String),
    Lifecycle(LifecycleError),
}

impl fmt::Display for ExecutorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPolicy => formatter.write_str("The executor policy is invalid."),
            Self::InvalidClock(_) => formatter.write_str("The injected executor clock failed."),
            Self::InvalidClaimToken(_) => {
                formatter.write_str("The injected executor claim token is invalid.")
            }
            Self::Lifecycle(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for ExecutorError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Lifecycle(error) => Some(error),
            _ => None,
        }
    }
}

impl From<LifecycleError> for ExecutorError {
    fn from(error: LifecycleError) -> Self {
        Self::Lifecycle(error)
    }
}

pub fn run_one_cycle<D, C, G, H>(
    database: &D,
    policy: ExecutorPolicy,
    clock: &mut C,
    token_generator: &mut G,
    handler: &mut H,
) -> Result<ExecutorCycleReport, ExecutorError>
where
    D: ExecutorDatabase,
    C: ExecutorClock,
    G: ClaimTokenGenerator,
    H: IntentHandler,
{
    let discovery_now = injected_now(clock)?;
    let cycle_limit = policy.discovery_limit().min(policy.claim_capacity());
    let candidates = database.with_connection(|connection| {
        discover_lifecycle_work(connection, &discovery_now, cycle_limit)
    })?;
    let mut report = ExecutorCycleReport {
        discovered: candidates.len() as u32,
        ..ExecutorCycleReport::default()
    };

    for candidate in candidates {
        let claim_now = injected_now(clock)?;
        let claim_expires_at = claim_now.checked_add_millis(policy.claim_lease_millis())?;
        let raw_token = token_generator
            .next_token()
            .map_err(ExecutorError::InvalidClaimToken)?;
        let claim_token =
            LifecycleClaimToken::new(raw_token).map_err(ExecutorError::InvalidClaimToken)?;
        let outcome = database.with_connection(|connection| {
            claim_discovered_intent(
                connection,
                &candidate,
                &claim_token,
                &claim_now,
                &claim_expires_at,
            )
        })?;
        match outcome {
            ClaimAttemptOutcome::Claimed(claimed) => {
                report.successfully_claimed += 1;
                if candidate.claim_kind == super::lifecycle::WorkClaimKind::ReclaimExpired {
                    report.reclaimed_expired += 1;
                }
                match handler.handle(&claimed) {
                    Ok(()) => report.handler_completed += 1,
                    Err(message) => report.handler_failures.push(HandlerFailure {
                        intent_id: claimed.intent_id.as_str().to_string(),
                        message,
                    }),
                }
            }
            ClaimAttemptOutcome::NotClaimed(reason) => record_claim_loss(&mut report, reason),
        }
    }

    Ok(report)
}

fn injected_now(clock: &mut impl ExecutorClock) -> Result<ExecutorTimestamp, ExecutorError> {
    let millis = clock.now_millis().map_err(ExecutorError::InvalidClock)?;
    ExecutorTimestamp::from_millis(millis).map_err(ExecutorError::Lifecycle)
}

fn record_claim_loss(report: &mut ExecutorCycleReport, reason: ClaimLossReason) {
    match reason {
        ClaimLossReason::LostRace | ClaimLossReason::Expired => report.lost_races += 1,
        ClaimLossReason::Cancelled => report.skipped_cancelled += 1,
        ClaimLossReason::StaleRevision => report.skipped_stale += 1,
        ClaimLossReason::Superseded => report.skipped_superseded += 1,
        ClaimLossReason::Retired => report.skipped_retired += 1,
        ClaimLossReason::InvalidState => report.skipped_invalid_state += 1,
    }
}
