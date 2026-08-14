use std::{
    fmt,
    fs::{self, File, Metadata},
    io::{self, Cursor, Read},
    path::{Component, Path, PathBuf},
    time::SystemTime,
};

use rusqlite::Connection;
use sha2::{Digest, Sha256};

use super::{
    catalog_lifecycle::{
        resolve_claimed_source_locator, LocatorResolutionError, OwnerSourceProvider,
        ResolvedSourceLocator,
    },
    contract::{RoleId, TierId},
    executor::{ExecutorClock, IntentHandler},
    fingerprint::fingerprint_reader,
    identity::{
        LifecycleTargetIdentity, OperationIdentity, RoleIdentifier, SourceFingerprint,
        SourceLocatorKind, ValidatedSha256, VariantClass, VariantIdentity,
    },
    lifecycle::{
        complete_requested_cancellation, complete_retirement, finalize_generation,
        load_targets_for_claim, record_desired_fingerprint, record_target_outcome,
        release_claim_for_retry, transition_intent, validate_claim_ownership,
        AtomicPublicationLifecycleOutcome, ClaimOwnershipStatus, ClaimedIntentSnapshot,
        ExecutorTimestamp, FailureClass, FinalizationOutcome, LifecycleAction, LifecycleError,
        LifecycleState, LifecycleTargetRecord, TargetOutcome, TargetState,
    },
    path::ManagedMediaRoot,
    processor::{
        ManagedMediaProcessor, ProcessorError, ProcessorRequest, ProcessorResult, ProcessorVariant,
        MAX_SOURCE_BYTES,
    },
    publication::{
        activate_lifecycle_publication, cleanup_lifecycle_publication,
        execute_lifecycle_publication_filesystem, prepare_lifecycle_publication, PublicationError,
        PublicationLifecycleContext, PublicationOutcome, PublicationRequest,
    },
};

const MAX_READ_CHUNK_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcquisitionPolicy {
    maximum_source_bytes: u64,
    read_chunk_bytes: usize,
    allowed_roots: Vec<PathBuf>,
}

impl AcquisitionPolicy {
    pub fn new(
        maximum_source_bytes: u64,
        read_chunk_bytes: usize,
        allowed_roots: Vec<PathBuf>,
    ) -> Result<Self, AcquisitionPolicyError> {
        if maximum_source_bytes == 0
            || maximum_source_bytes > MAX_SOURCE_BYTES
            || read_chunk_bytes == 0
            || read_chunk_bytes > MAX_READ_CHUNK_BYTES
            || allowed_roots.is_empty()
            || allowed_roots.iter().any(|root| !valid_absolute_path(root))
        {
            return Err(AcquisitionPolicyError);
        }
        Ok(Self {
            maximum_source_bytes,
            read_chunk_bytes,
            allowed_roots,
        })
    }

    pub const fn maximum_source_bytes(&self) -> u64 {
        self.maximum_source_bytes
    }

    pub const fn read_chunk_bytes(&self) -> usize {
        self.read_chunk_bytes
    }

    pub fn allowed_roots(&self) -> &[PathBuf] {
        &self.allowed_roots
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AcquisitionPolicyError;

impl fmt::Display for AcquisitionPolicyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("The injected local-source acquisition policy is invalid.")
    }
}

impl std::error::Error for AcquisitionPolicyError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AcquisitionCheckpoint {
    BeforePathValidation,
    BeforeOpen,
    BetweenReadChunks { completed_chunks: u64 },
    AfterRead,
}

#[derive(Debug)]
pub enum AcquisitionError<C> {
    Control(C),
    MalformedPath,
    PathOutsideAllowedRoots,
    MissingFile,
    PermissionDenied,
    Directory,
    SpecialFile,
    SymlinkOrReparsePoint,
    UnsafeAncestor,
    SourceTooLarge { limit: u64 },
    SourceChangedDuringRead,
    ReadFailure(io::ErrorKind),
}

#[derive(Debug, Clone)]
pub struct AcquiredSource {
    pub bytes: Vec<u8>,
    pub byte_length: u64,
}

pub fn validate_local_source_readable(path: &Path) -> Result<u64, String> {
    let policy = AcquisitionPolicy::new(MAX_SOURCE_BYTES, 1, vec![path.to_path_buf()])
        .map_err(|error| error.to_string())?;
    validate_requested_path::<()>(path, &policy).map_err(|error| format!("{error:?}"))?;
    let path_metadata =
        metadata_without_following::<()>(path).map_err(|error| format!("{error:?}"))?;
    validate_source_metadata::<()>(&path_metadata).map_err(|error| format!("{error:?}"))?;
    if path_metadata.len() > MAX_SOURCE_BYTES {
        return Err("local source exceeds the managed-media source limit".to_string());
    }
    let source = File::open(path).map_err(|error| error.to_string())?;
    let opened = source.metadata().map_err(|error| error.to_string())?;
    validate_source_metadata::<()>(&opened).map_err(|error| format!("{error:?}"))?;
    if MetadataIdentity::from_metadata(&path_metadata) != MetadataIdentity::from_metadata(&opened) {
        return Err("local source changed while readability was validated".to_string());
    }
    Ok(opened.len())
}

pub fn acquire_local_source<C>(
    path: &Path,
    policy: &AcquisitionPolicy,
    mut checkpoint: impl FnMut(AcquisitionCheckpoint) -> Result<(), C>,
) -> Result<AcquiredSource, AcquisitionError<C>> {
    checkpoint(AcquisitionCheckpoint::BeforePathValidation).map_err(AcquisitionError::Control)?;
    validate_requested_path(path, policy)?;
    let path_metadata = metadata_without_following(path)?;
    validate_source_metadata(&path_metadata)?;

    checkpoint(AcquisitionCheckpoint::BeforeOpen).map_err(AcquisitionError::Control)?;
    let mut source = File::open(path).map_err(map_open_error)?;
    let initial = source.metadata().map_err(map_metadata_error)?;
    validate_source_metadata(&initial)?;
    if MetadataIdentity::from_metadata(&path_metadata) != MetadataIdentity::from_metadata(&initial)
    {
        return Err(AcquisitionError::SourceChangedDuringRead);
    }
    if initial.len() > policy.maximum_source_bytes {
        return Err(AcquisitionError::SourceTooLarge {
            limit: policy.maximum_source_bytes,
        });
    }

    let initial_identity = MetadataIdentity::from_metadata(&initial);
    let initial_capacity = usize::try_from(initial.len())
        .unwrap_or(policy.read_chunk_bytes)
        .min(policy.maximum_source_bytes as usize);
    let mut bytes = Vec::with_capacity(initial_capacity);
    let mut buffer = vec![0_u8; policy.read_chunk_bytes];
    let mut completed_chunks = 0_u64;

    loop {
        checkpoint(AcquisitionCheckpoint::BetweenReadChunks { completed_chunks })
            .map_err(AcquisitionError::Control)?;
        let read = source.read(&mut buffer).map_err(map_read_error)?;
        if read == 0 {
            break;
        }
        let next_length = (bytes.len() as u64).checked_add(read as u64).ok_or(
            AcquisitionError::SourceTooLarge {
                limit: policy.maximum_source_bytes,
            },
        )?;
        if next_length > policy.maximum_source_bytes {
            return Err(AcquisitionError::SourceTooLarge {
                limit: policy.maximum_source_bytes,
            });
        }
        bytes.extend_from_slice(&buffer[..read]);
        completed_chunks = completed_chunks
            .checked_add(1)
            .ok_or(AcquisitionError::SourceChangedDuringRead)?;
    }

    checkpoint(AcquisitionCheckpoint::AfterRead).map_err(AcquisitionError::Control)?;
    let final_handle_metadata = source.metadata().map_err(map_metadata_error)?;
    let final_path_metadata = metadata_without_following(path)?;
    if initial_identity != MetadataIdentity::from_metadata(&final_handle_metadata)
        || initial_identity != MetadataIdentity::from_metadata(&final_path_metadata)
        || final_handle_metadata.len() != bytes.len() as u64
    {
        return Err(AcquisitionError::SourceChangedDuringRead);
    }

    Ok(AcquiredSource {
        byte_length: bytes.len() as u64,
        bytes,
    })
}

fn validate_requested_path<C>(
    path: &Path,
    policy: &AcquisitionPolicy,
) -> Result<(), AcquisitionError<C>> {
    if !valid_absolute_path(path) || path.as_os_str().is_empty() || path_is_network(path) {
        return Err(AcquisitionError::MalformedPath);
    }
    if !policy
        .allowed_roots
        .iter()
        .any(|root| path.starts_with(root))
    {
        return Err(AcquisitionError::PathOutsideAllowedRoots);
    }

    let mut current = Some(path);
    while let Some(candidate) = current {
        let metadata = metadata_without_following(candidate)?;
        if metadata.file_type().is_symlink() || is_reparse_point(&metadata) {
            return Err(AcquisitionError::SymlinkOrReparsePoint);
        }
        if candidate != path && !metadata.is_dir() {
            return Err(AcquisitionError::UnsafeAncestor);
        }
        current = candidate.parent();
    }
    Ok(())
}

fn valid_absolute_path(path: &Path) -> bool {
    path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
}

#[cfg(windows)]
fn path_is_network(path: &Path) -> bool {
    use std::{os::windows::ffi::OsStrExt, path::Prefix};

    if matches!(
        path.components().next(),
        Some(Component::Prefix(prefix))
            if matches!(
                prefix.kind(),
                Prefix::UNC(_, _) | Prefix::VerbatimUNC(_, _) | Prefix::DeviceNS(_)
            )
    ) {
        return true;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetDriveTypeW(root_path_name: *const u16) -> u32;
    }

    const DRIVE_UNKNOWN: u32 = 0;
    const DRIVE_NO_ROOT_DIR: u32 = 1;
    const DRIVE_REMOTE: u32 = 4;
    let Some(root) = path.ancestors().last() else {
        return true;
    };
    let mut encoded = root.as_os_str().encode_wide().collect::<Vec<_>>();
    encoded.push(0);
    // SAFETY: `encoded` is a live, nul-terminated UTF-16 path buffer for the
    // duration of the call and the Windows API does not retain the pointer.
    let drive_type = unsafe { GetDriveTypeW(encoded.as_ptr()) };
    matches!(drive_type, DRIVE_UNKNOWN | DRIVE_NO_ROOT_DIR | DRIVE_REMOTE)
}

#[cfg(not(windows))]
fn path_is_network(_path: &Path) -> bool {
    false
}

fn metadata_without_following<C>(path: &Path) -> Result<Metadata, AcquisitionError<C>> {
    fs::symlink_metadata(path).map_err(map_metadata_error)
}

fn validate_source_metadata<C>(metadata: &Metadata) -> Result<(), AcquisitionError<C>> {
    if metadata.file_type().is_symlink() || is_reparse_point(metadata) {
        return Err(AcquisitionError::SymlinkOrReparsePoint);
    }
    if metadata.is_dir() {
        return Err(AcquisitionError::Directory);
    }
    if !metadata.is_file() {
        return Err(AcquisitionError::SpecialFile);
    }
    Ok(())
}

#[cfg(windows)]
fn is_reparse_point(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_metadata: &Metadata) -> bool {
    false
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MetadataIdentity {
    len: u64,
    modified: Option<SystemTime>,
    platform: PlatformIdentity,
}

impl MetadataIdentity {
    fn from_metadata(metadata: &Metadata) -> Self {
        Self {
            len: metadata.len(),
            modified: metadata.modified().ok(),
            platform: PlatformIdentity::from_metadata(metadata),
        }
    }
}

#[cfg(windows)]
#[derive(Debug, Clone, PartialEq, Eq)]
struct PlatformIdentity {
    file_attributes: u32,
    creation_time: u64,
    last_write_time: u64,
}

#[cfg(windows)]
impl PlatformIdentity {
    fn from_metadata(metadata: &Metadata) -> Self {
        use std::os::windows::fs::MetadataExt;

        Self {
            file_attributes: metadata.file_attributes(),
            creation_time: metadata.creation_time(),
            last_write_time: metadata.last_write_time(),
        }
    }
}

#[cfg(unix)]
#[derive(Debug, Clone, PartialEq, Eq)]
struct PlatformIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
impl PlatformIdentity {
    fn from_metadata(metadata: &Metadata) -> Self {
        use std::os::unix::fs::MetadataExt;

        Self {
            device: metadata.dev(),
            inode: metadata.ino(),
        }
    }
}

#[cfg(not(any(windows, unix)))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct PlatformIdentity;

#[cfg(not(any(windows, unix)))]
impl PlatformIdentity {
    fn from_metadata(_metadata: &Metadata) -> Self {
        Self
    }
}

fn map_open_error<C>(error: io::Error) -> AcquisitionError<C> {
    match error.kind() {
        io::ErrorKind::NotFound => AcquisitionError::MissingFile,
        io::ErrorKind::PermissionDenied => AcquisitionError::PermissionDenied,
        kind => AcquisitionError::ReadFailure(kind),
    }
}

fn map_metadata_error<C>(error: io::Error) -> AcquisitionError<C> {
    map_open_error(error)
}

fn map_read_error<C>(error: io::Error) -> AcquisitionError<C> {
    match error.kind() {
        io::ErrorKind::PermissionDenied => AcquisitionError::PermissionDenied,
        kind => AcquisitionError::ReadFailure(kind),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrchestrationCheckpoint {
    BeforeLocatorResolution,
    AfterLocatorResolution,
    Acquisition(AcquisitionCheckpoint),
    BeforeFingerprint,
    AfterFingerprint,
    BeforeTargetPlanning,
    BeforeProcessor { role: RoleId, tier: TierId },
    AfterProcessor { role: RoleId, tier: TierId },
    BeforePublication { role: RoleId, class: VariantClass },
    AfterPublication { role: RoleId, class: VariantClass },
    BeforeTargetRecording { role: RoleId, class: VariantClass },
    BeforeFinalization,
}

pub trait CancellationBoundary {
    fn is_cancelled(&mut self, checkpoint: OrchestrationCheckpoint) -> Result<bool, String>;
}

impl<F> CancellationBoundary for F
where
    F: FnMut(OrchestrationCheckpoint) -> Result<bool, String>,
{
    fn is_cancelled(&mut self, checkpoint: OrchestrationCheckpoint) -> Result<bool, String> {
        self(checkpoint)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OrchestrationFailure {
    LocatorNotFound,
    LocatorHashMismatch,
    AmbiguousSourceSlot,
    LocatorProviderFailure,
    UnsupportedLocatorKind,
    MalformedLocalLocator,
    MissingLocalFile,
    PermissionFailure,
    DirectoryOrSpecialFile,
    SymlinkOrReparseRejected,
    UnsafeAncestor,
    SourceChangedDuringRead,
    SourceExceedsByteCap,
    SourceReadFailure,
    Cancellation,
    LostOwnership,
    StaleRevision,
    Superseded,
    Retired,
    ClockFailure,
    ProcessorUnsupportedInput,
    ProcessorIneligibleTarget,
    ProcessorValidationFailure,
    PublicationConflict,
    PublicationRecoverableState,
    PublicationFailure,
    TargetRecordConflict,
    FinalizationConflict,
}

impl OrchestrationFailure {
    pub const fn summary(self) -> &'static str {
        match self {
            Self::LocatorNotFound => "authoritative source locator not found",
            Self::LocatorHashMismatch => "authoritative source locator changed",
            Self::AmbiguousSourceSlot => "authoritative source slot is ambiguous",
            Self::LocatorProviderFailure => "authoritative source provider failed",
            Self::UnsupportedLocatorKind => "source locator kind is not locally supported",
            Self::MalformedLocalLocator => "local source locator is malformed or disallowed",
            Self::MissingLocalFile => "local source file is missing",
            Self::PermissionFailure => "local source permission was denied",
            Self::DirectoryOrSpecialFile => "local source is not a regular file",
            Self::SymlinkOrReparseRejected => "local source uses a rejected link or reparse point",
            Self::UnsafeAncestor => "local source has an unsafe ancestor",
            Self::SourceChangedDuringRead => "local source changed during bounded acquisition",
            Self::SourceExceedsByteCap => "local source exceeds the injected byte cap",
            Self::SourceReadFailure => "local source read failed",
            Self::Cancellation => "orchestration was cancelled",
            Self::LostOwnership => "lifecycle claim ownership was lost",
            Self::StaleRevision => "lifecycle revision became stale",
            Self::Superseded => "lifecycle intent was superseded",
            Self::Retired => "managed-media item was retired",
            Self::ClockFailure => "injected orchestration clock failed",
            Self::ProcessorUnsupportedInput => "processor rejected the source format",
            Self::ProcessorIneligibleTarget => "processor target is ineligible",
            Self::ProcessorValidationFailure => "processor output validation failed",
            Self::PublicationConflict => "immutable publication identity conflicts",
            Self::PublicationRecoverableState => "publication requires bounded recovery",
            Self::PublicationFailure => "immutable publication failed",
            Self::TargetRecordConflict => "lifecycle target result conflicts",
            Self::FinalizationConflict => "generation finalization is not valid",
        }
    }
}

impl fmt::Display for OrchestrationFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.summary())
    }
}

impl std::error::Error for OrchestrationFailure {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FailureDisposition {
    RetryAt(ExecutorTimestamp),
    Terminal,
    RecoveryRequired,
}

pub trait OrchestrationFailurePolicy {
    fn classify(&mut self, failure: OrchestrationFailure) -> FailureDisposition;
}

impl<F> OrchestrationFailurePolicy for F
where
    F: FnMut(OrchestrationFailure) -> FailureDisposition,
{
    fn classify(&mut self, failure: OrchestrationFailure) -> FailureDisposition {
        self(failure)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OrchestrationReport {
    pub source_resolved: bool,
    pub source_acquired: bool,
    pub source_fingerprinted: bool,
    pub orchestration_fingerprints_calculated: u32,
    pub standard_targets_published: u32,
    pub fallback_targets_published: u32,
    pub targets_skipped_ineligible: u32,
    pub idempotent_publications_reused: u32,
    pub publication_recovery_invoked: u32,
    pub retry_scheduled: bool,
    pub terminal_failure: Option<OrchestrationFailure>,
    pub cancelled: bool,
    pub superseded: bool,
    pub lost_ownership: bool,
    pub finalized: bool,
    pub already_finalized: bool,
}

pub struct LocalGenerationOrchestrator<'a> {
    connection: &'a Connection,
    source_provider: &'a mut dyn OwnerSourceProvider,
    managed_root: &'a ManagedMediaRoot,
    processor: &'a ManagedMediaProcessor,
    acquisition_policy: &'a AcquisitionPolicy,
    failure_policy: &'a mut dyn OrchestrationFailurePolicy,
    clock: &'a mut dyn ExecutorClock,
    cancellation: &'a mut dyn CancellationBoundary,
    last_report: Option<OrchestrationReport>,
}

impl<'a> LocalGenerationOrchestrator<'a> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        connection: &'a Connection,
        source_provider: &'a mut dyn OwnerSourceProvider,
        managed_root: &'a ManagedMediaRoot,
        processor: &'a ManagedMediaProcessor,
        acquisition_policy: &'a AcquisitionPolicy,
        failure_policy: &'a mut dyn OrchestrationFailurePolicy,
        clock: &'a mut dyn ExecutorClock,
        cancellation: &'a mut dyn CancellationBoundary,
    ) -> Self {
        Self {
            connection,
            source_provider,
            managed_root,
            processor,
            acquisition_policy,
            failure_policy,
            clock,
            cancellation,
            last_report: None,
        }
    }

    pub fn last_report(&self) -> Option<&OrchestrationReport> {
        self.last_report.as_ref()
    }

    pub fn execute(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
    ) -> Result<OrchestrationReport, OrchestrationFailure> {
        let report = self.execute_internal(claimed)?;
        self.last_report = Some(report.clone());
        Ok(report)
    }

    fn execute_internal(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
    ) -> Result<OrchestrationReport, OrchestrationFailure> {
        let mut report = OrchestrationReport::default();
        if let Err(failure) =
            self.checkpoint(claimed, OrchestrationCheckpoint::BeforeLocatorResolution)
        {
            return self.settle_failure(claimed, report, failure);
        }

        if claimed.action == LifecycleAction::Retire {
            let now = match self.checkpoint(claimed, OrchestrationCheckpoint::BeforeFinalization) {
                Ok(now) => now,
                Err(failure) => return self.settle_failure(claimed, report, failure),
            };
            let finalization = match complete_retirement(
                self.connection,
                &claimed.item_id,
                claimed.revision,
                &claimed.intent_id,
                &claimed.claim_token,
                &now,
            )
            .map_err(map_finalization_error)
            {
                Ok(finalization) => finalization,
                Err(failure) => return self.settle_failure(claimed, report, failure),
            };
            apply_finalization(&mut report, finalization);
            return Ok(report);
        }

        let resolved = match resolve_claimed_source_locator(
            self.connection,
            &claimed.intent_id,
            &claimed.item_id,
            claimed.revision,
            self.source_provider,
        ) {
            Ok(resolved) => resolved,
            Err(error) => {
                return self.settle_failure(claimed, report, map_locator_error(error));
            }
        };
        report.source_resolved = true;
        if !matches!(
            resolved.locator_kind,
            SourceLocatorKind::ExternalFile | SourceLocatorKind::ExternalDirectoryEntry
        ) {
            return self.settle_failure(
                claimed,
                report,
                OrchestrationFailure::UnsupportedLocatorKind,
            );
        }
        if let Err(failure) =
            self.checkpoint(claimed, OrchestrationCheckpoint::AfterLocatorResolution)
        {
            return self.settle_failure(claimed, report, failure);
        }

        let source_path = Path::new(&resolved.locator);
        let acquired = match acquire_local_source(source_path, self.acquisition_policy, |point| {
            self.checkpoint(claimed, OrchestrationCheckpoint::Acquisition(point))
                .map(|_| ())
        }) {
            Ok(acquired) => acquired,
            Err(error) => {
                return self.settle_failure(claimed, report, map_acquisition_error(error));
            }
        };
        report.source_acquired = true;

        if let Err(failure) = self.checkpoint(claimed, OrchestrationCheckpoint::BeforeFingerprint) {
            return self.settle_failure(claimed, report, failure);
        }
        let fingerprint = match fingerprint_reader(
            Cursor::new(&acquired.bytes),
            self.acquisition_policy.maximum_source_bytes(),
        )
        .map_err(|_| OrchestrationFailure::SourceReadFailure)
        {
            Ok(fingerprint) => fingerprint,
            Err(failure) => return self.settle_failure(claimed, report, failure),
        };
        if fingerprint.byte_length != acquired.byte_length {
            return self.settle_failure(
                claimed,
                report,
                OrchestrationFailure::SourceChangedDuringRead,
            );
        }
        report.source_fingerprinted = true;
        report.orchestration_fingerprints_calculated = 1;
        let fingerprint_now =
            match self.checkpoint(claimed, OrchestrationCheckpoint::AfterFingerprint) {
                Ok(now) => now,
                Err(failure) => return self.settle_failure(claimed, report, failure),
            };
        if let Err(error) = record_desired_fingerprint(
            self.connection,
            claimed,
            &fingerprint.hash,
            &fingerprint_now,
        )
        .map_err(map_lifecycle_write_error)
        {
            return self.settle_failure(claimed, report, error);
        }

        let target_now =
            match self.checkpoint(claimed, OrchestrationCheckpoint::BeforeTargetPlanning) {
                Ok(now) => now,
                Err(failure) => return self.settle_failure(claimed, report, failure),
            };
        let targets = match load_targets_for_claim(self.connection, claimed, &target_now)
            .map_err(map_lifecycle_write_error)
        {
            Ok(targets) => targets,
            Err(failure) => return self.settle_failure(claimed, report, failure),
        };
        if targets.is_empty() {
            return self.settle_failure(
                claimed,
                report,
                OrchestrationFailure::TargetRecordConflict,
            );
        }

        if let Err(failure) = self.process_targets(
            claimed,
            &resolved,
            &fingerprint.hash,
            &acquired.bytes,
            &targets,
            &mut report,
        ) {
            return self.settle_failure(claimed, report, failure);
        }

        let now = match self.checkpoint(claimed, OrchestrationCheckpoint::BeforeFinalization) {
            Ok(now) => now,
            Err(failure) => return self.settle_failure(claimed, report, failure),
        };
        let finalization = match finalize_generation(
            self.connection,
            &claimed.item_id,
            claimed.revision,
            &claimed.intent_id,
            &claimed.claim_token,
            &now,
        )
        .map_err(map_finalization_error)
        {
            Ok(finalization) => finalization,
            Err(failure) => return self.settle_failure(claimed, report, failure),
        };
        apply_finalization(&mut report, finalization);
        Ok(report)
    }

    fn process_targets(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        resolved: &ResolvedSourceLocator,
        source_fingerprint: &ValidatedSha256,
        source_bytes: &[u8],
        targets: &[LifecycleTargetRecord],
        report: &mut OrchestrationReport,
    ) -> Result<(), OrchestrationFailure> {
        let mut roles = targets.iter().map(|target| target.role).collect::<Vec<_>>();
        roles.sort_by_key(|role| role.as_str());
        roles.dedup_by_key(|role| role.as_str());

        for role in roles {
            let role_targets = targets
                .iter()
                .filter(|target| target.role == role)
                .cloned()
                .collect::<Vec<_>>();
            self.process_role(
                claimed,
                resolved,
                source_fingerprint,
                source_bytes,
                role,
                &role_targets,
                report,
            )?;
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn process_role(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        resolved: &ResolvedSourceLocator,
        source_fingerprint: &ValidatedSha256,
        source_bytes: &[u8],
        role: RoleId,
        targets: &[LifecycleTargetRecord],
        report: &mut OrchestrationReport,
    ) -> Result<(), OrchestrationFailure> {
        let fallback = targets
            .iter()
            .find(|target| target.class == VariantClass::NativeFallback)
            .ok_or(OrchestrationFailure::TargetRecordConflict)?;
        let mut standard = targets
            .iter()
            .filter(|target| matches!(target.class, VariantClass::Standard(_)))
            .cloned()
            .collect::<Vec<_>>();
        standard.sort_by_key(|target| match target.class {
            VariantClass::Standard(TierId::Thumbnail) => 0,
            VariantClass::Standard(TierId::Medium) => 1,
            VariantClass::Standard(TierId::Large) => 2,
            VariantClass::NativeFallback => 3,
        });
        if standard.is_empty() {
            return Err(OrchestrationFailure::TargetRecordConflict);
        }

        if fallback.state == TargetState::Published {
            if standard
                .iter()
                .any(|target| target.state == TargetState::Published)
            {
                return Err(OrchestrationFailure::TargetRecordConflict);
            }
            for target in &standard {
                if !target.state.is_terminal() {
                    self.record_skipped(claimed, target, report)?;
                }
            }
            return Ok(());
        }
        if standard.iter().any(|target| {
            target.class == VariantClass::Standard(TierId::Thumbnail)
                && target.state == TargetState::Published
        }) && !fallback.state.is_terminal()
        {
            self.record_skipped(claimed, fallback, report)?;
        }

        for target in &standard {
            if target.state.is_terminal() {
                continue;
            }
            self.prepare_target(claimed, target)?;
            let tier = match target.class {
                VariantClass::Standard(tier) => tier,
                VariantClass::NativeFallback => {
                    return Err(OrchestrationFailure::TargetRecordConflict)
                }
            };
            self.checkpoint(
                claimed,
                OrchestrationCheckpoint::BeforeProcessor { role, tier },
            )?;
            let result = match self.processor.process(ProcessorRequest {
                source_bytes,
                role,
                tier,
            }) {
                Ok(result) => result,
                Err(ProcessorError::IneligibleStandardTier) => {
                    self.record_skipped(claimed, target, report)?;
                    continue;
                }
                Err(error) => return Err(map_processor_error(error)),
            };
            self.checkpoint(
                claimed,
                OrchestrationCheckpoint::AfterProcessor { role, tier },
            )?;
            validate_processor_result(&result, role, source_fingerprint)?;

            match result.variant {
                ProcessorVariant::Standard(result_tier) if result_tier == tier => {
                    self.publish_target(
                        claimed,
                        resolved,
                        source_fingerprint,
                        target,
                        &result,
                        report,
                    )?;
                    if tier == TierId::Thumbnail && !fallback.state.is_terminal() {
                        self.record_skipped(claimed, fallback, report)?;
                    }
                }
                ProcessorVariant::NativeFallback if tier == TierId::Thumbnail => {
                    if !fallback.state.is_terminal() {
                        self.publish_target(
                            claimed,
                            resolved,
                            source_fingerprint,
                            fallback,
                            &result,
                            report,
                        )?;
                    }
                    for standard_target in &standard {
                        if !standard_target.state.is_terminal() {
                            self.record_skipped(claimed, standard_target, report)?;
                        }
                    }
                    return Ok(());
                }
                _ => return Err(OrchestrationFailure::ProcessorValidationFailure),
            }
        }
        Ok(())
    }

    fn publish_target(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        resolved: &ResolvedSourceLocator,
        source_fingerprint: &ValidatedSha256,
        target: &LifecycleTargetRecord,
        result: &ProcessorResult,
        report: &mut OrchestrationReport,
    ) -> Result<(), OrchestrationFailure> {
        let result_class = match result.variant {
            ProcessorVariant::Standard(tier) => VariantClass::Standard(tier),
            ProcessorVariant::NativeFallback => VariantClass::NativeFallback,
        };
        if result_class != target.class
            || result.role != target.role
            || result.source_sha256 != *source_fingerprint
        {
            return Err(OrchestrationFailure::ProcessorValidationFailure);
        }
        self.prepare_target(claimed, target)?;
        let preparation_time = self.checkpoint(
            claimed,
            OrchestrationCheckpoint::BeforePublication {
                role: target.role,
                class: target.class,
            },
        )?;
        let variant_id = derive_variant_id(resolved, source_fingerprint, result)?;
        let operation_id = derive_operation_id(claimed, target, &variant_id)?;
        let lifecycle = PublicationLifecycleContext {
            claimed: claimed.clone(),
            target_id: LifecycleTargetIdentity::new(target.target_id.clone())
                .map_err(|_| OrchestrationFailure::TargetRecordConflict)?,
        };
        let prepared = prepare_lifecycle_publication(
            self.connection,
            self.managed_root,
            self.processor,
            PublicationRequest {
                operation_id: operation_id.clone(),
                item_id: claimed.item_id.clone(),
                variant_id: variant_id.clone(),
                processor_result: result,
            },
            &lifecycle,
            &preparation_time,
        )
        .map_err(map_publication_error)?;
        execute_lifecycle_publication_filesystem(self.managed_root, self.processor, &prepared)
            .map_err(map_publication_error)?;
        let activation_time = self.checkpoint(
            claimed,
            OrchestrationCheckpoint::AfterPublication {
                role: target.role,
                class: target.class,
            },
        )?;
        let lifecycle_outcome = activate_lifecycle_publication(
            self.connection,
            &prepared,
            &lifecycle,
            &activation_time,
        )
        .map_err(map_publication_error)?;
        cleanup_lifecycle_publication(self.managed_root, self.processor, &prepared)
            .map_err(map_publication_error)?;
        let outcome = if prepared.already_completed() {
            PublicationOutcome::AlreadyCompleted {
                relative_path: prepared.relative_path().to_string(),
            }
        } else {
            PublicationOutcome::Published {
                relative_path: prepared.relative_path().to_string(),
            }
        };
        match outcome {
            PublicationOutcome::AlreadyCompleted { .. } => {
                report.idempotent_publications_reused += 1
            }
            PublicationOutcome::Published { .. } => {}
        }
        match lifecycle_outcome {
            AtomicPublicationLifecycleOutcome::AwaitingOtherTargets => {}
            AtomicPublicationLifecycleOutcome::Finalized => report.finalized = true,
            AtomicPublicationLifecycleOutcome::AlreadyFinalized => report.already_finalized = true,
        }
        match target.class {
            VariantClass::Standard(_) => report.standard_targets_published += 1,
            VariantClass::NativeFallback => report.fallback_targets_published += 1,
        }
        Ok(())
    }

    fn record_skipped(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        target: &LifecycleTargetRecord,
        report: &mut OrchestrationReport,
    ) -> Result<(), OrchestrationFailure> {
        if target.state == TargetState::SkippedIneligible {
            return Ok(());
        }
        self.prepare_target(claimed, target)?;
        let now = self.checkpoint(
            claimed,
            OrchestrationCheckpoint::BeforeTargetRecording {
                role: target.role,
                class: target.class,
            },
        )?;
        record_target_outcome(
            self.connection,
            claimed,
            &LifecycleTargetIdentity::new(target.target_id.clone())
                .map_err(|_| OrchestrationFailure::TargetRecordConflict)?,
            &TargetOutcome {
                state: TargetState::SkippedIneligible,
                publication_operation_id: None,
                result_variant_id: None,
                failure_class: None,
                failure_summary: None,
            },
            &now,
        )
        .map_err(map_lifecycle_write_error)?;
        report.targets_skipped_ineligible += 1;
        Ok(())
    }

    fn prepare_target(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        target: &LifecycleTargetRecord,
    ) -> Result<(), OrchestrationFailure> {
        if !matches!(
            target.state,
            TargetState::RetryableFailure | TargetState::RecoveryRequired
        ) {
            return Ok(());
        }
        let now = self.checkpoint(
            claimed,
            OrchestrationCheckpoint::BeforeTargetRecording {
                role: target.role,
                class: target.class,
            },
        )?;
        record_target_outcome(
            self.connection,
            claimed,
            &LifecycleTargetIdentity::new(target.target_id.clone())
                .map_err(|_| OrchestrationFailure::TargetRecordConflict)?,
            &TargetOutcome {
                state: TargetState::Claimed,
                publication_operation_id: None,
                result_variant_id: None,
                failure_class: None,
                failure_summary: None,
            },
            &now,
        )
        .map_err(map_lifecycle_write_error)?;
        Ok(())
    }

    fn checkpoint(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        checkpoint: OrchestrationCheckpoint,
    ) -> Result<ExecutorTimestamp, OrchestrationFailure> {
        if self
            .cancellation
            .is_cancelled(checkpoint)
            .map_err(|_| OrchestrationFailure::Cancellation)?
        {
            return Err(OrchestrationFailure::Cancellation);
        }
        let now = injected_now(self.clock)?;
        let status = validate_claim_ownership(self.connection, claimed, &now)
            .map_err(map_lifecycle_write_error)?;
        match status {
            ClaimOwnershipStatus::Owned => Ok(now),
            ClaimOwnershipStatus::LostOwnership
            | ClaimOwnershipStatus::Expired
            | ClaimOwnershipStatus::InvalidState => Err(OrchestrationFailure::LostOwnership),
            ClaimOwnershipStatus::Cancelled => Err(OrchestrationFailure::Cancellation),
            ClaimOwnershipStatus::StaleRevision => Err(OrchestrationFailure::StaleRevision),
            ClaimOwnershipStatus::Superseded => Err(OrchestrationFailure::Superseded),
            ClaimOwnershipStatus::Retired => Err(OrchestrationFailure::Retired),
        }
    }

    fn settle_failure(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        mut report: OrchestrationReport,
        failure: OrchestrationFailure,
    ) -> Result<OrchestrationReport, OrchestrationFailure> {
        match failure {
            OrchestrationFailure::LostOwnership => {
                report.lost_ownership = true;
                return Ok(report);
            }
            OrchestrationFailure::StaleRevision | OrchestrationFailure::Superseded => {
                report.superseded = true;
                return Ok(report);
            }
            OrchestrationFailure::Retired => {
                report.terminal_failure = Some(failure);
                return Ok(report);
            }
            OrchestrationFailure::Cancellation => {
                let now = injected_now(self.clock)?;
                let ownership = validate_claim_ownership(self.connection, claimed, &now)
                    .map_err(map_lifecycle_write_error)?;
                if ownership == ClaimOwnershipStatus::Cancelled {
                    complete_requested_cancellation(
                        self.connection,
                        claimed,
                        failure.summary(),
                        &now,
                    )
                    .map_err(map_lifecycle_write_error)?;
                } else if ownership == ClaimOwnershipStatus::Owned {
                    self.record_all_remaining(
                        claimed,
                        TargetState::Cancelled,
                        Some(FailureClass::Cancelled),
                        failure.summary(),
                        &now,
                    )?;
                    transition_intent(
                        self.connection,
                        &claimed.intent_id,
                        Some(&claimed.claim_token),
                        LifecycleState::Cancelled,
                        Some(FailureClass::Cancelled),
                        Some(failure.summary()),
                        &now,
                    )
                    .map_err(map_lifecycle_write_error)?;
                } else {
                    report.lost_ownership = true;
                    return Ok(report);
                }
                report.cancelled = true;
                return Ok(report);
            }
            _ => {}
        }

        let disposition = self.failure_policy.classify(failure);
        let now = injected_now(self.clock)?;
        match disposition {
            FailureDisposition::RetryAt(retry_at) => {
                if retry_at <= now {
                    return Err(OrchestrationFailure::TargetRecordConflict);
                }
                self.record_all_remaining(
                    claimed,
                    TargetState::RetryableFailure,
                    Some(FailureClass::Retryable),
                    failure.summary(),
                    &now,
                )?;
                release_claim_for_retry(
                    self.connection,
                    claimed,
                    &retry_at,
                    failure.summary(),
                    &now,
                )
                .map_err(map_lifecycle_write_error)?;
                report.retry_scheduled = true;
            }
            FailureDisposition::Terminal => {
                self.record_all_remaining(
                    claimed,
                    TargetState::TerminalFailure,
                    Some(FailureClass::Terminal),
                    failure.summary(),
                    &now,
                )?;
                transition_intent(
                    self.connection,
                    &claimed.intent_id,
                    Some(&claimed.claim_token),
                    LifecycleState::Failed,
                    Some(FailureClass::Terminal),
                    Some(failure.summary()),
                    &now,
                )
                .map_err(map_lifecycle_write_error)?;
                report.terminal_failure = Some(failure);
            }
            FailureDisposition::RecoveryRequired => {
                self.record_all_remaining(
                    claimed,
                    TargetState::RecoveryRequired,
                    Some(FailureClass::RecoveryRequired),
                    failure.summary(),
                    &now,
                )?;
                transition_intent(
                    self.connection,
                    &claimed.intent_id,
                    Some(&claimed.claim_token),
                    LifecycleState::RecoveryRequired,
                    Some(FailureClass::RecoveryRequired),
                    Some(failure.summary()),
                    &now,
                )
                .map_err(map_lifecycle_write_error)?;
                report.terminal_failure = Some(failure);
            }
        }
        Ok(report)
    }

    fn record_all_remaining(
        &mut self,
        claimed: &ClaimedIntentSnapshot,
        state: TargetState,
        failure_class: Option<FailureClass>,
        summary: &str,
        now: &ExecutorTimestamp,
    ) -> Result<(), OrchestrationFailure> {
        let targets = load_targets_for_claim(self.connection, claimed, now)
            .map_err(map_lifecycle_write_error)?;
        for target in targets {
            if target.state.is_terminal() || target.state == state {
                continue;
            }
            let target_id = LifecycleTargetIdentity::new(target.target_id.clone())
                .map_err(|_| OrchestrationFailure::TargetRecordConflict)?;
            if matches!(
                target.state,
                TargetState::RetryableFailure | TargetState::RecoveryRequired
            ) {
                record_target_outcome(
                    self.connection,
                    claimed,
                    &target_id,
                    &TargetOutcome {
                        state: TargetState::Claimed,
                        publication_operation_id: None,
                        result_variant_id: None,
                        failure_class: None,
                        failure_summary: None,
                    },
                    now,
                )
                .map_err(map_lifecycle_write_error)?;
            }
            record_target_outcome(
                self.connection,
                claimed,
                &target_id,
                &TargetOutcome {
                    state,
                    publication_operation_id: None,
                    result_variant_id: None,
                    failure_class,
                    failure_summary: Some(summary.to_string()),
                },
                now,
            )
            .map_err(map_lifecycle_write_error)?;
        }
        Ok(())
    }
}

impl IntentHandler for LocalGenerationOrchestrator<'_> {
    fn handle(&mut self, claimed: &ClaimedIntentSnapshot) -> Result<(), String> {
        self.execute(claimed)
            .map(|_| ())
            .map_err(|failure| failure.to_string())
    }
}

fn injected_now(clock: &mut dyn ExecutorClock) -> Result<ExecutorTimestamp, OrchestrationFailure> {
    let millis = clock
        .now_millis()
        .map_err(|_| OrchestrationFailure::ClockFailure)?;
    ExecutorTimestamp::from_millis(millis).map_err(|_| OrchestrationFailure::ClockFailure)
}

fn validate_processor_result(
    result: &ProcessorResult,
    expected_role: RoleId,
    expected_source: &ValidatedSha256,
) -> Result<(), OrchestrationFailure> {
    if result.role != expected_role || result.source_sha256 != *expected_source {
        return Err(OrchestrationFailure::ProcessorValidationFailure);
    }
    Ok(())
}

fn derive_variant_id(
    resolved: &ResolvedSourceLocator,
    source_fingerprint: &ValidatedSha256,
    result: &ProcessorResult,
) -> Result<ValidatedSha256, OrchestrationFailure> {
    let class = match result.variant {
        ProcessorVariant::Standard(tier) => VariantClass::Standard(tier),
        ProcessorVariant::NativeFallback => VariantClass::NativeFallback,
    };
    let identity = VariantIdentity::new(
        resolved.item_key.clone(),
        RoleIdentifier::new(result.role),
        SourceFingerprint::new(source_fingerprint.clone()),
        result.profile_version,
        class,
    );
    ValidatedSha256::new(hash_hex(&identity.preimage()))
        .map_err(|_| OrchestrationFailure::PublicationConflict)
}

fn derive_operation_id(
    claimed: &ClaimedIntentSnapshot,
    target: &LifecycleTargetRecord,
    variant_id: &ValidatedSha256,
) -> Result<OperationIdentity, OrchestrationFailure> {
    let preimage = format!(
        "lifecycle-publication-v2|{}|{}|{}|{}|{}|{}",
        claimed.intent_id.as_str(),
        claimed.revision.get(),
        claimed.claim_token.as_str(),
        target.target_id,
        target.class_label(),
        variant_id.as_str()
    );
    OperationIdentity::new(format!("operation_{}", hash_hex(&preimage)))
        .map_err(|_| OrchestrationFailure::PublicationConflict)
}

trait TargetClassLabel {
    fn class_label(&self) -> String;
}

impl TargetClassLabel for LifecycleTargetRecord {
    fn class_label(&self) -> String {
        match self.class {
            VariantClass::Standard(tier) => format!("standard:{}", tier.as_str()),
            VariantClass::NativeFallback => "native_fallback".to_string(),
        }
    }
}

fn hash_hex(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn apply_finalization(report: &mut OrchestrationReport, outcome: FinalizationOutcome) {
    match outcome {
        FinalizationOutcome::Promoted => report.finalized = true,
        FinalizationOutcome::AlreadyFinalized => report.already_finalized = true,
    }
}

fn map_locator_error(error: LocatorResolutionError) -> OrchestrationFailure {
    match error {
        LocatorResolutionError::ItemNotFound
        | LocatorResolutionError::OwnerNotFound
        | LocatorResolutionError::SlotNotFound => OrchestrationFailure::LocatorNotFound,
        LocatorResolutionError::LocatorHashMismatch => OrchestrationFailure::LocatorHashMismatch,
        LocatorResolutionError::AmbiguousSlot => OrchestrationFailure::AmbiguousSourceSlot,
        LocatorResolutionError::ProviderFailure => OrchestrationFailure::LocatorProviderFailure,
        LocatorResolutionError::StaleRevision => OrchestrationFailure::StaleRevision,
        LocatorResolutionError::OwnerIdentityMismatch
        | LocatorResolutionError::UnsupportedStoredIdentity => {
            OrchestrationFailure::TargetRecordConflict
        }
    }
}

fn map_acquisition_error(error: AcquisitionError<OrchestrationFailure>) -> OrchestrationFailure {
    match error {
        AcquisitionError::Control(failure) => failure,
        AcquisitionError::MalformedPath | AcquisitionError::PathOutsideAllowedRoots => {
            OrchestrationFailure::MalformedLocalLocator
        }
        AcquisitionError::MissingFile => OrchestrationFailure::MissingLocalFile,
        AcquisitionError::PermissionDenied => OrchestrationFailure::PermissionFailure,
        AcquisitionError::Directory | AcquisitionError::SpecialFile => {
            OrchestrationFailure::DirectoryOrSpecialFile
        }
        AcquisitionError::SymlinkOrReparsePoint => OrchestrationFailure::SymlinkOrReparseRejected,
        AcquisitionError::UnsafeAncestor => OrchestrationFailure::UnsafeAncestor,
        AcquisitionError::SourceTooLarge { .. } => OrchestrationFailure::SourceExceedsByteCap,
        AcquisitionError::SourceChangedDuringRead => OrchestrationFailure::SourceChangedDuringRead,
        AcquisitionError::ReadFailure(_) => OrchestrationFailure::SourceReadFailure,
    }
}

fn map_processor_error(error: ProcessorError) -> OrchestrationFailure {
    match error {
        ProcessorError::UnsupportedFormat
        | ProcessorError::UnknownFormat
        | ProcessorError::UnsupportedAnimatedWebP
        | ProcessorError::UnsupportedColorProfile
        | ProcessorError::MalformedOrientation
        | ProcessorError::InvalidOrTruncatedImage
        | ProcessorError::EmptySource => OrchestrationFailure::ProcessorUnsupportedInput,
        ProcessorError::IneligibleStandardTier => OrchestrationFailure::ProcessorIneligibleTarget,
        ProcessorError::SourceTooLarge { .. } => OrchestrationFailure::SourceExceedsByteCap,
        ProcessorError::IoFailure => OrchestrationFailure::SourceReadFailure,
        _ => OrchestrationFailure::ProcessorValidationFailure,
    }
}

fn map_publication_error(error: PublicationError) -> OrchestrationFailure {
    match error {
        PublicationError::OperationIdentityConflict
        | PublicationError::ItemIdentityConflict
        | PublicationError::VariantIdentityConflict
        | PublicationError::ImmutableFinalCollision
        | PublicationError::SchemaStateConflict => OrchestrationFailure::PublicationConflict,
        PublicationError::RecoveryStateConflict
        | PublicationError::InterruptedForVerification
        | PublicationError::JournalTransitionFailure => {
            OrchestrationFailure::PublicationRecoverableState
        }
        _ => OrchestrationFailure::PublicationFailure,
    }
}

fn map_lifecycle_write_error(error: LifecycleError) -> OrchestrationFailure {
    match error {
        LifecycleError::LostOwnership
        | LifecycleError::ClaimUnavailable
        | LifecycleError::ClaimExpired => OrchestrationFailure::LostOwnership,
        LifecycleError::Cancelled => OrchestrationFailure::Cancellation,
        LifecycleError::StaleRevision => OrchestrationFailure::StaleRevision,
        LifecycleError::Superseded => OrchestrationFailure::Superseded,
        LifecycleError::Retired => OrchestrationFailure::Retired,
        LifecycleError::InvalidPublicationLink => OrchestrationFailure::PublicationConflict,
        LifecycleError::FinalizationNotReady => OrchestrationFailure::FinalizationConflict,
        _ => OrchestrationFailure::TargetRecordConflict,
    }
}

fn map_finalization_error(error: LifecycleError) -> OrchestrationFailure {
    match error {
        LifecycleError::LostOwnership
        | LifecycleError::ClaimUnavailable
        | LifecycleError::ClaimExpired => OrchestrationFailure::LostOwnership,
        LifecycleError::Cancelled => OrchestrationFailure::Cancellation,
        LifecycleError::StaleRevision => OrchestrationFailure::StaleRevision,
        LifecycleError::Superseded => OrchestrationFailure::Superseded,
        LifecycleError::Retired => OrchestrationFailure::Retired,
        _ => OrchestrationFailure::FinalizationConflict,
    }
}
