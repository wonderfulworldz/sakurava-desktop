use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, DatabaseName, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    database::{
        self, backup_created_at, ensure_default_backup_folder, preview_backup_package_directory,
        upgrade_restored_identity, validate_restored_connection, BackupPackageDatabase,
        BackupPackageDeleteResult, BackupPackageExportResult, BackupPackageImportError,
        BackupPackageImportResult, BackupPackageIncludes, BackupPackageInfo, BackupPackageManifest,
        BackupPackagePreviewContent, BackupPackagePreviewCounts, BackupPackagePreviewDatabase,
        BackupPackagePreviewError, BackupPackageRestoreError, BackupPackageRestoreResult,
        BackupPackageRotationResult, BackupPackageType, RuntimeDatabase,
    },
    managed_media::path::ManagedMediaRoot,
    skv_package::{
        create_skv_v2_package, extract_skv_v2_to_owned_root, inspect_skv_v2,
        validate_database_and_managed_media, validate_extraction_root,
        validate_package_output_root, validate_protected_state_bytes, SkvCreateInput,
        SkvInspection, SkvPackageType, SKV_V2_DATABASE_ENTRY, SKV_V2_FORMAT, SKV_V2_STATE_ENTRY,
        SKV_V2_VERSION,
    },
};

const RECOVERY_DIRECTORY: &str = ".restore-recovery-v1";
const ACTIVE_DIRECTORY: &str = "active";
const JOURNAL_FILE: &str = "journal.json";
const PREVIOUS_JOURNAL_FILE: &str = "journal.previous.json";
const JOURNAL_TEMP_FILE: &str = "journal.next.tmp";
const JOURNAL_FORMAT: &str = "sakurava-restore-journal";
const JOURNAL_VERSION: u32 = 1;
const TARGET_DIRECTORY: &str = "target";
const SAFETY_DIRECTORY: &str = "safety";
const SAFETY_PACKAGE_DIRECTORY: &str = "safety-package";
const SAFETY_PACKAGE_FILE: &str = "sakurava-restore-safety.skv";
const SAFETY_DATABASE_FILE: &str = "safety-database.sqlite";
const PREVIOUS_MANAGED_DIRECTORY: &str = "previous-managed-v1";
const MAX_PROTECTED_STATE_BYTES: usize = 8 * 1024 * 1024;

static OPERATION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum PackageKind {
    V2,
    DirectoryV1,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RestorePhase {
    Prepared,
    SafetyPackageValidated,
    TargetContentStaged,
    ApplyStarted,
    DatabaseTransition,
    ManagedMediaTransition,
    PersistentStateTransition,
    PostApplyValidation,
    RollbackStarted,
    RollbackCompleted,
    RestoreCompleted,
}

impl RestorePhase {
    fn rank(self) -> u8 {
        match self {
            Self::Prepared => 1,
            Self::SafetyPackageValidated => 2,
            Self::TargetContentStaged => 3,
            Self::ApplyStarted => 4,
            Self::DatabaseTransition => 5,
            Self::ManagedMediaTransition => 6,
            Self::PersistentStateTransition => 7,
            Self::PostApplyValidation => 8,
            Self::RollbackStarted => 9,
            Self::RollbackCompleted => 10,
            Self::RestoreCompleted => 11,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreDomains {
    database: bool,
    managed_media: bool,
    protected_state: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreJournal {
    format: String,
    version: u32,
    operation_id: String,
    source_package_name: String,
    source_kind: PackageKind,
    source_package_sha256: String,
    safety_package_name: String,
    safety_package_sha256: String,
    target_workspace_identity: String,
    safety_workspace_identity: String,
    target_database_sha256: String,
    safety_database_sha256: String,
    target_managed_media_sha256: String,
    safety_managed_media_sha256: String,
    target_protected_state_sha256: String,
    safety_protected_state_sha256: String,
    domains: RestoreDomains,
    phase: RestorePhase,
    rollback_available: bool,
    completion_state: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RestorePackagePreview {
    pub package_name: String,
    pub manifest: BackupPackageManifest,
    pub database: BackupPackagePreviewDatabase,
    pub content: BackupPackagePreviewContent,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
    pub protected_state: Option<String>,
    pub protected_state_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreStateTransition {
    pub operation_id: String,
    pub mode: String,
    pub protected_state: String,
    pub expected_state_sha256: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRecoveryStatus {
    pub pending: bool,
    pub transition: Option<RestoreStateTransition>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRollbackTransition {
    pub transition: RestoreStateTransition,
    pub rollback_succeeded: bool,
}

fn recovery_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(RECOVERY_DIRECTORY)
}

fn active_root(app_data_dir: &Path) -> PathBuf {
    recovery_root(app_data_dir).join(ACTIVE_DIRECTORY)
}

fn ensure_plain_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        let metadata = fs::symlink_metadata(path)
            .map_err(|error| format!("Unable to inspect owned Restore directory: {error}"))?;
        if !metadata.is_dir() || is_link_or_reparse(&metadata) {
            return Err("Owned Restore directory is linked or not a directory".to_string());
        }
        return Ok(());
    }
    fs::create_dir(path)
        .map_err(|error| format!("Unable to create owned Restore directory: {error}"))?;
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to validate owned Restore directory: {error}"))?;
    if !metadata.is_dir() || is_link_or_reparse(&metadata) {
        return Err("Created Restore directory is linked or invalid".to_string());
    }
    Ok(())
}

fn prepare_operation_root(app_data_dir: &Path) -> Result<PathBuf, String> {
    if !app_data_dir.is_absolute() || !app_data_dir.is_dir() {
        return Err("Restore AppData root must be an existing absolute directory".to_string());
    }
    let root = recovery_root(app_data_dir);
    if !root.exists() {
        fs::create_dir(&root)
            .map_err(|error| format!("Unable to create Restore recovery root: {error}"))?;
    }
    ensure_plain_directory(&root)?;
    let active = active_root(app_data_dir);
    if active.exists() {
        return Err("An unresolved Restore operation already exists".to_string());
    }
    fs::create_dir(&active)
        .map_err(|error| format!("Unable to create active Restore root: {error}"))?;
    ensure_plain_directory(&active)?;
    Ok(active)
}

fn validate_operation_id(value: &str) -> Result<(), String> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Restore operation identity is invalid".to_string());
    }
    Ok(())
}

fn operation_id(package_hash: &str, state_hash: &str) -> String {
    let sequence = OPERATION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut hasher = Sha256::new();
    hasher.update(package_hash.as_bytes());
    hasher.update(state_hash.as_bytes());
    hasher.update(std::process::id().to_le_bytes());
    hasher.update(sequence.to_le_bytes());
    hasher.update(nanos.to_le_bytes());
    format!("{:x}", hasher.finalize())
}

fn validate_hash(value: &str, label: &str) -> Result<(), String> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(format!("{label} is invalid"));
    }
    Ok(())
}

fn validate_journal(journal: &RestoreJournal) -> Result<(), String> {
    if journal.format != JOURNAL_FORMAT
        || journal.version != JOURNAL_VERSION
        || journal.target_workspace_identity != TARGET_DIRECTORY
        || journal.safety_workspace_identity != SAFETY_DIRECTORY
        || journal.source_package_name.is_empty()
        || journal.safety_package_name != SAFETY_PACKAGE_FILE
        || !journal.rollback_available
    {
        return Err("Restore journal format or invariant is invalid".to_string());
    }
    validate_operation_id(&journal.operation_id)?;
    for (value, label) in [
        (&journal.source_package_sha256, "source package identity"),
        (&journal.safety_package_sha256, "safety package identity"),
        (&journal.target_database_sha256, "target database identity"),
        (&journal.safety_database_sha256, "safety database identity"),
        (
            &journal.target_managed_media_sha256,
            "target managed-media identity",
        ),
        (
            &journal.safety_managed_media_sha256,
            "safety managed-media identity",
        ),
        (
            &journal.target_protected_state_sha256,
            "target protected-state identity",
        ),
        (
            &journal.safety_protected_state_sha256,
            "safety protected-state identity",
        ),
    ] {
        validate_hash(value, label)?;
    }
    Ok(())
}

fn read_journal_file(path: &Path) -> Result<RestoreJournal, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to inspect Restore journal: {error}"))?;
    if !metadata.is_file() || is_link_or_reparse(&metadata) || metadata.len() > 256 * 1024 {
        return Err("Restore journal is linked, oversized, or not a regular file".to_string());
    }
    let bytes =
        fs::read(path).map_err(|error| format!("Unable to read Restore journal: {error}"))?;
    let journal: RestoreJournal = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Restore journal is malformed: {error}"))?;
    validate_journal(&journal)?;
    Ok(journal)
}

fn load_journal(app_data_dir: &Path) -> Result<Option<RestoreJournal>, String> {
    let active = active_root(app_data_dir);
    if !active.exists() {
        return Ok(None);
    }
    ensure_plain_directory(&active)?;
    let current = active.join(JOURNAL_FILE);
    let previous = active.join(PREVIOUS_JOURNAL_FILE);
    match (current.exists(), previous.exists()) {
        (true, _) => read_journal_file(&current).map(Some),
        (false, true) => {
            let recovered = read_journal_file(&previous)?;
            fs::rename(&previous, &current).map_err(|error| {
                format!("Unable to recover interrupted journal replacement: {error}")
            })?;
            Ok(Some(recovered))
        }
        (false, false) => Err("Restore recovery root exists without a journal".to_string()),
    }
}

fn write_journal(app_data_dir: &Path, next: &RestoreJournal) -> Result<(), String> {
    validate_journal(next)?;
    let active = active_root(app_data_dir);
    let current_path = active.join(JOURNAL_FILE);
    let previous_path = active.join(PREVIOUS_JOURNAL_FILE);
    if current_path.exists() || previous_path.exists() {
        if let Some(current) = load_journal(app_data_dir)? {
            if current.operation_id != next.operation_id || next.phase.rank() < current.phase.rank()
            {
                return Err(
                    "Restore journal transition is contradictory or non-monotonic".to_string(),
                );
            }
        }
    }
    ensure_plain_directory(&active)?;
    let current = active.join(JOURNAL_FILE);
    let previous = active.join(PREVIOUS_JOURNAL_FILE);
    let temporary = active.join(JOURNAL_TEMP_FILE);
    if temporary.exists() {
        return Err("Restore journal temporary file already exists".to_string());
    }
    let bytes = serde_json::to_vec(next)
        .map_err(|error| format!("Unable to serialize Restore journal: {error}"))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("Unable to create Restore journal replacement: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Unable to persist Restore journal replacement: {error}"))?;
    if previous.exists() {
        fs::remove_file(&previous)
            .map_err(|error| format!("Unable to rotate previous Restore journal: {error}"))?;
    }
    if current.exists() {
        fs::rename(&current, &previous)
            .map_err(|error| format!("Unable to preserve previous Restore journal: {error}"))?;
    }
    fs::rename(&temporary, &current)
        .map_err(|error| format!("Unable to activate Restore journal replacement: {error}"))?;
    Ok(())
}

fn advance_phase(
    app_data_dir: &Path,
    journal: &mut RestoreJournal,
    phase: RestorePhase,
) -> Result<(), String> {
    if phase.rank() < journal.phase.rank() {
        return Err("Restore journal phase cannot move backwards".to_string());
    }
    journal.phase = phase;
    journal.completion_state = match phase {
        RestorePhase::RestoreCompleted => "restore_completed",
        RestorePhase::RollbackCompleted => "rollback_completed",
        _ => "active",
    }
    .to_string();
    write_journal(app_data_dir, journal)
}

pub fn has_unresolved_restore(app_data_dir: &Path) -> Result<bool, String> {
    Ok(load_journal(app_data_dir)?.is_some())
}

fn hash_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn hash_file(path: &Path) -> Result<String, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to inspect Restore artifact: {error}"))?;
    if !metadata.is_file() || is_link_or_reparse(&metadata) {
        return Err("Restore artifact is linked or not a regular file".to_string());
    }
    let mut file =
        File::open(path).map_err(|error| format!("Unable to open Restore artifact: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Unable to read Restore artifact: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn collect_plain_files(
    root: &Path,
    relative: &Path,
    files: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let directory = root.join(relative);
    if !directory.exists() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(&directory)
        .map_err(|error| format!("Unable to inspect managed-media directory: {error}"))?;
    if !metadata.is_dir() || is_link_or_reparse(&metadata) {
        return Err("Managed-media directory is linked or invalid".to_string());
    }
    let mut entries = fs::read_dir(&directory)
        .map_err(|error| format!("Unable to read managed-media directory: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Unable to enumerate managed-media directory: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let child_relative = relative.join(entry.file_name());
        let child_metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("Unable to inspect managed-media entry: {error}"))?;
        if is_link_or_reparse(&child_metadata) {
            return Err("Managed-media contains a linked entry".to_string());
        }
        if child_metadata.is_dir() {
            collect_plain_files(root, &child_relative, files)?;
        } else if child_metadata.is_file() {
            files.push(child_relative);
        } else {
            return Err("Managed-media contains an unsupported entry".to_string());
        }
    }
    Ok(())
}

fn hash_directory(root: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    collect_plain_files(root, Path::new(""), &mut files)?;
    let mut hasher = Sha256::new();
    for relative in files {
        let relative_text = relative
            .to_str()
            .ok_or_else(|| "Managed-media path is not Unicode".to_string())?
            .replace('\\', "/");
        hasher.update(relative_text.as_bytes());
        hasher.update([0]);
        let path = root.join(&relative);
        hasher.update(hash_file(&path)?.as_bytes());
        hasher.update(
            fs::metadata(&path)
                .map_err(|error| error.to_string())?
                .len()
                .to_le_bytes(),
        );
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn copy_plain_tree(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Err("Restore tree destination already exists".to_string());
    }
    fs::create_dir(destination)
        .map_err(|error| format!("Unable to create Restore tree destination: {error}"))?;
    let mut files = Vec::new();
    collect_plain_files(source, Path::new(""), &mut files)?;
    for relative in files {
        let target = destination.join(&relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Unable to create Restore tree parent: {error}"))?;
        }
        fs::copy(source.join(&relative), &target)
            .map_err(|error| format!("Unable to copy Restore tree entry: {error}"))?;
    }
    Ok(())
}

fn package_type(value: SkvPackageType) -> BackupPackageType {
    match value {
        SkvPackageType::Manual => BackupPackageType::Manual,
        SkvPackageType::Automatic => BackupPackageType::Automatic,
        SkvPackageType::Safety => BackupPackageType::Safety,
    }
}

fn skv_type(value: BackupPackageType) -> SkvPackageType {
    match value {
        BackupPackageType::Manual => SkvPackageType::Manual,
        BackupPackageType::Automatic => SkvPackageType::Automatic,
        BackupPackageType::Safety => SkvPackageType::Safety,
    }
}

fn manifest_view(inspection: &SkvInspection, note: String) -> BackupPackageManifest {
    BackupPackageManifest {
        format: SKV_V2_FORMAT.to_string(),
        version: SKV_V2_VERSION,
        created_at: inspection.manifest.created_at.clone(),
        backup_type: package_type(inspection.manifest.backup_type),
        note,
        includes: BackupPackageIncludes {
            database: true,
            original_media: false,
            app_managed_assets: true,
        },
        database: BackupPackageDatabase {
            file: SKV_V2_DATABASE_ENTRY.to_string(),
        },
    }
}

fn timestamp_file_fragment(created_at: &str) -> String {
    created_at
        .chars()
        .filter(|character| character.is_ascii_digit())
        .take(14)
        .collect()
}

fn validate_protected_state(serialized: &str) -> Result<(), String> {
    if serialized.is_empty() || serialized.len() > MAX_PROTECTED_STATE_BYTES {
        return Err("Protected-state snapshot size is invalid".to_string());
    }
    validate_protected_state_bytes(serialized.as_bytes()).map_err(|error| error.to_string())
}

pub fn create_backup_package_v2(
    database: &RuntimeDatabase,
    backup_type: BackupPackageType,
    note: Option<String>,
    protected_state: String,
) -> Result<BackupPackageInfo, String> {
    if backup_type == BackupPackageType::Safety {
        return Err("Safety backup packages can only be created internally".to_string());
    }
    database.ensure_restore_resolved()?;
    validate_protected_state(&protected_state)?;
    let _operation = database.lock_restore_operation()?;
    let backup_folder = ensure_default_backup_folder(database)?;
    let created_at = backup_created_at(SystemTime::now())?;
    let filename = format!(
        "sakurava-backup-{}-{}.skv",
        timestamp_file_fragment(&created_at),
        match backup_type {
            BackupPackageType::Manual => "manual",
            BackupPackageType::Automatic => "automatic",
            BackupPackageType::Safety => unreachable!(),
        }
    );
    let snapshot = backup_folder.join(format!(".{filename}.database.tmp"));
    if snapshot.exists() || backup_folder.join(&filename).exists() {
        return Err("A backup package already exists for this second and type".to_string());
    }
    let result = (|| {
        let connection = database.connection();
        let connection = connection
            .lock()
            .map_err(|_| "Database connection is unavailable".to_string())?;
        connection
            .backup(DatabaseName::Main, &snapshot, None)
            .map_err(|error| format!("Unable to snapshot the active database: {error}"))?;
        drop(connection);
        let output_root = validate_package_output_root(&backup_folder, None)
            .map_err(|error| error.to_string())?;
        let managed_root = ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir)?;
        let package_path = create_skv_v2_package(SkvCreateInput {
            output_root: &output_root,
            output_file_name: &filename,
            database_snapshot: &snapshot,
            managed_media_root: &managed_root,
            protected_state_snapshot: protected_state.as_bytes(),
            created_at: &created_at,
            backup_type: skv_type(backup_type),
        })
        .map_err(|error| error.to_string())?;
        let inspection = inspect_skv_v2(&package_path).map_err(|error| error.to_string())?;
        Ok(BackupPackageInfo {
            package_name: filename,
            package_path: package_path.display().to_string(),
            manifest: manifest_view(&inspection, note.unwrap_or_default()),
        })
    })();
    if snapshot.exists() {
        let _ = fs::remove_file(&snapshot);
    }
    result
}

fn direct_package_path(database: &RuntimeDatabase, package_name: &str) -> Result<PathBuf, String> {
    if package_name.is_empty()
        || package_name == "."
        || package_name == ".."
        || package_name.contains('/')
        || package_name.contains('\\')
    {
        return Err("Backup package name is invalid".to_string());
    }
    let backup_folder = ensure_default_backup_folder(database)?;
    let canonical_folder = backup_folder
        .canonicalize()
        .map_err(|error| format!("Unable to resolve Backup folder: {error}"))?;
    let candidate = backup_folder.join(package_name);
    let metadata = fs::symlink_metadata(&candidate)
        .map_err(|error| format!("Backup package was not found: {error}"))?;
    if is_link_or_reparse(&metadata) || (!metadata.is_file() && !metadata.is_dir()) {
        return Err("Backup package is linked or has an unsupported type".to_string());
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|error| format!("Unable to resolve Backup package: {error}"))?;
    if canonical.parent() != Some(canonical_folder.as_path()) {
        return Err("Backup package must be a direct child of the Backup folder".to_string());
    }
    Ok(canonical)
}

pub fn list_backup_packages_v2_and_legacy(
    database: &RuntimeDatabase,
) -> Result<Vec<BackupPackageInfo>, String> {
    database.ensure_restore_resolved()?;
    let mut packages = database::list_backup_packages(database)?;
    let backup_folder = ensure_default_backup_folder(database)?;
    for entry in fs::read_dir(&backup_folder)
        .map_err(|error| format!("Unable to list Backup folder: {error}"))?
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let metadata = match fs::symlink_metadata(entry.path()) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !metadata.is_file() || is_link_or_reparse(&metadata) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_ascii_lowercase().ends_with(".skv") {
            continue;
        }
        let Ok(inspection) = inspect_skv_v2(&entry.path()) else {
            continue;
        };
        if inspection.manifest.backup_type == SkvPackageType::Safety {
            continue;
        }
        packages.push(BackupPackageInfo {
            package_name: name,
            package_path: entry.path().display().to_string(),
            manifest: manifest_view(&inspection, String::new()),
        });
    }
    packages.sort_by(|left, right| right.manifest.created_at.cmp(&left.manifest.created_at));
    Ok(packages)
}

pub fn rotate_automatic_backup_packages_v2_and_legacy(
    database: &RuntimeDatabase,
    keep_count: usize,
) -> Result<BackupPackageRotationResult, String> {
    database.ensure_restore_resolved()?;
    let _operation = database.lock_restore_operation()?;
    let mut automatic = list_backup_packages_v2_and_legacy(database)?
        .into_iter()
        .filter(|package| package.manifest.backup_type == BackupPackageType::Automatic)
        .collect::<Vec<_>>();
    automatic.sort_by(|left, right| right.manifest.created_at.cmp(&left.manifest.created_at));
    let mut removed_paths = Vec::new();
    for package in automatic.iter().skip(keep_count) {
        let path = direct_package_path(database, &package.package_name)?;
        if path.is_file() {
            fs::remove_file(&path)
                .map_err(|error| format!("Unable to rotate automatic Backup: {error}"))?;
        } else {
            fs::remove_dir_all(&path)
                .map_err(|error| format!("Unable to rotate legacy automatic Backup: {error}"))?;
        }
        removed_paths.push(path.display().to_string());
    }
    Ok(BackupPackageRotationResult {
        kept_automatic: automatic.len().min(keep_count),
        removed_automatic: removed_paths.len(),
        removed_paths,
    })
}

fn database_counts(path: &Path) -> Result<BackupPackagePreviewCounts, String> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("Unable to open staged database: {error}"))?;
    validate_restored_connection(&connection)?;
    let count = |table: &str| -> Result<i64, String> {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .map_err(|error| format!("Unable to count staged {table}: {error}"))
    };
    Ok(BackupPackagePreviewCounts {
        videos: count("videos")?,
        images: count("images")?,
        performers: count("performers")?,
        categories: count("managedCategories")?,
        glossary: count("glossary_entries")?,
        credits: count("credits")?,
    })
}

fn preview_v2_at(
    database: &RuntimeDatabase,
    package_name: &str,
    package_path: &Path,
) -> Result<RestorePackagePreview, BackupPackagePreviewError> {
    let inspection = inspect_skv_v2(package_path).map_err(|error| BackupPackagePreviewError {
        code: error.code.to_string(),
        message: error.message,
    })?;
    if inspection.manifest.backup_type == SkvPackageType::Safety {
        return Err(BackupPackagePreviewError {
            code: "safety_package_hidden".to_string(),
            message: "Safety packages cannot be restored from Backup History".to_string(),
        });
    }
    let preview_parent = recovery_root(&database.paths.app_data_dir).join("preview");
    if !preview_parent.exists() {
        fs::create_dir_all(&preview_parent).map_err(|error| BackupPackagePreviewError {
            code: "preview_workspace_failed".to_string(),
            message: error.to_string(),
        })?;
    }
    let root = preview_parent.join(format!(
        "preview-{}",
        OPERATION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let validated =
        validate_extraction_root(&root, None).map_err(|error| BackupPackagePreviewError {
            code: error.code.to_string(),
            message: error.message,
        })?;
    let result = (|| {
        extract_skv_v2_to_owned_root(package_path, &validated).map_err(|error| {
            BackupPackagePreviewError {
                code: error.code.to_string(),
                message: error.message,
            }
        })?;
        let state = fs::read_to_string(root.join(SKV_V2_STATE_ENTRY)).map_err(|error| {
            BackupPackagePreviewError {
                code: "state_read_failed".to_string(),
                message: error.to_string(),
            }
        })?;
        let counts = database_counts(&root.join(SKV_V2_DATABASE_ENTRY)).map_err(|message| {
            BackupPackagePreviewError {
                code: "database_semantic_validation_failed".to_string(),
                message,
            }
        })?;
        validate_database_and_managed_media(&root.join(SKV_V2_DATABASE_ENTRY), &root).map_err(
            |error| BackupPackagePreviewError {
                code: error.code.to_string(),
                message: error.message,
            },
        )?;
        Ok(RestorePackagePreview {
            package_name: package_name.to_string(),
            manifest: manifest_view(&inspection, String::new()),
            database: BackupPackagePreviewDatabase {
                file: SKV_V2_DATABASE_ENTRY.to_string(),
                quick_check: "ok".to_string(),
                required_schema_present: true,
                counts,
            },
            content: BackupPackagePreviewContent {
                database_included: true,
                original_media_included: false,
                app_managed_assets_included: true,
            },
            warnings: Vec::new(),
            errors: Vec::new(),
            protected_state_sha256: Some(hash_bytes(state.as_bytes())),
            protected_state: Some(state),
        })
    })();
    if root.exists() {
        let _ = fs::remove_dir_all(&root);
    }
    result
}

pub fn preview_backup_package_v2_or_legacy(
    database: &RuntimeDatabase,
    package_name: &str,
) -> Result<RestorePackagePreview, BackupPackagePreviewError> {
    database
        .ensure_restore_resolved()
        .map_err(|message| BackupPackagePreviewError {
            code: "recovery_unresolved".to_string(),
            message,
        })?;
    let _operation =
        database
            .lock_restore_operation()
            .map_err(|message| BackupPackagePreviewError {
                code: "package_operation_busy".to_string(),
                message,
            })?;
    let path = direct_package_path(database, package_name).map_err(|message| {
        BackupPackagePreviewError {
            code: "package_not_found".to_string(),
            message,
        }
    })?;
    if path.is_file() {
        return preview_v2_at(database, package_name, &path);
    }
    let legacy = preview_backup_package_directory(package_name, &path)?;
    Ok(RestorePackagePreview {
        package_name: legacy.package_name,
        manifest: legacy.manifest,
        database: legacy.database,
        content: legacy.content,
        warnings: legacy.warnings,
        errors: legacy.errors,
        protected_state: None,
        protected_state_sha256: None,
    })
}

fn stage_source_package(
    _database: &RuntimeDatabase,
    package_name: &str,
    package_path: &Path,
    active: &Path,
) -> Result<(PackageKind, RestoreDomains, String, String), String> {
    let target = active.join(TARGET_DIRECTORY);
    let validated = validate_extraction_root(&target, None).map_err(|error| error.to_string())?;
    if package_path.is_file() {
        let inspection = extract_skv_v2_to_owned_root(package_path, &validated)
            .map_err(|error| error.to_string())?;
        if inspection.manifest.backup_type == SkvPackageType::Safety {
            return Err("Safety packages cannot be selected as Restore targets".to_string());
        }
        let state = fs::read_to_string(target.join(SKV_V2_STATE_ENTRY))
            .map_err(|error| format!("Unable to read staged protected state: {error}"))?;
        validate_database_and_managed_media(&target.join(SKV_V2_DATABASE_ENTRY), &target)
            .map_err(|error| error.to_string())?;
        Ok((
            PackageKind::V2,
            RestoreDomains {
                database: true,
                managed_media: true,
                protected_state: true,
            },
            state,
            hash_file(package_path)?,
        ))
    } else {
        preview_backup_package_directory(package_name, package_path)
            .map_err(|error| error.message)?;
        fs::create_dir_all(target.join("catalog"))
            .map_err(|error| format!("Unable to create legacy staging root: {error}"))?;
        fs::copy(
            package_path.join(database::BACKUP_DATABASE_FILE_NAME),
            target.join(SKV_V2_DATABASE_ENTRY),
        )
        .map_err(|error| format!("Unable to stage legacy database: {error}"))?;
        let mut hasher = Sha256::new();
        hasher.update(
            fs::read(package_path.join(database::BACKUP_MANIFEST_FILE_NAME))
                .map_err(|error| error.to_string())?,
        );
        hasher.update(
            fs::read(package_path.join(database::BACKUP_DATABASE_FILE_NAME))
                .map_err(|error| error.to_string())?,
        );
        Ok((
            PackageKind::DirectoryV1,
            RestoreDomains {
                database: true,
                managed_media: false,
                protected_state: false,
            },
            String::new(),
            format!("{:x}", hasher.finalize()),
        ))
    }
}

fn create_complete_safety_package(
    database: &RuntimeDatabase,
    active: &Path,
    protected_state: &str,
    created_at: &str,
) -> Result<(String, String, String, String), String> {
    let snapshot = active.join(SAFETY_DATABASE_FILE);
    {
        let connection = database.connection();
        let connection = connection
            .lock()
            .map_err(|_| "Database connection is unavailable".to_string())?;
        connection
            .backup(DatabaseName::Main, &snapshot, None)
            .map_err(|error| format!("Unable to snapshot database for safety package: {error}"))?;
    }
    let output_directory = active.join(SAFETY_PACKAGE_DIRECTORY);
    fs::create_dir(&output_directory)
        .map_err(|error| format!("Unable to create safety-package root: {error}"))?;
    let output_root =
        validate_package_output_root(&output_directory, None).map_err(|error| error.to_string())?;
    let managed_root = ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir)?;
    let package = create_skv_v2_package(SkvCreateInput {
        output_root: &output_root,
        output_file_name: SAFETY_PACKAGE_FILE,
        database_snapshot: &snapshot,
        managed_media_root: &managed_root,
        protected_state_snapshot: protected_state.as_bytes(),
        created_at,
        backup_type: SkvPackageType::Safety,
    })
    .map_err(|error| error.to_string())?;
    inspect_skv_v2(&package).map_err(|error| error.to_string())?;
    let safety_root = active.join(SAFETY_DIRECTORY);
    let validated =
        validate_extraction_root(&safety_root, None).map_err(|error| error.to_string())?;
    extract_skv_v2_to_owned_root(&package, &validated).map_err(|error| error.to_string())?;
    validate_database_and_managed_media(&safety_root.join(SKV_V2_DATABASE_ENTRY), &safety_root)
        .map_err(|error| error.to_string())?;
    let safety_state = fs::read_to_string(safety_root.join(SKV_V2_STATE_ENTRY))
        .map_err(|error| format!("Unable to read safety protected state: {error}"))?;
    Ok((
        hash_file(&package)?,
        hash_file(&safety_root.join(SKV_V2_DATABASE_ENTRY))?,
        hash_directory(&safety_root.join("managed-media").join("v1"))?,
        hash_bytes(safety_state.as_bytes()),
    ))
}

fn prepare_staged_database(
    target_database: &Path,
    safety_database: &Path,
    migration_yymm: &str,
) -> Result<(), String> {
    let mut connection = Connection::open(target_database)
        .map_err(|error| format!("Unable to open staged Restore database: {error}"))?;
    validate_restored_connection(&connection)?;
    upgrade_restored_identity(&mut connection, safety_database, migration_yymm)?;
    database::require_migrated_sakurava_refs(&connection)?;
    validate_restored_connection(&connection)
}

fn activate_database(database: &RuntimeDatabase, source: &Path) -> Result<(), String> {
    let connection = database.connection();
    let mut connection = connection
        .lock()
        .map_err(|_| "Database connection is unavailable".to_string())?;
    connection
        .restore(DatabaseName::Main, source, None::<fn(_)>)
        .map_err(|error| format!("Unable to activate staged database: {error}"))?;
    validate_restored_connection(&connection)?;
    database::require_migrated_sakurava_refs(&connection)
}

fn activate_managed_media(
    app_data_dir: &Path,
    active: &Path,
    domains: &RestoreDomains,
) -> Result<(), String> {
    if !domains.managed_media {
        return Ok(());
    }
    let target = active
        .join(TARGET_DIRECTORY)
        .join("managed-media")
        .join("v1");
    if !target.exists() {
        fs::create_dir_all(&target).map_err(|error| {
            format!("Unable to create empty target managed-media root: {error}")
        })?;
    }
    ensure_plain_directory(&target)?;
    let live_parent = app_data_dir.join("managed-media");
    if !live_parent.exists() {
        fs::create_dir(&live_parent)
            .map_err(|error| format!("Unable to create managed-media parent: {error}"))?;
    }
    ensure_plain_directory(&live_parent)?;
    let live = live_parent.join("v1");
    let previous = active.join(PREVIOUS_MANAGED_DIRECTORY);
    if previous.exists() {
        return Err("Previous managed-media rollback artifact already exists".to_string());
    }
    if live.exists() {
        ensure_plain_directory(&live)?;
        fs::rename(&live, &previous)
            .map_err(|error| format!("Unable to preserve previous managed-media root: {error}"))?;
    }
    if let Err(error) = fs::rename(&target, &live) {
        if previous.exists() && !live.exists() {
            let _ = fs::rename(&previous, &live);
        }
        return Err(format!(
            "Unable to activate staged managed-media root: {error}"
        ));
    }
    Ok(())
}

fn rollback_backend(database: &RuntimeDatabase, journal: &RestoreJournal) -> Result<(), String> {
    let active = active_root(&database.paths.app_data_dir);
    let safety_database = active.join(SAFETY_DIRECTORY).join(SKV_V2_DATABASE_ENTRY);
    if hash_file(&safety_database)? != journal.safety_database_sha256 {
        return Err("Safety database identity changed before rollback".to_string());
    }
    activate_database(database, &safety_database)?;
    restore_managed_media_from_safety(&database.paths.app_data_dir, &active, journal)?;
    validate_database_and_managed_media(
        &database.paths.database_file,
        &database.paths.app_data_dir,
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn restore_managed_media_from_safety(
    app_data_dir: &Path,
    active: &Path,
    journal: &RestoreJournal,
) -> Result<(), String> {
    let live_parent = app_data_dir.join("managed-media");
    if !live_parent.exists() {
        fs::create_dir(&live_parent).map_err(|error| error.to_string())?;
    }
    let live = live_parent.join("v1");
    let previous = active.join(PREVIOUS_MANAGED_DIRECTORY);
    if live.exists() {
        ensure_plain_directory(&live)?;
        fs::remove_dir_all(&live)
            .map_err(|error| format!("Unable to remove incomplete managed-media root: {error}"))?;
    }
    if previous.exists() {
        ensure_plain_directory(&previous)?;
        fs::rename(&previous, &live)
            .map_err(|error| format!("Unable to restore previous managed-media root: {error}"))?;
    } else {
        let safety = active
            .join(SAFETY_DIRECTORY)
            .join("managed-media")
            .join("v1");
        if !safety.exists() {
            fs::create_dir_all(&safety).map_err(|error| error.to_string())?;
        }
        copy_plain_tree(&safety, &live)?;
    }
    if hash_directory(&live)? != journal.safety_managed_media_sha256 {
        return Err(
            "Rolled-back managed-media identity does not match the safety package".to_string(),
        );
    }
    Ok(())
}

pub fn begin_restore(
    database: &RuntimeDatabase,
    package_name: &str,
    migration_yymm: &str,
    current_protected_state: String,
) -> Result<RestoreStateTransition, BackupPackageRestoreError> {
    database.ensure_restore_resolved().map_err(|message| {
        BackupPackageRestoreError::new("recovery_unresolved", message, package_name)
    })?;
    validate_protected_state(&current_protected_state).map_err(|message| {
        BackupPackageRestoreError::new("current_state_invalid", message, package_name)
    })?;
    let _operation = database.lock_restore_operation().map_err(|message| {
        BackupPackageRestoreError::new("package_operation_busy", message, package_name)
    })?;
    let package_path = direct_package_path(database, package_name).map_err(|message| {
        BackupPackageRestoreError::new("package_not_found", message, package_name)
    })?;
    if package_path.is_file() {
        preview_v2_at(database, package_name, &package_path).map_err(|error| {
            BackupPackageRestoreError::new(&error.code, error.message, package_name)
        })?;
    } else {
        preview_backup_package_directory(package_name, &package_path).map_err(|error| {
            BackupPackageRestoreError::new(&error.code, error.message, package_name)
        })?;
    }
    let active = prepare_operation_root(&database.paths.app_data_dir).map_err(|message| {
        BackupPackageRestoreError::new("recovery_workspace_failed", message, package_name)
    })?;
    let created_at = backup_created_at(SystemTime::now()).map_err(|message| {
        BackupPackageRestoreError::new("timestamp_failed", message, package_name)
    })?;
    let state_hash = hash_bytes(current_protected_state.as_bytes());
    let staged = stage_source_package(database, package_name, &package_path, &active);
    let (kind, domains, mut target_state, source_hash) = match staged {
        Ok(value) => value,
        Err(message) => {
            let _ = cleanup_active_root(&database.paths.app_data_dir);
            return Err(BackupPackageRestoreError::new(
                "target_staging_failed",
                message,
                package_name,
            ));
        }
    };
    let operation = operation_id(&source_hash, &state_hash);
    let safety =
        create_complete_safety_package(database, &active, &current_protected_state, &created_at);
    let (safety_package_hash, safety_database_hash, safety_media_hash, safety_state_hash) =
        match safety {
            Ok(value) => value,
            Err(message) => {
                let _ = cleanup_active_root(&database.paths.app_data_dir);
                return Err(BackupPackageRestoreError::new(
                    "safety_package_failed",
                    message,
                    package_name,
                ));
            }
        };
    if !domains.protected_state {
        target_state = current_protected_state.clone();
    }
    let target_database = active.join(TARGET_DIRECTORY).join(SKV_V2_DATABASE_ENTRY);
    let safety_database = active.join(SAFETY_DIRECTORY).join(SKV_V2_DATABASE_ENTRY);
    if let Err(message) =
        prepare_staged_database(&target_database, &safety_database, migration_yymm)
    {
        let _ = cleanup_active_root(&database.paths.app_data_dir);
        return Err(BackupPackageRestoreError::new(
            "target_database_invalid",
            message,
            package_name,
        ));
    }
    let target_media_root = active
        .join(TARGET_DIRECTORY)
        .join("managed-media")
        .join("v1");
    if domains.managed_media && !target_media_root.exists() {
        if let Err(error) = fs::create_dir_all(&target_media_root) {
            let _ = cleanup_active_root(&database.paths.app_data_dir);
            return Err(BackupPackageRestoreError::new(
                "target_media_invalid",
                error.to_string(),
                package_name,
            ));
        }
    }
    let target_media_hash = if domains.managed_media {
        hash_directory(&target_media_root)
    } else {
        let live = ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir).map_err(
            |message| BackupPackageRestoreError::new("managed_root_invalid", message, package_name),
        )?;
        hash_directory(live.as_path())
    }
    .map_err(|message| {
        BackupPackageRestoreError::new("target_media_invalid", message, package_name)
    })?;
    let mut journal = RestoreJournal {
        format: JOURNAL_FORMAT.to_string(),
        version: JOURNAL_VERSION,
        operation_id: operation.clone(),
        source_package_name: package_name.to_string(),
        source_kind: kind,
        source_package_sha256: source_hash,
        safety_package_name: SAFETY_PACKAGE_FILE.to_string(),
        safety_package_sha256: safety_package_hash,
        target_workspace_identity: TARGET_DIRECTORY.to_string(),
        safety_workspace_identity: SAFETY_DIRECTORY.to_string(),
        target_database_sha256: hash_file(&target_database).map_err(|message| {
            BackupPackageRestoreError::new("target_database_invalid", message, package_name)
        })?,
        safety_database_sha256: safety_database_hash,
        target_managed_media_sha256: target_media_hash,
        safety_managed_media_sha256: safety_media_hash,
        target_protected_state_sha256: hash_bytes(target_state.as_bytes()),
        safety_protected_state_sha256: safety_state_hash,
        domains,
        phase: RestorePhase::Prepared,
        rollback_available: true,
        completion_state: "active".to_string(),
        created_at,
    };
    write_journal(&database.paths.app_data_dir, &journal)
        .and_then(|_| {
            advance_phase(
                &database.paths.app_data_dir,
                &mut journal,
                RestorePhase::SafetyPackageValidated,
            )
        })
        .and_then(|_| {
            advance_phase(
                &database.paths.app_data_dir,
                &mut journal,
                RestorePhase::TargetContentStaged,
            )
        })
        .map_err(|message| {
            BackupPackageRestoreError::new("journal_failed", message, package_name)
        })?;
    if let Err(message) = advance_phase(
        &database.paths.app_data_dir,
        &mut journal,
        RestorePhase::ApplyStarted,
    )
    .and_then(|_| activate_database(database, &target_database))
    .and_then(|_| {
        advance_phase(
            &database.paths.app_data_dir,
            &mut journal,
            RestorePhase::DatabaseTransition,
        )
    })
    .and_then(|_| activate_managed_media(&database.paths.app_data_dir, &active, &journal.domains))
    .and_then(|_| {
        advance_phase(
            &database.paths.app_data_dir,
            &mut journal,
            RestorePhase::ManagedMediaTransition,
        )
    })
    .and_then(|_| {
        validate_database_and_managed_media(
            &database.paths.database_file,
            &database.paths.app_data_dir,
        )
        .map_err(|error| error.to_string())
    }) {
        let rollback_result = advance_phase(
            &database.paths.app_data_dir,
            &mut journal,
            RestorePhase::RollbackStarted,
        )
        .and_then(|_| rollback_backend(database, &journal))
        .and_then(|_| {
            advance_phase(
                &database.paths.app_data_dir,
                &mut journal,
                RestorePhase::RollbackCompleted,
            )
        });
        let rollback_succeeded = rollback_result.is_ok();
        if rollback_succeeded {
            let _ = cleanup_active_root(&database.paths.app_data_dir);
        }
        let mut error = BackupPackageRestoreError::new(
            if rollback_succeeded {
                "restore_apply_failed"
            } else {
                "restore_rollback_failed"
            },
            message,
            package_name,
        );
        error.safety_package_name = Some(SAFETY_PACKAGE_FILE.to_string());
        error.rollback_attempted = true;
        error.rollback_succeeded = rollback_succeeded;
        return Err(error);
    }
    Ok(RestoreStateTransition {
        operation_id: operation,
        mode: "restore".to_string(),
        protected_state: target_state,
        expected_state_sha256: journal.target_protected_state_sha256,
    })
}

fn validate_live_target(
    database: &RuntimeDatabase,
    journal: &RestoreJournal,
) -> Result<(), String> {
    validate_database_and_managed_media(
        &database.paths.database_file,
        &database.paths.app_data_dir,
    )
    .map_err(|error| error.to_string())?;
    let database_snapshot = active_root(&database.paths.app_data_dir).join("post-apply.sqlite");
    if database_snapshot.exists() {
        fs::remove_file(&database_snapshot).map_err(|error| error.to_string())?;
    }
    {
        let connection = database.connection();
        let connection = connection
            .lock()
            .map_err(|_| "Database connection is unavailable".to_string())?;
        connection
            .backup(DatabaseName::Main, &database_snapshot, None)
            .map_err(|error| error.to_string())?;
    }
    let hash = hash_file(&database_snapshot)?;
    fs::remove_file(&database_snapshot).map_err(|error| error.to_string())?;
    if hash != journal.target_database_sha256 {
        return Err("Post-apply database identity does not match the staged target".to_string());
    }
    let managed = ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir)?;
    if hash_directory(managed.as_path())? != journal.target_managed_media_sha256 {
        return Err(
            "Post-apply managed-media identity does not match the staged target".to_string(),
        );
    }
    Ok(())
}

pub fn complete_restore(
    database: &RuntimeDatabase,
    operation_id: &str,
    applied_state_sha256: &str,
) -> Result<BackupPackageRestoreResult, BackupPackageRestoreError> {
    let _operation = database.lock_restore_operation().map_err(|message| {
        BackupPackageRestoreError::new("package_operation_busy", message, operation_id)
    })?;
    let mut journal = load_journal(&database.paths.app_data_dir)
        .map_err(|message| {
            BackupPackageRestoreError::new("journal_invalid", message, operation_id)
        })?
        .ok_or_else(|| {
            BackupPackageRestoreError::new(
                "journal_missing",
                "Restore journal is missing",
                operation_id,
            )
        })?;
    if journal.operation_id != operation_id
        || journal.target_protected_state_sha256 != applied_state_sha256
    {
        return Err(BackupPackageRestoreError::new(
            "state_receipt_mismatch",
            "Protected-state receipt does not match the active Restore operation",
            &journal.source_package_name,
        ));
    }
    advance_phase(
        &database.paths.app_data_dir,
        &mut journal,
        RestorePhase::PersistentStateTransition,
    )
    .and_then(|_| validate_live_target(database, &journal))
    .and_then(|_| {
        advance_phase(
            &database.paths.app_data_dir,
            &mut journal,
            RestorePhase::PostApplyValidation,
        )
    })
    .and_then(|_| {
        advance_phase(
            &database.paths.app_data_dir,
            &mut journal,
            RestorePhase::RestoreCompleted,
        )
    })
    .map_err(|message| {
        BackupPackageRestoreError::new(
            "post_apply_validation_failed",
            message,
            &journal.source_package_name,
        )
    })?;
    let result = BackupPackageRestoreResult {
        restored_package_name: journal.source_package_name.clone(),
        safety_package_name: journal.safety_package_name.clone(),
        restored_at: backup_created_at(SystemTime::now()).unwrap_or(journal.created_at.clone()),
        database_restored: true,
        rollback_attempted: false,
        rollback_succeeded: false,
        warnings: Vec::new(),
        errors: Vec::new(),
    };
    cleanup_active_root(&database.paths.app_data_dir).map_err(|message| {
        BackupPackageRestoreError::new(
            "recovery_cleanup_failed",
            message,
            &journal.source_package_name,
        )
    })?;
    Ok(result)
}

pub fn rollback_after_state_failure(
    database: &RuntimeDatabase,
    operation_id: &str,
) -> Result<RestoreRollbackTransition, BackupPackageRestoreError> {
    let _operation = database.lock_restore_operation().map_err(|message| {
        BackupPackageRestoreError::new("package_operation_busy", message, operation_id)
    })?;
    let mut journal = load_journal(&database.paths.app_data_dir)
        .map_err(|message| {
            BackupPackageRestoreError::new("journal_invalid", message, operation_id)
        })?
        .ok_or_else(|| {
            BackupPackageRestoreError::new(
                "journal_missing",
                "Restore journal is missing",
                operation_id,
            )
        })?;
    if journal.operation_id != operation_id {
        return Err(BackupPackageRestoreError::new(
            "operation_mismatch",
            "Restore operation identity is stale",
            &journal.source_package_name,
        ));
    }
    advance_phase(
        &database.paths.app_data_dir,
        &mut journal,
        RestorePhase::RollbackStarted,
    )
    .and_then(|_| rollback_backend(database, &journal))
    .and_then(|_| {
        advance_phase(
            &database.paths.app_data_dir,
            &mut journal,
            RestorePhase::RollbackCompleted,
        )
    })
    .map_err(|message| {
        BackupPackageRestoreError::new(
            "restore_rollback_failed",
            message,
            &journal.source_package_name,
        )
    })?;
    let state = read_expected_state(&database.paths.app_data_dir, &journal, "rollback")?;
    Ok(RestoreRollbackTransition {
        transition: state,
        rollback_succeeded: true,
    })
}

fn read_expected_state(
    app_data_dir: &Path,
    journal: &RestoreJournal,
    mode: &str,
) -> Result<RestoreStateTransition, BackupPackageRestoreError> {
    let path = if mode == "rollback" {
        active_root(app_data_dir)
            .join(SAFETY_DIRECTORY)
            .join(SKV_V2_STATE_ENTRY)
    } else if journal.domains.protected_state {
        active_root(app_data_dir)
            .join(TARGET_DIRECTORY)
            .join(SKV_V2_STATE_ENTRY)
    } else {
        active_root(app_data_dir)
            .join(SAFETY_DIRECTORY)
            .join(SKV_V2_STATE_ENTRY)
    };
    let state = fs::read_to_string(&path).map_err(|error| {
        BackupPackageRestoreError::new(
            "state_artifact_missing",
            error.to_string(),
            &journal.source_package_name,
        )
    })?;
    let expected = if mode == "rollback" {
        &journal.safety_protected_state_sha256
    } else {
        &journal.target_protected_state_sha256
    };
    if hash_bytes(state.as_bytes()) != *expected {
        return Err(BackupPackageRestoreError::new(
            "state_artifact_mismatch",
            "Protected-state recovery artifact changed",
            &journal.source_package_name,
        ));
    }
    Ok(RestoreStateTransition {
        operation_id: journal.operation_id.clone(),
        mode: mode.to_string(),
        protected_state: state,
        expected_state_sha256: expected.clone(),
    })
}

pub fn recovery_status(
    database: &RuntimeDatabase,
) -> Result<RestoreRecoveryStatus, BackupPackageRestoreError> {
    let Some(journal) = load_journal(&database.paths.app_data_dir).map_err(|message| {
        BackupPackageRestoreError::new("journal_invalid", message, "recovery")
    })?
    else {
        return Ok(RestoreRecoveryStatus {
            pending: false,
            transition: None,
        });
    };
    let mode = if journal.phase == RestorePhase::RollbackCompleted
        || journal.phase == RestorePhase::RollbackStarted
    {
        "rollback"
    } else {
        "restore"
    };
    let transition = read_expected_state(&database.paths.app_data_dir, &journal, mode)?;
    Ok(RestoreRecoveryStatus {
        pending: true,
        transition: Some(transition),
    })
}

pub fn complete_recovery(
    database: &RuntimeDatabase,
    operation_id: &str,
    mode: &str,
    applied_state_sha256: &str,
) -> Result<Option<BackupPackageRestoreResult>, BackupPackageRestoreError> {
    if mode == "restore" {
        return complete_restore(database, operation_id, applied_state_sha256).map(Some);
    }
    let _operation = database.lock_restore_operation().map_err(|message| {
        BackupPackageRestoreError::new("package_operation_busy", message, operation_id)
    })?;
    let journal = load_journal(&database.paths.app_data_dir)
        .map_err(|message| {
            BackupPackageRestoreError::new("journal_invalid", message, operation_id)
        })?
        .ok_or_else(|| {
            BackupPackageRestoreError::new(
                "journal_missing",
                "Restore journal is missing",
                operation_id,
            )
        })?;
    if journal.operation_id != operation_id
        || journal.phase != RestorePhase::RollbackCompleted
        || journal.safety_protected_state_sha256 != applied_state_sha256
    {
        return Err(BackupPackageRestoreError::new(
            "rollback_receipt_mismatch",
            "Rollback state receipt does not match the journal",
            &journal.source_package_name,
        ));
    }
    cleanup_active_root(&database.paths.app_data_dir).map_err(|message| {
        BackupPackageRestoreError::new(
            "recovery_cleanup_failed",
            message,
            &journal.source_package_name,
        )
    })?;
    Ok(None)
}

fn validate_recovery_artifacts(
    app_data_dir: &Path,
    journal: &RestoreJournal,
) -> Result<(), String> {
    let active = active_root(app_data_dir);
    let safety_package = active
        .join(SAFETY_PACKAGE_DIRECTORY)
        .join(SAFETY_PACKAGE_FILE);
    if hash_file(&safety_package)? != journal.safety_package_sha256 {
        return Err("Safety package identity does not match the Restore journal".to_string());
    }
    inspect_skv_v2(&safety_package).map_err(|error| error.to_string())?;
    let safety = active.join(SAFETY_DIRECTORY);
    if hash_file(&safety.join(SKV_V2_DATABASE_ENTRY))? != journal.safety_database_sha256
        || hash_directory(&safety.join("managed-media").join("v1"))?
            != journal.safety_managed_media_sha256
        || hash_bytes(
            &fs::read(safety.join(SKV_V2_STATE_ENTRY)).map_err(|error| error.to_string())?,
        ) != journal.safety_protected_state_sha256
    {
        return Err("Safety workspace identity does not match the Restore journal".to_string());
    }
    Ok(())
}

pub fn recover_before_database_open(app_data_dir: &Path) -> Result<(), String> {
    let Some(mut journal) = load_journal(app_data_dir)? else {
        return Ok(());
    };
    validate_recovery_artifacts(app_data_dir, &journal)?;
    if journal.phase == RestorePhase::RestoreCompleted {
        return cleanup_active_root(app_data_dir);
    }
    if matches!(
        journal.phase,
        RestorePhase::ManagedMediaTransition
            | RestorePhase::PersistentStateTransition
            | RestorePhase::PostApplyValidation
    ) {
        if validate_database_and_managed_media(
            &app_data_dir.join(database::DATABASE_FILE_NAME),
            app_data_dir,
        )
        .is_ok()
        {
            return Ok(());
        }
        advance_phase(app_data_dir, &mut journal, RestorePhase::RollbackStarted)?;
        let safety_database = active_root(app_data_dir)
            .join(SAFETY_DIRECTORY)
            .join(SKV_V2_DATABASE_ENTRY);
        let mut connection = Connection::open(app_data_dir.join(database::DATABASE_FILE_NAME))
            .map_err(|error| format!("Unable to open database for startup rollback: {error}"))?;
        connection
            .restore(DatabaseName::Main, &safety_database, None::<fn(_)>)
            .map_err(|error| {
                format!("Unable to restore safety database during startup: {error}")
            })?;
        validate_restored_connection(&connection)?;
        drop(connection);
        restore_managed_media_from_safety(app_data_dir, &active_root(app_data_dir), &journal)?;
        validate_database_and_managed_media(
            &app_data_dir.join(database::DATABASE_FILE_NAME),
            app_data_dir,
        )
        .map_err(|error| error.to_string())?;
        return advance_phase(app_data_dir, &mut journal, RestorePhase::RollbackCompleted);
    }
    if journal.phase == RestorePhase::RollbackCompleted {
        return Ok(());
    }
    advance_phase(app_data_dir, &mut journal, RestorePhase::RollbackStarted)?;
    let safety_database = active_root(app_data_dir)
        .join(SAFETY_DIRECTORY)
        .join(SKV_V2_DATABASE_ENTRY);
    let mut connection = Connection::open(app_data_dir.join(database::DATABASE_FILE_NAME))
        .map_err(|error| format!("Unable to open database for startup rollback: {error}"))?;
    connection
        .restore(DatabaseName::Main, &safety_database, None::<fn(_)>)
        .map_err(|error| format!("Unable to restore safety database during startup: {error}"))?;
    validate_restored_connection(&connection)?;
    drop(connection);
    restore_managed_media_from_safety(app_data_dir, &active_root(app_data_dir), &journal)?;
    validate_database_and_managed_media(
        &app_data_dir.join(database::DATABASE_FILE_NAME),
        app_data_dir,
    )
    .map_err(|error| error.to_string())?;
    advance_phase(app_data_dir, &mut journal, RestorePhase::RollbackCompleted)
}

fn cleanup_active_root(app_data_dir: &Path) -> Result<(), String> {
    let recovery = recovery_root(app_data_dir);
    let active = active_root(app_data_dir);
    if !active.exists() {
        return Ok(());
    }
    ensure_plain_directory(&recovery)?;
    ensure_plain_directory(&active)?;
    if active.parent() != Some(recovery.as_path())
        || active.file_name().and_then(|name| name.to_str()) != Some(ACTIVE_DIRECTORY)
    {
        return Err("Restore cleanup target identity is invalid".to_string());
    }
    fs::remove_dir_all(&active)
        .map_err(|error| format!("Unable to clean completed Restore operation: {error}"))
}

pub fn delete_backup_package_v2_or_legacy(
    database: &RuntimeDatabase,
    package_name: &str,
) -> Result<BackupPackageDeleteResult, String> {
    database.ensure_restore_resolved()?;
    let _operation = database.lock_restore_operation()?;
    let path = direct_package_path(database, package_name)?;
    if path.is_file() {
        inspect_skv_v2(&path).map_err(|error| error.to_string())?;
        fs::remove_file(path)
            .map_err(|error| format!("Unable to delete Backup package: {error}"))?;
    } else {
        preview_backup_package_directory(package_name, &path).map_err(|error| error.message)?;
        fs::remove_dir_all(path)
            .map_err(|error| format!("Unable to delete legacy Backup package: {error}"))?;
    }
    Ok(BackupPackageDeleteResult {
        package_name: package_name.to_string(),
        deleted: true,
    })
}

pub fn export_backup_package_v2_or_legacy(
    database: &RuntimeDatabase,
    package_name: &str,
    destination_root: &Path,
) -> Result<BackupPackageExportResult, String> {
    database.ensure_restore_resolved()?;
    let _operation = database.lock_restore_operation()?;
    if !destination_root.is_dir() {
        return Err("Backup export destination must be an existing folder".to_string());
    }
    let source = direct_package_path(database, package_name)?;
    let destination = destination_root.join(package_name);
    if destination.exists() {
        return Err("Backup export destination already exists".to_string());
    }
    if source.is_file() {
        inspect_skv_v2(&source).map_err(|error| error.to_string())?;
        fs::copy(&source, &destination)
            .map_err(|error| format!("Unable to export Backup package: {error}"))?;
    } else {
        preview_backup_package_directory(package_name, &source).map_err(|error| error.message)?;
        copy_plain_tree(&source, &destination)?;
    }
    Ok(BackupPackageExportResult {
        package_name: package_name.to_string(),
        exported: true,
        exported_path: destination.display().to_string(),
    })
}

pub fn import_selected_backup_package_v2_or_legacy(
    database: &RuntimeDatabase,
    selected_path: Option<PathBuf>,
) -> Result<BackupPackageImportResult, BackupPackageImportError> {
    let Some(selected) = selected_path else {
        return Ok(BackupPackageImportResult {
            cancelled: true,
            imported: false,
            package_name: None,
        });
    };
    database
        .ensure_restore_resolved()
        .map_err(|message| BackupPackageImportError {
            code: "recovery_unresolved".to_string(),
            message,
        })?;
    let _operation =
        database
            .lock_restore_operation()
            .map_err(|message| BackupPackageImportError {
                code: "operation_busy".to_string(),
                message,
            })?;
    let metadata = fs::symlink_metadata(&selected).map_err(|error| BackupPackageImportError {
        code: "invalid_selected_package".to_string(),
        message: error.to_string(),
    })?;
    if is_link_or_reparse(&metadata) || (!metadata.is_file() && !metadata.is_dir()) {
        return Err(BackupPackageImportError {
            code: "invalid_selected_package".to_string(),
            message: "Selected package is linked or unsupported".to_string(),
        });
    }
    let selected = selected
        .canonicalize()
        .map_err(|error| BackupPackageImportError {
            code: "invalid_selected_package".to_string(),
            message: error.to_string(),
        })?;
    let name = selected
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| BackupPackageImportError {
            code: "invalid_selected_package".to_string(),
            message: "Selected package name is invalid".to_string(),
        })?
        .to_string();
    if metadata.is_file() {
        let inspection = inspect_skv_v2(&selected).map_err(|error| BackupPackageImportError {
            code: error.code.to_string(),
            message: error.message,
        })?;
        if inspection.manifest.backup_type == SkvPackageType::Safety {
            return Err(BackupPackageImportError {
                code: "invalid_selected_package".to_string(),
                message: "Safety packages cannot be imported".to_string(),
            });
        }
    } else {
        preview_backup_package_directory(&name, &selected).map_err(|error| {
            BackupPackageImportError {
                code: error.code,
                message: error.message,
            }
        })?;
    }
    let backup_folder =
        ensure_default_backup_folder(database).map_err(|message| BackupPackageImportError {
            code: "import_failed".to_string(),
            message,
        })?;
    let destination = backup_folder.join(&name);
    if destination.exists() {
        return Err(BackupPackageImportError {
            code: "import_failed".to_string(),
            message: "A Backup package with this name already exists".to_string(),
        });
    }
    if metadata.is_file() {
        fs::copy(&selected, &destination).map_err(|error| BackupPackageImportError {
            code: "import_failed".to_string(),
            message: error.to_string(),
        })?;
    } else {
        copy_plain_tree(&selected, &destination).map_err(|message| BackupPackageImportError {
            code: "import_failed".to_string(),
            message,
        })?;
    }
    Ok(BackupPackageImportResult {
        cancelled: false,
        imported: true,
        package_name: Some(name),
    })
}

#[cfg(windows)]
fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_type().is_symlink() || metadata.file_attributes() & 0x0400 != 0
}

#[cfg(not(windows))]
fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(test)]
pub(crate) fn active_journal_for_test(app_data_dir: &Path) -> Result<Option<String>, String> {
    load_journal(app_data_dir).map(|value| value.map(|journal| format!("{:?}", journal.phase)))
}
