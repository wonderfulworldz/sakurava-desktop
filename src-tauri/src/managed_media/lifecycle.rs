use std::{cmp::Ordering, fmt};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use super::{
    contract::{RoleId, TierId},
    identity::{
        LifecycleClaimToken, LifecycleIntentIdentity, LifecycleTargetIdentity, ValidatedSha256,
        VariantClass,
    },
    publication, schema,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleAction {
    Generate,
    RepairMissing,
    Regenerate,
    Retire,
}

impl LifecycleAction {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Generate => "generate",
            Self::RepairMissing => "repair_missing",
            Self::Regenerate => "regenerate",
            Self::Retire => "retire",
        }
    }

    fn parse(value: &str) -> Result<Self, LifecycleError> {
        match value {
            "generate" => Ok(Self::Generate),
            "repair_missing" => Ok(Self::RepairMissing),
            "regenerate" => Ok(Self::Regenerate),
            "retire" => Ok(Self::Retire),
            _ => Err(LifecycleError::UnknownStoredValue),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleState {
    Queued,
    Claimed,
    RetryWait,
    Completed,
    CompletedWithFailures,
    Failed,
    Cancelled,
    Superseded,
    Retired,
    RecoveryRequired,
}

impl LifecycleState {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Claimed => "claimed",
            Self::RetryWait => "retry_wait",
            Self::Completed => "completed",
            Self::CompletedWithFailures => "completed_with_failures",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Superseded => "superseded",
            Self::Retired => "retired",
            Self::RecoveryRequired => "recovery_required",
        }
    }

    fn parse(value: &str) -> Result<Self, LifecycleError> {
        match value {
            "queued" => Ok(Self::Queued),
            "claimed" => Ok(Self::Claimed),
            "retry_wait" => Ok(Self::RetryWait),
            "completed" => Ok(Self::Completed),
            "completed_with_failures" => Ok(Self::CompletedWithFailures),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "superseded" => Ok(Self::Superseded),
            "retired" => Ok(Self::Retired),
            "recovery_required" => Ok(Self::RecoveryRequired),
            _ => Err(LifecycleError::UnknownStoredValue),
        }
    }

    pub const fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed
                | Self::CompletedWithFailures
                | Self::Failed
                | Self::Cancelled
                | Self::Superseded
                | Self::Retired
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetState {
    Pending,
    Claimed,
    Published,
    SkippedIneligible,
    RetryableFailure,
    TerminalFailure,
    Cancelled,
    Superseded,
    RecoveryRequired,
}

impl TargetState {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Claimed => "claimed",
            Self::Published => "published",
            Self::SkippedIneligible => "skipped_ineligible",
            Self::RetryableFailure => "retryable_failure",
            Self::TerminalFailure => "terminal_failure",
            Self::Cancelled => "cancelled",
            Self::Superseded => "superseded",
            Self::RecoveryRequired => "recovery_required",
        }
    }

    fn parse(value: &str) -> Result<Self, LifecycleError> {
        match value {
            "pending" => Ok(Self::Pending),
            "claimed" => Ok(Self::Claimed),
            "published" => Ok(Self::Published),
            "skipped_ineligible" => Ok(Self::SkippedIneligible),
            "retryable_failure" => Ok(Self::RetryableFailure),
            "terminal_failure" => Ok(Self::TerminalFailure),
            "cancelled" => Ok(Self::Cancelled),
            "superseded" => Ok(Self::Superseded),
            "recovery_required" => Ok(Self::RecoveryRequired),
            _ => Err(LifecycleError::UnknownStoredValue),
        }
    }

    pub const fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Published
                | Self::SkippedIneligible
                | Self::TerminalFailure
                | Self::Cancelled
                | Self::Superseded
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureClass {
    Retryable,
    Terminal,
    Cancelled,
    Stale,
    RecoveryRequired,
}

impl FailureClass {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Retryable => "retryable",
            Self::Terminal => "terminal",
            Self::Cancelled => "cancelled",
            Self::Stale => "stale",
            Self::RecoveryRequired => "recovery_required",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct ItemRevision(u64);

impl ItemRevision {
    pub fn new(value: u64) -> Result<Self, LifecycleError> {
        if value == 0 || value > i64::MAX as u64 {
            return Err(LifecycleError::InvalidRevision);
        }
        Ok(Self(value))
    }

    pub const fn get(self) -> u64 {
        self.0
    }

    fn as_i64(self) -> i64 {
        self.0 as i64
    }

    fn from_i64(value: i64) -> Result<Self, LifecycleError> {
        if value <= 0 {
            return Err(LifecycleError::InvalidRevision);
        }
        Self::new(value as u64)
    }
}

#[derive(Debug, Clone)]
pub struct NewLifecycleIntent {
    pub intent_id: LifecycleIntentIdentity,
    pub item_id: ValidatedSha256,
    pub revision: ItemRevision,
    pub action: LifecycleAction,
    pub expected_locator_hash: ValidatedSha256,
}

#[derive(Debug, Clone)]
pub struct NewLifecycleTarget {
    pub target_id: LifecycleTargetIdentity,
    pub intent_id: LifecycleIntentIdentity,
    pub item_id: ValidatedSha256,
    pub revision: ItemRevision,
    pub role: RoleId,
    pub class: VariantClass,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LifecycleIntentRecord {
    pub intent_id: String,
    pub item_id: String,
    pub revision: ItemRevision,
    pub action: LifecycleAction,
    pub state: LifecycleState,
    pub attempt_count: u64,
    pub cancellation_requested: bool,
    pub desired_source_fingerprint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LifecycleTargetRecord {
    pub target_id: String,
    pub intent_id: String,
    pub item_id: String,
    pub revision: ItemRevision,
    pub role: RoleId,
    pub class: VariantClass,
    pub state: TargetState,
    pub publication_operation_id: Option<String>,
    pub result_variant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutorTimestamp {
    encoded: String,
    millis: u64,
}

impl ExecutorTimestamp {
    pub fn from_millis(millis: u64) -> Result<Self, LifecycleError> {
        if millis > i64::MAX as u64 {
            return Err(LifecycleError::InvalidTimestamp);
        }
        Ok(Self {
            encoded: millis.to_string(),
            millis,
        })
    }

    pub fn parse(value: &str) -> Result<Self, LifecycleError> {
        if value.is_empty()
            || !value.bytes().all(|byte| byte.is_ascii_digit())
            || (value.len() > 1 && value.starts_with('0'))
        {
            return Err(LifecycleError::InvalidTimestamp);
        }
        let millis = value
            .parse::<u64>()
            .map_err(|_| LifecycleError::InvalidTimestamp)?;
        let timestamp = Self::from_millis(millis)?;
        if timestamp.encoded != value {
            return Err(LifecycleError::InvalidTimestamp);
        }
        Ok(timestamp)
    }

    pub fn checked_add_millis(&self, duration_millis: u64) -> Result<Self, LifecycleError> {
        self.millis
            .checked_add(duration_millis)
            .ok_or(LifecycleError::InvalidTimestamp)
            .and_then(Self::from_millis)
    }

    pub const fn as_millis(&self) -> u64 {
        self.millis
    }

    pub fn as_str(&self) -> &str {
        &self.encoded
    }
}

impl PartialOrd for ExecutorTimestamp {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ExecutorTimestamp {
    fn cmp(&self, other: &Self) -> Ordering {
        self.millis.cmp(&other.millis)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkClaimKind {
    Initial,
    ReclaimExpired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LifecycleWorkCandidate {
    pub intent_id: LifecycleIntentIdentity,
    pub item_id: ValidatedSha256,
    pub revision: ItemRevision,
    pub action: LifecycleAction,
    pub state: LifecycleState,
    pub effective_due_at: ExecutorTimestamp,
    pub claim_kind: WorkClaimKind,
    previous_claim_token: Option<LifecycleClaimToken>,
    previous_claim_expires_at: Option<ExecutorTimestamp>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimedIntentSnapshot {
    pub intent_id: LifecycleIntentIdentity,
    pub item_id: ValidatedSha256,
    pub revision: ItemRevision,
    pub action: LifecycleAction,
    pub claim_token: LifecycleClaimToken,
    pub claim_expires_at: ExecutorTimestamp,
    pub attempt_count: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimLossReason {
    LostRace,
    Cancelled,
    StaleRevision,
    Superseded,
    Retired,
    Expired,
    InvalidState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClaimAttemptOutcome {
    Claimed(ClaimedIntentSnapshot),
    NotClaimed(ClaimLossReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimOwnershipStatus {
    Owned,
    LostOwnership,
    Cancelled,
    StaleRevision,
    Superseded,
    Retired,
    Expired,
    InvalidState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimRenewalOutcome {
    Renewed,
    LostOwnership,
    Cancelled,
    StaleRevision,
    Superseded,
    Retired,
    Expired,
    InvalidState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PersistedWriteOutcome {
    Applied,
    AlreadyApplied,
}

#[derive(Debug, Clone)]
pub struct TargetOutcome {
    pub state: TargetState,
    pub publication_operation_id: Option<String>,
    pub result_variant_id: Option<ValidatedSha256>,
    pub failure_class: Option<FailureClass>,
    pub failure_summary: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FinalizationOutcome {
    Promoted,
    AlreadyFinalized,
}

#[derive(Debug)]
pub enum LifecycleError {
    Database(rusqlite::Error),
    SchemaConflict,
    IdentityConflict,
    ItemNotFound,
    IntentNotFound,
    TargetNotFound,
    InvalidRevision,
    StaleRevision,
    InvalidTransition,
    ClaimUnavailable,
    LostOwnership,
    Cancelled,
    Superseded,
    Retired,
    ClaimExpired,
    InvalidPolicy,
    InvalidTimestamp,
    InvalidFailure,
    InvalidPublicationLink,
    FinalizationNotReady,
    StructuralConflict,
    UnknownStoredValue,
}

impl fmt::Display for LifecycleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::Database(_) => "A managed-media lifecycle database operation failed.",
            Self::SchemaConflict => "The managed-media lifecycle schema is invalid.",
            Self::IdentityConflict => "The managed-media lifecycle identity is inconsistent.",
            Self::ItemNotFound => "The managed-media item was not found.",
            Self::IntentNotFound => "The managed-media lifecycle intent was not found.",
            Self::TargetNotFound => "The managed-media lifecycle target was not found.",
            Self::InvalidRevision => "The managed-media lifecycle revision is invalid.",
            Self::StaleRevision => "The managed-media lifecycle revision is stale.",
            Self::InvalidTransition => "The managed-media lifecycle transition is invalid.",
            Self::ClaimUnavailable => "The managed-media lifecycle intent cannot be claimed.",
            Self::LostOwnership => "The managed-media lifecycle claim is no longer owned.",
            Self::Cancelled => "The managed-media lifecycle intent was cancelled.",
            Self::Superseded => "The managed-media lifecycle intent was superseded.",
            Self::Retired => "The managed-media item was retired.",
            Self::ClaimExpired => "The managed-media lifecycle claim expired.",
            Self::InvalidPolicy => "The managed-media executor policy is invalid.",
            Self::InvalidTimestamp => "The managed-media lifecycle timestamp is invalid.",
            Self::InvalidFailure => "The managed-media lifecycle failure result is invalid.",
            Self::InvalidPublicationLink => {
                "The managed-media lifecycle publication evidence is invalid."
            }
            Self::FinalizationNotReady => "The managed-media lifecycle generation is not ready.",
            Self::StructuralConflict => {
                "The managed-media lifecycle state conflicts with the requested result."
            }
            Self::UnknownStoredValue => {
                "The managed-media lifecycle row contains an unknown value."
            }
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for LifecycleError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Database(error) => Some(error),
            _ => None,
        }
    }
}

impl From<rusqlite::Error> for LifecycleError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

pub fn intent_transition_allowed(from: LifecycleState, to: LifecycleState) -> bool {
    if from == to {
        return true;
    }
    match from {
        LifecycleState::Queued => matches!(
            to,
            LifecycleState::Claimed
                | LifecycleState::Cancelled
                | LifecycleState::Superseded
                | LifecycleState::RecoveryRequired
        ),
        LifecycleState::Claimed => matches!(
            to,
            LifecycleState::RetryWait
                | LifecycleState::Completed
                | LifecycleState::CompletedWithFailures
                | LifecycleState::Failed
                | LifecycleState::Cancelled
                | LifecycleState::Superseded
                | LifecycleState::Retired
                | LifecycleState::RecoveryRequired
        ),
        LifecycleState::RetryWait => matches!(
            to,
            LifecycleState::Claimed
                | LifecycleState::Cancelled
                | LifecycleState::Superseded
                | LifecycleState::RecoveryRequired
        ),
        LifecycleState::RecoveryRequired => matches!(
            to,
            LifecycleState::Claimed
                | LifecycleState::Failed
                | LifecycleState::Cancelled
                | LifecycleState::Superseded
        ),
        _ => false,
    }
}

pub fn target_transition_allowed(from: TargetState, to: TargetState) -> bool {
    if from == to {
        return true;
    }
    match from {
        TargetState::Pending | TargetState::Claimed => matches!(
            to,
            TargetState::Claimed
                | TargetState::Published
                | TargetState::SkippedIneligible
                | TargetState::RetryableFailure
                | TargetState::TerminalFailure
                | TargetState::Cancelled
                | TargetState::Superseded
                | TargetState::RecoveryRequired
        ),
        TargetState::RetryableFailure | TargetState::RecoveryRequired => matches!(
            to,
            TargetState::Claimed
                | TargetState::TerminalFailure
                | TargetState::Cancelled
                | TargetState::Superseded
                | TargetState::RecoveryRequired
        ),
        _ => false,
    }
}

pub fn initialize_item_generation(
    connection: &Connection,
    item_id: &ValidatedSha256,
    now: &str,
) -> Result<(), LifecycleError> {
    require_timestamp(now)?;
    schema::validate_schema(connection).map_err(|_| LifecycleError::SchemaConflict)?;
    connection
        .execute(
            "INSERT INTO managed_media_item_generations (
               managed_item_id, current_revision, desired_revision, created_at, updated_at
             ) VALUES (?1, 0, 0, ?2, ?2)
             ON CONFLICT(managed_item_id) DO NOTHING",
            (item_id.as_str(), now),
        )
        .map_err(LifecycleError::Database)?;
    let exists: bool = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM managed_media_item_generations WHERE managed_item_id = ?1
         )",
        [item_id.as_str()],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(LifecycleError::ItemNotFound);
    }
    Ok(())
}

pub fn queue_intent(
    connection: &Connection,
    input: &NewLifecycleIntent,
    now: &str,
) -> Result<(), LifecycleError> {
    require_timestamp(now)?;
    schema::validate_schema(connection).map_err(|_| LifecycleError::SchemaConflict)?;
    let transaction = connection.unchecked_transaction()?;
    queue_intent_in_transaction(&transaction, input, now)?;
    transaction.commit()?;
    Ok(())
}

pub(crate) fn queue_intent_in_transaction(
    connection: &Connection,
    input: &NewLifecycleIntent,
    now: &str,
) -> Result<(), LifecycleError> {
    require_timestamp(now)?;
    let (locator_hash, lifecycle_state): (String, String) = connection
        .query_row(
            "SELECT locator_hash, lifecycle_state FROM managed_media_items WHERE item_id = ?1",
            [input.item_id.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or(LifecycleError::ItemNotFound)?;
    if locator_hash != input.expected_locator_hash.as_str()
        || matches!(
            lifecycle_state.as_str(),
            "retired" | "invalid" | "recovery_required"
        )
    {
        return Err(LifecycleError::IdentityConflict);
    }
    let (current_revision, desired_revision): (i64, i64) = connection
        .query_row(
            "SELECT current_revision, desired_revision
             FROM managed_media_item_generations WHERE managed_item_id = ?1",
            [input.item_id.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or(LifecycleError::IdentityConflict)?;
    if input.revision.as_i64() <= current_revision || input.revision.as_i64() <= desired_revision {
        return Err(LifecycleError::StaleRevision);
    }
    connection.execute(
        "UPDATE managed_media_item_generations
         SET desired_revision = ?2, updated_at = ?3 WHERE managed_item_id = ?1",
        (input.item_id.as_str(), input.revision.as_i64(), now),
    )?;
    connection.execute(
        "INSERT INTO managed_media_lifecycle_intents (
           intent_id, managed_item_id, desired_revision, lifecycle_action,
           expected_locator_hash, lifecycle_state, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, 'queued', ?6, ?6)",
        params![
            input.intent_id.as_str(),
            input.item_id.as_str(),
            input.revision.as_i64(),
            input.action.as_str(),
            input.expected_locator_hash.as_str(),
            now
        ],
    )?;
    connection.execute(
        "UPDATE managed_media_lifecycle_intents
         SET lifecycle_state = 'superseded', claim_token = NULL, claim_expires_at = NULL,
             retry_eligible_at = NULL, superseded_by_intent_id = ?1,
             failure_class = 'stale', failure_summary = 'superseded by newer revision',
             updated_at = ?4, finished_at = ?4
         WHERE managed_item_id = ?2 AND desired_revision < ?3
           AND lifecycle_state IN ('queued', 'claimed', 'retry_wait', 'recovery_required')",
        (
            input.intent_id.as_str(),
            input.item_id.as_str(),
            input.revision.as_i64(),
            now,
        ),
    )?;
    connection.execute(
        "UPDATE managed_media_lifecycle_targets
         SET target_state = 'superseded', failure_class = 'stale',
             failure_summary = 'superseded by newer revision', updated_at = ?3
         WHERE managed_item_id = ?1 AND desired_revision < ?2
           AND target_state IN ('pending', 'claimed', 'retryable_failure', 'recovery_required')",
        (input.item_id.as_str(), input.revision.as_i64(), now),
    )?;
    Ok(())
}

pub fn add_target(
    connection: &Connection,
    input: &NewLifecycleTarget,
    now: &str,
) -> Result<(), LifecycleError> {
    require_timestamp(now)?;
    let (variant_class, standard_tier) = class_parts(input.class);
    connection
        .execute(
            "INSERT INTO managed_media_lifecycle_targets (
               target_id, intent_id, managed_item_id, desired_revision, role_id,
               variant_class, standard_tier, target_state, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)",
            params![
                input.target_id.as_str(),
                input.intent_id.as_str(),
                input.item_id.as_str(),
                input.revision.as_i64(),
                input.role.as_str(),
                variant_class,
                standard_tier,
                now
            ],
        )
        .map_err(|error| match error {
            rusqlite::Error::SqliteFailure(_, _) => LifecycleError::IdentityConflict,
            other => LifecycleError::Database(other),
        })?;
    Ok(())
}

pub fn discover_lifecycle_work(
    connection: &Connection,
    now: &ExecutorTimestamp,
    limit: u32,
) -> Result<Vec<LifecycleWorkCandidate>, LifecycleError> {
    if limit == 0 {
        return Err(LifecycleError::InvalidPolicy);
    }
    schema::validate_schema(connection).map_err(|_| LifecycleError::SchemaConflict)?;
    let now_millis =
        i64::try_from(now.as_millis()).map_err(|_| LifecycleError::InvalidTimestamp)?;
    let mut statement = connection.prepare(
        "SELECT i.intent_id, i.managed_item_id, i.desired_revision, i.lifecycle_action,
                i.lifecycle_state,
                CASE
                  WHEN i.lifecycle_state = 'retry_wait' THEN i.retry_eligible_at
                  WHEN i.lifecycle_state = 'claimed' THEN i.claim_expires_at
                  ELSE i.created_at
                END AS effective_due_at,
                i.created_at, i.claim_token, i.claim_expires_at
         FROM managed_media_lifecycle_intents i
         JOIN managed_media_items item ON item.item_id = i.managed_item_id
         JOIN managed_media_item_generations generation
           ON generation.managed_item_id = i.managed_item_id
         WHERE (
             i.lifecycle_state IN ('queued', 'recovery_required')
             OR (
               i.lifecycle_state = 'retry_wait'
               AND i.retry_eligible_at IS NOT NULL
               AND CAST(i.retry_eligible_at AS INTEGER) <= ?1
             )
             OR (
               i.lifecycle_state = 'claimed'
               AND i.claim_expires_at IS NOT NULL
               AND CAST(i.claim_expires_at AS INTEGER) <= ?1
             )
           )
           AND i.cancellation_requested = 0
           AND i.superseded_by_intent_id IS NULL
           AND item.lifecycle_state IN ('active', 'pending')
           AND i.desired_revision = generation.desired_revision
           AND NOT EXISTS (
             SELECT 1
             FROM managed_media_lifecycle_intents active_claim
             WHERE active_claim.managed_item_id = i.managed_item_id
               AND active_claim.intent_id <> i.intent_id
               AND active_claim.lifecycle_state = 'claimed'
               AND active_claim.claim_expires_at IS NOT NULL
               AND CAST(active_claim.claim_expires_at AS INTEGER) > ?1
           )
         ORDER BY CAST(effective_due_at AS INTEGER), CAST(i.created_at AS INTEGER), i.intent_id
         LIMIT ?2",
    )?;
    let rows = statement.query_map((now_millis, i64::from(limit)), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
        ))
    })?;
    rows.map(|row| parse_work_candidate(row?)).collect()
}

pub fn claim_intent(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
    claim_token: &LifecycleClaimToken,
    now: &ExecutorTimestamp,
    expires_at: &ExecutorTimestamp,
) -> Result<ClaimAttemptOutcome, LifecycleError> {
    let candidate = match load_claim_candidate(connection, intent_id, now)? {
        Some(candidate) => candidate,
        None => {
            let context = load_claim_context(connection, intent_id.as_str())?;
            return Ok(ClaimAttemptOutcome::NotClaimed(claim_loss_reason(
                &context, now,
            )));
        }
    };
    claim_discovered_intent(connection, &candidate, claim_token, now, expires_at)
}

pub fn claim_discovered_intent(
    connection: &Connection,
    candidate: &LifecycleWorkCandidate,
    claim_token: &LifecycleClaimToken,
    now: &ExecutorTimestamp,
    expires_at: &ExecutorTimestamp,
) -> Result<ClaimAttemptOutcome, LifecycleError> {
    if expires_at <= now {
        return Err(LifecycleError::InvalidTimestamp);
    }
    let transaction = connection.unchecked_transaction()?;
    let context = load_claim_context(&transaction, candidate.intent_id.as_str())?;
    if let Some(reason) = claim_candidate_rejection(&context, candidate, now)? {
        transaction.commit()?;
        return Ok(ClaimAttemptOutcome::NotClaimed(reason));
    }
    let active_same_item: bool = transaction.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM managed_media_lifecycle_intents
           WHERE managed_item_id = ?1 AND intent_id <> ?2
             AND lifecycle_state = 'claimed' AND claim_expires_at IS NOT NULL
             AND CAST(claim_expires_at AS INTEGER) > ?3
         )",
        (
            candidate.item_id.as_str(),
            candidate.intent_id.as_str(),
            i64::try_from(now.as_millis()).map_err(|_| LifecycleError::InvalidTimestamp)?,
        ),
        |row| row.get(0),
    )?;
    if active_same_item {
        transaction.commit()?;
        return Ok(ClaimAttemptOutcome::NotClaimed(ClaimLossReason::LostRace));
    }
    let updated = match candidate.claim_kind {
        WorkClaimKind::Initial => transaction.execute(
            "UPDATE managed_media_lifecycle_intents
             SET lifecycle_state = 'claimed', claim_token = ?2, claim_expires_at = ?3,
                 retry_eligible_at = NULL, attempt_count = attempt_count + 1,
                 failure_class = NULL, failure_summary = NULL, updated_at = ?4
             WHERE intent_id = ?1 AND lifecycle_state = ?5
               AND cancellation_requested = 0 AND superseded_by_intent_id IS NULL",
            (
                candidate.intent_id.as_str(),
                claim_token.as_str(),
                expires_at.as_str(),
                now.as_str(),
                candidate.state.as_str(),
            ),
        )?,
        WorkClaimKind::ReclaimExpired => transaction.execute(
            "UPDATE managed_media_lifecycle_intents
             SET claim_token = ?2, claim_expires_at = ?3,
                 attempt_count = attempt_count + 1, failure_class = NULL,
                 failure_summary = NULL, updated_at = ?4
             WHERE intent_id = ?1 AND lifecycle_state = 'claimed'
               AND claim_token = ?5 AND claim_expires_at = ?6
               AND cancellation_requested = 0 AND superseded_by_intent_id IS NULL",
            (
                candidate.intent_id.as_str(),
                claim_token.as_str(),
                expires_at.as_str(),
                now.as_str(),
                candidate
                    .previous_claim_token
                    .as_ref()
                    .map(LifecycleClaimToken::as_str),
                candidate
                    .previous_claim_expires_at
                    .as_ref()
                    .map(ExecutorTimestamp::as_str),
            ),
        )?,
    };
    if updated != 1 {
        let latest = load_claim_context(&transaction, candidate.intent_id.as_str())?;
        let reason = claim_loss_reason(&latest, now);
        transaction.commit()?;
        return Ok(ClaimAttemptOutcome::NotClaimed(reason));
    }
    let attempt_count = context
        .attempt_count
        .checked_add(1)
        .ok_or(LifecycleError::StructuralConflict)?;
    transaction.commit()?;
    Ok(ClaimAttemptOutcome::Claimed(ClaimedIntentSnapshot {
        intent_id: candidate.intent_id.clone(),
        item_id: candidate.item_id.clone(),
        revision: candidate.revision,
        action: candidate.action,
        claim_token: claim_token.clone(),
        claim_expires_at: expires_at.clone(),
        attempt_count,
    }))
}

pub fn reclaim_expired_intent(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
    claim_token: &LifecycleClaimToken,
    now: &ExecutorTimestamp,
    expires_at: &ExecutorTimestamp,
) -> Result<ClaimAttemptOutcome, LifecycleError> {
    let candidate = match load_claim_candidate(connection, intent_id, now)? {
        Some(candidate) if candidate.claim_kind == WorkClaimKind::ReclaimExpired => candidate,
        _ => {
            let context = load_claim_context(connection, intent_id.as_str())?;
            return Ok(ClaimAttemptOutcome::NotClaimed(claim_loss_reason(
                &context, now,
            )));
        }
    };
    claim_discovered_intent(connection, &candidate, claim_token, now, expires_at)
}

pub fn renew_claim(
    connection: &Connection,
    claimed: &mut ClaimedIntentSnapshot,
    now: &ExecutorTimestamp,
    new_expires_at: &ExecutorTimestamp,
) -> Result<ClaimRenewalOutcome, LifecycleError> {
    if new_expires_at <= now || new_expires_at <= &claimed.claim_expires_at {
        return Err(LifecycleError::InvalidTimestamp);
    }
    let transaction = connection.unchecked_transaction()?;
    let status = validate_claim_ownership_in_connection(
        &transaction,
        &claimed.intent_id,
        &claimed.item_id,
        claimed.revision,
        &claimed.claim_token,
        now,
    )?;
    if status != ClaimOwnershipStatus::Owned {
        transaction.commit()?;
        return Ok(renewal_outcome(status));
    }
    let updated = transaction.execute(
        "UPDATE managed_media_lifecycle_intents
         SET claim_expires_at = ?2, updated_at = ?3
         WHERE intent_id = ?1 AND lifecycle_state = 'claimed'
           AND claim_token = ?4 AND claim_expires_at = ?5",
        (
            claimed.intent_id.as_str(),
            new_expires_at.as_str(),
            now.as_str(),
            claimed.claim_token.as_str(),
            claimed.claim_expires_at.as_str(),
        ),
    )?;
    if updated != 1 {
        transaction.commit()?;
        return Ok(ClaimRenewalOutcome::LostOwnership);
    }
    transaction.commit()?;
    claimed.claim_expires_at = new_expires_at.clone();
    Ok(ClaimRenewalOutcome::Renewed)
}

pub fn release_claim_for_retry(
    connection: &Connection,
    claimed: &ClaimedIntentSnapshot,
    retry_eligible_at: &ExecutorTimestamp,
    summary: &str,
    now: &ExecutorTimestamp,
) -> Result<(), LifecycleError> {
    require_summary(summary)?;
    let transaction = connection.unchecked_transaction()?;
    require_owned(validate_claim_ownership_in_connection(
        &transaction,
        &claimed.intent_id,
        &claimed.item_id,
        claimed.revision,
        &claimed.claim_token,
        now,
    )?)?;
    let updated = transaction.execute(
        "UPDATE managed_media_lifecycle_intents
         SET lifecycle_state = 'retry_wait', claim_token = NULL, claim_expires_at = NULL,
             retry_eligible_at = ?3, failure_class = 'retryable',
             failure_summary = ?4, updated_at = ?5
         WHERE intent_id = ?1 AND lifecycle_state = 'claimed' AND claim_token = ?2",
        (
            claimed.intent_id.as_str(),
            claimed.claim_token.as_str(),
            retry_eligible_at.as_str(),
            summary,
            now.as_str(),
        ),
    )?;
    if updated != 1 {
        return Err(LifecycleError::LostOwnership);
    }
    transaction.commit()?;
    Ok(())
}

pub fn request_cancellation(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
    now: &ExecutorTimestamp,
) -> Result<(), LifecycleError> {
    let updated = connection.execute(
        "UPDATE managed_media_lifecycle_intents
         SET cancellation_requested = 1, updated_at = ?2
         WHERE intent_id = ?1
           AND lifecycle_state IN ('queued', 'claimed', 'retry_wait', 'recovery_required')",
        (intent_id.as_str(), now.as_str()),
    )?;
    if updated != 1 {
        return Err(LifecycleError::InvalidTransition);
    }
    Ok(())
}

pub fn complete_requested_cancellation(
    connection: &Connection,
    claimed: &ClaimedIntentSnapshot,
    summary: &str,
    now: &ExecutorTimestamp,
) -> Result<(), LifecycleError> {
    require_summary(summary)?;
    let transaction = connection.unchecked_transaction()?;
    let context = load_claim_context(&transaction, claimed.intent_id.as_str())?;
    if context.item_id != claimed.item_id
        || context.revision != claimed.revision
        || context.state != LifecycleState::Claimed
        || context.claim_token.as_ref() != Some(&claimed.claim_token)
        || !context.cancellation_requested
    {
        return Err(LifecycleError::ClaimUnavailable);
    }
    transaction.execute(
        "UPDATE managed_media_lifecycle_targets
         SET target_state = 'cancelled', failure_class = 'cancelled',
             failure_summary = ?2, updated_at = ?3
         WHERE intent_id = ?1
           AND target_state IN ('pending', 'claimed', 'retryable_failure', 'recovery_required')",
        (claimed.intent_id.as_str(), summary, now.as_str()),
    )?;
    let updated = transaction.execute(
        "UPDATE managed_media_lifecycle_intents
         SET lifecycle_state = 'cancelled', claim_token = NULL, claim_expires_at = NULL,
             retry_eligible_at = NULL, failure_class = 'cancelled',
             failure_summary = ?3, updated_at = ?4, finished_at = ?4
         WHERE intent_id = ?1 AND lifecycle_state = 'claimed' AND claim_token = ?2
           AND cancellation_requested = 1",
        (
            claimed.intent_id.as_str(),
            claimed.claim_token.as_str(),
            summary,
            now.as_str(),
        ),
    )?;
    if updated != 1 {
        return Err(LifecycleError::LostOwnership);
    }
    transaction.commit()?;
    Ok(())
}

pub fn transition_intent(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
    claim_token: Option<&LifecycleClaimToken>,
    next: LifecycleState,
    failure_class: Option<FailureClass>,
    failure_summary: Option<&str>,
    now: &ExecutorTimestamp,
) -> Result<(), LifecycleError> {
    if let Some(summary) = failure_summary {
        require_summary(summary)?;
    }
    let transaction = connection.unchecked_transaction()?;
    let record = load_intent_in_transaction(&transaction, intent_id.as_str())?;
    if !intent_transition_allowed(record.state, next)
        || matches!(
            next,
            LifecycleState::Claimed
                | LifecycleState::RetryWait
                | LifecycleState::Completed
                | LifecycleState::Retired
                | LifecycleState::Superseded
        )
    {
        return Err(LifecycleError::InvalidTransition);
    }
    let expected_failure = match next {
        LifecycleState::Failed | LifecycleState::CompletedWithFailures => {
            Some(FailureClass::Terminal)
        }
        LifecycleState::Cancelled => Some(FailureClass::Cancelled),
        LifecycleState::RecoveryRequired => Some(FailureClass::RecoveryRequired),
        _ => None,
    };
    if failure_class != expected_failure
        || (expected_failure.is_some() && failure_summary.is_none())
    {
        return Err(LifecycleError::InvalidFailure);
    }
    let stored_claim: Option<String> = transaction.query_row(
        "SELECT claim_token FROM managed_media_lifecycle_intents WHERE intent_id = ?1",
        [intent_id.as_str()],
        |row| row.get(0),
    )?;
    if record.state == LifecycleState::Claimed
        && stored_claim.as_deref() != claim_token.map(LifecycleClaimToken::as_str)
    {
        return Err(LifecycleError::ClaimUnavailable);
    }
    let finished_at = next.is_terminal().then_some(now.as_str());
    let updated = transaction.execute(
        "UPDATE managed_media_lifecycle_intents
         SET lifecycle_state = ?2, claim_token = NULL, claim_expires_at = NULL,
             retry_eligible_at = NULL, failure_class = ?3, failure_summary = ?4,
             updated_at = ?5, finished_at = ?6
         WHERE intent_id = ?1 AND lifecycle_state = ?7",
        params![
            intent_id.as_str(),
            next.as_str(),
            failure_class.map(FailureClass::as_str),
            failure_summary,
            now.as_str(),
            finished_at,
            record.state.as_str()
        ],
    )?;
    if updated != 1 {
        return Err(LifecycleError::InvalidTransition);
    }
    transaction.commit()?;
    Ok(())
}

pub fn record_desired_fingerprint(
    connection: &Connection,
    claimed: &ClaimedIntentSnapshot,
    fingerprint: &ValidatedSha256,
    now: &ExecutorTimestamp,
) -> Result<PersistedWriteOutcome, LifecycleError> {
    let transaction = connection.unchecked_transaction()?;
    require_owned(validate_claim_ownership_in_connection(
        &transaction,
        &claimed.intent_id,
        &claimed.item_id,
        claimed.revision,
        &claimed.claim_token,
        now,
    )?)?;
    let (stored_fingerprint, pending_fingerprint): (Option<String>, Option<String>) = transaction
        .query_row(
        "SELECT intent.desired_source_fingerprint, item.pending_source_fingerprint
             FROM managed_media_lifecycle_intents intent
             JOIN managed_media_items item ON item.item_id = intent.managed_item_id
             WHERE intent.intent_id = ?1",
        [claimed.intent_id.as_str()],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if stored_fingerprint.as_deref() == Some(fingerprint.as_str())
        && pending_fingerprint.as_deref() == Some(fingerprint.as_str())
    {
        transaction.commit()?;
        return Ok(PersistedWriteOutcome::AlreadyApplied);
    }
    if stored_fingerprint.is_some() {
        return Err(LifecycleError::StructuralConflict);
    }
    let updated_intent = transaction.execute(
        "UPDATE managed_media_lifecycle_intents
         SET desired_source_fingerprint = ?2, updated_at = ?3
         WHERE intent_id = ?1 AND lifecycle_state = 'claimed' AND claim_token = ?4
           AND desired_source_fingerprint IS NULL",
        (
            claimed.intent_id.as_str(),
            fingerprint.as_str(),
            now.as_str(),
            claimed.claim_token.as_str(),
        ),
    )?;
    let updated = transaction.execute(
        "UPDATE managed_media_items
         SET pending_source_fingerprint = ?2, lifecycle_state = 'pending', updated_at = ?3
         WHERE item_id = ?1 AND locator_hash = (
           SELECT expected_locator_hash FROM managed_media_lifecycle_intents WHERE intent_id = ?4
         )",
        (
            claimed.item_id.as_str(),
            fingerprint.as_str(),
            now.as_str(),
            claimed.intent_id.as_str(),
        ),
    )?;
    if updated_intent != 1 || updated != 1 {
        return Err(LifecycleError::IdentityConflict);
    }
    transaction.commit()?;
    Ok(PersistedWriteOutcome::Applied)
}

pub fn record_target_outcome(
    connection: &Connection,
    claimed: &ClaimedIntentSnapshot,
    target_id: &LifecycleTargetIdentity,
    outcome: &TargetOutcome,
    now: &ExecutorTimestamp,
) -> Result<PersistedWriteOutcome, LifecycleError> {
    if let Some(summary) = outcome.failure_summary.as_deref() {
        require_summary(summary)?;
    }
    let transaction = connection.unchecked_transaction()?;
    require_owned(validate_claim_ownership_in_connection(
        &transaction,
        &claimed.intent_id,
        &claimed.item_id,
        claimed.revision,
        &claimed.claim_token,
        now,
    )?)?;
    let target = load_target_in_transaction(&transaction, target_id.as_str())?;
    if target.intent_id != claimed.intent_id.as_str()
        || target.item_id != claimed.item_id.as_str()
        || target.revision != claimed.revision
    {
        return Err(LifecycleError::IdentityConflict);
    }
    let stored_outcome: (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = transaction.query_row(
        "SELECT target_state, publication_operation_id, result_variant_id,
                failure_class, failure_summary
         FROM managed_media_lifecycle_targets WHERE target_id = ?1",
        [target_id.as_str()],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    )?;
    let requested_outcome = (
        outcome.state.as_str().to_string(),
        outcome.publication_operation_id.clone(),
        outcome
            .result_variant_id
            .as_ref()
            .map(|value| value.as_str().to_string()),
        outcome
            .failure_class
            .map(FailureClass::as_str)
            .map(str::to_string),
        outcome.failure_summary.clone(),
    );
    if stored_outcome == requested_outcome {
        transaction.commit()?;
        return Ok(PersistedWriteOutcome::AlreadyApplied);
    }
    if target.state == outcome.state || target.state.is_terminal() {
        return Err(LifecycleError::StructuralConflict);
    }
    if !target_transition_allowed(target.state, outcome.state) {
        return Err(LifecycleError::InvalidTransition);
    }
    validate_target_outcome(&transaction, &target, outcome)?;
    let updated = transaction.execute(
        "UPDATE managed_media_lifecycle_targets
         SET target_state = ?2, publication_operation_id = ?3, result_variant_id = ?4,
             failure_class = ?5, failure_summary = ?6, updated_at = ?7
         WHERE target_id = ?1 AND target_state = ?8
           AND EXISTS (
             SELECT 1 FROM managed_media_lifecycle_intents
             WHERE intent_id = ?9 AND lifecycle_state = 'claimed' AND claim_token = ?10
           )",
        params![
            target_id.as_str(),
            outcome.state.as_str(),
            outcome.publication_operation_id.as_deref(),
            outcome
                .result_variant_id
                .as_ref()
                .map(ValidatedSha256::as_str),
            outcome.failure_class.map(FailureClass::as_str),
            outcome.failure_summary.as_deref(),
            now.as_str(),
            target.state.as_str(),
            claimed.intent_id.as_str(),
            claimed.claim_token.as_str()
        ],
    )?;
    if updated != 1 {
        return Err(LifecycleError::LostOwnership);
    }
    transaction.commit()?;
    Ok(PersistedWriteOutcome::Applied)
}

pub fn finalize_generation(
    connection: &Connection,
    item_id: &ValidatedSha256,
    revision: ItemRevision,
    intent_id: &LifecycleIntentIdentity,
    claim_token: &LifecycleClaimToken,
    now: &ExecutorTimestamp,
) -> Result<FinalizationOutcome, LifecycleError> {
    let transaction = connection.unchecked_transaction()?;
    let intent = load_intent_in_transaction(&transaction, intent_id.as_str())?;
    if intent.item_id != item_id.as_str() || intent.revision != revision {
        return Err(LifecycleError::IdentityConflict);
    }
    let (current_revision, desired_revision): (i64, i64) = transaction.query_row(
        "SELECT current_revision, desired_revision
         FROM managed_media_item_generations WHERE managed_item_id = ?1",
        [&intent.item_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if current_revision == intent.revision.as_i64() && intent.state == LifecycleState::Completed {
        transaction.commit()?;
        return Ok(FinalizationOutcome::AlreadyFinalized);
    }
    require_owned(validate_claim_ownership_in_connection(
        &transaction,
        intent_id,
        item_id,
        revision,
        claim_token,
        now,
    )?)?;
    if desired_revision != intent.revision.as_i64()
        || intent.state != LifecycleState::Claimed
        || intent.action == LifecycleAction::Retire
    {
        return Err(LifecycleError::FinalizationNotReady);
    }
    let stored_claim: Option<String> = transaction.query_row(
        "SELECT claim_token FROM managed_media_lifecycle_intents WHERE intent_id = ?1",
        [intent_id.as_str()],
        |row| row.get(0),
    )?;
    if stored_claim.as_deref() != Some(claim_token.as_str()) {
        return Err(LifecycleError::ClaimUnavailable);
    }
    let desired_fingerprint = intent
        .desired_source_fingerprint
        .as_deref()
        .ok_or(LifecycleError::FinalizationNotReady)?;
    let (locator_hash, pending_fingerprint, item_state): (String, Option<String>, String) =
        transaction.query_row(
            "SELECT locator_hash, pending_source_fingerprint, lifecycle_state
         FROM managed_media_items WHERE item_id = ?1",
            [&intent.item_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    let expected_locator: String = transaction.query_row(
        "SELECT expected_locator_hash FROM managed_media_lifecycle_intents WHERE intent_id = ?1",
        [intent_id.as_str()],
        |row| row.get(0),
    )?;
    if !matches!(item_state.as_str(), "active" | "pending")
        || locator_hash != expected_locator
        || pending_fingerprint.as_deref() != Some(desired_fingerprint)
    {
        return Err(LifecycleError::IdentityConflict);
    }
    let targets = load_targets_for_intent(&transaction, intent_id.as_str())?;
    if targets.is_empty()
        || targets.iter().any(|target| {
            !matches!(
                target.state,
                TargetState::Published | TargetState::SkippedIneligible
            )
        })
    {
        return Err(LifecycleError::FinalizationNotReady);
    }
    for target in targets
        .iter()
        .filter(|target| target.state == TargetState::Published)
    {
        validate_published_target(&transaction, target, desired_fingerprint)?;
    }
    let updated_item = transaction.execute(
        "UPDATE managed_media_items
         SET current_source_fingerprint = ?2, pending_source_fingerprint = NULL,
             lifecycle_state = 'active', updated_at = ?3
         WHERE item_id = ?1 AND pending_source_fingerprint = ?2",
        (&intent.item_id, desired_fingerprint, now.as_str()),
    )?;
    let updated_generation = transaction.execute(
        "UPDATE managed_media_item_generations
         SET current_revision = desired_revision, updated_at = ?2
         WHERE managed_item_id = ?1 AND desired_revision = ?3",
        (&intent.item_id, now.as_str(), intent.revision.as_i64()),
    )?;
    let updated_intent = transaction.execute(
        "UPDATE managed_media_lifecycle_intents
         SET lifecycle_state = 'completed', claim_token = NULL, claim_expires_at = NULL,
             retry_eligible_at = NULL, failure_class = NULL, failure_summary = NULL,
             updated_at = ?3, finished_at = ?3
         WHERE intent_id = ?1 AND lifecycle_state = 'claimed' AND claim_token = ?2",
        (intent_id.as_str(), claim_token.as_str(), now.as_str()),
    )?;
    if updated_item != 1 || updated_generation != 1 || updated_intent != 1 {
        return Err(LifecycleError::FinalizationNotReady);
    }
    transaction.commit()?;
    Ok(FinalizationOutcome::Promoted)
}

pub fn complete_retirement(
    connection: &Connection,
    item_id: &ValidatedSha256,
    revision: ItemRevision,
    intent_id: &LifecycleIntentIdentity,
    claim_token: &LifecycleClaimToken,
    now: &ExecutorTimestamp,
) -> Result<FinalizationOutcome, LifecycleError> {
    let transaction = connection.unchecked_transaction()?;
    let intent = load_intent_in_transaction(&transaction, intent_id.as_str())?;
    if intent.item_id != item_id.as_str()
        || intent.revision != revision
        || intent.action != LifecycleAction::Retire
    {
        return Err(LifecycleError::IdentityConflict);
    }
    let (current_revision, desired_revision): (i64, i64) = transaction.query_row(
        "SELECT current_revision, desired_revision
         FROM managed_media_item_generations WHERE managed_item_id = ?1",
        [item_id.as_str()],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if current_revision == revision.as_i64() && intent.state == LifecycleState::Retired {
        transaction.commit()?;
        return Ok(FinalizationOutcome::AlreadyFinalized);
    }
    require_owned(validate_claim_ownership_in_connection(
        &transaction,
        intent_id,
        item_id,
        revision,
        claim_token,
        now,
    )?)?;
    let target_count: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM managed_media_lifecycle_targets WHERE intent_id = ?1",
        [intent_id.as_str()],
        |row| row.get(0),
    )?;
    let stored_claim: Option<String> = transaction.query_row(
        "SELECT claim_token FROM managed_media_lifecycle_intents WHERE intent_id = ?1",
        [intent_id.as_str()],
        |row| row.get(0),
    )?;
    if desired_revision != revision.as_i64()
        || intent.state != LifecycleState::Claimed
        || stored_claim.as_deref() != Some(claim_token.as_str())
        || target_count != 0
    {
        return Err(LifecycleError::FinalizationNotReady);
    }
    let updated_item = transaction.execute(
        "UPDATE managed_media_items
         SET pending_source_fingerprint = NULL, lifecycle_state = 'retired', updated_at = ?2
         WHERE item_id = ?1 AND lifecycle_state IN ('active', 'pending')",
        (item_id.as_str(), now.as_str()),
    )?;
    let updated_generation = transaction.execute(
        "UPDATE managed_media_item_generations
         SET current_revision = desired_revision, updated_at = ?2
         WHERE managed_item_id = ?1 AND desired_revision = ?3",
        (item_id.as_str(), now.as_str(), revision.as_i64()),
    )?;
    let updated_intent = transaction.execute(
        "UPDATE managed_media_lifecycle_intents
         SET lifecycle_state = 'retired', claim_token = NULL, claim_expires_at = NULL,
             retry_eligible_at = NULL, failure_class = NULL, failure_summary = NULL,
             updated_at = ?3, finished_at = ?3
         WHERE intent_id = ?1 AND lifecycle_state = 'claimed' AND claim_token = ?2",
        (intent_id.as_str(), claim_token.as_str(), now.as_str()),
    )?;
    if updated_item != 1 || updated_generation != 1 || updated_intent != 1 {
        return Err(LifecycleError::FinalizationNotReady);
    }
    transaction.commit()?;
    Ok(FinalizationOutcome::Promoted)
}

pub fn load_intent(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
) -> Result<LifecycleIntentRecord, LifecycleError> {
    load_intent_from_connection(connection, intent_id.as_str())
}

pub fn load_target(
    connection: &Connection,
    target_id: &LifecycleTargetIdentity,
) -> Result<LifecycleTargetRecord, LifecycleError> {
    load_target_from_connection(connection, target_id.as_str())
}

pub fn load_targets_for_claim(
    connection: &Connection,
    claimed: &ClaimedIntentSnapshot,
    now: &ExecutorTimestamp,
) -> Result<Vec<LifecycleTargetRecord>, LifecycleError> {
    require_owned(validate_claim_ownership_in_connection(
        connection,
        &claimed.intent_id,
        &claimed.item_id,
        claimed.revision,
        &claimed.claim_token,
        now,
    )?)?;
    let targets = load_targets_for_intent(connection, claimed.intent_id.as_str())?;
    if targets.iter().any(|target| {
        target.intent_id != claimed.intent_id.as_str()
            || target.item_id != claimed.item_id.as_str()
            || target.revision != claimed.revision
    }) {
        return Err(LifecycleError::IdentityConflict);
    }
    Ok(targets)
}

pub fn validate_claim_ownership(
    connection: &Connection,
    claimed: &ClaimedIntentSnapshot,
    now: &ExecutorTimestamp,
) -> Result<ClaimOwnershipStatus, LifecycleError> {
    validate_claim_ownership_in_connection(
        connection,
        &claimed.intent_id,
        &claimed.item_id,
        claimed.revision,
        &claimed.claim_token,
        now,
    )
}

#[derive(Debug)]
struct ClaimContext {
    intent_id: LifecycleIntentIdentity,
    item_id: ValidatedSha256,
    revision: ItemRevision,
    action: LifecycleAction,
    state: LifecycleState,
    attempt_count: u64,
    cancellation_requested: bool,
    superseded_by_intent_id: Option<String>,
    retry_eligible_at: Option<ExecutorTimestamp>,
    claim_token: Option<LifecycleClaimToken>,
    claim_expires_at: Option<ExecutorTimestamp>,
    created_at: ExecutorTimestamp,
    item_state: String,
    current_desired_revision: ItemRevision,
}

fn load_claim_context(
    connection: &Connection,
    intent_id: &str,
) -> Result<ClaimContext, LifecycleError> {
    let value = connection
        .query_row(
            "SELECT intent.intent_id, intent.managed_item_id, intent.desired_revision,
                    intent.lifecycle_action, intent.lifecycle_state, intent.attempt_count,
                    intent.cancellation_requested, intent.superseded_by_intent_id,
                    intent.retry_eligible_at, intent.claim_token, intent.claim_expires_at,
                    intent.created_at, item.lifecycle_state, generation.desired_revision
             FROM managed_media_lifecycle_intents intent
             JOIN managed_media_items item ON item.item_id = intent.managed_item_id
             JOIN managed_media_item_generations generation
               ON generation.managed_item_id = intent.managed_item_id
             WHERE intent.intent_id = ?1",
            [intent_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, bool>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, String>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, i64>(13)?,
                ))
            },
        )
        .optional()?
        .ok_or(LifecycleError::IntentNotFound)?;
    if value.5 < 0 {
        return Err(LifecycleError::UnknownStoredValue);
    }
    Ok(ClaimContext {
        intent_id: LifecycleIntentIdentity::new(value.0)
            .map_err(|_| LifecycleError::UnknownStoredValue)?,
        item_id: ValidatedSha256::new(value.1).map_err(|_| LifecycleError::UnknownStoredValue)?,
        revision: ItemRevision::from_i64(value.2)?,
        action: LifecycleAction::parse(&value.3)?,
        state: LifecycleState::parse(&value.4)?,
        attempt_count: value.5 as u64,
        cancellation_requested: value.6,
        superseded_by_intent_id: value.7,
        retry_eligible_at: value
            .8
            .as_deref()
            .map(ExecutorTimestamp::parse)
            .transpose()?,
        claim_token: value
            .9
            .map(LifecycleClaimToken::new)
            .transpose()
            .map_err(|_| LifecycleError::UnknownStoredValue)?,
        claim_expires_at: value
            .10
            .as_deref()
            .map(ExecutorTimestamp::parse)
            .transpose()?,
        created_at: ExecutorTimestamp::parse(&value.11)?,
        item_state: value.12,
        current_desired_revision: ItemRevision::from_i64(value.13)?,
    })
}

fn parse_work_candidate(
    value: (
        String,
        String,
        i64,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
    ),
) -> Result<LifecycleWorkCandidate, LifecycleError> {
    let state = LifecycleState::parse(&value.4)?;
    let previous_claim_token = value
        .7
        .map(LifecycleClaimToken::new)
        .transpose()
        .map_err(|_| LifecycleError::UnknownStoredValue)?;
    let previous_claim_expires_at = value
        .8
        .as_deref()
        .map(ExecutorTimestamp::parse)
        .transpose()?;
    let claim_kind = if state == LifecycleState::Claimed {
        if previous_claim_token.is_none() || previous_claim_expires_at.is_none() {
            return Err(LifecycleError::StructuralConflict);
        }
        WorkClaimKind::ReclaimExpired
    } else {
        WorkClaimKind::Initial
    };
    ExecutorTimestamp::parse(&value.6)?;
    Ok(LifecycleWorkCandidate {
        intent_id: LifecycleIntentIdentity::new(value.0)
            .map_err(|_| LifecycleError::UnknownStoredValue)?,
        item_id: ValidatedSha256::new(value.1).map_err(|_| LifecycleError::UnknownStoredValue)?,
        revision: ItemRevision::from_i64(value.2)?,
        action: LifecycleAction::parse(&value.3)?,
        state,
        effective_due_at: ExecutorTimestamp::parse(&value.5)?,
        claim_kind,
        previous_claim_token,
        previous_claim_expires_at,
    })
}

fn load_claim_candidate(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
    now: &ExecutorTimestamp,
) -> Result<Option<LifecycleWorkCandidate>, LifecycleError> {
    let context = load_claim_context(connection, intent_id.as_str())?;
    let claim_kind = match context.state {
        LifecycleState::Queued | LifecycleState::RecoveryRequired => WorkClaimKind::Initial,
        LifecycleState::RetryWait
            if context
                .retry_eligible_at
                .as_ref()
                .is_some_and(|eligible| eligible <= now) =>
        {
            WorkClaimKind::Initial
        }
        LifecycleState::Claimed
            if context
                .claim_expires_at
                .as_ref()
                .is_some_and(|expiry| expiry <= now) =>
        {
            WorkClaimKind::ReclaimExpired
        }
        _ => return Ok(None),
    };
    if context.cancellation_requested
        || context.superseded_by_intent_id.is_some()
        || !matches!(context.item_state.as_str(), "active" | "pending")
        || context.revision != context.current_desired_revision
    {
        return Ok(None);
    }
    let effective_due_at = match context.state {
        LifecycleState::RetryWait => context.retry_eligible_at.clone(),
        LifecycleState::Claimed => context.claim_expires_at.clone(),
        _ => Some(context.created_at.clone()),
    }
    .ok_or(LifecycleError::StructuralConflict)?;
    Ok(Some(LifecycleWorkCandidate {
        intent_id: context.intent_id,
        item_id: context.item_id,
        revision: context.revision,
        action: context.action,
        state: context.state,
        effective_due_at,
        claim_kind,
        previous_claim_token: context.claim_token,
        previous_claim_expires_at: context.claim_expires_at,
    }))
}

fn claim_candidate_rejection(
    context: &ClaimContext,
    candidate: &LifecycleWorkCandidate,
    now: &ExecutorTimestamp,
) -> Result<Option<ClaimLossReason>, LifecycleError> {
    if context.intent_id != candidate.intent_id
        || context.item_id != candidate.item_id
        || context.revision != candidate.revision
        || context.action != candidate.action
        || context.state != candidate.state
    {
        return Ok(Some(ClaimLossReason::LostRace));
    }
    let reason = claim_loss_reason(context, now);
    let eligible = match candidate.claim_kind {
        WorkClaimKind::Initial => {
            matches!(
                context.state,
                LifecycleState::Queued
                    | LifecycleState::RetryWait
                    | LifecycleState::RecoveryRequired
            ) && (context.state != LifecycleState::RetryWait
                || context
                    .retry_eligible_at
                    .as_ref()
                    .is_some_and(|eligible| eligible <= now))
        }
        WorkClaimKind::ReclaimExpired => {
            context.state == LifecycleState::Claimed
                && context.claim_token == candidate.previous_claim_token
                && context.claim_expires_at == candidate.previous_claim_expires_at
                && context
                    .claim_expires_at
                    .as_ref()
                    .is_some_and(|expiry| expiry <= now)
        }
    };
    if eligible
        && !context.cancellation_requested
        && context.superseded_by_intent_id.is_none()
        && matches!(context.item_state.as_str(), "active" | "pending")
        && context.revision == context.current_desired_revision
    {
        Ok(None)
    } else {
        Ok(Some(reason))
    }
}

fn claim_loss_reason(context: &ClaimContext, now: &ExecutorTimestamp) -> ClaimLossReason {
    if context.cancellation_requested {
        ClaimLossReason::Cancelled
    } else if context.state == LifecycleState::Superseded
        || context.superseded_by_intent_id.is_some()
    {
        ClaimLossReason::Superseded
    } else if context.item_state == "retired" {
        ClaimLossReason::Retired
    } else if context.revision != context.current_desired_revision {
        ClaimLossReason::StaleRevision
    } else if context.state == LifecycleState::Claimed
        && context
            .claim_expires_at
            .as_ref()
            .is_some_and(|expiry| expiry > now)
    {
        ClaimLossReason::LostRace
    } else if context.state == LifecycleState::Claimed {
        ClaimLossReason::Expired
    } else {
        ClaimLossReason::InvalidState
    }
}

fn validate_claim_ownership_in_connection(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
    item_id: &ValidatedSha256,
    revision: ItemRevision,
    claim_token: &LifecycleClaimToken,
    now: &ExecutorTimestamp,
) -> Result<ClaimOwnershipStatus, LifecycleError> {
    let context = load_claim_context(connection, intent_id.as_str())?;
    if context.item_id != *item_id
        || context.revision != revision
        || context.current_desired_revision != revision
    {
        return Ok(ClaimOwnershipStatus::StaleRevision);
    }
    if context.cancellation_requested {
        return Ok(ClaimOwnershipStatus::Cancelled);
    }
    if context.state == LifecycleState::Superseded || context.superseded_by_intent_id.is_some() {
        return Ok(ClaimOwnershipStatus::Superseded);
    }
    if context.item_state == "retired" {
        return Ok(ClaimOwnershipStatus::Retired);
    }
    if !matches!(context.item_state.as_str(), "active" | "pending")
        || context.state != LifecycleState::Claimed
    {
        return Ok(ClaimOwnershipStatus::InvalidState);
    }
    if context.claim_token.as_ref() != Some(claim_token) {
        return Ok(ClaimOwnershipStatus::LostOwnership);
    }
    if context
        .claim_expires_at
        .as_ref()
        .is_none_or(|expiry| expiry <= now)
    {
        return Ok(ClaimOwnershipStatus::Expired);
    }
    Ok(ClaimOwnershipStatus::Owned)
}

fn require_owned(status: ClaimOwnershipStatus) -> Result<(), LifecycleError> {
    match status {
        ClaimOwnershipStatus::Owned => Ok(()),
        ClaimOwnershipStatus::LostOwnership => Err(LifecycleError::LostOwnership),
        ClaimOwnershipStatus::Cancelled => Err(LifecycleError::Cancelled),
        ClaimOwnershipStatus::StaleRevision => Err(LifecycleError::StaleRevision),
        ClaimOwnershipStatus::Superseded => Err(LifecycleError::Superseded),
        ClaimOwnershipStatus::Retired => Err(LifecycleError::Retired),
        ClaimOwnershipStatus::Expired => Err(LifecycleError::ClaimExpired),
        ClaimOwnershipStatus::InvalidState => Err(LifecycleError::InvalidTransition),
    }
}

fn renewal_outcome(status: ClaimOwnershipStatus) -> ClaimRenewalOutcome {
    match status {
        ClaimOwnershipStatus::Owned => ClaimRenewalOutcome::Renewed,
        ClaimOwnershipStatus::LostOwnership => ClaimRenewalOutcome::LostOwnership,
        ClaimOwnershipStatus::Cancelled => ClaimRenewalOutcome::Cancelled,
        ClaimOwnershipStatus::StaleRevision => ClaimRenewalOutcome::StaleRevision,
        ClaimOwnershipStatus::Superseded => ClaimRenewalOutcome::Superseded,
        ClaimOwnershipStatus::Retired => ClaimRenewalOutcome::Retired,
        ClaimOwnershipStatus::Expired => ClaimRenewalOutcome::Expired,
        ClaimOwnershipStatus::InvalidState => ClaimRenewalOutcome::InvalidState,
    }
}

fn load_intent_from_connection(
    connection: &Connection,
    intent_id: &str,
) -> Result<LifecycleIntentRecord, LifecycleError> {
    connection
        .query_row(
            "SELECT intent_id, managed_item_id, desired_revision, lifecycle_action,
                    lifecycle_state, attempt_count, cancellation_requested,
                    desired_source_fingerprint
             FROM managed_media_lifecycle_intents WHERE intent_id = ?1",
            [intent_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, bool>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            },
        )
        .optional()?
        .ok_or(LifecycleError::IntentNotFound)
        .and_then(parse_intent_tuple)
}

fn load_intent_in_transaction(
    transaction: &Transaction<'_>,
    intent_id: &str,
) -> Result<LifecycleIntentRecord, LifecycleError> {
    load_intent_from_connection(transaction, intent_id)
}

fn parse_intent_tuple(
    value: (
        String,
        String,
        i64,
        String,
        String,
        i64,
        bool,
        Option<String>,
    ),
) -> Result<LifecycleIntentRecord, LifecycleError> {
    if value.5 < 0
        || LifecycleIntentIdentity::new(value.0.clone()).is_err()
        || ValidatedSha256::new(value.1.clone()).is_err()
        || value
            .7
            .as_ref()
            .is_some_and(|fingerprint| ValidatedSha256::new(fingerprint.clone()).is_err())
    {
        return Err(LifecycleError::UnknownStoredValue);
    }
    Ok(LifecycleIntentRecord {
        intent_id: value.0,
        item_id: value.1,
        revision: ItemRevision::from_i64(value.2)?,
        action: LifecycleAction::parse(&value.3)?,
        state: LifecycleState::parse(&value.4)?,
        attempt_count: value.5 as u64,
        cancellation_requested: value.6,
        desired_source_fingerprint: value.7,
    })
}

fn load_target_from_connection(
    connection: &Connection,
    target_id: &str,
) -> Result<LifecycleTargetRecord, LifecycleError> {
    connection
        .query_row(
            "SELECT target_id, intent_id, managed_item_id, desired_revision, role_id,
                    variant_class, standard_tier, target_state,
                    publication_operation_id, result_variant_id
             FROM managed_media_lifecycle_targets WHERE target_id = ?1",
            [target_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            },
        )
        .optional()?
        .ok_or(LifecycleError::TargetNotFound)
        .and_then(parse_target_tuple)
}

fn load_target_in_transaction(
    transaction: &Transaction<'_>,
    target_id: &str,
) -> Result<LifecycleTargetRecord, LifecycleError> {
    load_target_from_connection(transaction, target_id)
}

fn parse_target_tuple(
    value: (
        String,
        String,
        String,
        i64,
        String,
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    ),
) -> Result<LifecycleTargetRecord, LifecycleError> {
    if LifecycleTargetIdentity::new(value.0.clone()).is_err()
        || LifecycleIntentIdentity::new(value.1.clone()).is_err()
        || ValidatedSha256::new(value.2.clone()).is_err()
        || value
            .9
            .as_ref()
            .is_some_and(|variant| ValidatedSha256::new(variant.clone()).is_err())
    {
        return Err(LifecycleError::UnknownStoredValue);
    }
    Ok(LifecycleTargetRecord {
        target_id: value.0,
        intent_id: value.1,
        item_id: value.2,
        revision: ItemRevision::from_i64(value.3)?,
        role: parse_role(&value.4)?,
        class: parse_class(&value.5, value.6.as_deref())?,
        state: TargetState::parse(&value.7)?,
        publication_operation_id: value.8,
        result_variant_id: value.9,
    })
}

fn load_targets_for_intent(
    connection: &Connection,
    intent_id: &str,
) -> Result<Vec<LifecycleTargetRecord>, LifecycleError> {
    let mut statement = connection.prepare(
        "SELECT target_id FROM managed_media_lifecycle_targets
         WHERE intent_id = ?1 ORDER BY role_id, variant_class, standard_tier, target_id",
    )?;
    let ids = statement
        .query_map([intent_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    ids.into_iter()
        .map(|target_id| load_target_from_connection(connection, &target_id))
        .collect()
}

fn validate_target_outcome(
    transaction: &Transaction<'_>,
    target: &LifecycleTargetRecord,
    outcome: &TargetOutcome,
) -> Result<(), LifecycleError> {
    match outcome.state {
        TargetState::Published => {
            if outcome.failure_class.is_some() || outcome.failure_summary.is_some() {
                return Err(LifecycleError::InvalidFailure);
            }
            let operation_id = outcome
                .publication_operation_id
                .as_deref()
                .ok_or(LifecycleError::InvalidPublicationLink)?;
            let variant_id = outcome
                .result_variant_id
                .as_ref()
                .ok_or(LifecycleError::InvalidPublicationLink)?;
            let intent = load_intent_from_connection(transaction, &target.intent_id)?;
            let source = intent
                .desired_source_fingerprint
                .as_deref()
                .ok_or(LifecycleError::InvalidPublicationLink)?;
            publication::validate_linked_publication(
                transaction,
                operation_id,
                &target.item_id,
                variant_id.as_str(),
                source,
                target.role,
                target.class,
            )
            .map_err(|_| LifecycleError::InvalidPublicationLink)
        }
        TargetState::RetryableFailure
            if outcome.failure_class == Some(FailureClass::Retryable)
                && outcome.publication_operation_id.is_none()
                && outcome.result_variant_id.is_none() =>
        {
            Ok(())
        }
        TargetState::TerminalFailure
            if outcome.failure_class == Some(FailureClass::Terminal)
                && outcome.publication_operation_id.is_none()
                && outcome.result_variant_id.is_none() =>
        {
            Ok(())
        }
        TargetState::Cancelled
            if outcome.failure_class == Some(FailureClass::Cancelled)
                && outcome.publication_operation_id.is_none()
                && outcome.result_variant_id.is_none() =>
        {
            Ok(())
        }
        TargetState::Superseded
            if outcome.failure_class == Some(FailureClass::Stale)
                && outcome.publication_operation_id.is_none()
                && outcome.result_variant_id.is_none() =>
        {
            Ok(())
        }
        TargetState::RecoveryRequired
            if outcome.failure_class == Some(FailureClass::RecoveryRequired)
                && outcome.publication_operation_id.is_none()
                && outcome.result_variant_id.is_none() =>
        {
            Ok(())
        }
        TargetState::Claimed | TargetState::SkippedIneligible
            if outcome.failure_class.is_none()
                && outcome.failure_summary.is_none()
                && outcome.publication_operation_id.is_none()
                && outcome.result_variant_id.is_none() =>
        {
            Ok(())
        }
        _ => Err(LifecycleError::InvalidFailure),
    }
}

fn validate_published_target(
    connection: &Connection,
    target: &LifecycleTargetRecord,
    source_fingerprint: &str,
) -> Result<(), LifecycleError> {
    publication::validate_linked_publication(
        connection,
        target
            .publication_operation_id
            .as_deref()
            .ok_or(LifecycleError::InvalidPublicationLink)?,
        &target.item_id,
        target
            .result_variant_id
            .as_deref()
            .ok_or(LifecycleError::InvalidPublicationLink)?,
        source_fingerprint,
        target.role,
        target.class,
    )
    .map_err(|_| LifecycleError::InvalidPublicationLink)
}

fn class_parts(class: VariantClass) -> (&'static str, Option<&'static str>) {
    match class {
        VariantClass::Standard(tier) => ("standard", Some(tier.as_str())),
        VariantClass::NativeFallback => ("native_fallback", None),
    }
}

fn parse_class(
    variant_class: &str,
    standard_tier: Option<&str>,
) -> Result<VariantClass, LifecycleError> {
    match (variant_class, standard_tier) {
        ("standard", Some("THUMBNAIL")) => Ok(VariantClass::Standard(TierId::Thumbnail)),
        ("standard", Some("MEDIUM")) => Ok(VariantClass::Standard(TierId::Medium)),
        ("standard", Some("LARGE")) => Ok(VariantClass::Standard(TierId::Large)),
        ("native_fallback", None) => Ok(VariantClass::NativeFallback),
        _ => Err(LifecycleError::UnknownStoredValue),
    }
}

fn parse_role(value: &str) -> Result<RoleId, LifecycleError> {
    RoleId::ALL
        .into_iter()
        .find(|role| role.as_str() == value)
        .ok_or(LifecycleError::UnknownStoredValue)
}

fn require_timestamp(value: &str) -> Result<(), LifecycleError> {
    if value.is_empty() || value.trim() != value || value.len() > 64 || value.contains('\0') {
        return Err(LifecycleError::InvalidTimestamp);
    }
    Ok(())
}

fn require_summary(value: &str) -> Result<(), LifecycleError> {
    if value.is_empty() || value.len() > 1024 || value.contains('\0') {
        return Err(LifecycleError::InvalidFailure);
    }
    Ok(())
}
