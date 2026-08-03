use std::{
    collections::BTreeSet,
    ffi::{OsStr, OsString},
    fmt, fs,
    fs::{File, OpenOptions},
    io::{BufReader, BufWriter, Read, Write},
    path::{Component, Path, PathBuf},
};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::managed_media::path::ManagedMediaRoot;

pub(crate) const SKV_V2_FORMAT: &str = "sakurava-skv";
pub(crate) const SKV_V2_VERSION: u32 = 2;
pub(crate) const SKV_V2_EXTENSION: &str = "skv";
pub(crate) const SKV_V2_DATABASE_ENTRY: &str = "catalog/sakurava.sqlite";
pub(crate) const SKV_V2_STATE_ENTRY: &str = "state/protected-state.v1.json";
pub(crate) const SKV_V2_MANAGED_PREFIX: &str = "managed-media/v1/";
pub(crate) const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
pub(crate) const MAX_ENTRY_COUNT: usize = 10_000;
pub(crate) const MAX_ENTRY_BYTES: u64 = 512 * 1024 * 1024;
pub(crate) const MAX_MANAGED_FILE_BYTES: u64 = 64 * 1024 * 1024;
pub(crate) const MAX_STATE_SNAPSHOT_BYTES: u64 = 8 * 1024 * 1024;
pub(crate) const MAX_AGGREGATE_UNCOMPRESSED_BYTES: u64 = 4 * 1024 * 1024 * 1024;
pub(crate) const MAX_COMPRESSION_RATIO: u64 = 1;

const HEADER_MAGIC: [u8; 16] = *b"SAKURAVA-SKV2\0\0\0";
const HEADER_BYTES: u64 = 16 + 4 + 4 + 32;
const REQUIRED_DATABASE_TABLES: [&str; 6] = [
    "videos",
    "images",
    "performers",
    "managedCategories",
    "glossary_entries",
    "credits",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SkvError {
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

impl SkvError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for SkvError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for SkvError {}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SkvPackageType {
    Manual,
    Automatic,
    Safety,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SkvCompatibilityMetadata {
    pub(crate) minimum_application_version: String,
    pub(crate) sqlite_user_version: u32,
    pub(crate) schema_migration_count: u32,
    pub(crate) schema_migrations_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SkvEntryKind {
    CatalogDatabase,
    ManagedMedia,
    ProtectedState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SkvEntryManifest {
    pub(crate) path: String,
    pub(crate) kind: SkvEntryKind,
    pub(crate) uncompressed_size: u64,
    pub(crate) stored_size: u64,
    pub(crate) sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SkvManifest {
    pub(crate) format: String,
    pub(crate) version: u32,
    pub(crate) application_version: String,
    pub(crate) created_at: String,
    pub(crate) backup_type: SkvPackageType,
    pub(crate) compression: String,
    pub(crate) compatibility: SkvCompatibilityMetadata,
    pub(crate) aggregate_uncompressed_size: u64,
    pub(crate) entries: Vec<SkvEntryManifest>,
}

#[derive(Debug, Clone)]
pub(crate) struct SkvCreateInput<'a> {
    pub(crate) output_root: &'a ValidatedPackageOutputRoot,
    pub(crate) output_file_name: &'a str,
    pub(crate) database_snapshot: &'a Path,
    pub(crate) managed_media_root: &'a ManagedMediaRoot,
    pub(crate) protected_state_snapshot: &'a [u8],
    pub(crate) created_at: &'a str,
    pub(crate) backup_type: SkvPackageType,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum RootIdentityComponent {
    Prefix(OsString),
    Root,
    Normal(OsString),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RootIdentity {
    components: Vec<RootIdentityComponent>,
}

impl RootIdentity {
    fn collides_with(&self, other: &Self) -> bool {
        self.components.starts_with(&other.components)
            || other.components.starts_with(&self.components)
    }
}

#[derive(Debug, Clone)]
struct ValidatedOwnedRoot {
    path: PathBuf,
    identity: RootIdentity,
}

#[derive(Debug, Clone)]
pub(crate) struct ValidatedPackageOutputRoot {
    owned: ValidatedOwnedRoot,
}

#[derive(Debug, Clone)]
pub(crate) struct ValidatedExtractionRoot {
    owned: ValidatedOwnedRoot,
}

impl ValidatedPackageOutputRoot {
    pub(crate) fn as_path(&self) -> &Path {
        &self.owned.path
    }
}

impl ValidatedExtractionRoot {
    pub(crate) fn as_path(&self) -> &Path {
        &self.owned.path
    }

    fn materialize(&self) -> Result<&Path, SkvError> {
        match fs::symlink_metadata(&self.owned.path) {
            Ok(_) => {
                return Err(SkvError::new(
                    "extraction_root_invalid",
                    "The validated extraction root is no longer new.",
                ))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(SkvError::new(
                    "extraction_root_invalid",
                    format!("Unable to revalidate extraction root: {error}"),
                ))
            }
        }
        fs::create_dir(&self.owned.path)
            .map_err(|error| SkvError::new("extraction_root_create_failed", error.to_string()))?;
        let metadata = fs::symlink_metadata(&self.owned.path)
            .map_err(|error| SkvError::new("extraction_root_invalid", error.to_string()))?;
        if !metadata.is_dir() {
            return Err(SkvError::new(
                "extraction_root_invalid",
                "The validated extraction root is not a directory.",
            ));
        }
        reject_reparse_metadata(&metadata, &self.owned.path)?;
        Ok(&self.owned.path)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SkvInspection {
    pub(crate) manifest: SkvManifest,
    pub(crate) package_size: u64,
}

#[derive(Debug, Clone)]
struct ManagedFileRecord {
    relative_path: String,
    expected_size: u64,
    expected_sha256: String,
    source_path: PathBuf,
}

#[derive(Debug, Clone)]
enum EntrySource {
    File(PathBuf),
    Bytes(Vec<u8>),
}

#[derive(Debug, Clone)]
struct PreparedEntry {
    manifest: SkvEntryManifest,
    source: EntrySource,
}

#[derive(Debug)]
struct ParsedContainer {
    manifest: SkvManifest,
    payload_offset: u64,
    package_size: u64,
}

pub(crate) fn create_skv_v2_package(input: SkvCreateInput<'_>) -> Result<PathBuf, SkvError> {
    let output_root = input.output_root.as_path();
    validate_output_file_name(input.output_file_name)?;
    validate_created_at(input.created_at)?;
    validate_protected_state_snapshot(input.protected_state_snapshot)?;

    let database = validate_database_snapshot(input.database_snapshot)?;
    let managed_records = managed_file_records(&database, input.managed_media_root)?;
    let compatibility = database_compatibility(&database)?;
    drop(database);

    let mut entries = Vec::with_capacity(managed_records.len() + 2);
    entries.push(prepare_file_entry(
        SKV_V2_DATABASE_ENTRY,
        SkvEntryKind::CatalogDatabase,
        input.database_snapshot,
        MAX_ENTRY_BYTES,
    )?);
    for record in managed_records {
        let package_path = format!("{SKV_V2_MANAGED_PREFIX}{}", record.relative_path);
        let entry = prepare_file_entry(
            &package_path,
            SkvEntryKind::ManagedMedia,
            &record.source_path,
            MAX_MANAGED_FILE_BYTES,
        )?;
        if entry.manifest.uncompressed_size != record.expected_size
            || entry.manifest.sha256 != record.expected_sha256
        {
            return Err(SkvError::new(
                "managed_media_mismatch",
                format!(
                    "Managed file {} does not match authoritative database metadata.",
                    record.relative_path
                ),
            ));
        }
        entries.push(entry);
    }
    entries.push(prepare_bytes_entry(
        SKV_V2_STATE_ENTRY,
        SkvEntryKind::ProtectedState,
        input.protected_state_snapshot,
        MAX_STATE_SNAPSHOT_BYTES,
    )?);
    entries.sort_by(|left, right| left.manifest.path.cmp(&right.manifest.path));

    let aggregate_uncompressed_size = entries.iter().try_fold(0_u64, |total, entry| {
        total
            .checked_add(entry.manifest.uncompressed_size)
            .ok_or_else(|| SkvError::new("aggregate_too_large", "Package size overflowed."))
    })?;
    let manifest = SkvManifest {
        format: SKV_V2_FORMAT.to_string(),
        version: SKV_V2_VERSION,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: input.created_at.to_string(),
        backup_type: input.backup_type,
        compression: "none".to_string(),
        compatibility,
        aggregate_uncompressed_size,
        entries: entries.iter().map(|entry| entry.manifest.clone()).collect(),
    };
    validate_manifest(&manifest)?;
    let manifest_bytes = serde_json::to_vec(&manifest)
        .map_err(|error| SkvError::new("manifest_encode_failed", error.to_string()))?;
    if manifest_bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(SkvError::new(
            "manifest_too_large",
            "The package manifest exceeds its safety limit.",
        ));
    }

    let final_path = output_root.join(input.output_file_name);
    if final_path.exists() {
        return Err(SkvError::new(
            "destination_exists",
            "The requested package destination already exists.",
        ));
    }
    let staging_path = output_root.join(format!(".{}.staging", input.output_file_name));
    if staging_path.exists() {
        return Err(SkvError::new(
            "staging_exists",
            "The exact package staging path already exists.",
        ));
    }

    let write_result = write_container(&staging_path, &manifest_bytes, &entries);
    if let Err(error) = write_result {
        let _ = fs::remove_file(&staging_path);
        return Err(error);
    }
    inspect_skv_v2(&staging_path)?;
    fs::rename(&staging_path, &final_path).map_err(|error| {
        let _ = fs::remove_file(&staging_path);
        SkvError::new("package_finalize_failed", error.to_string())
    })?;
    Ok(final_path)
}

pub(crate) fn inspect_skv_v2(package_path: &Path) -> Result<SkvInspection, SkvError> {
    let parsed = parse_container(package_path)?;
    verify_payloads(package_path, &parsed)?;
    Ok(SkvInspection {
        manifest: parsed.manifest,
        package_size: parsed.package_size,
    })
}

pub(crate) fn extract_skv_v2_to_owned_root(
    package_path: &Path,
    extraction_root: &ValidatedExtractionRoot,
) -> Result<SkvInspection, SkvError> {
    let parsed = parse_container(package_path)?;
    verify_payloads(package_path, &parsed)?;
    let extraction_root = extraction_root.materialize()?;
    let extraction_result = extract_payloads(package_path, &parsed, extraction_root)
        .and_then(|_| validate_extracted_package(extraction_root, &parsed.manifest));
    if let Err(error) = extraction_result {
        let _ = fs::remove_dir_all(extraction_root);
        return Err(error);
    }
    Ok(SkvInspection {
        manifest: parsed.manifest,
        package_size: parsed.package_size,
    })
}

fn write_container(
    staging_path: &Path,
    manifest_bytes: &[u8],
    entries: &[PreparedEntry],
) -> Result<(), SkvError> {
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(staging_path)
        .map_err(|error| SkvError::new("package_create_failed", error.to_string()))?;
    let mut writer = BufWriter::new(file);
    writer
        .write_all(&HEADER_MAGIC)
        .and_then(|_| writer.write_all(&SKV_V2_VERSION.to_le_bytes()))
        .and_then(|_| writer.write_all(&(manifest_bytes.len() as u32).to_le_bytes()))
        .and_then(|_| writer.write_all(&Sha256::digest(manifest_bytes)))
        .and_then(|_| writer.write_all(manifest_bytes))
        .map_err(|error| SkvError::new("package_write_failed", error.to_string()))?;
    for entry in entries {
        match &entry.source {
            EntrySource::File(path) => copy_file_and_verify(path, &mut writer, &entry.manifest)?,
            EntrySource::Bytes(bytes) => {
                if bytes.len() as u64 != entry.manifest.uncompressed_size
                    || hex_sha256(bytes) != entry.manifest.sha256
                {
                    return Err(SkvError::new(
                        "source_changed",
                        format!(
                            "Entry {} changed during package creation.",
                            entry.manifest.path
                        ),
                    ));
                }
                writer
                    .write_all(bytes)
                    .map_err(|error| SkvError::new("package_write_failed", error.to_string()))?;
            }
        }
    }
    writer
        .flush()
        .map_err(|error| SkvError::new("package_write_failed", error.to_string()))?;
    writer
        .get_ref()
        .sync_all()
        .map_err(|error| SkvError::new("package_sync_failed", error.to_string()))
}

fn parse_container(package_path: &Path) -> Result<ParsedContainer, SkvError> {
    validate_regular_file(
        package_path,
        MAX_AGGREGATE_UNCOMPRESSED_BYTES + MAX_MANIFEST_BYTES + HEADER_BYTES,
    )?;
    let package_size = fs::metadata(package_path)
        .map_err(|error| SkvError::new("package_metadata_failed", error.to_string()))?
        .len();
    let mut reader = BufReader::new(
        File::open(package_path)
            .map_err(|error| SkvError::new("package_open_failed", error.to_string()))?,
    );
    let mut magic = [0_u8; 16];
    read_exact(&mut reader, &mut magic, "truncated_header")?;
    if magic != HEADER_MAGIC {
        return Err(SkvError::new(
            "unsupported_format",
            "The file does not contain the Sakurava SKV v2 identity.",
        ));
    }
    let version = read_u32(&mut reader, "truncated_header")?;
    if version != SKV_V2_VERSION {
        return Err(SkvError::new(
            "unsupported_version",
            format!("Single-file SKV version {version} is unsupported."),
        ));
    }
    let manifest_len = read_u32(&mut reader, "truncated_header")? as u64;
    if manifest_len == 0 || manifest_len > MAX_MANIFEST_BYTES {
        return Err(SkvError::new(
            "manifest_too_large",
            "The manifest length is outside the allowed boundary.",
        ));
    }
    let mut expected_manifest_hash = [0_u8; 32];
    read_exact(&mut reader, &mut expected_manifest_hash, "truncated_header")?;
    let mut manifest_bytes = vec![0_u8; manifest_len as usize];
    read_exact(&mut reader, &mut manifest_bytes, "truncated_manifest")?;
    if Sha256::digest(&manifest_bytes).as_slice() != expected_manifest_hash {
        return Err(SkvError::new(
            "manifest_hash_mismatch",
            "The package manifest hash is invalid.",
        ));
    }
    let manifest: SkvManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| SkvError::new("malformed_manifest", error.to_string()))?;
    validate_manifest(&manifest)?;
    let expected_size = HEADER_BYTES
        .checked_add(manifest_len)
        .and_then(|value| value.checked_add(manifest.aggregate_uncompressed_size))
        .ok_or_else(|| SkvError::new("aggregate_too_large", "Package size overflowed."))?;
    if expected_size != package_size {
        return Err(SkvError::new(
            "container_size_mismatch",
            "The package is truncated or contains trailing data.",
        ));
    }
    Ok(ParsedContainer {
        manifest,
        payload_offset: HEADER_BYTES + manifest_len,
        package_size,
    })
}

fn verify_payloads(package_path: &Path, parsed: &ParsedContainer) -> Result<(), SkvError> {
    let mut reader = BufReader::new(
        File::open(package_path)
            .map_err(|error| SkvError::new("package_open_failed", error.to_string()))?,
    );
    std::io::copy(
        &mut reader.by_ref().take(parsed.payload_offset),
        &mut std::io::sink(),
    )
    .map_err(|error| SkvError::new("package_read_failed", error.to_string()))?;
    for entry in &parsed.manifest.entries {
        verify_entry_payload(&mut reader, entry)?;
    }
    let mut trailing = [0_u8; 1];
    if reader
        .read(&mut trailing)
        .map_err(|error| SkvError::new("package_read_failed", error.to_string()))?
        != 0
    {
        return Err(SkvError::new(
            "trailing_data",
            "The package contains unexpected trailing data.",
        ));
    }
    Ok(())
}

fn verify_entry_payload(
    reader: &mut BufReader<File>,
    entry: &SkvEntryManifest,
) -> Result<(), SkvError> {
    let mut remaining = entry.stored_size;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    while remaining > 0 {
        let count = usize::try_from(remaining.min(buffer.len() as u64)).unwrap_or(buffer.len());
        let read = reader
            .read(&mut buffer[..count])
            .map_err(|error| SkvError::new("package_read_failed", error.to_string()))?;
        if read == 0 {
            return Err(SkvError::new(
                "truncated_entry",
                format!("Entry {} is truncated.", entry.path),
            ));
        }
        hasher.update(&buffer[..read]);
        remaining -= read as u64;
    }
    if format!("{:x}", hasher.finalize()) != entry.sha256 {
        return Err(SkvError::new(
            "entry_hash_mismatch",
            format!("Entry {} failed integrity validation.", entry.path),
        ));
    }
    Ok(())
}

fn extract_payloads(
    package_path: &Path,
    parsed: &ParsedContainer,
    root: &Path,
) -> Result<(), SkvError> {
    let mut reader = BufReader::new(
        File::open(package_path)
            .map_err(|error| SkvError::new("package_open_failed", error.to_string()))?,
    );
    std::io::copy(
        &mut reader.by_ref().take(parsed.payload_offset),
        &mut std::io::sink(),
    )
    .map_err(|error| SkvError::new("package_read_failed", error.to_string()))?;
    for entry in &parsed.manifest.entries {
        let destination = root.join(&entry.path);
        if !destination.starts_with(root) {
            return Err(SkvError::new(
                "path_escape",
                format!("Entry {} escaped the owned extraction root.", entry.path),
            ));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| SkvError::new("extract_create_failed", error.to_string()))?;
            reject_reparse_path(parent)?;
        }
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination)
            .map_err(|error| SkvError::new("extract_create_failed", error.to_string()))?;
        let mut writer = BufWriter::new(file);
        let mut remaining = entry.stored_size;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        while remaining > 0 {
            let count = usize::try_from(remaining.min(buffer.len() as u64)).unwrap_or(buffer.len());
            let read = reader
                .read(&mut buffer[..count])
                .map_err(|error| SkvError::new("package_read_failed", error.to_string()))?;
            if read == 0 {
                return Err(SkvError::new("truncated_entry", entry.path.clone()));
            }
            writer
                .write_all(&buffer[..read])
                .map_err(|error| SkvError::new("extract_write_failed", error.to_string()))?;
            hasher.update(&buffer[..read]);
            remaining -= read as u64;
        }
        writer
            .flush()
            .map_err(|error| SkvError::new("extract_write_failed", error.to_string()))?;
        if format!("{:x}", hasher.finalize()) != entry.sha256 {
            return Err(SkvError::new("entry_hash_mismatch", entry.path.clone()));
        }
    }
    Ok(())
}

fn validate_extracted_package(root: &Path, manifest: &SkvManifest) -> Result<(), SkvError> {
    let database_path = root.join(SKV_V2_DATABASE_ENTRY);
    let database = validate_database_snapshot(&database_path)?;
    if database_compatibility(&database)? != manifest.compatibility {
        return Err(SkvError::new(
            "compatibility_mismatch",
            "Package compatibility metadata does not match its catalog database.",
        ));
    }
    let managed_root = ManagedMediaRoot::from_app_data_dir(root)
        .map_err(|error| SkvError::new("managed_root_invalid", error))?;
    let expected: BTreeSet<String> = managed_file_records(&database, &managed_root)?
        .into_iter()
        .map(|record| format!("{SKV_V2_MANAGED_PREFIX}{}", record.relative_path))
        .collect();
    let actual: BTreeSet<String> = manifest
        .entries
        .iter()
        .filter(|entry| entry.kind == SkvEntryKind::ManagedMedia)
        .map(|entry| entry.path.clone())
        .collect();
    if expected != actual {
        return Err(SkvError::new(
            "managed_media_set_mismatch",
            "Managed-media entries do not match database metadata.",
        ));
    }
    let state = fs::read(root.join(SKV_V2_STATE_ENTRY))
        .map_err(|error| SkvError::new("state_read_failed", error.to_string()))?;
    validate_protected_state_snapshot(&state)
}

pub(crate) fn validate_database_and_managed_media(
    database_path: &Path,
    app_data_dir: &Path,
) -> Result<(), SkvError> {
    let database = validate_database_snapshot(database_path)?;
    let managed_root = ManagedMediaRoot::from_app_data_dir(app_data_dir)
        .map_err(|error| SkvError::new("managed_root_invalid", error))?;
    for record in managed_file_records(&database, &managed_root)? {
        validate_regular_file(&record.source_path, MAX_MANAGED_FILE_BYTES)?;
        let (size, hash) = hash_file(&record.source_path)?;
        if size != record.expected_size || hash != record.expected_sha256 {
            return Err(SkvError::new(
                "managed_media_identity_mismatch",
                format!(
                    "Managed-media file {} failed identity validation.",
                    record.relative_path
                ),
            ));
        }
    }
    Ok(())
}

pub(crate) fn validate_protected_state_bytes(bytes: &[u8]) -> Result<(), SkvError> {
    validate_protected_state_snapshot(bytes)
}

fn prepare_file_entry(
    package_path: &str,
    kind: SkvEntryKind,
    source_path: &Path,
    limit: u64,
) -> Result<PreparedEntry, SkvError> {
    validate_portable_entry_path(package_path)?;
    validate_regular_file(source_path, limit)?;
    let (size, sha256) = hash_file(source_path)?;
    Ok(PreparedEntry {
        manifest: SkvEntryManifest {
            path: package_path.to_string(),
            kind,
            uncompressed_size: size,
            stored_size: size,
            sha256,
        },
        source: EntrySource::File(source_path.to_path_buf()),
    })
}

fn prepare_bytes_entry(
    package_path: &str,
    kind: SkvEntryKind,
    bytes: &[u8],
    limit: u64,
) -> Result<PreparedEntry, SkvError> {
    validate_portable_entry_path(package_path)?;
    if bytes.len() as u64 > limit {
        return Err(SkvError::new(
            "entry_too_large",
            format!("Entry {package_path} exceeds its safety limit."),
        ));
    }
    Ok(PreparedEntry {
        manifest: SkvEntryManifest {
            path: package_path.to_string(),
            kind,
            uncompressed_size: bytes.len() as u64,
            stored_size: bytes.len() as u64,
            sha256: hex_sha256(bytes),
        },
        source: EntrySource::Bytes(bytes.to_vec()),
    })
}

fn copy_file_and_verify(
    source_path: &Path,
    writer: &mut BufWriter<File>,
    manifest: &SkvEntryManifest,
) -> Result<(), SkvError> {
    validate_regular_file(source_path, manifest.uncompressed_size)?;
    let mut source = BufReader::new(
        File::open(source_path)
            .map_err(|error| SkvError::new("source_open_failed", error.to_string()))?,
    );
    let mut total = 0_u64;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = source
            .read(&mut buffer)
            .map_err(|error| SkvError::new("source_read_failed", error.to_string()))?;
        if read == 0 {
            break;
        }
        total = total
            .checked_add(read as u64)
            .ok_or_else(|| SkvError::new("source_changed", "Source size overflowed."))?;
        if total > manifest.uncompressed_size {
            return Err(SkvError::new("source_changed", manifest.path.clone()));
        }
        hasher.update(&buffer[..read]);
        writer
            .write_all(&buffer[..read])
            .map_err(|error| SkvError::new("package_write_failed", error.to_string()))?;
    }
    if total != manifest.uncompressed_size || format!("{:x}", hasher.finalize()) != manifest.sha256
    {
        return Err(SkvError::new(
            "source_changed",
            format!("Entry {} changed during package creation.", manifest.path),
        ));
    }
    Ok(())
}

fn validate_manifest(manifest: &SkvManifest) -> Result<(), SkvError> {
    if manifest.format != SKV_V2_FORMAT {
        return Err(SkvError::new(
            "unsupported_format",
            "Unsupported SKV format.",
        ));
    }
    if manifest.version != SKV_V2_VERSION {
        return Err(SkvError::new(
            "unsupported_version",
            format!("Unsupported SKV version {}.", manifest.version),
        ));
    }
    if manifest.application_version.is_empty()
        || manifest
            .compatibility
            .minimum_application_version
            .is_empty()
        || manifest.compression != "none"
    {
        return Err(SkvError::new(
            "invalid_compatibility",
            "Compatibility or compression metadata is invalid.",
        ));
    }
    validate_created_at(&manifest.created_at)?;
    if manifest.entries.is_empty() || manifest.entries.len() > MAX_ENTRY_COUNT {
        return Err(SkvError::new(
            "entry_count_exceeded",
            "Package entry count is outside the allowed boundary.",
        ));
    }
    let mut previous = None::<&str>;
    let mut database_count = 0;
    let mut state_count = 0;
    let mut aggregate = 0_u64;
    for entry in &manifest.entries {
        validate_portable_entry_path(&entry.path)?;
        if let Some(previous) = previous {
            if previous >= entry.path.as_str() {
                return Err(SkvError::new(
                    "duplicate_or_unsorted_entry",
                    "Package entries must be unique and sorted by exact portable path.",
                ));
            }
        }
        previous = Some(&entry.path);
        if entry.stored_size != entry.uncompressed_size {
            return Err(SkvError::new(
                "compression_not_allowed",
                "SKV v2 foundation entries must use the bounded 1:1 representation.",
            ));
        }
        let limit = match entry.kind {
            SkvEntryKind::CatalogDatabase => {
                database_count += 1;
                if entry.path != SKV_V2_DATABASE_ENTRY {
                    return Err(SkvError::new("unknown_entry", entry.path.clone()));
                }
                MAX_ENTRY_BYTES
            }
            SkvEntryKind::ManagedMedia => {
                if !entry.path.starts_with(SKV_V2_MANAGED_PREFIX)
                    || !(entry.path.ends_with(".jpg") || entry.path.ends_with(".png"))
                {
                    return Err(SkvError::new("unknown_entry", entry.path.clone()));
                }
                MAX_MANAGED_FILE_BYTES
            }
            SkvEntryKind::ProtectedState => {
                state_count += 1;
                if entry.path != SKV_V2_STATE_ENTRY {
                    return Err(SkvError::new("unknown_entry", entry.path.clone()));
                }
                MAX_STATE_SNAPSHOT_BYTES
            }
        };
        if entry.uncompressed_size > limit || entry.uncompressed_size > MAX_ENTRY_BYTES {
            return Err(SkvError::new("entry_too_large", entry.path.clone()));
        }
        validate_sha256(&entry.sha256)?;
        aggregate = aggregate
            .checked_add(entry.uncompressed_size)
            .ok_or_else(|| SkvError::new("aggregate_too_large", "Package size overflowed."))?;
        if aggregate > MAX_AGGREGATE_UNCOMPRESSED_BYTES {
            return Err(SkvError::new(
                "aggregate_too_large",
                "Package aggregate size exceeds its safety limit.",
            ));
        }
    }
    if database_count != 1 || state_count != 1 || aggregate != manifest.aggregate_uncompressed_size
    {
        return Err(SkvError::new(
            "entry_contract_mismatch",
            "The required database/state entry contract is not satisfied.",
        ));
    }
    validate_sha256(&manifest.compatibility.schema_migrations_sha256)
}

#[cfg(test)]
pub(crate) fn validate_manifest_for_test(manifest: &SkvManifest) -> Result<(), SkvError> {
    validate_manifest(manifest)
}

fn validate_portable_entry_path(value: &str) -> Result<(), SkvError> {
    if value.is_empty()
        || value.len() > 512
        || value.starts_with('/')
        || value.contains('\\')
        || value.contains(':')
        || value.contains('\0')
        || value != value.to_ascii_lowercase()
    {
        return Err(SkvError::new("invalid_entry_path", value.to_string()));
    }
    let mut component_count = 0;
    for component in value.split('/') {
        component_count += 1;
        if component.is_empty()
            || component == "."
            || component == ".."
            || component.ends_with('.')
            || component.ends_with(' ')
            || !component
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
        {
            return Err(SkvError::new("invalid_entry_path", value.to_string()));
        }
    }
    if component_count < 2 {
        return Err(SkvError::new("invalid_entry_path", value.to_string()));
    }
    Ok(())
}

fn validate_output_file_name(value: &str) -> Result<(), SkvError> {
    let path = Path::new(value);
    if path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| !extension.eq_ignore_ascii_case(SKV_V2_EXTENSION))
            .unwrap_or(true)
    {
        return Err(SkvError::new(
            "invalid_output_name",
            "New package output must use one portable .skv file name.",
        ));
    }
    Ok(())
}

fn validate_created_at(value: &str) -> Result<(), SkvError> {
    let bytes = value.as_bytes();
    let valid = bytes.len() == 20
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'Z'
        && bytes.iter().enumerate().all(|(index, byte)| {
            matches!(index, 4 | 7 | 10 | 13 | 16 | 19) || byte.is_ascii_digit()
        });
    if !valid {
        return Err(SkvError::new(
            "invalid_timestamp",
            "Creation timestamp must use UTC YYYY-MM-DDTHH:MM:SSZ form.",
        ));
    }
    Ok(())
}

fn validate_protected_state_snapshot(bytes: &[u8]) -> Result<(), SkvError> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_STATE_SNAPSHOT_BYTES {
        return Err(SkvError::new(
            "invalid_state_snapshot",
            "Protected state snapshot size is invalid.",
        ));
    }
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|error| SkvError::new("invalid_state_snapshot", error.to_string()))?;
    let object = value.as_object().ok_or_else(|| {
        SkvError::new(
            "invalid_state_snapshot",
            "Protected state must be an object.",
        )
    })?;
    let required = [
        "appearance",
        "automaticBackup",
        "catalogPreferences",
        "catalogPagination",
        "mediaAssetScope",
        "featureState",
        "translation",
    ];
    if object.get("format").and_then(|value| value.as_str()) != Some("sakurava-protected-state")
        || object.get("version").and_then(|value| value.as_u64()) != Some(1)
        || !required
            .iter()
            .all(|key| object.get(*key).is_some_and(|value| value.is_object()))
    {
        return Err(SkvError::new(
            "invalid_state_snapshot",
            "Protected state format, version, or owner map is invalid.",
        ));
    }
    Ok(())
}

fn validate_database_snapshot(path: &Path) -> Result<Connection, SkvError> {
    validate_regular_file(path, MAX_ENTRY_BYTES)?;
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| SkvError::new("database_open_failed", error.to_string()))?;
    let quick_check: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| SkvError::new("database_check_failed", error.to_string()))?;
    if quick_check != "ok" {
        return Err(SkvError::new(
            "database_check_failed",
            format!("SQLite quick_check returned {quick_check}."),
        ));
    }
    for table in REQUIRED_DATABASE_TABLES {
        if !sqlite_table_exists(&connection, table)? {
            return Err(SkvError::new(
                "database_schema_missing",
                format!("Required table {table} is missing."),
            ));
        }
    }
    Ok(connection)
}

fn database_compatibility(connection: &Connection) -> Result<SkvCompatibilityMetadata, SkvError> {
    let sqlite_user_version: u32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| SkvError::new("database_metadata_failed", error.to_string()))?;
    let mut migrations = Vec::new();
    if sqlite_table_exists(connection, "schemaMigrations")? {
        let mut statement = connection
            .prepare("SELECT migrationId FROM schemaMigrations ORDER BY migrationId")
            .map_err(|error| SkvError::new("database_metadata_failed", error.to_string()))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| SkvError::new("database_metadata_failed", error.to_string()))?;
        for row in rows {
            migrations.push(
                row.map_err(|error| SkvError::new("database_metadata_failed", error.to_string()))?,
            );
        }
    }
    let mut hasher = Sha256::new();
    for migration in &migrations {
        hasher.update(migration.as_bytes());
        hasher.update([0]);
    }
    Ok(SkvCompatibilityMetadata {
        minimum_application_version: env!("CARGO_PKG_VERSION").to_string(),
        sqlite_user_version,
        schema_migration_count: migrations.len() as u32,
        schema_migrations_sha256: format!("{:x}", hasher.finalize()),
    })
}

fn managed_file_records(
    connection: &Connection,
    managed_root: &ManagedMediaRoot,
) -> Result<Vec<ManagedFileRecord>, SkvError> {
    if !sqlite_table_exists(connection, "managed_media_variants")? {
        return Ok(Vec::new());
    }
    let mut statement = connection
        .prepare(
            "SELECT relative_path, byte_length, checksum
             FROM managed_media_variants
             ORDER BY relative_path",
        )
        .map_err(|error| SkvError::new("managed_metadata_failed", error.to_string()))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| SkvError::new("managed_metadata_failed", error.to_string()))?;
    let mut records = Vec::new();
    let mut seen = BTreeSet::new();
    for row in rows {
        let (relative_path, byte_length, checksum) =
            row.map_err(|error| SkvError::new("managed_metadata_failed", error.to_string()))?;
        if byte_length < 0 || !seen.insert(relative_path.clone()) {
            return Err(SkvError::new(
                "managed_metadata_invalid",
                "Managed-media metadata contains an invalid or duplicate path.",
            ));
        }
        validate_portable_entry_path(&format!("{SKV_V2_MANAGED_PREFIX}{relative_path}"))?;
        if !(relative_path.ends_with(".jpg") || relative_path.ends_with(".png")) {
            return Err(SkvError::new(
                "managed_metadata_invalid",
                format!("Managed-media path {relative_path} has an unsupported output type."),
            ));
        }
        validate_sha256(&checksum)?;
        let source_path = managed_root
            .resolve(Path::new(&relative_path))
            .map_err(|error| SkvError::new("managed_path_invalid", error))?;
        records.push(ManagedFileRecord {
            relative_path,
            expected_size: byte_length as u64,
            expected_sha256: checksum,
            source_path,
        });
    }
    Ok(records)
}

fn sqlite_table_exists(connection: &Connection, table: &str) -> Result<bool, SkvError> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [table],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| SkvError::new("database_metadata_failed", error.to_string()))
}

fn hash_file(path: &Path) -> Result<(u64, String), SkvError> {
    let mut reader = BufReader::new(
        File::open(path).map_err(|error| SkvError::new("source_open_failed", error.to_string()))?,
    );
    let mut total = 0_u64;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| SkvError::new("source_read_failed", error.to_string()))?;
        if read == 0 {
            break;
        }
        total = total
            .checked_add(read as u64)
            .ok_or_else(|| SkvError::new("entry_too_large", "Source size overflowed."))?;
        hasher.update(&buffer[..read]);
    }
    Ok((total, format!("{:x}", hasher.finalize())))
}

fn hex_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn validate_sha256(value: &str) -> Result<(), SkvError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(SkvError::new("invalid_sha256", "Invalid SHA-256 value."));
    }
    Ok(())
}

fn validate_regular_file(path: &Path, limit: u64) -> Result<(), SkvError> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| SkvError::new("file_metadata_failed", error.to_string()))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return Err(SkvError::new(
            "unsafe_file_type",
            format!("{} is not a direct regular file.", path.display()),
        ));
    }
    reject_reparse_metadata(&metadata, path)?;
    if metadata.len() > limit {
        return Err(SkvError::new(
            "entry_too_large",
            format!("{} exceeds its safety limit.", path.display()),
        ));
    }
    Ok(())
}

pub(crate) fn validate_package_output_root(
    root: &Path,
    live_app_data_root: Option<&Path>,
) -> Result<ValidatedPackageOutputRoot, SkvError> {
    let owned = validate_existing_root(root, "output root", "owned_root_invalid")?;
    reject_live_root_collision(&owned.identity, live_app_data_root)?;
    Ok(ValidatedPackageOutputRoot { owned })
}

pub(crate) fn validate_extraction_root(
    root: &Path,
    live_app_data_root: Option<&Path>,
) -> Result<ValidatedExtractionRoot, SkvError> {
    let normalized = normalize_platform_absolute_path(root.to_path_buf());
    validate_absolute_components(&normalized, "extraction_root_invalid")?;
    match fs::symlink_metadata(&normalized) {
        Ok(_) => {
            return Err(SkvError::new(
                "extraction_root_invalid",
                "The extraction root must be a new absolute path.",
            ))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(SkvError::new(
                "extraction_root_invalid",
                format!("Unable to inspect extraction root: {error}"),
            ))
        }
    }
    let parent = normalized.parent().ok_or_else(|| {
        SkvError::new(
            "extraction_root_invalid",
            "The extraction root has no parent.",
        )
    })?;
    let name = normalized.file_name().ok_or_else(|| {
        SkvError::new(
            "extraction_root_invalid",
            "The extraction root has no name.",
        )
    })?;
    let parent = validate_existing_root(parent, "extraction parent", "extraction_root_invalid")?;
    let path = parent.path.join(name);
    let identity = root_identity(&path, "extraction_root_invalid")?;
    reject_live_root_collision(&identity, live_app_data_root)?;
    Ok(ValidatedExtractionRoot {
        owned: ValidatedOwnedRoot { path, identity },
    })
}

fn validate_existing_root(
    root: &Path,
    label: &str,
    error_code: &'static str,
) -> Result<ValidatedOwnedRoot, SkvError> {
    let normalized = normalize_platform_absolute_path(root.to_path_buf());
    validate_absolute_components(&normalized, error_code)?;
    reject_reparse_path(&normalized)?;
    let canonical = normalize_platform_absolute_path(
        fs::canonicalize(&normalized)
            .map_err(|error| SkvError::new(error_code, error.to_string()))?,
    );
    validate_absolute_components(&canonical, error_code)?;
    reject_reparse_path(&canonical)?;
    let metadata = fs::symlink_metadata(&canonical)
        .map_err(|error| SkvError::new(error_code, error.to_string()))?;
    if !metadata.is_dir() {
        return Err(SkvError::new(
            error_code,
            format!("The {label} is not a directory."),
        ));
    }
    let identity = root_identity(&canonical, error_code)?;
    Ok(ValidatedOwnedRoot {
        path: canonical,
        identity,
    })
}

fn reject_live_root_collision(
    candidate: &RootIdentity,
    live_app_data_root: Option<&Path>,
) -> Result<(), SkvError> {
    let Some(live_root) = live_app_data_root else {
        return Ok(());
    };
    let live = validate_existing_root(live_root, "live AppData root", "live_root_invalid")?;
    if candidate.collides_with(&live.identity) {
        return Err(SkvError::new(
            "live_root_collision",
            "The disposable root collides with live AppData.",
        ));
    }
    Ok(())
}

fn validate_absolute_components(path: &Path, error_code: &'static str) -> Result<(), SkvError> {
    if !path.is_absolute() {
        return Err(SkvError::new(
            error_code,
            "A protected root must be absolute.",
        ));
    }
    for component in path.components() {
        if matches!(component, Component::CurDir | Component::ParentDir) {
            return Err(SkvError::new(
                error_code,
                "A protected root cannot contain relative path components.",
            ));
        }
    }
    Ok(())
}

fn root_identity(path: &Path, error_code: &'static str) -> Result<RootIdentity, SkvError> {
    let mut components = Vec::new();
    for component in path.components() {
        components.push(match component {
            Component::Prefix(prefix) => {
                RootIdentityComponent::Prefix(normalize_identity_component(prefix.as_os_str()))
            }
            Component::RootDir => RootIdentityComponent::Root,
            Component::Normal(value) => {
                RootIdentityComponent::Normal(normalize_identity_component(value))
            }
            Component::CurDir | Component::ParentDir => {
                return Err(SkvError::new(
                    error_code,
                    "A protected root identity contains a relative component.",
                ))
            }
        });
    }
    if components.is_empty() {
        return Err(SkvError::new(
            error_code,
            "A protected root identity is empty.",
        ));
    }
    Ok(RootIdentity { components })
}

fn reject_reparse_path(path: &Path) -> Result<(), SkvError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if current.exists() {
            let metadata = fs::symlink_metadata(&current)
                .map_err(|error| SkvError::new("path_metadata_failed", error.to_string()))?;
            if metadata.file_type().is_symlink() {
                return Err(SkvError::new(
                    "reparse_path_rejected",
                    format!("{} contains a symbolic link.", path.display()),
                ));
            }
            reject_reparse_metadata(&metadata, &current)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn normalize_platform_absolute_path(path: PathBuf) -> PathBuf {
    use std::{
        ffi::OsString,
        os::windows::ffi::{OsStrExt, OsStringExt},
    };

    const VERBATIM_PREFIX: &[u16] = &[b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16];
    const VERBATIM_UNC_PREFIX: &[u16] = &[
        b'\\' as u16,
        b'\\' as u16,
        b'?' as u16,
        b'\\' as u16,
        b'U' as u16,
        b'N' as u16,
        b'C' as u16,
        b'\\' as u16,
    ];

    let wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    let normalized = if wide.starts_with(VERBATIM_UNC_PREFIX) {
        let mut value = vec![b'\\' as u16, b'\\' as u16];
        value.extend_from_slice(&wide[VERBATIM_UNC_PREFIX.len()..]);
        value
    } else if wide.starts_with(VERBATIM_PREFIX) {
        wide[VERBATIM_PREFIX.len()..].to_vec()
    } else {
        return path;
    };
    PathBuf::from(OsString::from_wide(&normalized))
}

#[cfg(not(windows))]
fn normalize_platform_absolute_path(path: PathBuf) -> PathBuf {
    path
}

#[cfg(windows)]
fn normalize_identity_component(value: &OsStr) -> OsString {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};

    let mut wide: Vec<u16> = value.encode_wide().collect();
    for unit in &mut wide {
        if (*unit >= b'A' as u16) && (*unit <= b'Z' as u16) {
            *unit += (b'a' - b'A') as u16;
        }
    }
    OsString::from_wide(&wide)
}

#[cfg(not(windows))]
fn normalize_identity_component(value: &OsStr) -> OsString {
    value.to_os_string()
}

#[cfg(windows)]
fn reject_reparse_metadata(metadata: &fs::Metadata, path: &Path) -> Result<(), SkvError> {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(SkvError::new(
            "reparse_path_rejected",
            format!("{} is a reparse point.", path.display()),
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn reject_reparse_metadata(_metadata: &fs::Metadata, _path: &Path) -> Result<(), SkvError> {
    Ok(())
}

fn read_exact(
    reader: &mut impl Read,
    buffer: &mut [u8],
    code: &'static str,
) -> Result<(), SkvError> {
    reader
        .read_exact(buffer)
        .map_err(|error| SkvError::new(code, error.to_string()))
}

fn read_u32(reader: &mut impl Read, code: &'static str) -> Result<u32, SkvError> {
    let mut bytes = [0_u8; 4];
    read_exact(reader, &mut bytes, code)?;
    Ok(u32::from_le_bytes(bytes))
}
