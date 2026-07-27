use std::{
    fmt, fs,
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

use super::{
    contract::{FamilyId, ProfileVersion, RoleId, TierId},
    fingerprint::fingerprint_reader,
    identity::{OperationIdentity, ValidatedSha256, VariantClass},
    path::{ManagedMediaRoot, ValidatedOutputExtension},
    processor::{
        CropRectangle, InputFormat, ManagedMediaProcessor, OrientationApplied, OutputFormat,
        ProcessorResult, ProcessorVariant, JPEG_QUALITY, MAX_SOURCE_BYTES,
        PROCESSING_POLICY_VERSION, RESIZE_FILTER,
    },
    schema,
};

const JOURNAL_PAYLOAD_VERSION: u32 = 1;
const FORMAT_VERSION_JPEG: &str = "baseline-jpeg";
const FORMAT_VERSION_PNG: &str = "png";
const ENCODER_VERSION: &str = "image-0.25.10";

#[derive(Debug, Clone)]
pub struct PublicationRequest<'a> {
    pub operation_id: OperationIdentity,
    pub item_id: ValidatedSha256,
    pub variant_id: ValidatedSha256,
    pub processor_result: &'a ProcessorResult,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PublicationOutcome {
    Published { relative_path: String },
    AlreadyCompleted { relative_path: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryOutcome {
    NoActionRequired,
    ResumedStagingValidation,
    CompletedImmutablePublication,
    CompletedDescriptorActivation,
    FinalizedJournalState,
    RemovedExactStagingRemnant,
    MarkedFailedPreservingPrevious,
}

#[derive(Debug)]
pub enum PublicationError {
    InvalidInjectedRoot,
    UnsafePath,
    OperationIdentityConflict,
    ItemIdentityConflict,
    VariantIdentityConflict,
    InvalidProcessorResult,
    JournalFailure,
    JournalTransitionFailure,
    StagingCreateFailure,
    StagingWriteFailure,
    StagingSyncFailure,
    StagedChecksumMismatch,
    StagedValidationMismatch,
    ImmutableFinalCollision,
    ImmutablePublicationFailure,
    DescriptorTransactionFailure,
    SchemaStateConflict,
    RecoveryStateConflict,
    ExactCleanupFailure,
    IoFailure,
    InterruptedForVerification,
}

impl fmt::Display for PublicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidInjectedRoot => "The injected managed-media root is invalid.",
            Self::UnsafePath => "A managed-media path is unsafe.",
            Self::OperationIdentityConflict => {
                "The operation identity belongs to a different publication request."
            }
            Self::ItemIdentityConflict => "The managed-media item identity is inconsistent.",
            Self::VariantIdentityConflict => "The managed-media variant identity is inconsistent.",
            Self::InvalidProcessorResult => "The processor result failed validation.",
            Self::JournalFailure => "The operation journal could not record publication intent.",
            Self::JournalTransitionFailure => "The operation journal could not transition safely.",
            Self::StagingCreateFailure => "The isolated staging file could not be created.",
            Self::StagingWriteFailure => "The isolated staging file could not be written.",
            Self::StagingSyncFailure => "The isolated staging file could not be synchronized.",
            Self::StagedChecksumMismatch => "The staged bytes did not match their checksum.",
            Self::StagedValidationMismatch => {
                "The staged processor result failed reopen validation."
            }
            Self::ImmutableFinalCollision => {
                "An immutable managed-media final path contains different content."
            }
            Self::ImmutablePublicationFailure => {
                "The validated staged output could not be published immutably."
            }
            Self::DescriptorTransactionFailure => {
                "The managed-media descriptor transaction failed."
            }
            Self::SchemaStateConflict => "The managed-media schema state is inconsistent.",
            Self::RecoveryStateConflict => "The journal and filesystem recovery evidence conflict.",
            Self::ExactCleanupFailure => "The exact operation staging cleanup failed.",
            Self::IoFailure => "A managed-media I/O operation failed.",
            Self::InterruptedForVerification => {
                "Publication stopped at a controlled verification boundary."
            }
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for PublicationError {}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct JournalPayload {
    version: u32,
    operation_id: String,
    item_id: String,
    variant_id: String,
    expected_previous_source_fingerprint: Option<String>,
    source_fingerprint: String,
    role: String,
    family: String,
    variant_class: String,
    standard_tier: Option<String>,
    profile_version: String,
    output_format: String,
    format_version: String,
    encoder_version: String,
    relative_path: String,
    width: u32,
    height: u32,
    byte_length: u64,
    checksum: String,
    normalized_source_width: u32,
    normalized_source_height: u32,
    crop_x: u32,
    crop_y: u32,
    crop_width: u32,
    crop_height: u32,
    orientation_applied: u8,
    input_format: String,
    input_was_animated: bool,
    resize_filter: String,
    jpeg_quality: Option<u8>,
    processing_policy_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FailurePoint {
    AfterJournalIntent,
    AfterStagingWrite,
    AfterStagedValidation,
    AfterImmutablePublication,
    DuringDescriptorTransaction,
    AfterDescriptorCommit,
}

pub fn publish(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    request: PublicationRequest<'_>,
) -> Result<PublicationOutcome, PublicationError> {
    publish_internal(connection, root, processor, request, None)
}

#[cfg(test)]
pub(crate) fn publish_with_failure(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    request: PublicationRequest<'_>,
    failure_point: FailurePoint,
) -> Result<PublicationOutcome, PublicationError> {
    publish_internal(connection, root, processor, request, Some(failure_point))
}

fn publish_internal(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    request: PublicationRequest<'_>,
    failure_point: Option<FailurePoint>,
) -> Result<PublicationOutcome, PublicationError> {
    validate_root(root)?;
    schema::validate_schema(connection).map_err(|_| PublicationError::SchemaStateConflict)?;
    processor
        .validate_result(request.processor_result)
        .map_err(|_| PublicationError::InvalidProcessorResult)?;

    let payload = build_payload(connection, root, &request)?;
    let existing_state = record_intent(connection, &payload)?;
    if existing_state.as_deref() == Some("completed") {
        validate_completed(connection, root, processor, &payload)?;
        cleanup_exact_staging(root, &payload, processor)?;
        return Ok(PublicationOutcome::AlreadyCompleted {
            relative_path: payload.relative_path,
        });
    }
    if existing_state.as_deref() == Some("failed") {
        return Err(PublicationError::RecoveryStateConflict);
    }
    if existing_state.is_some() {
        let recovery = recover_one(connection, root, processor, &payload.operation_id)?;
        return match recovery {
            RecoveryOutcome::MarkedFailedPreservingPrevious => {
                Err(PublicationError::RecoveryStateConflict)
            }
            _ => Ok(PublicationOutcome::Published {
                relative_path: payload.relative_path,
            }),
        };
    }
    fail_if(failure_point, FailurePoint::AfterJournalIntent)?;

    write_staging(
        root,
        processor,
        &payload,
        &request.processor_result.output_bytes,
    )?;
    fail_if(failure_point, FailurePoint::AfterStagingWrite)?;

    transition_journal(connection, &payload.operation_id, "running", "validated")?;
    fail_if(failure_point, FailurePoint::AfterStagedValidation)?;

    transition_journal(connection, &payload.operation_id, "running", "publishing")?;
    publish_immutable(root, processor, &payload)?;
    transition_journal(
        connection,
        &payload.operation_id,
        "recovery_required",
        "published",
    )?;
    fail_if(failure_point, FailurePoint::AfterImmutablePublication)?;

    activate_descriptor(
        connection,
        &payload,
        failure_point == Some(FailurePoint::DuringDescriptorTransaction),
    )?;
    fail_if(failure_point, FailurePoint::AfterDescriptorCommit)?;

    cleanup_exact_staging(root, &payload, processor)?;
    Ok(PublicationOutcome::Published {
        relative_path: payload.relative_path,
    })
}

fn validate_root(root: &ManagedMediaRoot) -> Result<(), PublicationError> {
    if !root.as_path().is_absolute()
        || root.as_path() == root.app_data_dir()
        || !root.as_path().starts_with(root.app_data_dir())
    {
        return Err(PublicationError::InvalidInjectedRoot);
    }
    root.resolve(Path::new(".staging"))
        .map_err(|_| PublicationError::UnsafePath)?;
    Ok(())
}

fn build_payload(
    connection: &Connection,
    root: &ManagedMediaRoot,
    request: &PublicationRequest<'_>,
) -> Result<JournalPayload, PublicationError> {
    let result = request.processor_result;
    let (current, pending) = connection
        .query_row(
            "SELECT current_source_fingerprint, pending_source_fingerprint
             FROM managed_media_items WHERE item_id = ?1",
            [request.item_id.as_str()],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()
        .map_err(|_| PublicationError::SchemaStateConflict)?
        .ok_or(PublicationError::ItemIdentityConflict)?;

    if pending.as_deref() != Some(result.source_sha256.as_str())
        && current.as_deref() != Some(result.source_sha256.as_str())
    {
        return Err(PublicationError::ItemIdentityConflict);
    }

    let class = identity_variant_class(result.variant);
    let extension = output_extension(result.output_format)?;
    let final_path = root
        .item_variant_path(
            &request.item_id,
            &result.source_sha256,
            result.role,
            class,
            &extension,
        )
        .map_err(|_| PublicationError::UnsafePath)?;
    let relative_path = relative_path(root, &final_path)?;
    let (variant_class, standard_tier) = match result.variant {
        ProcessorVariant::Standard(tier) => {
            ("standard".to_string(), Some(tier.as_str().to_string()))
        }
        ProcessorVariant::NativeFallback => ("native_fallback".to_string(), None),
    };

    Ok(JournalPayload {
        version: JOURNAL_PAYLOAD_VERSION,
        operation_id: request.operation_id.as_str().to_string(),
        item_id: request.item_id.as_str().to_string(),
        variant_id: request.variant_id.as_str().to_string(),
        expected_previous_source_fingerprint: current,
        source_fingerprint: result.source_sha256.as_str().to_string(),
        role: result.role.as_str().to_string(),
        family: result.family.as_str().to_string(),
        variant_class,
        standard_tier,
        profile_version: result.profile_version.as_str().to_string(),
        output_format: result.output_format.as_str().to_string(),
        format_version: format_version(result.output_format).to_string(),
        encoder_version: ENCODER_VERSION.to_string(),
        relative_path,
        width: result.width,
        height: result.height,
        byte_length: result.byte_length,
        checksum: result.output_sha256.as_str().to_string(),
        normalized_source_width: result.normalized_source_width,
        normalized_source_height: result.normalized_source_height,
        crop_x: result.crop.x,
        crop_y: result.crop.y,
        crop_width: result.crop.width,
        crop_height: result.crop.height,
        orientation_applied: result.orientation_applied.exif_value(),
        input_format: result.input_format.as_str().to_string(),
        input_was_animated: result.input_was_animated,
        resize_filter: result.resize_filter.to_string(),
        jpeg_quality: result.jpeg_quality,
        processing_policy_version: result.processing_policy_version.to_string(),
    })
}

fn record_intent(
    connection: &Connection,
    payload: &JournalPayload,
) -> Result<Option<String>, PublicationError> {
    let serialized =
        serde_json::to_string(payload).map_err(|_| PublicationError::JournalFailure)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| PublicationError::JournalFailure)?;
    let existing = transaction
        .query_row(
            "SELECT scope_payload_json, operation_state
             FROM managed_media_operations WHERE operation_id = ?1",
            [&payload.operation_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|_| PublicationError::JournalFailure)?;
    if let Some((existing_payload, state)) = existing {
        let existing_payload: JournalPayload = serde_json::from_str(&existing_payload)
            .map_err(|_| PublicationError::OperationIdentityConflict)?;
        let mut comparable = payload.clone();
        comparable.expected_previous_source_fingerprint = existing_payload
            .expected_previous_source_fingerprint
            .clone();
        if existing_payload != comparable {
            return Err(PublicationError::OperationIdentityConflict);
        }
        transaction
            .commit()
            .map_err(|_| PublicationError::JournalFailure)?;
        return Ok(Some(state));
    }
    let now = timestamp();
    transaction
        .execute(
            "INSERT INTO managed_media_operations (
               operation_id, scope_kind, scope_payload_json, operation_state,
               cancellation_requested, total_count, completed_count,
               succeeded_count, skipped_count, failed_count, failure_summary,
               journal_state, created_at, updated_at, finished_at
             ) VALUES (?1, 'media_item', ?2, 'running', 0, 1, 0, 0, 0, 0,
                       NULL, 'staging', ?3, ?3, NULL)",
            (&payload.operation_id, &serialized, &now),
        )
        .map_err(|_| PublicationError::JournalFailure)?;
    transaction
        .commit()
        .map_err(|_| PublicationError::JournalFailure)?;
    Ok(None)
}

fn write_staging(
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    payload: &JournalPayload,
    bytes: &[u8],
) -> Result<(), PublicationError> {
    let staging_path = staging_path(root, payload)?;
    let parent = staging_path.parent().ok_or(PublicationError::UnsafePath)?;
    fs::create_dir_all(parent).map_err(|_| PublicationError::StagingCreateFailure)?;
    root.resolve(
        staging_path
            .strip_prefix(root.as_path())
            .map_err(|_| PublicationError::UnsafePath)?,
    )
    .map_err(|_| PublicationError::UnsafePath)?;

    if staging_path.exists() {
        return validate_file(&staging_path, processor, payload);
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging_path)
        .map_err(|_| PublicationError::StagingCreateFailure)?;
    file.write_all(bytes)
        .map_err(|_| PublicationError::StagingWriteFailure)?;
    file.flush()
        .map_err(|_| PublicationError::StagingWriteFailure)?;
    file.sync_all()
        .map_err(|_| PublicationError::StagingSyncFailure)?;
    drop(file);
    validate_file(&staging_path, processor, payload)
}

fn publish_immutable(
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    payload: &JournalPayload,
) -> Result<(), PublicationError> {
    let staging_path = staging_path(root, payload)?;
    let final_path = final_path(root, payload)?;
    if final_path.exists() {
        validate_final_file(&final_path, processor, payload)?;
        return Ok(());
    }
    validate_file(&staging_path, processor, payload)?;
    let parent = final_path.parent().ok_or(PublicationError::UnsafePath)?;
    fs::create_dir_all(parent).map_err(|_| PublicationError::ImmutablePublicationFailure)?;
    root.resolve(
        final_path
            .strip_prefix(root.as_path())
            .map_err(|_| PublicationError::UnsafePath)?,
    )
    .map_err(|_| PublicationError::UnsafePath)?;
    fs::rename(&staging_path, &final_path)
        .map_err(|_| PublicationError::ImmutablePublicationFailure)?;
    validate_final_file(&final_path, processor, payload)
}

fn validate_final_file(
    path: &Path,
    processor: &ManagedMediaProcessor,
    payload: &JournalPayload,
) -> Result<(), PublicationError> {
    validate_file(path, processor, payload).map_err(|error| match error {
        PublicationError::StagedChecksumMismatch | PublicationError::StagedValidationMismatch => {
            PublicationError::ImmutableFinalCollision
        }
        other => other,
    })
}

fn validate_file(
    path: &Path,
    processor: &ManagedMediaProcessor,
    payload: &JournalPayload,
) -> Result<(), PublicationError> {
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| PublicationError::IoFailure)?
        .read_to_end(&mut bytes)
        .map_err(|_| PublicationError::IoFailure)?;
    if bytes.len() as u64 != payload.byte_length {
        return Err(PublicationError::StagedChecksumMismatch);
    }
    let fingerprint = fingerprint_reader(&bytes[..], MAX_SOURCE_BYTES)
        .map_err(|_| PublicationError::StagedChecksumMismatch)?;
    if fingerprint.hash.as_str() != payload.checksum {
        return Err(PublicationError::StagedChecksumMismatch);
    }
    let result = result_from_payload(payload, bytes)?;
    processor
        .validate_result(&result)
        .map_err(|_| PublicationError::StagedValidationMismatch)
}

fn activate_descriptor(
    connection: &Connection,
    payload: &JournalPayload,
    interrupt_before_commit: bool,
) -> Result<(), PublicationError> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| PublicationError::DescriptorTransactionFailure)?;
    activate_descriptor_in_transaction(&transaction, payload)?;
    if interrupt_before_commit {
        return Err(PublicationError::InterruptedForVerification);
    }
    transaction
        .commit()
        .map_err(|_| PublicationError::DescriptorTransactionFailure)
}

#[cfg(test)]
pub(crate) fn activate_descriptor_for_test(
    connection: &Connection,
    operation_id: &str,
) -> Result<(), PublicationError> {
    let payload_json: String = connection
        .query_row(
            "SELECT scope_payload_json FROM managed_media_operations WHERE operation_id = ?1",
            [operation_id],
            |row| row.get(0),
        )
        .map_err(|_| PublicationError::RecoveryStateConflict)?;
    let payload: JournalPayload =
        serde_json::from_str(&payload_json).map_err(|_| PublicationError::RecoveryStateConflict)?;
    activate_descriptor(connection, &payload, false)
}

fn activate_descriptor_in_transaction(
    transaction: &Transaction<'_>,
    payload: &JournalPayload,
) -> Result<(), PublicationError> {
    let (current, pending) = transaction
        .query_row(
            "SELECT current_source_fingerprint, pending_source_fingerprint
             FROM managed_media_items WHERE item_id = ?1",
            [&payload.item_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()
        .map_err(|_| PublicationError::DescriptorTransactionFailure)?
        .ok_or(PublicationError::ItemIdentityConflict)?;
    if current.as_deref() != Some(&payload.source_fingerprint)
        && current != payload.expected_previous_source_fingerprint
    {
        return Err(PublicationError::ItemIdentityConflict);
    }
    if current.as_deref() != Some(&payload.source_fingerprint)
        && pending.as_deref() != Some(&payload.source_fingerprint)
    {
        return Err(PublicationError::ItemIdentityConflict);
    }

    let existing = transaction
        .query_row(
            "SELECT managed_item_id, role_id, family, variant_class, standard_tier,
                    source_fingerprint, profile_version, relative_path, width, height,
                    byte_length, checksum
             FROM managed_media_variants WHERE variant_id = ?1",
            [&payload.variant_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, u32>(8)?,
                    row.get::<_, u32>(9)?,
                    row.get::<_, u64>(10)?,
                    row.get::<_, String>(11)?,
                ))
            },
        )
        .optional()
        .map_err(|_| PublicationError::DescriptorTransactionFailure)?;
    let logical_variant = transaction
        .query_row(
            "SELECT variant_id FROM managed_media_variants
             WHERE managed_item_id = ?1 AND role_id = ?2
               AND source_fingerprint = ?3 AND profile_version = ?4
               AND variant_class = ?5
               AND ((standard_tier IS NULL AND ?6 IS NULL) OR standard_tier = ?6)",
            (
                &payload.item_id,
                &payload.role,
                &payload.source_fingerprint,
                &payload.profile_version,
                &payload.variant_class,
                &payload.standard_tier,
            ),
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| PublicationError::DescriptorTransactionFailure)?;
    if logical_variant
        .as_deref()
        .is_some_and(|variant_id| variant_id != payload.variant_id)
    {
        return Err(PublicationError::VariantIdentityConflict);
    }
    if let Some(existing) = existing {
        let expected = (
            payload.item_id.clone(),
            payload.role.clone(),
            payload.family.clone(),
            payload.variant_class.clone(),
            payload.standard_tier.clone(),
            payload.source_fingerprint.clone(),
            payload.profile_version.clone(),
            payload.relative_path.clone(),
            payload.width,
            payload.height,
            payload.byte_length,
            payload.checksum.clone(),
        );
        if existing != expected {
            return Err(PublicationError::VariantIdentityConflict);
        }
        transaction
            .execute(
                "UPDATE managed_media_variants
                 SET publication_state = 'published', validated_at = COALESCE(validated_at, ?2),
                     published_at = COALESCE(published_at, ?2), updated_at = ?2
                 WHERE variant_id = ?1",
                (&payload.variant_id, timestamp()),
            )
            .map_err(|_| PublicationError::DescriptorTransactionFailure)?;
    } else {
        transaction
            .execute(
                "INSERT INTO managed_media_variants (
                   variant_id, managed_item_id, role_id, family, variant_class,
                   standard_tier, source_fingerprint, profile_version, output_format,
                   format_version, encoder_version, relative_path, width, height,
                   byte_length, checksum, publication_state, validated_at, published_at,
                   created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                           ?13, ?14, ?15, ?16, 'published', ?17, ?17, ?17, ?17)",
                params![
                    &payload.variant_id,
                    &payload.item_id,
                    &payload.role,
                    &payload.family,
                    &payload.variant_class,
                    &payload.standard_tier,
                    &payload.source_fingerprint,
                    &payload.profile_version,
                    &payload.output_format,
                    &payload.format_version,
                    &payload.encoder_version,
                    &payload.relative_path,
                    payload.width,
                    payload.height,
                    payload.byte_length,
                    &payload.checksum,
                    timestamp(),
                ],
            )
            .map_err(|_| PublicationError::DescriptorTransactionFailure)?;
    }

    let now = timestamp();
    let updated = transaction
        .execute(
            "UPDATE managed_media_items
             SET current_source_fingerprint = ?2, pending_source_fingerprint = NULL,
                 lifecycle_state = 'active', updated_at = ?3
             WHERE item_id = ?1",
            (&payload.item_id, &payload.source_fingerprint, &now),
        )
        .map_err(|_| PublicationError::DescriptorTransactionFailure)?;
    if updated != 1 {
        return Err(PublicationError::ItemIdentityConflict);
    }
    let completed = transaction
        .execute(
            "UPDATE managed_media_operations
             SET operation_state = 'completed', journal_state = 'published',
                 completed_count = 1, succeeded_count = 1, skipped_count = 0,
                 failed_count = 0, failure_summary = NULL, updated_at = ?2,
                 finished_at = ?2
             WHERE operation_id = ?1 AND scope_payload_json = ?3",
            (
                &payload.operation_id,
                &now,
                serde_json::to_string(payload)
                    .map_err(|_| PublicationError::DescriptorTransactionFailure)?,
            ),
        )
        .map_err(|_| PublicationError::DescriptorTransactionFailure)?;
    if completed != 1 {
        return Err(PublicationError::JournalTransitionFailure);
    }
    Ok(())
}

fn transition_journal(
    connection: &Connection,
    operation_id: &str,
    operation_state: &str,
    journal_state: &str,
) -> Result<(), PublicationError> {
    let updated = connection
        .execute(
            "UPDATE managed_media_operations
             SET operation_state = ?2, journal_state = ?3, updated_at = ?4
             WHERE operation_id = ?1",
            (operation_id, operation_state, journal_state, timestamp()),
        )
        .map_err(|_| PublicationError::JournalTransitionFailure)?;
    if updated != 1 {
        return Err(PublicationError::JournalTransitionFailure);
    }
    Ok(())
}

fn mark_failed_preserving_previous(
    connection: &Connection,
    operation_id: &str,
) -> Result<(), PublicationError> {
    let now = timestamp();
    let updated = connection
        .execute(
            "UPDATE managed_media_operations
             SET operation_state = 'failed', journal_state = 'failed',
                 completed_count = 1, succeeded_count = 0, skipped_count = 0,
                 failed_count = 1, failure_summary = 'bounded publication evidence missing',
                 updated_at = ?2, finished_at = ?2
             WHERE operation_id = ?1",
            (operation_id, now),
        )
        .map_err(|_| PublicationError::JournalTransitionFailure)?;
    if updated != 1 {
        return Err(PublicationError::JournalTransitionFailure);
    }
    Ok(())
}

pub(crate) fn recover_one(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    operation_id: &str,
) -> Result<RecoveryOutcome, PublicationError> {
    validate_root(root)?;
    schema::validate_schema(connection).map_err(|_| PublicationError::SchemaStateConflict)?;
    let (operation_state, journal_state, payload_json) = connection
        .query_row(
            "SELECT operation_state, journal_state, scope_payload_json
             FROM managed_media_operations WHERE operation_id = ?1",
            [operation_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|_| PublicationError::RecoveryStateConflict)?
        .ok_or(PublicationError::RecoveryStateConflict)?;
    let payload: JournalPayload =
        serde_json::from_str(&payload_json).map_err(|_| PublicationError::RecoveryStateConflict)?;
    if payload.operation_id != operation_id || payload.version != JOURNAL_PAYLOAD_VERSION {
        return Err(PublicationError::OperationIdentityConflict);
    }

    let staging = staging_path(root, &payload)?;
    let final_path = final_path(root, &payload)?;
    let staging_exists = staging.exists();
    let final_exists = final_path.exists();

    if operation_state == "completed" && journal_state == "published" {
        validate_completed(connection, root, processor, &payload)?;
        if staging_exists || staging.parent().is_some_and(Path::exists) {
            cleanup_exact_staging(root, &payload, processor)?;
            return Ok(RecoveryOutcome::RemovedExactStagingRemnant);
        }
        return Ok(RecoveryOutcome::NoActionRequired);
    }
    if operation_state == "failed" || journal_state == "failed" {
        return Ok(RecoveryOutcome::NoActionRequired);
    }

    match journal_state.as_str() {
        "staging" if !staging_exists && !final_exists => {
            mark_failed_preserving_previous(connection, operation_id)?;
            Ok(RecoveryOutcome::MarkedFailedPreservingPrevious)
        }
        "staging" | "validated" | "publishing" if staging_exists => {
            validate_file(&staging, processor, &payload)?;
            transition_journal(connection, operation_id, "running", "validated")?;
            transition_journal(connection, operation_id, "running", "publishing")?;
            publish_immutable(root, processor, &payload)?;
            transition_journal(connection, operation_id, "recovery_required", "published")?;
            activate_descriptor(connection, &payload, false)?;
            cleanup_exact_staging(root, &payload, processor)?;
            Ok(RecoveryOutcome::CompletedImmutablePublication)
        }
        "published" if operation_state == "recovery_required" && final_exists => {
            validate_final_file(&final_path, processor, &payload)?;
            activate_descriptor(connection, &payload, false)?;
            cleanup_exact_staging(root, &payload, processor)?;
            Ok(RecoveryOutcome::FinalizedJournalState)
        }
        "publishing" | "published" if final_exists => {
            validate_final_file(&final_path, processor, &payload)?;
            activate_descriptor(connection, &payload, false)?;
            cleanup_exact_staging(root, &payload, processor)?;
            Ok(RecoveryOutcome::CompletedDescriptorActivation)
        }
        _ => Err(PublicationError::RecoveryStateConflict),
    }
}

pub(crate) fn list_nonterminal_operations(
    connection: &Connection,
    maximum: u32,
) -> Result<Vec<String>, PublicationError> {
    if maximum == 0 || maximum > 256 {
        return Err(PublicationError::RecoveryStateConflict);
    }
    let mut statement = connection
        .prepare(
            "SELECT operation_id FROM managed_media_operations
             WHERE operation_state NOT IN ('completed', 'failed', 'cancelled')
             ORDER BY created_at, operation_id LIMIT ?1",
        )
        .map_err(|_| PublicationError::RecoveryStateConflict)?;
    let operation_ids = statement
        .query_map([maximum], |row| row.get::<_, String>(0))
        .map_err(|_| PublicationError::RecoveryStateConflict)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|_| PublicationError::RecoveryStateConflict)?;
    Ok(operation_ids)
}

fn validate_completed(
    connection: &Connection,
    root: &ManagedMediaRoot,
    processor: &ManagedMediaProcessor,
    payload: &JournalPayload,
) -> Result<(), PublicationError> {
    let active: Option<String> = connection
        .query_row(
            "SELECT current_source_fingerprint FROM managed_media_items WHERE item_id = ?1",
            [&payload.item_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| PublicationError::SchemaStateConflict)?
        .flatten();
    if active.as_deref() != Some(&payload.source_fingerprint) {
        return Err(PublicationError::RecoveryStateConflict);
    }
    let descriptor: Option<(String, String)> = connection
        .query_row(
            "SELECT checksum, publication_state FROM managed_media_variants
             WHERE variant_id = ?1",
            [&payload.variant_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| PublicationError::SchemaStateConflict)?;
    if descriptor.as_ref().map(|value| value.0.as_str()) != Some(payload.checksum.as_str())
        || descriptor.as_ref().map(|value| value.1.as_str()) != Some("published")
    {
        return Err(PublicationError::RecoveryStateConflict);
    }
    validate_final_file(&final_path(root, payload)?, processor, payload)
}

fn cleanup_exact_staging(
    root: &ManagedMediaRoot,
    payload: &JournalPayload,
    processor: &ManagedMediaProcessor,
) -> Result<(), PublicationError> {
    let staging = staging_path(root, payload)?;
    if staging.exists() {
        validate_file(&staging, processor, payload)
            .map_err(|_| PublicationError::ExactCleanupFailure)?;
        fs::remove_file(&staging).map_err(|_| PublicationError::ExactCleanupFailure)?;
    }
    if let Some(directory) = staging.parent() {
        match fs::remove_dir(directory) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(PublicationError::ExactCleanupFailure),
        }
    }
    Ok(())
}

fn result_from_payload(
    payload: &JournalPayload,
    output_bytes: Vec<u8>,
) -> Result<ProcessorResult, PublicationError> {
    if payload.resize_filter != RESIZE_FILTER
        || payload.processing_policy_version != PROCESSING_POLICY_VERSION
        || payload.profile_version != ProfileVersion::V1.as_str()
    {
        return Err(PublicationError::StagedValidationMismatch);
    }
    let output_format = parse_output_format(&payload.output_format)?;
    if payload.format_version != format_version(output_format)
        || payload.encoder_version != ENCODER_VERSION
        || payload.jpeg_quality != (output_format == OutputFormat::Jpeg).then_some(JPEG_QUALITY)
    {
        return Err(PublicationError::StagedValidationMismatch);
    }
    let role = RoleId::ALL
        .into_iter()
        .find(|role| role.as_str() == payload.role)
        .ok_or(PublicationError::StagedValidationMismatch)?;
    let family = FamilyId::ALL
        .into_iter()
        .find(|family| family.as_str() == payload.family)
        .ok_or(PublicationError::StagedValidationMismatch)?;
    let variant = match payload.variant_class.as_str() {
        "standard" => ProcessorVariant::Standard(
            TierId::ALL
                .into_iter()
                .find(|tier| Some(tier.as_str()) == payload.standard_tier.as_deref())
                .ok_or(PublicationError::StagedValidationMismatch)?,
        ),
        "native_fallback" if payload.standard_tier.is_none() => ProcessorVariant::NativeFallback,
        _ => return Err(PublicationError::StagedValidationMismatch),
    };
    let orientation = OrientationApplied::try_from(u32::from(payload.orientation_applied))
        .map_err(|_| PublicationError::StagedValidationMismatch)?;
    let input_format = match payload.input_format.as_str() {
        "JPEG" => InputFormat::Jpeg,
        "PNG" => InputFormat::Png,
        "GIF" => InputFormat::Gif,
        "WEBP" => InputFormat::WebP,
        _ => return Err(PublicationError::StagedValidationMismatch),
    };
    Ok(ProcessorResult {
        output_bytes,
        output_format,
        width: payload.width,
        height: payload.height,
        byte_length: payload.byte_length,
        output_sha256: ValidatedSha256::new(payload.checksum.clone())
            .map_err(|_| PublicationError::StagedValidationMismatch)?,
        source_sha256: ValidatedSha256::new(payload.source_fingerprint.clone())
            .map_err(|_| PublicationError::StagedValidationMismatch)?,
        profile_version: ProfileVersion::V1,
        role,
        family,
        variant,
        normalized_source_width: payload.normalized_source_width,
        normalized_source_height: payload.normalized_source_height,
        crop: CropRectangle {
            x: payload.crop_x,
            y: payload.crop_y,
            width: payload.crop_width,
            height: payload.crop_height,
        },
        orientation_applied: orientation,
        input_format,
        input_was_animated: payload.input_was_animated,
        resize_filter: RESIZE_FILTER,
        jpeg_quality: payload.jpeg_quality,
        processing_policy_version: PROCESSING_POLICY_VERSION,
    })
}

fn staging_path(
    root: &ManagedMediaRoot,
    payload: &JournalPayload,
) -> Result<PathBuf, PublicationError> {
    root.staging_path(
        &OperationIdentity::new(payload.operation_id.clone())
            .map_err(|_| PublicationError::OperationIdentityConflict)?,
        &ValidatedSha256::new(payload.variant_id.clone())
            .map_err(|_| PublicationError::VariantIdentityConflict)?,
    )
    .map_err(|_| PublicationError::UnsafePath)
}

fn final_path(
    root: &ManagedMediaRoot,
    payload: &JournalPayload,
) -> Result<PathBuf, PublicationError> {
    root.resolve(Path::new(&payload.relative_path))
        .map_err(|_| PublicationError::UnsafePath)
}

fn output_extension(format: OutputFormat) -> Result<ValidatedOutputExtension, PublicationError> {
    let extension = match format {
        OutputFormat::Jpeg => "jpg",
        OutputFormat::Png => "png",
    };
    ValidatedOutputExtension::from_approved_allowlist(extension, &["jpg", "png"])
        .map_err(|_| PublicationError::InvalidProcessorResult)
}

fn parse_output_format(value: &str) -> Result<OutputFormat, PublicationError> {
    match value {
        "JPEG" => Ok(OutputFormat::Jpeg),
        "PNG" => Ok(OutputFormat::Png),
        _ => Err(PublicationError::StagedValidationMismatch),
    }
}

fn format_version(format: OutputFormat) -> &'static str {
    match format {
        OutputFormat::Jpeg => FORMAT_VERSION_JPEG,
        OutputFormat::Png => FORMAT_VERSION_PNG,
    }
}

fn identity_variant_class(variant: ProcessorVariant) -> VariantClass {
    match variant {
        ProcessorVariant::Standard(tier) => VariantClass::Standard(tier),
        ProcessorVariant::NativeFallback => VariantClass::NativeFallback,
    }
}

fn relative_path(root: &ManagedMediaRoot, path: &Path) -> Result<String, PublicationError> {
    let relative = path
        .strip_prefix(root.as_path())
        .map_err(|_| PublicationError::UnsafePath)?;
    let normalized = relative.to_string_lossy().replace('\\', "/");
    if normalized.is_empty() || normalized.contains("..") {
        return Err(PublicationError::UnsafePath);
    }
    Ok(normalized)
}

fn timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:09}Z", duration.as_secs(), duration.subsec_nanos())
}

fn fail_if(
    configured: Option<FailurePoint>,
    current: FailurePoint,
) -> Result<(), PublicationError> {
    if configured == Some(current) {
        Err(PublicationError::InterruptedForVerification)
    } else {
        Ok(())
    }
}
