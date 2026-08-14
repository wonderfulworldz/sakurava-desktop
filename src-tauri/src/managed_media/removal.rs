use std::{
    collections::HashMap,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    acquisition::validate_local_source_readable,
    catalog_lifecycle::{
        queue_generate_after_removal, resolve_item_source_locator, SqliteOwnerSourceProvider,
    },
    identity::{SourceLocatorKind, ValidatedSha256},
    path::ManagedMediaRoot,
    publication::{PublicationError, RecoveryOutcome},
    schema,
};

const REMOVAL_PAYLOAD_VERSION: u32 = 1;
const REMOVAL_KIND: &str = "guarded_remove_mini_images";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemovalPreview {
    pub preview_token: String,
    pub automatic_policy_state: String,
    pub source_slot_count_considered: u64,
    pub removable_source_slot_count: u64,
    pub removable_physical_variant_count: u64,
    pub recorded_removable_bytes: u64,
    pub protected_original_unavailable_source_count: u64,
    pub protected_original_unavailable_variant_count: u64,
    pub already_missing_managed_file_count: u64,
    pub conflicting_nonterminal_lifecycle_work_count: u64,
    pub unresolved_recovery_publication_conflict_count: u64,
    pub validation_failed_source_count: u64,
    pub skipped_source_slot_count: u64,
    pub lifecycle_conflict_source_count: u64,
    pub recovery_conflict_source_count: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemovalExecuteRequest {
    pub preview_token: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemovalResult {
    pub removed_source_slot_count: u64,
    pub removed_variant_count: u64,
    pub protected_original_unavailable_source_count: u64,
    pub protected_original_unavailable_variant_count: u64,
    pub already_missing_reconciled_count: u64,
    pub failed_source_slot_count: u64,
    pub failed_variant_count: u64,
    pub skipped_source_slot_count: u64,
    pub locked_or_unmovable_variant_count: u64,
    pub stale_source_slot_count: u64,
    pub lifecycle_conflict_source_count: u64,
    pub recovery_conflict_source_count: u64,
    pub validation_failed_source_count: u64,
    pub reclaimed_bytes: u64,
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct VariantSnapshot {
    variant_id: String,
    relative_path: String,
    byte_length: u64,
    checksum: String,
    publication_state: String,
    file_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct ItemSnapshot {
    item_id: String,
    locator_hash: String,
    lifecycle_state: String,
    current_revision: u64,
    desired_revision: u64,
    source_readable: bool,
    lifecycle_conflict_count: u64,
    recovery_conflict_count: u64,
    validation_failed: bool,
    variants: Vec<VariantSnapshot>,
}

impl ItemSnapshot {
    fn removable(&self) -> bool {
        self.source_readable
            && self.lifecycle_conflict_count == 0
            && self.recovery_conflict_count == 0
            && !self.validation_failed
            && !self.variants.is_empty()
    }
}

#[derive(Debug, Clone)]
struct RemovalAnalysis {
    preview: RemovalPreview,
    items: Vec<ItemSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct RemovalJournalPayload {
    version: u32,
    kind: String,
    operation_id: String,
    preview_token: String,
    item: ItemSnapshot,
    variants: Vec<RemovalJournalVariant>,
    generation_intent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct RemovalJournalVariant {
    variant: VariantSnapshot,
    quarantine_relative_path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemovalFailurePoint {
    AfterQuarantine,
    AfterDatabaseCommit,
}

pub fn preview(
    connection: &Connection,
    root: &ManagedMediaRoot,
    automatic_policy_state: &str,
) -> Result<RemovalPreview, String> {
    Ok(analyze(connection, root, automatic_policy_state)?.preview)
}

pub fn execute(
    connection: &Connection,
    root: &ManagedMediaRoot,
    request: RemovalExecuteRequest,
) -> Result<RemovalResult, String> {
    execute_internal(connection, root, request, None)
}

pub(crate) fn execute_internal(
    connection: &Connection,
    root: &ManagedMediaRoot,
    request: RemovalExecuteRequest,
    failure_point: Option<RemovalFailurePoint>,
) -> Result<RemovalResult, String> {
    let analysis = analyze(connection, root, "off")?;
    if request.preview_token != analysis.preview.preview_token {
        return Ok(RemovalResult {
            stale: true,
            ..empty_result(&analysis.preview)
        });
    }
    let mut result = empty_result(&analysis.preview);
    for item in analysis.items.iter().filter(|item| item.removable()) {
        match remove_item(
            connection,
            root,
            &analysis.preview.preview_token,
            item,
            failure_point,
        ) {
            Ok(item_result) => {
                result.removed_source_slot_count += 1;
                result.removed_variant_count += item.variants.len() as u64;
                result.already_missing_reconciled_count += item_result.already_missing;
                result.reclaimed_bytes += item_result.reclaimed_bytes;
            }
            Err(error) => {
                result.failed_source_slot_count += 1;
                result.failed_variant_count += item.variants.len() as u64;
                match error.class {
                    ItemRemovalFailureClass::LockedOrUnmovable => {
                        result.locked_or_unmovable_variant_count += item.variants.len() as u64
                    }
                    ItemRemovalFailureClass::Stale => result.stale_source_slot_count += 1,
                    ItemRemovalFailureClass::LifecycleConflict => {
                        result.lifecycle_conflict_source_count += 1
                    }
                    ItemRemovalFailureClass::RecoveryConflict => {
                        result.recovery_conflict_source_count += 1
                    }
                    ItemRemovalFailureClass::ValidationFailed => {
                        result.validation_failed_source_count += 1
                    }
                }
                let _ = error.message;
            }
        }
    }
    Ok(result)
}

fn empty_result(preview: &RemovalPreview) -> RemovalResult {
    RemovalResult {
        removed_source_slot_count: 0,
        removed_variant_count: 0,
        protected_original_unavailable_source_count: preview
            .protected_original_unavailable_source_count,
        protected_original_unavailable_variant_count: preview
            .protected_original_unavailable_variant_count,
        already_missing_reconciled_count: 0,
        failed_source_slot_count: 0,
        failed_variant_count: 0,
        skipped_source_slot_count: preview.skipped_source_slot_count
            + preview.protected_original_unavailable_source_count,
        locked_or_unmovable_variant_count: 0,
        stale_source_slot_count: 0,
        lifecycle_conflict_source_count: preview.lifecycle_conflict_source_count,
        recovery_conflict_source_count: preview.recovery_conflict_source_count,
        validation_failed_source_count: preview.validation_failed_source_count,
        reclaimed_bytes: 0,
        stale: false,
    }
}

fn analyze(
    connection: &Connection,
    root: &ManagedMediaRoot,
    automatic_policy_state: &str,
) -> Result<RemovalAnalysis, String> {
    schema::validate_schema(connection).map_err(|error| error.to_string())?;
    let recovery_operations = nonterminal_operation_items(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT item.item_id, item.locator_hash, item.lifecycle_state,
                    generation.current_revision, generation.desired_revision
             FROM managed_media_items item
             JOIN managed_media_item_generations generation
               ON generation.managed_item_id = item.item_id
             WHERE item.lifecycle_state IN ('active', 'pending')
             ORDER BY item.item_id",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, u64>(3)?,
                row.get::<_, u64>(4)?,
            ))
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    let mut items = Vec::new();
    for (item_id, locator_hash, lifecycle_state, current_revision, desired_revision) in rows {
        let validated_item = ValidatedSha256::new(item_id.clone())?;
        let source_readable = {
            let mut provider = SqliteOwnerSourceProvider::new(connection);
            resolve_item_source_locator(connection, &validated_item, &mut provider)
                .ok()
                .filter(|source| {
                    matches!(
                        source.locator_kind,
                        SourceLocatorKind::ExternalFile | SourceLocatorKind::ExternalDirectoryEntry
                    )
                })
                .is_some_and(|source| {
                    validate_local_source_readable(Path::new(&source.locator)).is_ok()
                })
        };
        let lifecycle_conflict_count: u64 = connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_lifecycle_intents
                 WHERE managed_item_id = ?1
                   AND lifecycle_state IN ('queued', 'claimed', 'retry_wait', 'recovery_required')",
                [&item_id],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        let mut variants = load_variants(connection, root, &item_id)?;
        variants.sort_by(|left, right| left.variant_id.cmp(&right.variant_id));
        let validation_failed = variants.iter().any(|variant| {
            !matches!(
                variant.publication_state.as_str(),
                "published" | "superseded"
            ) || variant.file_state == "invalid"
        });
        items.push(ItemSnapshot {
            item_id: item_id.clone(),
            locator_hash,
            lifecycle_state,
            current_revision,
            desired_revision,
            source_readable,
            lifecycle_conflict_count,
            recovery_conflict_count: recovery_operations
                .by_item
                .get(&item_id)
                .copied()
                .unwrap_or(0)
                .saturating_add(recovery_operations.unknown),
            validation_failed,
            variants,
        });
    }
    let token = snapshot_token(&items)?;
    let mut preview = RemovalPreview {
        preview_token: token,
        automatic_policy_state: automatic_policy_state.to_string(),
        source_slot_count_considered: items.len() as u64,
        removable_source_slot_count: 0,
        removable_physical_variant_count: 0,
        recorded_removable_bytes: 0,
        protected_original_unavailable_source_count: 0,
        protected_original_unavailable_variant_count: 0,
        already_missing_managed_file_count: 0,
        conflicting_nonterminal_lifecycle_work_count: 0,
        unresolved_recovery_publication_conflict_count: recovery_operations.total,
        validation_failed_source_count: 0,
        skipped_source_slot_count: 0,
        lifecycle_conflict_source_count: 0,
        recovery_conflict_source_count: 0,
    };
    for item in &items {
        preview.already_missing_managed_file_count += item
            .variants
            .iter()
            .filter(|variant| variant.file_state == "missing")
            .count() as u64;
        preview.conflicting_nonterminal_lifecycle_work_count += item.lifecycle_conflict_count;
        preview.validation_failed_source_count += u64::from(item.validation_failed);
        preview.lifecycle_conflict_source_count +=
            u64::from(item.lifecycle_conflict_count > 0);
        preview.recovery_conflict_source_count +=
            u64::from(item.recovery_conflict_count > 0);
        if !item.source_readable {
            preview.protected_original_unavailable_source_count += 1;
            preview.protected_original_unavailable_variant_count += item.variants.len() as u64;
        } else if item.removable() {
            preview.removable_source_slot_count += 1;
            for variant in item
                .variants
                .iter()
                .filter(|variant| variant.file_state == "present")
            {
                preview.removable_physical_variant_count += 1;
                preview.recorded_removable_bytes = preview
                    .recorded_removable_bytes
                    .checked_add(variant.byte_length)
                    .ok_or_else(|| "Managed-media removal byte count overflowed.".to_string())?;
            }
        } else if !item.variants.is_empty() {
            preview.skipped_source_slot_count += 1;
        }
    }
    Ok(RemovalAnalysis { preview, items })
}

fn load_variants(
    connection: &Connection,
    root: &ManagedMediaRoot,
    item_id: &str,
) -> Result<Vec<VariantSnapshot>, String> {
    let mut statement = connection
        .prepare(
            "SELECT variant_id, relative_path, byte_length, checksum, publication_state
             FROM managed_media_variants WHERE managed_item_id = ?1 ORDER BY variant_id",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([item_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, u64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    rows.into_iter()
        .map(
            |(variant_id, relative_path, byte_length, checksum, publication_state)| {
                let path = root.resolve(Path::new(&relative_path))?;
                let file_state = match fs::symlink_metadata(&path) {
                    Ok(metadata)
                        if metadata.file_type().is_file() && !metadata.file_type().is_symlink() =>
                    {
                        "present"
                    }
                    Err(error) if error.kind() == ErrorKind::NotFound => "missing",
                    _ => "invalid",
                };
                Ok(VariantSnapshot {
                    variant_id,
                    relative_path,
                    byte_length,
                    checksum,
                    publication_state,
                    file_state: file_state.to_string(),
                })
            },
        )
        .collect()
}

struct RecoveryOperationSummary {
    by_item: HashMap<String, u64>,
    unknown: u64,
    total: u64,
}

fn nonterminal_operation_items(connection: &Connection) -> Result<RecoveryOperationSummary, String> {
    let mut statement = connection
        .prepare(
            "SELECT scope_payload_json FROM managed_media_operations
             WHERE operation_state NOT IN ('completed', 'failed', 'cancelled')",
        )
        .map_err(database_error)?;
    let payloads = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    let mut summary = RecoveryOperationSummary {
        by_item: HashMap::new(),
        unknown: 0,
        total: payloads.len() as u64,
    };
    for serialized in payloads {
        let item_id = serde_json::from_str::<serde_json::Value>(&serialized)
            .ok()
            .and_then(|payload| {
                payload
                .get("item_id")
                .or_else(|| payload.get("item").and_then(|item| item.get("item_id")))
                .and_then(|value| value.as_str())
                .map(str::to_string)
            });
        if let Some(item_id) = item_id {
            *summary.by_item.entry(item_id).or_default() += 1;
        } else {
            summary.unknown += 1;
        }
    }
    Ok(summary)
}

fn snapshot_token(items: &[ItemSnapshot]) -> Result<String, String> {
    let serialized = serde_json::to_vec(items).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(serialized)))
}

struct ItemRemovalOutcome {
    already_missing: u64,
    reclaimed_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ItemRemovalFailureClass {
    LockedOrUnmovable,
    Stale,
    LifecycleConflict,
    RecoveryConflict,
    ValidationFailed,
}

struct ItemRemovalFailure {
    class: ItemRemovalFailureClass,
    message: String,
}

impl ItemRemovalFailure {
    fn new(class: ItemRemovalFailureClass, message: impl Into<String>) -> Self {
        Self {
            class,
            message: message.into(),
        }
    }
}

impl From<String> for ItemRemovalFailure {
    fn from(message: String) -> Self {
        Self::new(ItemRemovalFailureClass::ValidationFailed, message)
    }
}

fn remove_item(
    connection: &Connection,
    root: &ManagedMediaRoot,
    preview_token: &str,
    item: &ItemSnapshot,
    failure_point: Option<RemovalFailurePoint>,
) -> Result<ItemRemovalOutcome, ItemRemovalFailure> {
    revalidate_item(connection, root, item)
        .map_err(|message| ItemRemovalFailure::new(ItemRemovalFailureClass::Stale, message))?;
    let operation_id = operation_id(preview_token, &item.item_id)?;
    let quarantine_base = root.quarantine_path("removal", &operation_id)?;
    let variants = item
        .variants
        .iter()
        .map(|variant| RemovalJournalVariant {
            variant: variant.clone(),
            quarantine_relative_path: format!(
                ".quarantine/removal/{operation_id}/{}",
                variant.variant_id
            ),
        })
        .collect::<Vec<_>>();
    let mut payload = RemovalJournalPayload {
        version: REMOVAL_PAYLOAD_VERSION,
        kind: REMOVAL_KIND.to_string(),
        operation_id: operation_id.clone(),
        preview_token: preview_token.to_string(),
        item: item.clone(),
        variants,
        generation_intent_id: None,
    };
    record_operation(connection, &payload).map_err(|message| {
        ItemRemovalFailure::new(ItemRemovalFailureClass::RecoveryConflict, message)
    })?;
    let mut database_committed = false;
    let outcome = (|| -> Result<ItemRemovalOutcome, ItemRemovalFailure> {
        fs::create_dir_all(&quarantine_base).map_err(|error| error.to_string())?;
        for variant in payload
            .variants
            .iter()
            .filter(|variant| variant.variant.file_state == "present")
        {
            let final_path = checked_final_path(root, &variant.variant)?;
            validate_variant_file(&final_path, &variant.variant)
                .map_err(classify_variant_file_failure)?;
            let quarantine = root.resolve(Path::new(&variant.quarantine_relative_path))?;
            fs::rename(&final_path, &quarantine).map_err(|error| {
                ItemRemovalFailure::new(
                    ItemRemovalFailureClass::LockedOrUnmovable,
                    error.to_string(),
                )
            })?;
            validate_variant_file(&quarantine, &variant.variant)
                .map_err(classify_variant_file_failure)?;
        }
        if failure_point == Some(RemovalFailurePoint::AfterQuarantine) {
            return Err(ItemRemovalFailure::new(
                ItemRemovalFailureClass::RecoveryConflict,
                "controlled removal interruption after quarantine",
            ));
        }
        let transaction = Transaction::new_unchecked(connection, TransactionBehavior::Immediate)
            .map_err(database_error)?;
        validate_operation_and_item(&transaction, &payload).map_err(|message| {
            let class = if message.contains("lifecycle") {
                ItemRemovalFailureClass::LifecycleConflict
            } else {
                ItemRemovalFailureClass::Stale
            };
            ItemRemovalFailure::new(class, message)
        })?;
        for variant in &payload.variants {
            transaction
                .execute(
                    "UPDATE managed_media_lifecycle_targets
                 SET target_state = 'superseded', publication_operation_id = NULL,
                     result_variant_id = NULL, failure_class = 'stale',
                     failure_summary = 'managed output removed by explicit user action',
                     updated_at = ?2
                 WHERE result_variant_id = ?1",
                    params![variant.variant.variant_id, timestamp()],
                )
                .map_err(database_error)?;
            let deleted = transaction
                .execute(
                    "DELETE FROM managed_media_variants WHERE variant_id = ?1",
                    [&variant.variant.variant_id],
                )
                .map_err(database_error)?;
            if deleted != 1 {
                return Err(ItemRemovalFailure::new(
                    ItemRemovalFailureClass::Stale,
                    "Managed-media variant changed before removal commit.",
                ));
            }
        }
        payload.generation_intent_id = Some(queue_generate_after_removal(
            &transaction,
            &payload.item.item_id,
            &payload.item.locator_hash,
            &timestamp(),
        )?);
        let serialized = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
        let updated = transaction
            .execute(
                "UPDATE managed_media_operations
             SET scope_payload_json = ?2, operation_state = 'recovery_required',
                 journal_state = 'published', updated_at = ?3
             WHERE operation_id = ?1 AND operation_state = 'running' AND journal_state = 'staging'",
                params![operation_id, serialized, timestamp()],
            )
            .map_err(database_error)?;
        if updated != 1 {
            return Err(ItemRemovalFailure::new(
                ItemRemovalFailureClass::RecoveryConflict,
                "Managed-media removal journal changed before commit.",
            ));
        }
        transaction.commit().map_err(database_error)?;
        database_committed = true;
        if failure_point == Some(RemovalFailurePoint::AfterDatabaseCommit) {
            return Err(ItemRemovalFailure::new(
                ItemRemovalFailureClass::RecoveryConflict,
                "controlled removal interruption after database commit",
            ));
        }
        let reclaimed_bytes = cleanup_quarantine(root, &payload).map_err(|message| {
            ItemRemovalFailure::new(ItemRemovalFailureClass::RecoveryConflict, message)
        })?;
        complete_operation(connection, &payload.operation_id).map_err(|message| {
            ItemRemovalFailure::new(ItemRemovalFailureClass::RecoveryConflict, message)
        })?;
        Ok(ItemRemovalOutcome {
            already_missing: payload
                .variants
                .iter()
                .filter(|variant| variant.variant.file_state == "missing")
                .count() as u64,
            reclaimed_bytes,
        })
    })();
    if outcome.is_err() && !database_committed && failure_point.is_none() {
        recover_removal_operation(connection, root, &operation_id).map_err(|error| {
            ItemRemovalFailure::new(
                ItemRemovalFailureClass::RecoveryConflict,
                format!("Removal failed and rollback could not complete: {error}"),
            )
        })?;
    }
    outcome
}

fn record_operation(
    connection: &Connection,
    payload: &RemovalJournalPayload,
) -> Result<(), String> {
    let serialized = serde_json::to_string(payload).map_err(|error| error.to_string())?;
    let now = timestamp();
    connection
        .execute(
            "INSERT INTO managed_media_operations (
               operation_id, scope_kind, scope_payload_json, operation_state,
               cancellation_requested, total_count, completed_count, succeeded_count,
               skipped_count, failed_count, failure_summary, journal_state,
               created_at, updated_at, finished_at
             ) VALUES (?1, 'targeted_variants', ?2, 'running', 0, ?3, 0, 0, 0, 0,
                       NULL, 'staging', ?4, ?4, NULL)",
            params![
                payload.operation_id,
                serialized,
                payload.variants.len() as u64,
                now
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn revalidate_item(
    connection: &Connection,
    root: &ManagedMediaRoot,
    expected: &ItemSnapshot,
) -> Result<(), String> {
    let current = analyze(connection, root, "off")?
        .items
        .into_iter()
        .find(|item| item.item_id == expected.item_id)
        .ok_or_else(|| "Managed-media source slot is stale.".to_string())?;
    if current != *expected || !current.removable() {
        return Err("Managed-media source slot is stale or protected.".to_string());
    }
    Ok(())
}

fn validate_operation_and_item(
    connection: &Connection,
    payload: &RemovalJournalPayload,
) -> Result<(), String> {
    let current_payload: String = connection
        .query_row(
            "SELECT scope_payload_json FROM managed_media_operations
             WHERE operation_id = ?1 AND operation_state = 'running' AND journal_state = 'staging'",
            [&payload.operation_id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if serde_json::from_str::<RemovalJournalPayload>(&current_payload)
        .ok()
        .as_ref()
        != Some(payload)
    {
        return Err("Managed-media removal operation identity changed.".to_string());
    }
    let current: (String, String, u64, u64) = connection
        .query_row(
            "SELECT item.locator_hash, item.lifecycle_state,
                    generation.current_revision, generation.desired_revision
             FROM managed_media_items item
             JOIN managed_media_item_generations generation
               ON generation.managed_item_id = item.item_id
             WHERE item.item_id = ?1",
            [&payload.item.item_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(database_error)?;
    if current
        != (
            payload.item.locator_hash.clone(),
            payload.item.lifecycle_state.clone(),
            payload.item.current_revision,
            payload.item.desired_revision,
        )
    {
        return Err("Managed-media item changed before removal commit.".to_string());
    }
    let conflicts: u64 = connection
        .query_row(
            "SELECT COUNT(*) FROM managed_media_lifecycle_intents
             WHERE managed_item_id = ?1
               AND lifecycle_state IN ('queued', 'claimed', 'retry_wait', 'recovery_required')",
            [&payload.item.item_id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if conflicts != 0 {
        return Err("Managed-media lifecycle work became active during removal.".to_string());
    }
    for variant in &payload.variants {
        let row: Option<(String, u64, String, String)> = connection
            .query_row(
                "SELECT relative_path, byte_length, checksum, publication_state
                 FROM managed_media_variants WHERE variant_id = ?1 AND managed_item_id = ?2",
                params![variant.variant.variant_id, payload.item.item_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()
            .map_err(database_error)?;
        if row
            != Some((
                variant.variant.relative_path.clone(),
                variant.variant.byte_length,
                variant.variant.checksum.clone(),
                variant.variant.publication_state.clone(),
            ))
        {
            return Err("Managed-media variant changed before removal commit.".to_string());
        }
    }
    Ok(())
}

fn checked_final_path(
    root: &ManagedMediaRoot,
    variant: &VariantSnapshot,
) -> Result<PathBuf, String> {
    root.resolve(Path::new(&variant.relative_path))
}

fn validate_variant_file(path: &Path, variant: &VariantSnapshot) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("Managed-media removal target is not a regular file.".to_string());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    if bytes.len() as u64 != variant.byte_length
        || format!("{:x}", Sha256::digest(&bytes)) != variant.checksum
    {
        return Err("Managed-media removal target does not match recorded identity.".to_string());
    }
    Ok(())
}

fn classify_variant_file_failure(message: String) -> ItemRemovalFailure {
    let class = if message.starts_with("Managed-media removal target") {
        ItemRemovalFailureClass::ValidationFailed
    } else {
        ItemRemovalFailureClass::LockedOrUnmovable
    };
    ItemRemovalFailure::new(class, message)
}

fn cleanup_quarantine(
    root: &ManagedMediaRoot,
    payload: &RemovalJournalPayload,
) -> Result<u64, String> {
    let mut reclaimed = 0_u64;
    for variant in payload
        .variants
        .iter()
        .filter(|variant| variant.variant.file_state == "present")
    {
        let quarantine = root.resolve(Path::new(&variant.quarantine_relative_path))?;
        match fs::remove_file(&quarantine) {
            Ok(()) => reclaimed = reclaimed.saturating_add(variant.variant.byte_length),
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    let directory = root.quarantine_path("removal", &payload.operation_id)?;
    match fs::remove_dir(directory) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    Ok(reclaimed)
}

fn complete_operation(connection: &Connection, operation_id: &str) -> Result<(), String> {
    let now = timestamp();
    let total: u64 = connection
        .query_row(
            "SELECT total_count FROM managed_media_operations WHERE operation_id = ?1",
            [operation_id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    let updated = connection
        .execute(
            "UPDATE managed_media_operations
             SET operation_state = 'completed', journal_state = 'recovered',
                 completed_count = ?2, succeeded_count = ?2, skipped_count = 0,
                 failed_count = 0, failure_summary = NULL, updated_at = ?3, finished_at = ?3
             WHERE operation_id = ?1 AND operation_state = 'recovery_required'
               AND journal_state = 'published'",
            params![operation_id, total, now],
        )
        .map_err(database_error)?;
    if updated != 1 {
        return Err("Managed-media removal operation could not be closed.".to_string());
    }
    Ok(())
}

pub(crate) fn is_removal_operation(
    connection: &Connection,
    operation_id: &str,
) -> Result<bool, PublicationError> {
    let payload: String = connection
        .query_row(
            "SELECT scope_payload_json FROM managed_media_operations WHERE operation_id = ?1",
            [operation_id],
            |row| row.get(0),
        )
        .map_err(|_| PublicationError::RecoveryStateConflict)?;
    Ok(serde_json::from_str::<serde_json::Value>(&payload)
        .ok()
        .and_then(|value| {
            value
                .get("kind")
                .and_then(|kind| kind.as_str())
                .map(str::to_string)
        })
        .as_deref()
        == Some(REMOVAL_KIND))
}

pub(crate) fn recover_removal_operation(
    connection: &Connection,
    root: &ManagedMediaRoot,
    operation_id: &str,
) -> Result<RecoveryOutcome, PublicationError> {
    let (operation_state, payload_json): (String, String) = connection
        .query_row(
            "SELECT operation_state, scope_payload_json FROM managed_media_operations
             WHERE operation_id = ?1",
            [operation_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| PublicationError::RecoveryStateConflict)?;
    let payload: RemovalJournalPayload =
        serde_json::from_str(&payload_json).map_err(|_| PublicationError::RecoveryStateConflict)?;
    if payload.version != REMOVAL_PAYLOAD_VERSION
        || payload.kind != REMOVAL_KIND
        || payload.operation_id != operation_id
    {
        return Err(PublicationError::OperationIdentityConflict);
    }
    if matches!(
        operation_state.as_str(),
        "completed" | "failed" | "cancelled"
    ) {
        return Ok(RecoveryOutcome::NoActionRequired);
    }
    let present_rows = payload
        .variants
        .iter()
        .map(|variant| {
            connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM managed_media_variants WHERE variant_id = ?1)",
                    [&variant.variant.variant_id],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(|_| PublicationError::RecoveryStateConflict)
        })
        .collect::<Result<Vec<_>, _>>()?;
    if present_rows.iter().all(|present| *present) {
        for variant in payload
            .variants
            .iter()
            .filter(|variant| variant.variant.file_state == "present")
        {
            let final_path = checked_final_path(root, &variant.variant)
                .map_err(|_| PublicationError::UnsafePath)?;
            let quarantine = root
                .resolve(Path::new(&variant.quarantine_relative_path))
                .map_err(|_| PublicationError::UnsafePath)?;
            match (final_path.exists(), quarantine.exists()) {
                (true, false) => {}
                (false, true) => {
                    validate_variant_file(&quarantine, &variant.variant)
                        .map_err(|_| PublicationError::RecoveryStateConflict)?;
                    fs::rename(&quarantine, &final_path)
                        .map_err(|_| PublicationError::ExactCleanupFailure)?;
                }
                _ => return Err(PublicationError::RecoveryStateConflict),
            }
        }
        let now = timestamp();
        connection
            .execute(
                "UPDATE managed_media_operations
                 SET operation_state = 'failed', journal_state = 'recovered',
                     completed_count = total_count, succeeded_count = 0, skipped_count = 0,
                     failed_count = total_count,
                     failure_summary = 'removal rolled back before database reconciliation',
                     updated_at = ?2, finished_at = ?2 WHERE operation_id = ?1",
                params![operation_id, now],
            )
            .map_err(|_| PublicationError::JournalTransitionFailure)?;
        let directory = root
            .quarantine_path("removal", operation_id)
            .map_err(|_| PublicationError::UnsafePath)?;
        if directory.exists() {
            fs::remove_dir(directory).map_err(|_| PublicationError::ExactCleanupFailure)?;
        }
        return Ok(RecoveryOutcome::RemovalRolledBack);
    }
    if !present_rows.iter().all(|present| !*present) {
        return Err(PublicationError::RecoveryStateConflict);
    }
    cleanup_quarantine(root, &payload).map_err(|_| PublicationError::ExactCleanupFailure)?;
    complete_operation(connection, operation_id)
        .map_err(|_| PublicationError::JournalTransitionFailure)?;
    Ok(RecoveryOutcome::RemovalCompleted)
}

fn operation_id(preview_token: &str, item_id: &str) -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    Ok(format!(
        "remove_{}",
        format!(
            "{:x}",
            Sha256::digest(format!("{preview_token}|{item_id}|{nanos}"))
        )
    ))
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| format!("epoch-ms-{}", duration.as_millis()))
        .unwrap_or_else(|_| "epoch-ms-0".to_string())
}

fn database_error(error: rusqlite::Error) -> String {
    error.to_string()
}
