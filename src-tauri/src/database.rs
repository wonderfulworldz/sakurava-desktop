use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, TryLockError},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{
    params, Connection, DatabaseName, OpenFlags, OptionalExtension, TransactionBehavior,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;

pub const APP_DATA_FOLDER_NAME: &str = "app.sakurava.desktop";
pub const DATABASE_FILE_NAME: &str = "sakurava.sqlite";
const APP_GENERATED_CACHE_DIR_NAMES: [&str; 3] =
    ["generated-cache", "thumbnail-cache", "preview-cache"];
pub const BACKUP_FOLDER_NAME: &str = "backups";
pub const BACKUP_FORMAT: &str = "sakurava-backup-directory";
pub const BACKUP_FORMAT_VERSION: u32 = 1;
pub const BACKUP_DATABASE_FILE_NAME: &str = "sakurava.sqlite";
pub const BACKUP_MANIFEST_FILE_NAME: &str = "manifest.json";
pub const SAKURAVA_REF_MIGRATION_ID: &str = "41.8.4A-sakurava-ref-v1";
pub const SAKURAVA_REF_CAPACITY: i64 = 9_999;

const SAKURAVA_REF_SECTIONS: [(&str, &str, &str, &str); 5] = [
    ("V", "videos", "id", "VID"),
    ("I", "images", "id", "IMG"),
    ("P", "performers", "id", "PER"),
    ("C", "managedCategories", "key", "CAT"),
    ("G", "glossary_entries", "id", "GLO"),
];

const CREATE_VIDEOS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY NOT NULL,
  sakuravaRef TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  originalTitle TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  censorship TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  releaseDate TEXT NOT NULL DEFAULT '',
  durationMinutes INTEGER,
  resolution TEXT NOT NULL DEFAULT '',
  fileSizeBytes INTEGER,
  fileType TEXT NOT NULL DEFAULT '',
  publisherLabel TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  mediaPath TEXT NOT NULL DEFAULT '',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  relatedPerformersJson TEXT NOT NULL DEFAULT '[]',
  relatedImagesJson TEXT NOT NULL DEFAULT '[]',
  source_links_json TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
"#;

const CREATE_IMAGES_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY NOT NULL,
  sakuravaRef TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  originalTitle TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  censorship TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  releaseDate TEXT NOT NULL DEFAULT '',
  publisherLabel TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  folderPath TEXT NOT NULL DEFAULT '',
  imageCount INTEGER,
  mainResolution TEXT NOT NULL DEFAULT '',
  totalFileSizeBytes INTEGER,
  mainFileType TEXT NOT NULL DEFAULT '',
  galleryImagePathsJson TEXT NOT NULL DEFAULT '[]',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  relatedPerformersJson TEXT NOT NULL DEFAULT '[]',
  relatedVideosJson TEXT NOT NULL DEFAULT '[]',
  source_links_json TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
"#;

const CREATE_PERFORMERS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS performers (
  id TEXT PRIMARY KEY NOT NULL,
  sakuravaRef TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  originalName TEXT NOT NULL DEFAULT '',
  aliasesJson TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT '',
  debutDate TEXT NOT NULL DEFAULT '',
  retiredDate TEXT NOT NULL DEFAULT '',
  birthDate TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  birthplace TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  bloodType TEXT NOT NULL DEFAULT '',
  heightCm INTEGER,
  weightKg INTEGER,
  measurements TEXT NOT NULL DEFAULT '',
  cupSize TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  performerThumbnailPathsJson TEXT NOT NULL DEFAULT '[]',
  filmographyCount INTEGER,
  pictorialsCount INTEGER,
  relatedVideosJson TEXT NOT NULL DEFAULT '[]',
  relatedImagesJson TEXT NOT NULL DEFAULT '[]',
  source_links_json TEXT NOT NULL DEFAULT '[]',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
"#;

const CREATE_MANAGED_CATEGORIES_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS managedCategories (
  key TEXT PRIMARY KEY NOT NULL,
  sakuravaRef TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  parentKey TEXT,
  description TEXT NOT NULL DEFAULT '',
  thumbnailPath TEXT NOT NULL DEFAULT '',
  showInVideos INTEGER NOT NULL DEFAULT 1 CHECK (showInVideos IN (0, 1)),
  showInImages INTEGER NOT NULL DEFAULT 1 CHECK (showInImages IN (0, 1)),
  showInPerformers INTEGER NOT NULL DEFAULT 1 CHECK (showInPerformers IN (0, 1)),
  showInCredits INTEGER NOT NULL DEFAULT 0 CHECK (showInCredits IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(name COLLATE NOCASE),
  FOREIGN KEY(parentKey) REFERENCES managedCategories(key)
);
"#;

const CREATE_GLOSSARY_ENTRIES_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS glossary_entries (
  id TEXT PRIMARY KEY NOT NULL,
  sakuravaRef TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  synonyms_json TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  parent_id TEXT NOT NULL DEFAULT '',
  thumbnail_path TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  source_title TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
"#;

const CREATE_CREDITS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY NOT NULL,
  workType TEXT NOT NULL,
  workId TEXT NOT NULL,
  performerId TEXT NOT NULL,
  characterName TEXT NOT NULL DEFAULT '',
  characterOriginalName TEXT,
  creditedAs TEXT,
  creditedAsMode TEXT NOT NULL DEFAULT 'auto',
  creditTypeCategoryId TEXT,
  roleImportanceCategoryId TEXT,
  characterMode TEXT NOT NULL DEFAULT 'text',
  characterId TEXT,
  billingOrder INTEGER,
  note TEXT,
  legacySourceKey TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
"#;

const SCHEMA_SQL: [&str; 6] = [
    CREATE_VIDEOS_TABLE_SQL,
    CREATE_IMAGES_TABLE_SQL,
    CREATE_PERFORMERS_TABLE_SQL,
    CREATE_MANAGED_CATEGORIES_TABLE_SQL,
    CREATE_GLOSSARY_ENTRIES_TABLE_SQL,
    CREATE_CREDITS_TABLE_SQL,
];
const REQUIRED_SCHEMA_TABLES: [&str; 6] = [
    "videos",
    "images",
    "performers",
    "managedCategories",
    "glossary_entries",
    "credits",
];

#[derive(Debug, Clone)]
pub struct RuntimeDatabasePaths {
    pub app_data_dir: PathBuf,
    pub database_file: PathBuf,
}

#[derive(Clone)]
pub struct RuntimeDatabase {
    pub paths: RuntimeDatabasePaths,
    connection: Arc<Mutex<Connection>>,
    package_operation: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseBackupResult {
    pub destination_path: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseRestoreResult {
    pub source_path: String,
    pub success: bool,
    pub safety_backup_path: String,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SakuravaRefSectionCounts {
    pub videos: i64,
    pub images: i64,
    pub performers: i64,
    pub categories: i64,
    pub glossary: i64,
}

impl SakuravaRefSectionCounts {
    fn all_within_capacity(&self) -> bool {
        [
            self.videos,
            self.images,
            self.performers,
            self.categories,
            self.glossary,
        ]
        .into_iter()
        .all(|count| count <= SAKURAVA_REF_CAPACITY)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SakuravaRefMigrationStatus {
    pub state: SakuravaRefMigrationState,
    pub required: bool,
    pub migration_id: String,
    pub counts: SakuravaRefSectionCounts,
    pub capacity_per_section_month: i64,
    pub preconditions_valid: bool,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SakuravaRefMigrationState {
    Legacy,
    Migrated,
    Invalid,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SakuravaRefMigrationResult {
    pub migrated: bool,
    pub migration_id: String,
    pub migration_yymm: String,
    pub counts: SakuravaRefSectionCounts,
    pub safety_package_name: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BackupPackageType {
    Manual,
    Automatic,
    Safety,
}

impl BackupPackageType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Automatic => "automatic",
            Self::Safety => "safety",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageIncludes {
    pub database: bool,
    pub original_media: bool,
    pub app_managed_assets: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BackupPackageDatabase {
    pub file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageManifest {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    pub backup_type: BackupPackageType,
    pub note: String,
    pub includes: BackupPackageIncludes,
    pub database: BackupPackageDatabase,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageInfo {
    pub package_name: String,
    pub package_path: String,
    pub manifest: BackupPackageManifest,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackagePreviewCounts {
    pub videos: i64,
    pub images: i64,
    pub performers: i64,
    pub categories: i64,
    pub glossary: i64,
    pub credits: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackagePreviewDatabase {
    pub file: String,
    pub quick_check: String,
    pub required_schema_present: bool,
    pub counts: BackupPackagePreviewCounts,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackagePreviewContent {
    pub database_included: bool,
    pub original_media_included: bool,
    pub app_managed_assets_included: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackagePreview {
    pub package_name: String,
    pub manifest: BackupPackageManifest,
    pub database: BackupPackagePreviewDatabase,
    pub content: BackupPackagePreviewContent,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackagePreviewError {
    pub code: String,
    pub message: String,
}

impl BackupPackagePreviewError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageRestoreResult {
    pub restored_package_name: String,
    pub safety_package_name: String,
    pub restored_at: String,
    pub database_restored: bool,
    pub rollback_attempted: bool,
    pub rollback_succeeded: bool,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageRestoreError {
    pub code: String,
    pub message: String,
    pub restored_package_name: String,
    pub safety_package_name: Option<String>,
    pub rollback_attempted: bool,
    pub rollback_succeeded: bool,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

impl BackupPackageRestoreError {
    fn new(
        code: &str,
        message: impl Into<String>,
        restored_package_name: impl Into<String>,
    ) -> Self {
        let message = message.into();
        Self {
            code: code.to_string(),
            message: message.clone(),
            restored_package_name: restored_package_name.into(),
            safety_package_name: None,
            rollback_attempted: false,
            rollback_succeeded: false,
            warnings: Vec::new(),
            errors: vec![message],
        }
    }

    fn from_preview(package_name: &str, error: BackupPackagePreviewError) -> Self {
        Self::new(&error.code, error.message, package_name)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageRotationResult {
    pub kept_automatic: usize,
    pub removed_automatic: usize,
    pub removed_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageDeleteResult {
    pub package_name: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageExportResult {
    pub package_name: String,
    pub exported: bool,
    pub exported_path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupFolderOpenResult {
    pub folder_path: String,
    pub opened: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClearCacheResult {
    pub success: bool,
    pub message: String,
    pub files_removed: u64,
    pub bytes_removed: u64,
    pub cleared_paths: Vec<String>,
}

impl RuntimeDatabase {
    pub fn connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.connection)
    }

    pub(crate) fn lock_package_operation(&self) -> Result<MutexGuard<'_, ()>, String> {
        match self.package_operation.try_lock() {
            Ok(guard) => Ok(guard),
            Err(TryLockError::WouldBlock) => {
                Err("Another backup or restore package operation is already running".to_string())
            }
            Err(TryLockError::Poisoned(_)) => {
                Err("Backup and restore package operations are unavailable".to_string())
            }
        }
    }
}

pub fn runtime_database_paths(app_data_dir: impl AsRef<Path>) -> RuntimeDatabasePaths {
    let app_data_dir = app_data_dir.as_ref().to_path_buf();
    let database_file = app_data_dir.join(DATABASE_FILE_NAME);

    RuntimeDatabasePaths {
        app_data_dir,
        database_file,
    }
}

pub fn default_backup_folder(database: &RuntimeDatabase) -> PathBuf {
    database.paths.app_data_dir.join(BACKUP_FOLDER_NAME)
}

pub fn ensure_default_backup_folder(database: &RuntimeDatabase) -> Result<PathBuf, String> {
    let backup_folder = default_backup_folder(database);
    fs::create_dir_all(&backup_folder)
        .map_err(|error| format!("Unable to create Sakurava backup folder: {error}"))?;
    if !backup_folder.is_dir() || !is_path_inside(&backup_folder, &database.paths.app_data_dir) {
        return Err("Sakurava backup folder is outside app data".to_string());
    }
    Ok(backup_folder)
}

pub fn create_backup_package(
    database: &RuntimeDatabase,
    backup_type: BackupPackageType,
    note: Option<String>,
) -> Result<BackupPackageInfo, String> {
    if backup_type == BackupPackageType::Safety {
        return Err("Safety backup packages can only be created internally".to_string());
    }
    let _operation = database.lock_package_operation()?;
    create_backup_package_at(database, backup_type, note, SystemTime::now())
}

fn create_backup_package_at(
    database: &RuntimeDatabase,
    backup_type: BackupPackageType,
    note: Option<String>,
    created_at: SystemTime,
) -> Result<BackupPackageInfo, String> {
    let backup_folder = ensure_default_backup_folder(database)?;
    let timestamp = backup_timestamp(created_at)?;
    let package_name = format!("sakurava-backup-{timestamp}-{}", backup_type.as_str());
    let package_path = backup_folder.join(&package_name);
    if package_path.exists() {
        return Err("A backup package already exists for this second and type".to_string());
    }

    let staging_path =
        backup_folder.join(format!(".{package_name}.staging-{}", timestamp_millis()));
    if staging_path.exists() {
        return Err("Backup package staging path already exists".to_string());
    }

    let result = (|| {
        fs::create_dir(&staging_path)
            .map_err(|error| format!("Unable to create backup staging folder: {error}"))?;
        backup_runtime_database(database, staging_path.join(BACKUP_DATABASE_FILE_NAME))?;

        let manifest = BackupPackageManifest {
            format: BACKUP_FORMAT.to_string(),
            version: BACKUP_FORMAT_VERSION,
            created_at: backup_created_at(created_at)?,
            backup_type,
            note: normalize_backup_note(note),
            includes: BackupPackageIncludes {
                database: true,
                original_media: false,
                app_managed_assets: false,
            },
            database: BackupPackageDatabase {
                file: BACKUP_DATABASE_FILE_NAME.to_string(),
            },
        };
        let manifest_json = serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("Unable to serialize backup manifest: {error}"))?;
        fs::write(staging_path.join(BACKUP_MANIFEST_FILE_NAME), manifest_json)
            .map_err(|error| format!("Unable to write backup manifest: {error}"))?;

        fs::rename(&staging_path, &package_path)
            .map_err(|error| format!("Unable to finalize backup package: {error}"))?;
        Ok(BackupPackageInfo {
            package_name,
            package_path: package_path.display().to_string(),
            manifest,
        })
    })();

    if result.is_err() && staging_path.exists() {
        let _ = fs::remove_dir_all(&staging_path);
    }
    result
}

pub fn list_backup_packages(database: &RuntimeDatabase) -> Result<Vec<BackupPackageInfo>, String> {
    let backup_folder = ensure_default_backup_folder(database)?;
    let canonical_backup_folder = backup_folder
        .canonicalize()
        .map_err(|error| format!("Unable to resolve Sakurava backup folder: {error}"))?;
    let mut packages = Vec::new();
    let entries = fs::read_dir(&backup_folder)
        .map_err(|error| format!("Unable to list Sakurava backup folder: {error}"))?;

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let package_path = entry.path();
        let Ok(canonical_package_path) = package_path.canonicalize() else {
            continue;
        };
        if canonical_package_path.parent() != Some(canonical_backup_folder.as_path()) {
            continue;
        }
        let Some(manifest) = read_valid_backup_manifest(&canonical_package_path) else {
            continue;
        };
        packages.push(BackupPackageInfo {
            package_name: entry.file_name().to_string_lossy().to_string(),
            package_path: canonical_package_path.display().to_string(),
            manifest,
        });
    }
    packages.sort_by(|left, right| right.manifest.created_at.cmp(&left.manifest.created_at));
    Ok(packages)
}

pub fn preview_backup_package(
    database: &RuntimeDatabase,
    package_name: &str,
) -> Result<BackupPackagePreview, BackupPackagePreviewError> {
    validate_backup_package_name(package_name)?;
    let backup_folder = default_backup_folder(database);
    if !backup_folder.is_dir() {
        return Err(BackupPackagePreviewError::new(
            "backup_folder_missing",
            "Sakurava backup folder does not exist",
        ));
    }
    let canonical_backup_folder = backup_folder.canonicalize().map_err(|error| {
        BackupPackagePreviewError::new(
            "backup_folder_unavailable",
            format!("Unable to resolve Sakurava backup folder: {error}"),
        )
    })?;
    let package_path = backup_folder.join(package_name);
    let metadata = fs::symlink_metadata(&package_path).map_err(|error| {
        BackupPackagePreviewError::new(
            "package_not_found",
            format!("Backup package was not found: {error}"),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(BackupPackagePreviewError::new(
            "invalid_package_type",
            "Backup package must be a direct, non-symlink folder",
        ));
    }
    let canonical_package_path = package_path.canonicalize().map_err(|error| {
        BackupPackagePreviewError::new(
            "package_unavailable",
            format!("Unable to resolve backup package: {error}"),
        )
    })?;
    if canonical_package_path.parent() != Some(canonical_backup_folder.as_path()) {
        return Err(BackupPackagePreviewError::new(
            "package_outside_backup_folder",
            "Backup package must be a direct child of the Sakurava backup folder",
        ));
    }

    preview_backup_package_directory(package_name, &canonical_package_path)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageImportResult {
    pub cancelled: bool,
    pub imported: bool,
    pub package_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupPackageImportError {
    pub code: String,
    pub message: String,
}

impl BackupPackageImportError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid_selected_package", message)
    }
}

fn preview_backup_package_directory(
    package_name: &str,
    canonical_package_path: &Path,
) -> Result<BackupPackagePreview, BackupPackagePreviewError> {
    let manifest_path = canonical_package_path.join(BACKUP_MANIFEST_FILE_NAME);
    let manifest_text = fs::read_to_string(&manifest_path).map_err(|error| {
        BackupPackagePreviewError::new(
            "manifest_missing",
            format!("Backup manifest is missing or unreadable: {error}"),
        )
    })?;
    let manifest_value: serde_json::Value =
        serde_json::from_str(&manifest_text).map_err(|error| {
            BackupPackagePreviewError::new(
                "manifest_malformed",
                format!("Backup manifest is malformed: {error}"),
            )
        })?;
    let manifest: BackupPackageManifest =
        serde_json::from_value(manifest_value.clone()).map_err(|error| {
            BackupPackagePreviewError::new(
                "manifest_invalid",
                format!("Backup manifest fields are invalid: {error}"),
            )
        })?;
    validate_preview_manifest(&manifest)?;

    let database_path = canonical_package_path.join(BACKUP_DATABASE_FILE_NAME);
    if !database_path.is_file() {
        return Err(BackupPackagePreviewError::new(
            "database_missing",
            "Backup package database is missing",
        ));
    }
    let backup_connection = Connection::open_with_flags(
        &database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| {
        BackupPackagePreviewError::new(
            "database_unreadable",
            format!("Unable to open backup database read-only: {error}"),
        )
    })?;
    let quick_check: String = backup_connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| {
            BackupPackagePreviewError::new(
                "database_integrity_error",
                format!("Unable to validate backup database integrity: {error}"),
            )
        })?;
    if quick_check != "ok" {
        return Err(BackupPackagePreviewError::new(
            "database_integrity_failed",
            format!("Backup database failed SQLite integrity check: {quick_check}"),
        ));
    }
    for table_name in REQUIRED_SCHEMA_TABLES {
        let table_count: i64 = backup_connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table_name],
                |row| row.get(0),
            )
            .map_err(|error| {
                BackupPackagePreviewError::new(
                    "schema_inspection_failed",
                    format!("Unable to inspect backup database schema: {error}"),
                )
            })?;
        if table_count != 1 {
            return Err(BackupPackagePreviewError::new(
                "required_schema_missing",
                format!("Backup database is missing required table: {table_name}"),
            ));
        }
    }
    if table_has_column(&backup_connection, "videos", "sakuravaRef").map_err(|error| {
        BackupPackagePreviewError::new("identity_schema_inspection_failed", error.to_string())
    })? {
        validate_sakurava_ref_schema(&backup_connection).map_err(|message| {
            BackupPackagePreviewError::new("identity_validation_failed", message)
        })?;
        validate_sakurava_ref_counters(&backup_connection).map_err(|message| {
            BackupPackagePreviewError::new("identity_counter_validation_failed", message)
        })?;
    }

    let counts = BackupPackagePreviewCounts {
        videos: count_backup_rows(&backup_connection, "videos")?,
        images: count_backup_rows(&backup_connection, "images")?,
        performers: count_backup_rows(&backup_connection, "performers")?,
        categories: count_backup_rows(&backup_connection, "managedCategories")?,
        glossary: count_backup_rows(&backup_connection, "glossary_entries")?,
        credits: count_backup_rows(&backup_connection, "credits")?,
    };
    let mut warnings = manifest_unknown_field_warnings(&manifest_value);
    if !manifest.includes.app_managed_assets {
        warnings.push(
            "Directory package v1 does not include future app-managed asset sections.".to_string(),
        );
    }

    Ok(BackupPackagePreview {
        package_name: package_name.to_string(),
        database: BackupPackagePreviewDatabase {
            file: manifest.database.file.clone(),
            quick_check,
            required_schema_present: true,
            counts,
        },
        content: BackupPackagePreviewContent {
            database_included: manifest.includes.database,
            original_media_included: manifest.includes.original_media,
            app_managed_assets_included: manifest.includes.app_managed_assets,
        },
        manifest,
        warnings,
        errors: Vec::new(),
    })
}

fn validate_backup_package_name(package_name: &str) -> Result<(), BackupPackagePreviewError> {
    let trimmed = package_name.trim();
    if trimmed.is_empty()
        || trimmed != package_name
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || Path::new(trimmed).components().count() != 1
    {
        return Err(BackupPackagePreviewError::new(
            "invalid_package_name",
            "Backup package name must identify one direct child folder",
        ));
    }
    Ok(())
}

fn validate_preview_manifest(
    manifest: &BackupPackageManifest,
) -> Result<(), BackupPackagePreviewError> {
    if manifest.format != BACKUP_FORMAT {
        return Err(BackupPackagePreviewError::new(
            "unsupported_format",
            "Backup manifest format is not supported",
        ));
    }
    if manifest.version != BACKUP_FORMAT_VERSION {
        return Err(BackupPackagePreviewError::new(
            "unsupported_version",
            format!(
                "Backup manifest version {} is not supported",
                manifest.version
            ),
        ));
    }
    if !is_valid_backup_created_at(&manifest.created_at) {
        return Err(BackupPackagePreviewError::new(
            "invalid_created_at",
            "Backup manifest createdAt is invalid",
        ));
    }
    if manifest.database.file != BACKUP_DATABASE_FILE_NAME {
        return Err(BackupPackagePreviewError::new(
            "invalid_database_file",
            "Backup manifest database file must be sakurava.sqlite",
        ));
    }
    if !manifest.includes.database {
        return Err(BackupPackagePreviewError::new(
            "database_not_included",
            "Backup manifest must include the database",
        ));
    }
    if manifest.includes.original_media {
        return Err(BackupPackagePreviewError::new(
            "original_media_not_supported",
            "Directory package v1 cannot include original media",
        ));
    }
    if manifest.includes.app_managed_assets {
        return Err(BackupPackagePreviewError::new(
            "app_managed_assets_not_supported",
            "Directory package v1 cannot include app-managed assets",
        ));
    }
    Ok(())
}

fn is_valid_backup_created_at(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 20
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'Z'
    {
        return false;
    }
    if bytes
        .iter()
        .enumerate()
        .any(|(index, byte)| !matches!(index, 4 | 7 | 10 | 13 | 16 | 19) && !byte.is_ascii_digit())
    {
        return false;
    }
    let parse = |start: usize, end: usize| {
        std::str::from_utf8(&bytes[start..end])
            .ok()
            .and_then(|text| text.parse::<u32>().ok())
    };
    matches!(parse(5, 7), Some(1..=12))
        && matches!(parse(8, 10), Some(1..=31))
        && matches!(parse(11, 13), Some(0..=23))
        && matches!(parse(14, 16), Some(0..=59))
        && matches!(parse(17, 19), Some(0..=59))
}

fn count_backup_rows(
    connection: &Connection,
    table_name: &str,
) -> Result<i64, BackupPackagePreviewError> {
    connection
        .query_row(
            &format!("SELECT COUNT(*) FROM \"{table_name}\""),
            [],
            |row| row.get(0),
        )
        .map_err(|error| {
            BackupPackagePreviewError::new(
                "count_failed",
                format!("Unable to count backup table {table_name}: {error}"),
            )
        })
}

fn manifest_unknown_field_warnings(manifest: &serde_json::Value) -> Vec<String> {
    let Some(object) = manifest.as_object() else {
        return Vec::new();
    };
    let known = [
        "format",
        "version",
        "createdAt",
        "backupType",
        "note",
        "includes",
        "database",
    ];
    let unknown = object
        .keys()
        .filter(|key| !known.contains(&key.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if unknown.is_empty() {
        Vec::new()
    } else {
        vec![format!(
            "Backup manifest contains unrecognized fields: {}.",
            unknown.join(", ")
        )]
    }
}

pub fn restore_backup_package(
    database: &RuntimeDatabase,
    package_name: &str,
) -> Result<BackupPackageRestoreResult, BackupPackageRestoreError> {
    restore_backup_package_with_hooks(
        database,
        package_name,
        |_| Ok(()),
        |connection, _| validate_restored_connection(connection),
        |_| Ok(()),
    )
}

fn restore_backup_package_with_hooks<P, F, R>(
    database: &RuntimeDatabase,
    package_name: &str,
    pre_apply_hook: P,
    post_apply_check: F,
    rollback_source_check: R,
) -> Result<BackupPackageRestoreResult, BackupPackageRestoreError>
where
    P: FnOnce(&Path) -> Result<(), String>,
    F: FnOnce(&mut Connection, &Path) -> Result<(), String>,
    R: FnOnce(&Path) -> Result<(), String>,
{
    let _operation = database.lock_package_operation().map_err(|message| {
        BackupPackageRestoreError::new("package_operation_busy", message, package_name)
    })?;

    // Never trust a preview produced by an earlier frontend request.
    preview_backup_package(database, package_name)
        .map_err(|error| BackupPackageRestoreError::from_preview(package_name, error))?;

    let connection = database.connection();
    let mut connection = connection.lock().map_err(|_| {
        BackupPackageRestoreError::new(
            "database_unavailable",
            "Database connection is unavailable",
            package_name,
        )
    })?;

    let safety_reason = format!("restoring {package_name}");
    let safety_package =
        create_safety_backup_package(database, &connection, &safety_reason, SystemTime::now())
            .map_err(|message| {
                BackupPackageRestoreError::new(
                    "safety_package_failed",
                    format!("Unable to create restore safety package: {message}"),
                    package_name,
                )
            })?;

    let package_path = default_backup_folder(database).join(package_name);
    pre_apply_hook(&package_path).map_err(|message| {
        let mut error =
            BackupPackageRestoreError::new("pre_apply_check_failed", message, package_name);
        error.safety_package_name = Some(safety_package.package_name.clone());
        error
    })?;

    // Revalidate after the safety snapshot and immediately before the mutating restore call.
    let preview = preview_backup_package(database, package_name).map_err(|error| {
        let mut restore_error = BackupPackageRestoreError::from_preview(package_name, error);
        restore_error.safety_package_name = Some(safety_package.package_name.clone());
        restore_error
    })?;
    let source_path = package_path.join(BACKUP_DATABASE_FILE_NAME);
    let safety_database_path =
        PathBuf::from(&safety_package.package_path).join(BACKUP_DATABASE_FILE_NAME);

    let apply_result = connection
        .restore(DatabaseName::Main, &source_path, None::<fn(_)>)
        .map_err(|error| format!("Unable to restore package database: {error}"))
        .and_then(|_| post_apply_check(&mut connection, &safety_database_path));

    if let Err(apply_error) = apply_result {
        let rollback_result = rollback_source_check(&safety_database_path).and_then(|_| {
            connection
                .restore(DatabaseName::Main, &safety_database_path, None::<fn(_)>)
                .map_err(|error| format!("Unable to roll back from safety package: {error}"))
        });
        let rollback_succeeded = rollback_result.is_ok();
        let mut errors = vec![apply_error.clone()];
        let message = if let Err(rollback_error) = rollback_result {
            errors.push(rollback_error.clone());
            format!("{apply_error}. {rollback_error}")
        } else {
            format!("{apply_error}. The active database was rolled back from the safety package.")
        };
        return Err(BackupPackageRestoreError {
            code: if rollback_succeeded {
                "restore_apply_failed"
            } else {
                "restore_rollback_failed"
            }
            .to_string(),
            message,
            restored_package_name: package_name.to_string(),
            safety_package_name: Some(safety_package.package_name),
            rollback_attempted: true,
            rollback_succeeded,
            warnings: preview.warnings,
            errors,
        });
    }

    Ok(BackupPackageRestoreResult {
        restored_package_name: package_name.to_string(),
        safety_package_name: safety_package.package_name,
        restored_at: backup_created_at(SystemTime::now()).map_err(|message| {
            BackupPackageRestoreError::new("result_timestamp_failed", message, package_name)
        })?,
        database_restored: true,
        rollback_attempted: false,
        rollback_succeeded: false,
        warnings: preview.warnings,
        errors: Vec::new(),
    })
}

fn create_safety_backup_package(
    database: &RuntimeDatabase,
    connection: &Connection,
    reason: &str,
    created_at: SystemTime,
) -> Result<BackupPackageInfo, String> {
    let backup_folder = ensure_default_backup_folder(database)?;
    let timestamp = backup_timestamp(created_at)?;
    let base_name = format!("sakurava-backup-{timestamp}-safety");
    let mut package_name = base_name.clone();
    let mut package_path = backup_folder.join(&package_name);
    if package_path.exists() {
        package_name = format!("{base_name}-{}", timestamp_millis());
        package_path = backup_folder.join(&package_name);
    }
    if package_path.exists() {
        return Err("A restore safety package already exists for this operation".to_string());
    }

    let staging_path =
        backup_folder.join(format!(".{package_name}.staging-{}", timestamp_millis()));
    let result = (|| {
        fs::create_dir(&staging_path)
            .map_err(|error| format!("Unable to create safety package staging folder: {error}"))?;
        let safety_database_path = staging_path.join(BACKUP_DATABASE_FILE_NAME);
        connection
            .backup(DatabaseName::Main, &safety_database_path, None)
            .map_err(|error| format!("Unable to back up the active database: {error}"))?;

        let manifest = BackupPackageManifest {
            format: BACKUP_FORMAT.to_string(),
            version: BACKUP_FORMAT_VERSION,
            created_at: backup_created_at(created_at)?,
            backup_type: BackupPackageType::Safety,
            note: format!("Safety backup before {reason}"),
            includes: BackupPackageIncludes {
                database: true,
                original_media: false,
                app_managed_assets: false,
            },
            database: BackupPackageDatabase {
                file: BACKUP_DATABASE_FILE_NAME.to_string(),
            },
        };
        let manifest_json = serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("Unable to serialize safety package manifest: {error}"))?;
        fs::write(staging_path.join(BACKUP_MANIFEST_FILE_NAME), manifest_json)
            .map_err(|error| format!("Unable to write safety package manifest: {error}"))?;
        fs::rename(&staging_path, &package_path)
            .map_err(|error| format!("Unable to finalize safety package: {error}"))?;

        Ok(BackupPackageInfo {
            package_name,
            package_path: package_path.display().to_string(),
            manifest,
        })
    })();

    if result.is_err() && staging_path.exists() {
        let _ = fs::remove_dir_all(&staging_path);
    }
    result
}

pub(crate) fn create_import_safety_backup_package(
    database: &RuntimeDatabase,
    connection: &Connection,
) -> Result<BackupPackageInfo, String> {
    create_safety_backup_package(database, connection, "catalog import", SystemTime::now())
}

fn validate_restored_connection(connection: &Connection) -> Result<(), String> {
    let quick_check: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Unable to validate restored database integrity: {error}"))?;
    if quick_check != "ok" {
        return Err(format!(
            "Restored database failed SQLite integrity check: {quick_check}"
        ));
    }
    for table_name in REQUIRED_SCHEMA_TABLES {
        let present: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table_name],
                |row| row.get(0),
            )
            .map_err(|error| format!("Unable to inspect restored database schema: {error}"))?;
        if present != 1 {
            return Err(format!(
                "Restored database is missing required table: {table_name}"
            ));
        }
    }
    Ok(())
}

pub fn rotate_automatic_backup_packages(
    database: &RuntimeDatabase,
    keep_count: usize,
) -> Result<BackupPackageRotationResult, String> {
    let _operation = database.lock_package_operation()?;
    if keep_count == 0 || keep_count > 100 {
        return Err("Automatic backup rotation count must be between 1 and 100".to_string());
    }
    let backup_folder = ensure_default_backup_folder(database)?;
    let canonical_backup_folder = backup_folder
        .canonicalize()
        .map_err(|error| format!("Unable to resolve Sakurava backup folder: {error}"))?;
    let automatic = list_backup_packages(database)?
        .into_iter()
        .filter(|package| package.manifest.backup_type == BackupPackageType::Automatic)
        .collect::<Vec<_>>();
    let mut removed_paths = Vec::new();

    for package in automatic.iter().skip(keep_count) {
        let path = PathBuf::from(&package.package_path);
        let canonical_path = path
            .canonicalize()
            .map_err(|error| format!("Unable to resolve automatic backup package: {error}"))?;
        if canonical_path.parent() != Some(canonical_backup_folder.as_path()) {
            return Err("Automatic backup rotation path is outside the backup folder".to_string());
        }
        fs::remove_dir_all(&canonical_path)
            .map_err(|error| format!("Unable to remove automatic backup package: {error}"))?;
        removed_paths.push(canonical_path.display().to_string());
    }

    Ok(BackupPackageRotationResult {
        kept_automatic: automatic.len().min(keep_count),
        removed_automatic: removed_paths.len(),
        removed_paths,
    })
}

fn resolve_normal_backup_package(
    database: &RuntimeDatabase,
    package_name: &str,
) -> Result<(PathBuf, BackupPackageManifest), String> {
    let preview = preview_backup_package(database, package_name).map_err(|error| error.message)?;
    if preview.manifest.backup_type == BackupPackageType::Safety {
        return Err("Safety backup packages cannot be managed from Backup History".to_string());
    }

    let backup_folder = default_backup_folder(database);
    let canonical_backup_folder = backup_folder
        .canonicalize()
        .map_err(|error| format!("Unable to resolve Sakurava backup folder: {error}"))?;
    let package_path = backup_folder.join(package_name);
    let metadata = fs::symlink_metadata(&package_path)
        .map_err(|error| format!("Backup package was not found: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Backup package must be a direct, non-symlink folder".to_string());
    }
    let canonical_package_path = package_path
        .canonicalize()
        .map_err(|error| format!("Unable to resolve backup package: {error}"))?;
    if canonical_package_path.parent() != Some(canonical_backup_folder.as_path()) {
        return Err(
            "Backup package must be a direct child of the Sakurava backup folder".to_string(),
        );
    }
    let manifest = read_valid_backup_manifest(&canonical_package_path)
        .ok_or_else(|| "Backup package manifest or content is invalid".to_string())?;
    if manifest.backup_type == BackupPackageType::Safety {
        return Err("Safety backup packages cannot be managed from Backup History".to_string());
    }
    Ok((canonical_package_path, manifest))
}

pub fn delete_backup_package(
    database: &RuntimeDatabase,
    package_name: &str,
) -> Result<BackupPackageDeleteResult, String> {
    let _operation = database.lock_package_operation()?;
    let (package_path, _) = resolve_normal_backup_package(database, package_name)?;
    fs::remove_dir_all(&package_path)
        .map_err(|error| format!("Unable to delete backup package: {error}"))?;
    Ok(BackupPackageDeleteResult {
        package_name: package_name.to_string(),
        deleted: true,
    })
}

pub fn export_backup_package(
    database: &RuntimeDatabase,
    package_name: &str,
    destination_root: impl AsRef<Path>,
) -> Result<BackupPackageExportResult, String> {
    let _operation = database.lock_package_operation()?;
    let (package_path, _) = resolve_normal_backup_package(database, package_name)?;
    let destination_root = destination_root.as_ref();
    if destination_root.as_os_str().is_empty() || !destination_root.is_dir() {
        return Err("Backup export destination must be an existing folder".to_string());
    }
    let canonical_destination_root = destination_root
        .canonicalize()
        .map_err(|error| format!("Unable to resolve backup export destination: {error}"))?;
    let canonical_backup_folder = default_backup_folder(database)
        .canonicalize()
        .map_err(|error| format!("Unable to resolve Sakurava backup folder: {error}"))?;
    if canonical_destination_root.starts_with(&canonical_backup_folder)
        || canonical_destination_root.starts_with(&package_path)
    {
        return Err("Choose a destination outside Sakurava's backup package folders".to_string());
    }

    let mut destination_path = canonical_destination_root.join(package_name);
    let mut suffix = 1usize;
    while destination_path.exists() {
        destination_path = canonical_destination_root.join(format!("{package_name}-{suffix}"));
        suffix += 1;
        if suffix > 10_000 {
            return Err("Unable to choose a unique backup export folder".to_string());
        }
    }
    let staging_path = canonical_destination_root
        .join(format!(".{package_name}.exporting-{}", timestamp_millis()));
    if staging_path.exists() {
        return Err("Backup export staging folder already exists".to_string());
    }

    let result = (|| {
        fs::create_dir(&staging_path)
            .map_err(|error| format!("Unable to create backup export folder: {error}"))?;
        fs::copy(
            package_path.join(BACKUP_MANIFEST_FILE_NAME),
            staging_path.join(BACKUP_MANIFEST_FILE_NAME),
        )
        .map_err(|error| format!("Unable to export backup manifest: {error}"))?;
        fs::copy(
            package_path.join(BACKUP_DATABASE_FILE_NAME),
            staging_path.join(BACKUP_DATABASE_FILE_NAME),
        )
        .map_err(|error| format!("Unable to export backup database: {error}"))?;
        fs::rename(&staging_path, &destination_path)
            .map_err(|error| format!("Unable to finalize backup export: {error}"))?;
        Ok(BackupPackageExportResult {
            package_name: package_name.to_string(),
            exported: true,
            exported_path: destination_path.display().to_string(),
        })
    })();

    if result.is_err() && staging_path.exists() {
        let _ = fs::remove_dir_all(&staging_path);
    }
    result
}

pub fn import_selected_backup_package(
    database: &RuntimeDatabase,
    selected_path: Option<PathBuf>,
) -> Result<BackupPackageImportResult, BackupPackageImportError> {
    let Some(selected_path) = selected_path else {
        return Ok(BackupPackageImportResult {
            cancelled: true,
            imported: false,
            package_name: None,
        });
    };
    let _operation = database
        .lock_package_operation()
        .map_err(|message| BackupPackageImportError::new("operation_busy", message))?;

    let metadata = fs::symlink_metadata(&selected_path).map_err(|error| {
        BackupPackageImportError::invalid(format!(
            "Selected backup package does not exist: {error}"
        ))
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(BackupPackageImportError::invalid(
            "Selected backup package must be a non-symlink directory",
        ));
    }
    let canonical_source = selected_path.canonicalize().map_err(|error| {
        BackupPackageImportError::invalid(format!(
            "Unable to resolve selected backup package: {error}"
        ))
    })?;
    let package_name = canonical_source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            BackupPackageImportError::invalid("Selected backup package name is invalid")
        })?
        .to_string();
    validate_backup_package_name(&package_name)
        .map_err(|error| BackupPackageImportError::invalid(error.message))?;

    let backup_folder = ensure_default_backup_folder(database)
        .map_err(|error| BackupPackageImportError::new("import_failed", error))?;
    let canonical_backup_folder = backup_folder.canonicalize().map_err(|error| {
        BackupPackageImportError::new(
            "import_failed",
            format!("Unable to resolve Sakurava backup folder: {error}"),
        )
    })?;
    if canonical_source.starts_with(&canonical_backup_folder) {
        return Err(BackupPackageImportError::invalid(
            "Choose a backup package outside Sakurava's backup folder",
        ));
    }

    let preview = preview_backup_package_directory(&package_name, &canonical_source)
        .map_err(|error| BackupPackageImportError::invalid(error.message))?;
    if preview.manifest.backup_type == BackupPackageType::Safety {
        return Err(BackupPackageImportError::invalid(
            "Safety backup packages cannot be imported from Backup History",
        ));
    }

    let mut destination_name = package_name.clone();
    let mut destination_path = backup_folder.join(&destination_name);
    let mut suffix = 1usize;
    while destination_path.exists() {
        destination_name = format!("{package_name}-{suffix}");
        destination_path = backup_folder.join(&destination_name);
        suffix += 1;
        if suffix > 10_000 {
            return Err(BackupPackageImportError::new(
                "import_failed",
                "Unable to choose a unique imported backup package name",
            ));
        }
    }
    let staging_path = backup_folder.join(format!(
        ".{destination_name}.importing-{}",
        timestamp_millis()
    ));
    if staging_path.exists() {
        return Err(BackupPackageImportError::new(
            "import_failed",
            "Backup import staging folder already exists",
        ));
    }

    let result = (|| {
        fs::create_dir(&staging_path).map_err(|error| {
            BackupPackageImportError::new(
                "import_failed",
                format!("Unable to create backup import folder: {error}"),
            )
        })?;
        fs::copy(
            canonical_source.join(BACKUP_MANIFEST_FILE_NAME),
            staging_path.join(BACKUP_MANIFEST_FILE_NAME),
        )
        .map_err(|error| {
            BackupPackageImportError::new(
                "import_failed",
                format!("Unable to import backup manifest: {error}"),
            )
        })?;
        fs::copy(
            canonical_source.join(BACKUP_DATABASE_FILE_NAME),
            staging_path.join(BACKUP_DATABASE_FILE_NAME),
        )
        .map_err(|error| {
            BackupPackageImportError::new(
                "import_failed",
                format!("Unable to import backup database: {error}"),
            )
        })?;
        fs::rename(&staging_path, &destination_path).map_err(|error| {
            BackupPackageImportError::new(
                "import_failed",
                format!("Unable to finalize imported backup package: {error}"),
            )
        })?;
        Ok(BackupPackageImportResult {
            cancelled: false,
            imported: true,
            package_name: Some(destination_name),
        })
    })();

    if result.is_err() && staging_path.exists() {
        let _ = fs::remove_dir_all(&staging_path);
    }
    result
}

pub fn open_default_backup_folder(
    database: &RuntimeDatabase,
) -> Result<BackupFolderOpenResult, String> {
    let backup_folder = ensure_default_backup_folder(database)?;
    open_backup_folder_platform(&backup_folder)?;
    Ok(BackupFolderOpenResult {
        folder_path: backup_folder.display().to_string(),
        opened: true,
    })
}

#[cfg(target_os = "windows")]
fn open_backup_folder_platform(path: &Path) -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map_err(|error| format!("Unable to open Sakurava backup folder: {error}"))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn open_backup_folder_platform(_path: &Path) -> Result<(), String> {
    Err("Open Backup Folder is available on Windows".to_string())
}

fn read_valid_backup_manifest(package_path: &Path) -> Option<BackupPackageManifest> {
    let manifest_text = fs::read_to_string(package_path.join(BACKUP_MANIFEST_FILE_NAME)).ok()?;
    let manifest: BackupPackageManifest = serde_json::from_str(&manifest_text).ok()?;
    if manifest.format != BACKUP_FORMAT
        || manifest.version != BACKUP_FORMAT_VERSION
        || !manifest.includes.database
        || manifest.includes.original_media
        || manifest.includes.app_managed_assets
        || manifest.database.file != BACKUP_DATABASE_FILE_NAME
        || !package_path.join(BACKUP_DATABASE_FILE_NAME).is_file()
    {
        return None;
    }
    Some(manifest)
}

fn normalize_backup_note(note: Option<String>) -> String {
    note.unwrap_or_default().trim().chars().take(2000).collect()
}

fn backup_timestamp(time: SystemTime) -> Result<String, String> {
    let (year, month, day, hour, minute, second) = utc_time_parts(time)?;
    Ok(format!(
        "{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}"
    ))
}

fn backup_created_at(time: SystemTime) -> Result<String, String> {
    let (year, month, day, hour, minute, second) = utc_time_parts(time)?;
    Ok(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
    ))
}

fn utc_time_parts(time: SystemTime) -> Result<(i64, u32, u32, u32, u32, u32), String> {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Backup timestamp is before the Unix epoch".to_string())?
        .as_secs();
    let days = (seconds / 86_400) as i64;
    let seconds_of_day = seconds % 86_400;
    let (year, month, day) = civil_date_from_days(days);
    Ok((
        year,
        month,
        day,
        (seconds_of_day / 3_600) as u32,
        ((seconds_of_day % 3_600) / 60) as u32,
        (seconds_of_day % 60) as u32,
    ))
}

fn civil_date_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    (year, month as u32, day as u32)
}

pub fn prepare_database_paths(app_data_dir: impl AsRef<Path>) -> io::Result<RuntimeDatabasePaths> {
    let paths = runtime_database_paths(app_data_dir);
    fs::create_dir_all(&paths.app_data_dir)?;
    Ok(paths)
}

pub fn initialize_schema(connection: &Connection) -> rusqlite::Result<()> {
    let database_was_fresh = connection.query_row(
        "SELECT COUNT(*) = 0 FROM sqlite_master WHERE type = 'table' AND name = 'videos'",
        [],
        |row| row.get::<_, bool>(0),
    )?;
    for statement in SCHEMA_SQL {
        connection.execute_batch(statement)?;
    }

    ensure_text_json_column(connection, "videos", "relatedPerformersJson", "[]")?;
    ensure_text_json_column(connection, "videos", "relatedImagesJson", "[]")?;
    ensure_text_json_column(connection, "videos", "source_links_json", "[]")?;
    ensure_text_column(connection, "videos", "resolution", "")?;
    ensure_integer_column(connection, "videos", "fileSizeBytes")?;
    ensure_text_column(connection, "videos", "fileType", "")?;
    ensure_text_json_column(connection, "images", "relatedPerformersJson", "[]")?;
    ensure_text_json_column(connection, "images", "relatedVideosJson", "[]")?;
    ensure_text_json_column(connection, "images", "galleryImagePathsJson", "[]")?;
    ensure_text_json_column(connection, "images", "source_links_json", "[]")?;
    ensure_text_column(connection, "images", "mainResolution", "")?;
    ensure_integer_column(connection, "images", "totalFileSizeBytes")?;
    ensure_text_column(connection, "images", "mainFileType", "")?;
    ensure_text_json_column(
        connection,
        "performers",
        "performerThumbnailPathsJson",
        "[]",
    )?;
    ensure_text_column(connection, "performers", "debutDate", "")?;
    ensure_text_column(connection, "performers", "retiredDate", "")?;
    ensure_text_column(connection, "performers", "gender", "")?;
    ensure_text_column(connection, "performers", "birthplace", "")?;
    ensure_text_column(connection, "performers", "nationality", "")?;
    ensure_text_column(connection, "performers", "bloodType", "")?;
    ensure_integer_column(connection, "performers", "heightCm")?;
    ensure_integer_column(connection, "performers", "weightKg")?;
    ensure_text_column(connection, "performers", "measurements", "")?;
    ensure_text_column(connection, "performers", "cupSize", "")?;
    ensure_text_json_column(connection, "performers", "relatedVideosJson", "[]")?;
    ensure_text_json_column(connection, "performers", "relatedImagesJson", "[]")?;
    ensure_text_json_column(connection, "performers", "source_links_json", "[]")?;
    ensure_boolean_column(connection, "managedCategories", "showInVideos", true)?;
    ensure_boolean_column(connection, "managedCategories", "showInImages", true)?;
    ensure_boolean_column(connection, "managedCategories", "showInPerformers", true)?;
    ensure_boolean_column(connection, "managedCategories", "showInCredits", false)?;
    ensure_text_column(connection, "glossary_entries", "parent_id", "")?;
    backfill_legacy_credits(connection)?;

    // Only a genuinely fresh database receives identity infrastructure here.
    // Existing legacy or partial databases remain untouched so the
    // authoritative validator can classify them and require an explicit
    // upgrade or recovery flow.
    if database_was_fresh {
        create_sakurava_ref_support_schema(connection)?;
        connection.execute(
            "INSERT INTO schemaMigrations (migrationId, appliedAt) VALUES (?1, ?2)",
            params![
                SAKURAVA_REF_MIGRATION_ID,
                backup_created_at(SystemTime::now())
                    .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
            ],
        )?;
    }

    Ok(())
}

pub fn restore_backup_package_with_sakurava_refs(
    database: &RuntimeDatabase,
    package_name: &str,
    migration_yymm: &str,
) -> Result<BackupPackageRestoreResult, BackupPackageRestoreError> {
    let migration_yymm = validate_migration_yymm(migration_yymm).map_err(|message| {
        BackupPackageRestoreError::new("invalid_migration_month", message, package_name)
    })?;
    restore_backup_package_with_hooks(
        database,
        package_name,
        |_| Ok(()),
        move |connection, safety_database_path| {
            validate_restored_connection(connection)?;
            upgrade_restored_identity(connection, safety_database_path, &migration_yymm)
        },
        |_| Ok(()),
    )
}

fn upgrade_restored_identity(
    connection: &mut Connection,
    safety_database_path: &Path,
    migration_yymm: &str,
) -> Result<(), String> {
    let issues = validate_identity_preconditions(connection)?;
    if !issues.is_empty() {
        return Err(issues[0].clone());
    }

    // The restore coordinator owns the outer rollback. A dedicated connection
    // allows the same atomic identity migration to run against a legacy package.
    if !table_has_column(connection, "videos", "sakuravaRef").map_err(|error| error.to_string())? {
        migrate_sakurava_ref_connection(connection, migration_yymm)?;
    }
    validate_sakurava_ref_schema(connection)?;

    if safety_database_path.is_file() {
        let safety = Connection::open_with_flags(
            safety_database_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|error| format!("Unable to read restore safety counters: {error}"))?;
        let counter_table_present: i64 = safety.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'sakuravaRefCounters'",
            [], |row| row.get(0),
        ).map_err(|error| error.to_string())?;
        if counter_table_present == 1 {
            let mut statement = safety
                .prepare("SELECT sectionCode, issuanceYymm, lastSequence FROM sakuravaRefCounters")
                .map_err(|error| error.to_string())?;
            let counters = statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                })
                .map_err(|error| error.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| error.to_string())?;
            for (section, yymm, high_water) in counters {
                connection.execute(
                    "INSERT INTO sakuravaRefCounters (sectionCode, issuanceYymm, lastSequence) VALUES (?1, ?2, ?3)
                     ON CONFLICT(sectionCode, issuanceYymm) DO UPDATE SET lastSequence = MAX(lastSequence, excluded.lastSequence)",
                    params![section, yymm, high_water],
                ).map_err(|error| format!("Unable to preserve Sakurava Ref history during Restore: {error}"))?;
            }
        }
    }
    reconcile_sakurava_ref_counters(connection)?;
    validate_sakurava_ref_schema(connection)?;
    Ok(())
}

fn reconcile_sakurava_ref_counters(connection: &Connection) -> Result<(), String> {
    for (section, table, _, _) in SAKURAVA_REF_SECTIONS {
        let mut statement = connection
            .prepare(&format!(
                "SELECT substr(sakuravaRef, 2, 4), MAX(CAST(substr(sakuravaRef, 6, 4) AS INTEGER))
             FROM {table} WHERE sakuravaRef <> '' GROUP BY substr(sakuravaRef, 2, 4)"
            ))
            .map_err(|error| error.to_string())?;
        let high_water = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())?;
        for (yymm, sequence) in high_water {
            connection.execute(
                "INSERT INTO sakuravaRefCounters (sectionCode, issuanceYymm, lastSequence) VALUES (?1, ?2, ?3)
                 ON CONFLICT(sectionCode, issuanceYymm) DO UPDATE SET lastSequence = MAX(lastSequence, excluded.lastSequence)",
                params![section, yymm, sequence],
            ).map_err(|error| format!("Unable to reconcile Sakurava Ref counters: {error}"))?;
        }
    }
    Ok(())
}

fn validate_sakurava_ref_counters(connection: &Connection) -> Result<(), String> {
    for (section, table, _, _) in SAKURAVA_REF_SECTIONS {
        let mut statement = connection
            .prepare(&format!(
                "SELECT substr(sakuravaRef, 2, 4), MAX(CAST(substr(sakuravaRef, 6, 4) AS INTEGER))
             FROM {table} WHERE sakuravaRef <> '' GROUP BY substr(sakuravaRef, 2, 4)"
            ))
            .map_err(|error| error.to_string())?;
        let values = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())?;
        for (yymm, used) in values {
            let stored: Option<i64> = connection.query_row(
                "SELECT lastSequence FROM sakuravaRefCounters WHERE sectionCode = ?1 AND issuanceYymm = ?2",
                params![section, yymm], |row| row.get(0),
            ).optional().map_err(|error| error.to_string())?;
            if stored.is_none_or(|high_water| high_water < used) {
                return Err(format!(
                    "Sakurava Ref counter history is incomplete for {section}{yymm}."
                ));
            }
        }
    }
    Ok(())
}

fn create_sakurava_ref_support_schema(connection: &Connection) -> rusqlite::Result<()> {
    create_sakurava_ref_ledger_tables(connection)?;
    connection.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_sakurava_ref ON videos(sakuravaRef) WHERE sakuravaRef <> '';
         CREATE UNIQUE INDEX IF NOT EXISTS idx_images_sakurava_ref ON images(sakuravaRef) WHERE sakuravaRef <> '';
         CREATE UNIQUE INDEX IF NOT EXISTS idx_performers_sakurava_ref ON performers(sakuravaRef) WHERE sakuravaRef <> '';
         CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sakurava_ref ON managedCategories(sakuravaRef) WHERE sakuravaRef <> '';
         CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_sakurava_ref ON glossary_entries(sakuravaRef) WHERE sakuravaRef <> '';",
    )
}

fn create_sakurava_ref_ledger_tables(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schemaMigrations (
           migrationId TEXT PRIMARY KEY NOT NULL,
           appliedAt TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS sakuravaRefCounters (
           sectionCode TEXT NOT NULL,
           issuanceYymm TEXT NOT NULL,
           lastSequence INTEGER NOT NULL CHECK(lastSequence BETWEEN 0 AND 9999),
           PRIMARY KEY(sectionCode, issuanceYymm)
         );
         CREATE TABLE IF NOT EXISTS sakuravaRefAliases (
           sectionCode TEXT NOT NULL,
           alias TEXT NOT NULL COLLATE NOCASE,
           sakuravaRef TEXT NOT NULL,
           aliasKind TEXT NOT NULL,
           PRIMARY KEY(sectionCode, alias, aliasKind)
         );",
    )
}

fn backfill_legacy_credits(connection: &Connection) -> rusqlite::Result<()> {
    for (table_name, work_type) in [("videos", "video"), ("images", "image")] {
        let mut statement = connection.prepare(&format!(
            "SELECT id, relatedPerformersJson FROM {table_name}"
        ))?;
        let records = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (work_id, related_json) in records {
            let Ok(serde_json::Value::Array(relations)) =
                serde_json::from_str::<serde_json::Value>(&related_json)
            else {
                continue;
            };
            for (index, relation) in relations.iter().enumerate() {
                let Some(performer_id) = relation
                    .get("performerId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                else {
                    continue;
                };
                let legacy_source_key = format!(
                    "legacy:relatedPerformersJson:{work_type}:{work_id}:{performer_id}:{index}"
                );
                let credit_id =
                    format!("credit_legacy:{work_type}:{work_id}:{performer_id}:{index}");
                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|duration| duration.as_millis().to_string())
                    .unwrap_or_else(|_| "0".to_string());
                connection.execute(
                    "INSERT OR IGNORE INTO credits (
                        id, workType, workId, performerId, characterName,
                        characterOriginalName, creditedAs, creditedAsMode,
                        creditTypeCategoryId, roleImportanceCategoryId,
                        characterMode, characterId, billingOrder, note,
                        legacySourceKey, createdAt, updatedAt
                     )
                     SELECT ?1, ?2, ?3, ?4, '', NULL, NULL, 'auto',
                            NULL, NULL, 'text', NULL, ?5, NULL, ?6, ?7, ?7
                     WHERE NOT EXISTS (
                       SELECT 1 FROM credits WHERE legacySourceKey = ?6
                     )",
                    rusqlite::params![
                        credit_id,
                        work_type,
                        work_id,
                        performer_id,
                        index as i64,
                        legacy_source_key,
                        timestamp
                    ],
                )?;
            }
        }
    }
    Ok(())
}

fn ensure_text_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    default_text: &str,
) -> rusqlite::Result<()> {
    if !table_has_column(connection, table_name, column_name)? {
        connection.execute_batch(&format!(
            "ALTER TABLE {table_name} ADD COLUMN {column_name} TEXT NOT NULL DEFAULT '{default_text}'"
        ))?;
    }

    Ok(())
}

fn ensure_integer_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
) -> rusqlite::Result<()> {
    if !table_has_column(connection, table_name, column_name)? {
        connection.execute_batch(&format!(
            "ALTER TABLE {table_name} ADD COLUMN {column_name} INTEGER"
        ))?;
    }

    Ok(())
}

fn ensure_boolean_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    default_value: bool,
) -> rusqlite::Result<()> {
    if !table_has_column(connection, table_name, column_name)? {
        let default_integer = if default_value { 1 } else { 0 };
        connection.execute_batch(&format!(
            "ALTER TABLE {table_name} ADD COLUMN {column_name} INTEGER NOT NULL DEFAULT {default_integer} CHECK ({column_name} IN (0, 1))"
        ))?;
    }

    Ok(())
}

fn ensure_text_json_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    default_json: &str,
) -> rusqlite::Result<()> {
    if !table_has_column(connection, table_name, column_name)? {
        connection.execute_batch(&format!(
            "ALTER TABLE {table_name} ADD COLUMN {column_name} TEXT NOT NULL DEFAULT '{default_json}'"
        ))?;
    }

    Ok(())
}

fn table_has_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
) -> rusqlite::Result<bool> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(columns.iter().any(|column| column == column_name))
}

fn sakurava_ref_counts(connection: &Connection) -> rusqlite::Result<SakuravaRefSectionCounts> {
    Ok(SakuravaRefSectionCounts {
        videos: connection.query_row("SELECT COUNT(*) FROM videos", [], |row| row.get(0))?,
        images: connection.query_row("SELECT COUNT(*) FROM images", [], |row| row.get(0))?,
        performers: connection
            .query_row("SELECT COUNT(*) FROM performers", [], |row| row.get(0))?,
        categories: connection.query_row("SELECT COUNT(*) FROM managedCategories", [], |row| {
            row.get(0)
        })?,
        glossary: connection.query_row("SELECT COUNT(*) FROM glossary_entries", [], |row| {
            row.get(0)
        })?,
    })
}

fn validate_migration_yymm(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    if bytes.len() != 4 || !bytes.iter().all(u8::is_ascii_digit) {
        return Err("Migration month must use YYMM.".to_string());
    }
    let month = value[2..4]
        .parse::<u8>()
        .map_err(|_| "Migration month must use YYMM.".to_string())?;
    if !(1..=12).contains(&month) {
        return Err("Migration month contains an invalid month.".to_string());
    }
    Ok(value.to_string())
}

fn legacy_ref_token(value: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for unit in value.encode_utf16() {
        hash ^= u32::from(unit);
        hash = hash.wrapping_mul(0x01000193);
    }
    let mut value = hash;
    let mut digits = Vec::new();
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    loop {
        digits.push(ALPHABET[(value % 36) as usize] as char);
        value /= 36;
        if value == 0 {
            break;
        }
    }
    let token = digits.into_iter().rev().collect::<String>();
    format!("{token:0>7}")
        .chars()
        .rev()
        .take(7)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

fn legacy_derived_ref(prefix: &str, technical_id: &str) -> String {
    format!("{prefix}-{}", legacy_ref_token(technical_id))
}

fn collect_text_column(connection: &Connection, sql: &str) -> Result<Vec<String>, String> {
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn hierarchy_has_cycle(connection: &Connection, sql: &str) -> Result<bool, String> {
    use std::collections::HashMap;
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let parents = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<HashMap<_, _>>>()
        .map_err(|error| error.to_string())?;
    for start in parents.keys() {
        let mut seen = std::collections::HashSet::new();
        let mut current = Some(start.as_str());
        while let Some(id) = current {
            if !seen.insert(id.to_string()) {
                return Ok(true);
            }
            current = parents
                .get(id)
                .and_then(|parent| parent.as_deref())
                .filter(|parent| !parent.is_empty());
        }
    }
    Ok(false)
}

fn json_relations_are_valid(
    connection: &Connection,
    table: &str,
    column: &str,
    id_field: &str,
    targets: &std::collections::HashSet<String>,
) -> Result<bool, String> {
    let mut statement = connection
        .prepare(&format!("SELECT {column} FROM {table}"))
        .map_err(|error| error.to_string())?;
    let values = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    for text in values {
        let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&text) else {
            return Ok(false);
        };
        for item in items {
            let Some(id) = item.get(id_field).and_then(Value::as_str) else {
                continue;
            };
            if !id.trim().is_empty() && !targets.contains(id) {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

fn validate_identity_preconditions(connection: &Connection) -> Result<Vec<String>, String> {
    use std::collections::{HashMap, HashSet};

    let counts = sakurava_ref_counts(connection).map_err(|error| error.to_string())?;
    let mut issues = Vec::new();
    for (label, count) in [
        ("Videos", counts.videos),
        ("Images", counts.images),
        ("Performers", counts.performers),
        ("Managed Categories", counts.categories),
        ("Glossary", counts.glossary),
    ] {
        if count > SAKURAVA_REF_CAPACITY {
            issues.push(format!(
                "{label} contains {count} records; the migration-month capacity is 9,999."
            ));
        }
    }

    let mut ids_by_table: HashMap<&str, HashSet<String>> = HashMap::new();
    for (_, table, key, legacy_prefix) in SAKURAVA_REF_SECTIONS {
        let ids = collect_text_column(connection, &format!("SELECT {key} FROM {table}"))?;
        if ids.iter().any(|id| id.trim().is_empty()) {
            issues.push(format!(
                "{table} contains a record without a technical identity."
            ));
        }
        let unique = ids.iter().cloned().collect::<HashSet<_>>();
        if unique.len() != ids.len() {
            issues.push(format!("{table} contains duplicate technical identities."));
        }
        let mut derived = HashSet::new();
        for id in &ids {
            if !derived.insert(legacy_derived_ref(legacy_prefix, id)) {
                issues.push(format!(
                    "{table} contains a collision in its released legacy Sakurava Ref mapping."
                ));
                break;
            }
        }
        ids_by_table.insert(table, unique);
    }

    let categories = ids_by_table
        .get("managedCategories")
        .cloned()
        .unwrap_or_default();
    let performers = ids_by_table.get("performers").cloned().unwrap_or_default();
    let videos = ids_by_table.get("videos").cloned().unwrap_or_default();
    let images = ids_by_table.get("images").cloned().unwrap_or_default();

    let missing_category_parent: i64 = connection.query_row(
        "SELECT COUNT(*) FROM managedCategories child LEFT JOIN managedCategories parent ON parent.key = child.parentKey WHERE child.parentKey IS NOT NULL AND trim(child.parentKey) <> '' AND parent.key IS NULL",
        [], |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    let missing_glossary_parent: i64 = connection.query_row(
        "SELECT COUNT(*) FROM glossary_entries child LEFT JOIN glossary_entries parent ON parent.id = child.parent_id WHERE trim(child.parent_id) <> '' AND parent.id IS NULL",
        [], |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if missing_category_parent > 0 {
        issues.push("Managed Categories contain broken parent references.".to_string());
    }
    if missing_glossary_parent > 0 {
        issues.push("Glossary contains broken parent references.".to_string());
    }
    if hierarchy_has_cycle(connection, "SELECT key, parentKey FROM managedCategories")? {
        issues.push("Managed Categories contain a circular hierarchy.".to_string());
    }
    if hierarchy_has_cycle(
        connection,
        "SELECT id, NULLIF(parent_id, '') FROM glossary_entries",
    )? {
        issues.push("Glossary contains a circular hierarchy.".to_string());
    }

    for (table, column, id_field, targets, label) in [
        (
            "videos",
            "relatedPerformersJson",
            "performerId",
            &performers,
            "Video Performer",
        ),
        (
            "videos",
            "relatedImagesJson",
            "recordId",
            &images,
            "Video Image",
        ),
        (
            "images",
            "relatedPerformersJson",
            "performerId",
            &performers,
            "Image Performer",
        ),
        (
            "images",
            "relatedVideosJson",
            "recordId",
            &videos,
            "Image Video",
        ),
        (
            "performers",
            "relatedVideosJson",
            "recordId",
            &videos,
            "Performer Video",
        ),
        (
            "performers",
            "relatedImagesJson",
            "recordId",
            &images,
            "Performer Image",
        ),
    ] {
        if !json_relations_are_valid(connection, table, column, id_field, targets)? {
            issues.push(format!(
                "{label} relationships contain malformed or broken references."
            ));
        }
    }

    let mut credit_statement = connection.prepare(
        "SELECT workType, workId, performerId, creditTypeCategoryId, roleImportanceCategoryId FROM credits"
    ).map_err(|error| error.to_string())?;
    let credits = credit_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    for (work_type, work_id, performer_id, credit_type, role_type) in credits {
        let work_exists = match work_type.as_str() {
            "video" => videos.contains(&work_id),
            "image" => images.contains(&work_id),
            _ => false,
        };
        if !work_exists
            || !performers.contains(&performer_id)
            || credit_type
                .as_ref()
                .is_some_and(|id| !categories.contains(id))
            || role_type
                .as_ref()
                .is_some_and(|id| !categories.contains(id))
        {
            issues.push("Credits contain a broken catalog reference.".to_string());
            break;
        }
    }
    Ok(issues)
}

pub fn sakurava_ref_migration_status(
    database: &RuntimeDatabase,
) -> Result<SakuravaRefMigrationStatus, String> {
    let connection = database.connection();
    let connection = connection
        .lock()
        .map_err(|_| "Database connection is unavailable".to_string())?;
    sakurava_ref_migration_status_for_connection(&connection)
}

fn sakurava_ref_migration_status_for_connection(
    connection: &Connection,
) -> Result<SakuravaRefMigrationStatus, String> {
    let counts = sakurava_ref_counts(connection).map_err(|error| error.to_string())?;
    let state = classify_sakurava_ref_migration_state(connection)?;
    let issues = match state {
        SakuravaRefMigrationState::Legacy => validate_identity_preconditions(connection)?,
        SakuravaRefMigrationState::Migrated => Vec::new(),
        SakuravaRefMigrationState::Invalid => {
            vec!["Catalog reference infrastructure could not be verified.".to_string()]
        }
    };
    Ok(SakuravaRefMigrationStatus {
        state,
        required: state == SakuravaRefMigrationState::Legacy,
        migration_id: SAKURAVA_REF_MIGRATION_ID.to_string(),
        counts,
        capacity_per_section_month: SAKURAVA_REF_CAPACITY,
        preconditions_valid: state != SakuravaRefMigrationState::Invalid && issues.is_empty(),
        issues,
    })
}

fn classify_sakurava_ref_migration_state(
    connection: &Connection,
) -> Result<SakuravaRefMigrationState, String> {
    let ref_columns = SAKURAVA_REF_SECTIONS
        .iter()
        .map(|(_, table, _, _)| {
            table_has_column(connection, table, "sakuravaRef").map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let alias_table = sqlite_object_exists(connection, "table", "sakuravaRefAliases")?;
    let counter_table = sqlite_object_exists(connection, "table", "sakuravaRefCounters")?;
    let ledger_entry = if sqlite_object_exists(connection, "table", "schemaMigrations")? {
        connection
            .query_row(
                "SELECT COUNT(*) FROM schemaMigrations WHERE migrationId = ?1",
                [SAKURAVA_REF_MIGRATION_ID],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?
            == 1
    } else {
        false
    };
    let index_names = [
        "idx_videos_sakurava_ref",
        "idx_images_sakurava_ref",
        "idx_performers_sakurava_ref",
        "idx_categories_sakurava_ref",
        "idx_glossary_sakurava_ref",
    ];
    let any_index = index_names
        .iter()
        .map(|name| sqlite_object_exists(connection, "index", name))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .any(|exists| exists);
    let has_any_identity_infrastructure = ref_columns.iter().any(|present| *present)
        || alias_table
        || counter_table
        || ledger_entry
        || any_index;
    if !has_any_identity_infrastructure {
        return Ok(SakuravaRefMigrationState::Legacy);
    }

    if !ref_columns.iter().all(|present| *present)
        || !alias_table
        || !counter_table
        || !ledger_entry
        || !sakurava_ref_indexes_valid(connection)?
    {
        return Ok(SakuravaRefMigrationState::Invalid);
    }

    if validate_sakurava_ref_schema(connection).is_err()
        || validate_sakurava_ref_counters(connection).is_err()
        || validate_sakurava_ref_aliases_complete(connection).is_err()
        || !validate_identity_preconditions(connection)?.is_empty()
    {
        return Ok(SakuravaRefMigrationState::Invalid);
    }

    Ok(SakuravaRefMigrationState::Migrated)
}

fn sqlite_object_exists(
    connection: &Connection,
    object_type: &str,
    name: &str,
) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = ?1 AND name = ?2",
            params![object_type, name],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count == 1)
        .map_err(|error| error.to_string())
}

fn sakurava_ref_indexes_valid(connection: &Connection) -> Result<bool, String> {
    for (name, table) in [
        ("idx_videos_sakurava_ref", "videos"),
        ("idx_images_sakurava_ref", "images"),
        ("idx_performers_sakurava_ref", "performers"),
        ("idx_categories_sakurava_ref", "managedCategories"),
        ("idx_glossary_sakurava_ref", "glossary_entries"),
    ] {
        let sql: Option<String> = connection
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?1 AND tbl_name = ?2",
                params![name, table],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let Some(sql) = sql else { return Ok(false) };
        let normalized = sql.to_ascii_uppercase();
        if !normalized.contains("CREATE UNIQUE INDEX") || !normalized.contains("SAKURAVAREF") {
            return Ok(false);
        }
    }
    Ok(true)
}

fn validate_sakurava_ref_aliases_complete(connection: &Connection) -> Result<(), String> {
    for (section, table, key, legacy_prefix) in SAKURAVA_REF_SECTIONS {
        let mut statement = connection
            .prepare(&format!("SELECT {key}, sakuravaRef FROM {table}"))
            .map_err(|error| error.to_string())?;
        let records = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())?;
        for (technical_id, reference) in records {
            let current_aliases: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sakuravaRefAliases WHERE sectionCode = ?1 AND alias = ?2 COLLATE NOCASE AND aliasKind = 'currentCanonicalRef' AND sakuravaRef = ?2",
                    params![section, reference],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            if current_aliases != 1 {
                return Err("Catalog reference aliases are incomplete.".to_string());
            }
            let legacy_aliases: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sakuravaRefAliases WHERE sectionCode = ?1 AND sakuravaRef = ?2 AND aliasKind = 'legacyTechnicalId'",
                    params![section, reference],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            // Records created after migration have no legacy identity history.
            if legacy_aliases == 0 {
                continue;
            }
            if legacy_aliases != 1 {
                return Err("Catalog reference aliases are ambiguous.".to_string());
            }
            let legacy_ref = legacy_derived_ref(legacy_prefix, &technical_id);
            for (alias, kind) in [
                (technical_id.as_str(), "legacyTechnicalId"),
                (legacy_ref.as_str(), "contractV1Ref"),
                (legacy_ref.as_str(), "contractV2Ref"),
                (reference.as_str(), "currentCanonicalRef"),
            ] {
                let matches: i64 = connection
                    .query_row(
                        "SELECT COUNT(*) FROM sakuravaRefAliases WHERE sectionCode = ?1 AND alias = ?2 COLLATE NOCASE AND aliasKind = ?3 AND sakuravaRef = ?4",
                        params![section, alias, kind, reference],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                if matches != 1 {
                    return Err("Catalog reference aliases are incomplete.".to_string());
                }
            }
        }
        // Aliases are durable identity history. They may outlive a deleted
        // record so an issued Ref remains reserved and never becomes
        // ambiguous or reusable. Resolution still joins back to the live
        // section table and therefore returns no record for historical aliases.
    }
    Ok(())
}

pub fn require_migrated_sakurava_refs(connection: &Connection) -> Result<(), String> {
    match classify_sakurava_ref_migration_state(connection)? {
        SakuravaRefMigrationState::Migrated => Ok(()),
        SakuravaRefMigrationState::Legacy => {
            Err("Catalog references must be upgraded before this action is available.".to_string())
        }
        SakuravaRefMigrationState::Invalid => {
            Err("Catalog references need recovery before this action is available.".to_string())
        }
    }
}

pub fn migrate_sakurava_refs(
    database: &RuntimeDatabase,
    migration_yymm: &str,
) -> Result<SakuravaRefMigrationResult, String> {
    let migration_yymm = validate_migration_yymm(migration_yymm)?;
    let _package_operation = database.lock_package_operation()?;
    let connection = database.connection();
    let mut connection = connection
        .lock()
        .map_err(|_| "Database connection is unavailable".to_string())?;
    let counts = sakurava_ref_counts(&connection).map_err(|error| error.to_string())?;
    match classify_sakurava_ref_migration_state(&connection)? {
        SakuravaRefMigrationState::Migrated => {
            return Ok(SakuravaRefMigrationResult {
                migrated: false,
                migration_id: SAKURAVA_REF_MIGRATION_ID.to_string(),
                migration_yymm,
                counts,
                safety_package_name: String::new(),
            });
        }
        SakuravaRefMigrationState::Invalid => {
            return Err(
                "Catalog references need recovery. No catalog changes were applied.".to_string(),
            );
        }
        SakuravaRefMigrationState::Legacy => {}
    }
    let issues = validate_identity_preconditions(&connection)?;
    if !counts.all_within_capacity() || !issues.is_empty() {
        return Err(issues
            .first()
            .cloned()
            .unwrap_or_else(|| "Catalog identity migration preconditions failed.".to_string()));
    }
    let safety = create_safety_backup_package(
        database,
        &connection,
        "catalog reference upgrade",
        SystemTime::now(),
    )?;
    let safety_path = PathBuf::from(&safety.package_path);
    preview_backup_package_directory(&safety.package_name, &safety_path).map_err(|error| {
        format!(
            "Unable to verify migration safety backup: {}",
            error.message
        )
    })?;

    migrate_sakurava_ref_connection(&mut connection, &migration_yymm)?;
    Ok(SakuravaRefMigrationResult {
        migrated: true,
        migration_id: SAKURAVA_REF_MIGRATION_ID.to_string(),
        migration_yymm,
        counts,
        safety_package_name: safety.package_name,
    })
}

fn migrate_sakurava_ref_connection(
    connection: &mut Connection,
    migration_yymm: &str,
) -> Result<(), String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Unable to start catalog reference migration: {error}"))?;
    let result = (|| -> Result<(), String> {
        for table in [
            "videos",
            "images",
            "performers",
            "managedCategories",
            "glossary_entries",
        ] {
            transaction
                .execute_batch(&format!(
                    "ALTER TABLE {table} ADD COLUMN sakuravaRef TEXT NOT NULL DEFAULT ''"
                ))
                .map_err(|error| format!("Unable to add catalog reference storage: {error}"))?;
        }
        create_sakurava_ref_ledger_tables(&transaction).map_err(|error| error.to_string())?;
        for (section, table, key, legacy_prefix) in SAKURAVA_REF_SECTIONS {
            let ids = collect_text_column(
                &transaction,
                &format!("SELECT {key} FROM {table} ORDER BY {key} COLLATE BINARY ASC"),
            )?;
            for (index, technical_id) in ids.iter().enumerate() {
                let sequence = i64::try_from(index + 1)
                    .map_err(|_| "Catalog reference sequence overflowed.".to_string())?;
                let reference = format!("{section}{migration_yymm}{sequence:04}");
                transaction
                    .execute(
                        &format!("UPDATE {table} SET sakuravaRef = ?1 WHERE {key} = ?2"),
                        params![reference, technical_id],
                    )
                    .map_err(|error| format!("Unable to backfill catalog references: {error}"))?;
                for (alias, kind) in [
                    (technical_id.clone(), "legacyTechnicalId"),
                    (
                        legacy_derived_ref(legacy_prefix, technical_id),
                        "contractV1Ref",
                    ),
                    (
                        legacy_derived_ref(legacy_prefix, technical_id),
                        "contractV2Ref",
                    ),
                    (reference.clone(), "currentCanonicalRef"),
                ] {
                    transaction.execute(
                        "INSERT INTO sakuravaRefAliases (sectionCode, alias, sakuravaRef, aliasKind) VALUES (?1, ?2, ?3, ?4)",
                        params![section, alias, reference, kind],
                    ).map_err(|error| format!("Legacy catalog identity aliases are ambiguous: {error}"))?;
                }
            }
            transaction.execute(
                "INSERT INTO sakuravaRefCounters (sectionCode, issuanceYymm, lastSequence) VALUES (?1, ?2, ?3)",
                params![section, migration_yymm, ids.len() as i64],
            ).map_err(|error| error.to_string())?;
        }
        create_sakurava_ref_support_schema(&transaction).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO schemaMigrations (migrationId, appliedAt) VALUES (?1, ?2)",
                params![
                    SAKURAVA_REF_MIGRATION_ID,
                    backup_created_at(SystemTime::now())?
                ],
            )
            .map_err(|error| error.to_string())?;
        validate_sakurava_ref_schema(&transaction)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = transaction.rollback();
        return Err(format!(
            "Catalog reference upgrade was cancelled. No catalog changes were applied. {error}"
        ));
    }
    transaction
        .commit()
        .map_err(|error| format!("Unable to commit catalog reference upgrade: {error}"))?;
    Ok(())
}

pub fn validate_sakurava_ref_schema(connection: &Connection) -> Result<(), String> {
    for (section, table, _, _) in SAKURAVA_REF_SECTIONS {
        if !table_has_column(connection, table, "sakuravaRef").map_err(|error| error.to_string())? {
            return Err(format!("{table} is missing Sakurava Ref storage."));
        }
        let invalid: i64 = connection.query_row(
            &format!("SELECT COUNT(*) FROM {table} WHERE length(sakuravaRef) <> 9 OR substr(sakuravaRef, 1, 1) <> ?1 OR sakuravaRef GLOB '*[^A-Z0-9]*'"),
            [section], |row| row.get(0),
        ).map_err(|error| error.to_string())?;
        if invalid > 0 {
            return Err(format!("{table} contains invalid Sakurava Refs."));
        }
        let duplicate: i64 = connection.query_row(
            &format!("SELECT COUNT(*) FROM (SELECT sakuravaRef FROM {table} GROUP BY sakuravaRef HAVING COUNT(*) > 1)"),
            [], |row| row.get(0),
        ).map_err(|error| error.to_string())?;
        if duplicate > 0 {
            return Err(format!("{table} contains duplicate Sakurava Refs."));
        }
    }
    let ambiguous_aliases: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM (
           SELECT sectionCode, alias FROM sakuravaRefAliases
           GROUP BY sectionCode, alias HAVING COUNT(DISTINCT sakuravaRef) > 1
         )",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if ambiguous_aliases > 0 {
        return Err("Legacy aliases contain an ambiguous Sakurava Ref mapping.".to_string());
    }
    Ok(())
}

pub fn allocate_sakurava_ref(
    connection: &Connection,
    section_code: &str,
    issuance_yymm: &str,
) -> Result<String, String> {
    let yymm = validate_migration_yymm(issuance_yymm)?;
    if !matches!(section_code, "V" | "I" | "P" | "C" | "G") {
        return Err("Unsupported Sakurava Ref section.".to_string());
    }
    create_sakurava_ref_ledger_tables(connection).map_err(|error| error.to_string())?;
    connection.execute(
        "INSERT OR IGNORE INTO sakuravaRefCounters (sectionCode, issuanceYymm, lastSequence) VALUES (?1, ?2, 0)",
        params![section_code, yymm],
    ).map_err(|error| format!("Unable to reserve a Sakurava Ref: {error}"))?;
    let current: i64 = connection.query_row(
        "SELECT lastSequence FROM sakuravaRefCounters WHERE sectionCode = ?1 AND issuanceYymm = ?2",
        params![section_code, yymm], |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if current >= SAKURAVA_REF_CAPACITY {
        return Err(format!(
            "Sakurava Ref capacity for {section_code}{yymm} has been reached."
        ));
    }
    let sequence = current + 1;
    connection.execute(
        "UPDATE sakuravaRefCounters SET lastSequence = ?3 WHERE sectionCode = ?1 AND issuanceYymm = ?2",
        params![section_code, yymm, sequence],
    ).map_err(|error| format!("Unable to reserve a Sakurava Ref: {error}"))?;
    Ok(format!("{section_code}{yymm}{sequence:04}"))
}

pub fn register_current_sakurava_ref_alias(
    connection: &Connection,
    section_code: &str,
    reference: &str,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO sakuravaRefAliases (sectionCode, alias, sakuravaRef, aliasKind) VALUES (?1, ?2, ?2, 'currentCanonicalRef')",
            params![section_code, reference],
        )
        .map_err(|error| format!("Unable to register the Sakurava Ref: {error}"))?;
    Ok(())
}

pub fn format_sakurava_ref(value: &str) -> Option<String> {
    let canonical = value.trim().to_ascii_uppercase().replace('-', "");
    if canonical.len() != 9
        || !matches!(&canonical[0..1], "V" | "I" | "P" | "C" | "G" | "R")
        || !canonical[1..].bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    Some(format!("{}-{}", &canonical[..5], &canonical[5..]))
}

pub fn resolve_sakurava_ref(
    connection: &Connection,
    section_code: &str,
    identity: &str,
) -> Result<Option<String>, String> {
    let canonical_candidate = format_sakurava_ref(identity).map(|value| value.replace('-', ""));
    let canonical = if let Some(candidate) = canonical_candidate {
        Some(candidate)
    } else if table_has_column(connection, "videos", "sakuravaRef")
        .map_err(|error| error.to_string())?
    {
        connection.query_row(
            "SELECT sakuravaRef FROM sakuravaRefAliases WHERE sectionCode = ?1 AND alias = ?2 COLLATE NOCASE LIMIT 1",
            params![section_code, identity.trim()], |row| row.get(0),
        ).optional().map_err(|error| error.to_string())?
    } else {
        None
    };
    let Some(reference) = canonical else {
        return Ok(None);
    };
    let (_, table, key, _) = SAKURAVA_REF_SECTIONS
        .iter()
        .find(|(code, _, _, _)| *code == section_code)
        .ok_or_else(|| "Unsupported Sakurava Ref section.".to_string())?;
    connection
        .query_row(
            &format!("SELECT {key} FROM {table} WHERE sakuravaRef = ?1"),
            [reference],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

pub fn open_runtime_database(paths: RuntimeDatabasePaths) -> rusqlite::Result<RuntimeDatabase> {
    let connection = Connection::open(&paths.database_file)?;
    initialize_schema(&connection)?;

    Ok(RuntimeDatabase {
        paths,
        connection: Arc::new(Mutex::new(connection)),
        package_operation: Arc::new(Mutex::new(())),
    })
}

pub fn prepare_database(app_data_dir: impl AsRef<Path>) -> Result<RuntimeDatabase, String> {
    let paths = prepare_database_paths(app_data_dir)
        .map_err(|error| format!("Unable to prepare database directory: {error}"))?;

    open_runtime_database(paths)
        .map_err(|error| format!("Unable to open or initialize SQLite database: {error}"))
}

pub fn prepare_tauri_database<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<RuntimeDatabase, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    if app_data_dir.file_name().and_then(|name| name.to_str()) != Some(APP_DATA_FOLDER_NAME) {
        println!(
            "Sakurava app data directory resolved outside expected folder name: {}",
            app_data_dir.display()
        );
    }

    prepare_database(app_data_dir)
}

pub fn backup_runtime_database(
    database: &RuntimeDatabase,
    destination_path: impl AsRef<Path>,
) -> Result<DatabaseBackupResult, String> {
    let destination_path = destination_path.as_ref();

    if destination_path.as_os_str().is_empty() {
        return Err("Backup destination path is required".to_string());
    }
    if destination_path.is_dir() {
        return Err("Backup destination must be a file path".to_string());
    }
    if paths_refer_to_same_file(&database.paths.database_file, destination_path) {
        return Err("Backup destination cannot be the active database file".to_string());
    }

    if let Some(parent) = destination_path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err("Backup destination folder does not exist".to_string());
        }
    }

    let connection = database.connection();
    let connection = connection
        .lock()
        .map_err(|_| "Database connection is unavailable".to_string())?;
    connection
        .backup(DatabaseName::Main, destination_path, None)
        .map_err(|error| format!("Unable to back up SQLite database: {error}"))?;

    Ok(DatabaseBackupResult {
        destination_path: destination_path.display().to_string(),
        success: true,
    })
}

pub fn restore_runtime_database(
    database: &RuntimeDatabase,
    source_path: impl AsRef<Path>,
) -> Result<DatabaseRestoreResult, String> {
    let source_path = source_path.as_ref();
    validate_restore_source(source_path)?;

    let safety_backup_path = database.paths.app_data_dir.join(format!(
        "sakurava-before-restore-{}.sqlite",
        timestamp_millis()
    ));

    let connection = database.connection();
    let mut connection = connection
        .lock()
        .map_err(|_| "Database connection is unavailable".to_string())?;

    connection
        .backup(DatabaseName::Main, &safety_backup_path, None)
        .map_err(|error| format!("Unable to create restore safety backup: {error}"))?;

    if let Err(restore_error) = connection.restore(DatabaseName::Main, source_path, None::<fn(_)>) {
        if let Err(rollback_error) =
            connection.restore(DatabaseName::Main, &safety_backup_path, None::<fn(_)>)
        {
            return Err(format!(
                "Restore failed and safety rollback failed. Restore error: {restore_error}. Rollback error: {rollback_error}"
            ));
        }

        return Err(format!(
            "Unable to restore SQLite database: {restore_error}"
        ));
    }

    Ok(DatabaseRestoreResult {
        source_path: source_path.display().to_string(),
        success: true,
        safety_backup_path: safety_backup_path.display().to_string(),
        restart_required: false,
    })
}

pub fn clear_app_generated_cache(database: &RuntimeDatabase) -> Result<ClearCacheResult, String> {
    let mut files_removed = 0_u64;
    let mut bytes_removed = 0_u64;
    let mut cleared_paths = Vec::new();

    for dir_name in APP_GENERATED_CACHE_DIR_NAMES {
        let cache_dir = database.paths.app_data_dir.join(dir_name);
        if !cache_dir.exists() {
            continue;
        }
        if !cache_dir.is_dir() {
            return Err(format!(
                "App-generated cache path is not a folder: {dir_name}"
            ));
        }
        if !is_path_inside(&cache_dir, &database.paths.app_data_dir) {
            return Err("Cache cleanup path is outside Sakurava app data".to_string());
        }

        let (dir_files, dir_bytes) = count_directory_files_and_bytes(&cache_dir)?;
        fs::remove_dir_all(&cache_dir)
            .map_err(|error| format!("Unable to clear app-generated cache: {error}"))?;

        files_removed += dir_files;
        bytes_removed += dir_bytes;
        cleared_paths.push(cache_dir.display().to_string());
    }

    let message = if cleared_paths.is_empty() {
        "No app-generated cache found. Source media and catalog records were not changed."
            .to_string()
    } else {
        format!(
            "Cleared app-generated cache. Removed {files_removed} file(s). Source media and catalog records were not changed."
        )
    };

    Ok(ClearCacheResult {
        success: true,
        message,
        files_removed,
        bytes_removed,
        cleared_paths,
    })
}

fn validate_restore_source(source_path: &Path) -> Result<(), String> {
    if source_path.as_os_str().is_empty() {
        return Err("Restore source path is required".to_string());
    }
    if !source_path.exists() {
        return Err("Restore source file does not exist".to_string());
    }
    if source_path.is_dir() {
        return Err("Restore source must be a SQLite file, not a folder".to_string());
    }

    let connection = Connection::open(source_path)
        .map_err(|error| format!("Unable to open restore source as SQLite: {error}"))?;
    let quick_check: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Unable to validate restore source integrity: {error}"))?;
    if quick_check != "ok" {
        return Err(format!(
            "Restore source failed SQLite integrity check: {quick_check}"
        ));
    }

    for table_name in ["videos", "images", "performers"] {
        let table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table_name],
                |row| row.get(0),
            )
            .map_err(|error| format!("Unable to inspect restore source schema: {error}"))?;
        if table_count != 1 {
            return Err(format!(
                "Restore source is not a Sakurava database: missing {table_name} table"
            ));
        }
    }

    Ok(())
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

fn is_path_inside(path: &Path, parent: &Path) -> bool {
    match (path.canonicalize(), parent.canonicalize()) {
        (Ok(path), Ok(parent)) => path.starts_with(parent),
        _ => path.starts_with(parent),
    }
}

fn count_directory_files_and_bytes(path: &Path) -> Result<(u64, u64), String> {
    let mut files = 0_u64;
    let mut bytes = 0_u64;

    for entry in fs::read_dir(path)
        .map_err(|error| format!("Unable to inspect app-generated cache: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Unable to inspect app-generated cache: {error}"))?;
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Unable to inspect app-generated cache: {error}"))?;

        if metadata.is_dir() {
            let (child_files, child_bytes) = count_directory_files_and_bytes(&entry.path())?;
            files += child_files;
            bytes += child_bytes;
        } else if metadata.is_file() {
            files += 1;
            bytes += metadata.len();
        }
    }

    Ok((files, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::OptionalExtension;

    fn unique_test_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("sakurava-{name}-{}", std::process::id()))
    }

    fn create_external_backup_package(
        database: &RuntimeDatabase,
        external_root: &Path,
        package_name: &str,
        seconds: u64,
    ) -> PathBuf {
        let created = create_backup_package_at(
            database,
            BackupPackageType::Manual,
            Some("External restore package".to_string()),
            UNIX_EPOCH + std::time::Duration::from_secs(seconds),
        )
        .expect("source package");
        let source = PathBuf::from(created.package_path);
        let destination = external_root.join(package_name);
        fs::create_dir_all(&destination).expect("external package directory");
        fs::copy(
            source.join(BACKUP_MANIFEST_FILE_NAME),
            destination.join(BACKUP_MANIFEST_FILE_NAME),
        )
        .expect("external manifest");
        fs::copy(
            source.join(BACKUP_DATABASE_FILE_NAME),
            destination.join(BACKUP_DATABASE_FILE_NAME),
        )
        .expect("external database");
        destination
    }

    #[test]
    fn defines_runtime_database_names() {
        assert_eq!(APP_DATA_FOLDER_NAME, "app.sakurava.desktop");
        assert_eq!(DATABASE_FILE_NAME, "sakurava.sqlite");
    }

    fn legacy_runtime_database(name: &str) -> (PathBuf, RuntimeDatabase) {
        let app_data_dir = unique_test_dir(name).join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        fs::create_dir_all(&app_data_dir).expect("legacy app data");
        let paths = runtime_database_paths(&app_data_dir);
        let connection = Connection::open(&paths.database_file).expect("legacy database");
        for statement in SCHEMA_SQL {
            let legacy = statement
                .lines()
                .filter(|line| !line.contains("sakuravaRef"))
                .collect::<Vec<_>>()
                .join("\n");
            connection.execute_batch(&legacy).expect("legacy schema");
        }
        drop(connection);
        let database = open_runtime_database(paths).expect("legacy runtime database");
        (app_data_dir, database)
    }

    #[test]
    fn migrates_legacy_records_after_verified_safety_backup() {
        let (app_data_dir, database) = legacy_runtime_database("ref-migration");
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            connection.execute(
                "INSERT INTO videos (id, title, createdAt, updatedAt) VALUES ('video-b', 'B', '1', '1'), ('video-a', 'A', '1', '1')",
                [],
            ).expect("legacy videos");
            connection.execute(
                "INSERT INTO images (id, title, createdAt, updatedAt) VALUES ('image-a', 'A', '1', '1')",
                [],
            ).expect("legacy image");
            connection.execute(
                "INSERT INTO performers (id, name, createdAt, updatedAt) VALUES ('performer-a', 'A', '1', '1')",
                [],
            ).expect("legacy performer");
            connection.execute(
                "INSERT INTO managedCategories (key, name, createdAt, updatedAt) VALUES ('category-a', 'A', '1', '1')",
                [],
            ).expect("legacy category");
            connection.execute(
                "INSERT INTO glossary_entries (id, term, definition, created_at, updated_at) VALUES ('glossary-a', 'A', 'A', 1, 1)",
                [],
            ).expect("legacy glossary");
        }

        let status = sakurava_ref_migration_status(&database).expect("migration status");
        assert_eq!(status.state, SakuravaRefMigrationState::Legacy);
        assert!(status.required);
        assert!(status.preconditions_valid);
        assert_eq!(status.counts.videos, 2);

        let result = migrate_sakurava_refs(&database, "2607").expect("reference migration");
        assert!(result.migrated);
        assert!(!result.safety_package_name.is_empty());
        let preview = preview_backup_package(&database, &result.safety_package_name)
            .expect("safety package remains readable");
        assert_eq!(preview.database.counts.videos, 2);

        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        assert_eq!(
            collect_text_column(&connection, "SELECT sakuravaRef FROM videos ORDER BY id")
                .expect("video refs"),
            vec!["V26070001", "V26070002"]
        );
        for (table, expected) in [
            ("images", "I26070001"),
            ("performers", "P26070001"),
            ("managedCategories", "C26070001"),
            ("glossary_entries", "G26070001"),
        ] {
            let reference: String = connection
                .query_row(&format!("SELECT sakuravaRef FROM {table}"), [], |row| {
                    row.get(0)
                })
                .expect("section ref");
            assert_eq!(reference, expected);
        }
        assert_eq!(
            resolve_sakurava_ref(&connection, "V", "V2607-0001").expect("formatted resolver"),
            Some("video-a".to_string())
        );
        assert_eq!(
            resolve_sakurava_ref(&connection, "V", "V26070001").expect("canonical resolver"),
            Some("video-a".to_string())
        );
        assert_eq!(
            resolve_sakurava_ref(&connection, "V", "v2607-0001").expect("lowercase resolver"),
            Some("video-a".to_string())
        );
        assert_eq!(
            resolve_sakurava_ref(&connection, "V", "video-a").expect("legacy resolver"),
            Some("video-a".to_string())
        );
        let released_ref = legacy_derived_ref("VID", "video-a");
        assert_eq!(
            resolve_sakurava_ref(&connection, "V", &released_ref).expect("v1/v2 resolver"),
            Some("video-a".to_string())
        );
        let released_alias_kinds: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sakuravaRefAliases WHERE sectionCode = 'V' AND alias = ?1 AND aliasKind IN ('contractV1Ref', 'contractV2Ref')",
            [released_ref], |row| row.get(0),
        ).expect("released alias kinds");
        assert_eq!(released_alias_kinds, 2);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn migration_status_is_read_only_and_classifies_complete_and_partial_states() {
        let (legacy_dir, legacy) = legacy_runtime_database("ref-state-legacy");
        let legacy_status = sakurava_ref_migration_status(&legacy).expect("legacy status");
        assert_eq!(legacy_status.state, SakuravaRefMigrationState::Legacy);
        {
            let connection = legacy.connection();
            let connection = connection.lock().expect("legacy lock");
            assert!(!table_has_column(&connection, "videos", "sakuravaRef"));
        }
        assert!(list_backup_packages(&legacy)
            .expect("legacy backups")
            .is_empty());

        {
            let connection = legacy.connection();
            let connection = connection.lock().expect("legacy lock");
            connection
                .execute_batch("ALTER TABLE videos ADD COLUMN sakuravaRef TEXT NOT NULL DEFAULT ''")
                .expect("partial ref column");
        }
        assert_eq!(
            sakurava_ref_migration_status(&legacy)
                .expect("partial status")
                .state,
            SakuravaRefMigrationState::Invalid,
        );
        let partial_paths = legacy.paths.clone();
        drop(legacy);
        let reopened_partial =
            open_runtime_database(partial_paths).expect("reopen partial database");
        assert_eq!(
            sakurava_ref_migration_status(&reopened_partial)
                .expect("reopened partial status")
                .state,
            SakuravaRefMigrationState::Invalid,
        );
        {
            let connection = reopened_partial.connection();
            let connection = connection.lock().expect("partial lock");
            assert!(
                !sqlite_object_exists(&connection, "table", "sakuravaRefAliases")
                    .expect("partial alias table status")
            );
        }

        let complete_dir = unique_test_dir("ref-state-complete").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&complete_dir);
        let complete = prepare_database(&complete_dir).expect("complete database");
        assert_eq!(
            sakurava_ref_migration_status(&complete)
                .expect("complete status")
                .state,
            SakuravaRefMigrationState::Migrated,
        );
        let _ = fs::remove_dir_all(legacy_dir);
        let _ = fs::remove_dir_all(complete_dir);
    }

    #[test]
    fn migration_status_rejects_missing_ledger_counter_alias_and_unique_index() {
        for (name, mutation) in [
            (
                "ledger",
                "DELETE FROM schemaMigrations WHERE migrationId = '41.8.4A-sakurava-ref-v1'",
            ),
            ("counter", "DROP TABLE sakuravaRefCounters"),
            ("alias", "DROP TABLE sakuravaRefAliases"),
            ("index", "DROP INDEX idx_videos_sakurava_ref"),
        ] {
            let app_dir = unique_test_dir(&format!("ref-state-{name}")).join(APP_DATA_FOLDER_NAME);
            let _ = fs::remove_dir_all(&app_dir);
            let database = prepare_database(&app_dir).expect("database");
            {
                let connection = database.connection();
                let connection = connection.lock().expect("database lock");
                connection
                    .execute_batch(mutation)
                    .expect("partial mutation");
            }
            assert_eq!(
                sakurava_ref_migration_status(&database)
                    .expect("invalid status")
                    .state,
                SakuravaRefMigrationState::Invalid,
                "{name} must be required",
            );
            let _ = fs::remove_dir_all(app_dir);
        }
    }

    #[test]
    fn migration_status_rejects_invalid_counter_and_malformed_ref() {
        let counter_dir = unique_test_dir("ref-state-invalid-counter").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&counter_dir);
        let counter_database = prepare_database(&counter_dir).expect("database");
        {
            let connection = counter_database.connection();
            let connection = connection.lock().expect("database lock");
            let reference = allocate_sakurava_ref(&connection, "V", "2607").expect("reference");
            connection.execute(
                "INSERT INTO videos (id, sakuravaRef, title, createdAt, updatedAt) VALUES ('video-counter', ?1, 'Counter', '1', '1')",
                [reference.as_str()],
            ).expect("video fixture");
            register_current_sakurava_ref_alias(&connection, "V", &reference)
                .expect("current alias");
            connection.execute(
                "UPDATE sakuravaRefCounters SET lastSequence = 0 WHERE sectionCode = 'V' AND issuanceYymm = '2607'",
                [],
            ).expect("invalid counter fixture");
        }
        assert_eq!(
            sakurava_ref_migration_status(&counter_database)
                .expect("invalid counter status")
                .state,
            SakuravaRefMigrationState::Invalid,
        );

        let malformed_dir = unique_test_dir("ref-state-malformed-ref").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&malformed_dir);
        let malformed_database = prepare_database(&malformed_dir).expect("database");
        {
            let connection = malformed_database.connection();
            let connection = connection.lock().expect("database lock");
            connection.execute(
                "INSERT INTO videos (id, sakuravaRef, title, createdAt, updatedAt) VALUES ('video-malformed', 'V26-INVALID', 'Malformed', '1', '1')",
                [],
            ).expect("malformed video fixture");
            register_current_sakurava_ref_alias(&connection, "V", "V26-INVALID")
                .expect("malformed current alias");
        }
        assert_eq!(
            sakurava_ref_migration_status(&malformed_database)
                .expect("malformed status")
                .state,
            SakuravaRefMigrationState::Invalid,
        );

        let _ = fs::remove_dir_all(counter_dir);
        let _ = fs::remove_dir_all(malformed_dir);
    }

    #[test]
    fn allocator_is_section_scoped_transactional_and_never_reuses_committed_refs() {
        let connection = Connection::open_in_memory().expect("database");
        initialize_schema(&connection).expect("schema");
        let first = allocate_sakurava_ref(&connection, "V", "2607").expect("first video ref");
        let second = allocate_sakurava_ref(&connection, "V", "2607").expect("second video ref");
        let image = allocate_sakurava_ref(&connection, "I", "2607").expect("first image ref");
        let next_month = allocate_sakurava_ref(&connection, "V", "2608").expect("next month ref");
        assert_eq!(
            (first.as_str(), second.as_str()),
            ("V26070001", "V26070002")
        );
        assert_eq!(image, "I26070001");
        assert_eq!(next_month, "V26080001");
        let third = allocate_sakurava_ref(&connection, "V", "2607").expect("third video ref");
        assert_eq!(third, "V26070003");

        let mut connection = connection;
        let transaction = connection.transaction().expect("transaction");
        let rolled_back = allocate_sakurava_ref(&transaction, "G", "2607").expect("reserved ref");
        assert_eq!(rolled_back, "G26070001");
        transaction.rollback().expect("rollback");
        assert_eq!(
            allocate_sakurava_ref(&connection, "G", "2607")
                .expect("reused uncommitted reservation"),
            "G26070001"
        );
        connection.execute(
            "INSERT INTO sakuravaRefCounters (sectionCode, issuanceYymm, lastSequence) VALUES ('C', '2607', 9999)",
            [],
        ).expect("capacity fixture");
        assert!(allocate_sakurava_ref(&connection, "C", "2607")
            .expect_err("capacity reached")
            .contains("capacity"));
    }

    #[test]
    fn restoring_an_older_package_preserves_the_newer_ref_high_water() {
        let app_data_dir = unique_test_dir("ref-restore-high-water").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database");
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let reference = allocate_sakurava_ref(&connection, "V", "2607").expect("first ref");
            connection.execute(
                "INSERT INTO videos (id, sakuravaRef, title, createdAt, updatedAt) VALUES ('video-1', ?1, 'One', '1', '1')",
                [reference],
            ).expect("first video");
        }
        let older = create_backup_package(
            &database,
            BackupPackageType::Manual,
            Some("Older identity package".to_string()),
        )
        .expect("older package");
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            for sequence in 2..=5 {
                let reference = allocate_sakurava_ref(&connection, "V", "2607").expect("next ref");
                connection.execute(
                    "INSERT INTO videos (id, sakuravaRef, title, createdAt, updatedAt) VALUES (?1, ?2, 'Later', '1', '1')",
                    params![format!("video-{sequence}"), reference],
                ).expect("later video");
            }
        }

        restore_backup_package_with_sakurava_refs(&database, &older.package_name, "2607")
            .expect("restore older package");
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        assert_eq!(
            allocate_sakurava_ref(&connection, "V", "2607").expect("post-restore ref"),
            "V26070006"
        );
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn runtime_connection_serializes_concurrent_ref_allocations() {
        let app_data_dir = unique_test_dir("ref-concurrency").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database");
        let handles = (0..2)
            .map(|index| {
                let database = database.clone();
                std::thread::spawn(move || {
                    let connection = database.connection();
                    let mut connection = connection.lock().expect("database lock");
                    let transaction = connection.transaction().expect("transaction");
                    let reference = allocate_sakurava_ref(&transaction, "P", "2607")
                        .expect("concurrent ref");
                    transaction.execute(
                        "INSERT INTO performers (id, sakuravaRef, name, createdAt, updatedAt) VALUES (?1, ?2, 'Performer', '1', '1')",
                        params![format!("performer-{index}"), reference],
                    ).expect("performer insert");
                    transaction.commit().expect("commit");
                    reference
                })
            })
            .collect::<Vec<_>>();
        let mut references = handles
            .into_iter()
            .map(|handle| handle.join().expect("thread"))
            .collect::<Vec<_>>();
        references.sort();
        assert_eq!(references, vec!["P26070001", "P26070002"]);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn migration_capacity_failure_creates_no_backup_or_schema_change() {
        let (app_data_dir, database) = legacy_runtime_database("ref-capacity");
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            connection.execute_batch(
                "CREATE TEMP TABLE sequence(value INTEGER PRIMARY KEY);
                 WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 10000)
                 INSERT INTO sequence SELECT value FROM n;
                 INSERT INTO videos (id, title, createdAt, updatedAt)
                 SELECT printf('video-%05d', value), 'Video', '1', '1' FROM sequence;"
            ).expect("capacity fixture");
        }
        let error = migrate_sakurava_refs(&database, "2607").expect_err("capacity blocks");
        assert!(error.contains("9,999"));
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        assert!(!table_has_column(&connection, "videos", "sakuravaRef"));
        assert!(!default_backup_folder(&database).exists());
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn computes_database_file_inside_app_data_dir() {
        let app_data_dir = PathBuf::from("C:/Users/Example/AppData/Roaming/app.sakurava.desktop");
        let paths = runtime_database_paths(&app_data_dir);

        assert_eq!(paths.app_data_dir, app_data_dir);
        assert_eq!(
            paths.database_file,
            PathBuf::from("C:/Users/Example/AppData/Roaming/app.sakurava.desktop")
                .join("sakurava.sqlite")
        );
    }

    #[test]
    fn prepares_database_directory_without_creating_a_database_file() {
        let app_data_dir = unique_test_dir("runtime-paths").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);

        let paths = prepare_database_paths(&app_data_dir).expect("database path prep");

        assert!(paths.app_data_dir.is_dir());
        assert_eq!(paths.database_file, app_data_dir.join(DATABASE_FILE_NAME));
        assert!(!paths.database_file.exists());

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn opens_database_file_and_initializes_schema() {
        let app_data_dir = unique_test_dir("sqlite-init").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);

        let database = prepare_database(&app_data_dir).expect("database init");

        assert!(database.paths.database_file.is_file());

        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        let mut statement = connection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .expect("table query");
        let table_names = statement
            .query_map([], |row| row.get::<_, String>(0))
            .expect("table rows")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("table names");

        assert_eq!(
            table_names,
            vec![
                "credits",
                "glossary_entries",
                "images",
                "managedCategories",
                "performers",
                "sakuravaRefAliases",
                "sakuravaRefCounters",
                "schemaMigrations",
                "videos"
            ]
        );

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn schema_initialization_is_idempotent() {
        let app_data_dir = unique_test_dir("sqlite-idempotent").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);

        let first = prepare_database(&app_data_dir).expect("first init");
        drop(first);
        let second = prepare_database(&app_data_dir).expect("second init");

        assert!(second.paths.database_file.is_file());

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn backfills_legacy_related_performers_idempotently_without_mutating_legacy_data() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("initial schema");
        let video_json = r#"[{"performerId":" performer-1 ","nameSnapshot":"One"},{"nameSnapshot":"bad"},{"performerId":""}]"#;
        let image_json = r#"[{"performerId":"performer-2","nameSnapshot":"Two"}]"#;
        let aliases_json = r#"["Alias One","Alias Two"]"#;
        connection
            .execute(
                "INSERT INTO videos (id, title, relatedPerformersJson, createdAt, updatedAt)
                 VALUES ('video-1', 'Video', ?1, '1', '1')",
                [video_json],
            )
            .expect("video");
        connection
            .execute(
                "INSERT INTO images (id, title, relatedPerformersJson, createdAt, updatedAt)
                 VALUES ('image-1', 'Image', ?1, '1', '1')",
                [image_json],
            )
            .expect("image");
        connection
            .execute(
                "INSERT INTO performers (id, name, aliasesJson, createdAt, updatedAt)
                 VALUES ('performer-1', 'One', ?1, '1', '1')",
                [aliases_json],
            )
            .expect("performer");

        initialize_schema(&connection).expect("backfill");
        initialize_schema(&connection).expect("repeat backfill");

        let credits: Vec<(String, String, String, i64)> = connection
            .prepare(
                "SELECT workType, workId, performerId, billingOrder
                 FROM credits ORDER BY workType, workId",
            )
            .expect("credit query")
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .expect("credit rows")
            .collect::<rusqlite::Result<_>>()
            .expect("credits");
        assert_eq!(
            credits,
            vec![
                (
                    "image".to_string(),
                    "image-1".to_string(),
                    "performer-2".to_string(),
                    0
                ),
                (
                    "video".to_string(),
                    "video-1".to_string(),
                    "performer-1".to_string(),
                    0
                )
            ]
        );
        let stored_video_json: String = connection
            .query_row(
                "SELECT relatedPerformersJson FROM videos WHERE id = 'video-1'",
                [],
                |row| row.get(0),
            )
            .expect("legacy video json");
        let stored_aliases: String = connection
            .query_row(
                "SELECT aliasesJson FROM performers WHERE id = 'performer-1'",
                [],
                |row| row.get(0),
            )
            .expect("aliases");
        assert_eq!(stored_video_json, video_json);
        assert_eq!(stored_aliases, aliases_json);

        connection
            .execute(
                "UPDATE videos SET relatedPerformersJson = '{bad json' WHERE id = 'video-1'",
                [],
            )
            .expect("invalid legacy json");
        initialize_schema(&connection).expect("invalid json is safe");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM credits", [], |row| row.get(0))
            .expect("credit count");
        assert_eq!(count, 2);
    }

    #[test]
    fn backfill_survives_old_id_collisions_and_duplicate_legacy_relations() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("initial schema");
        let video_one_json = r#"[
          {"performerId":"performer-1"},
          {"performerId":"performer-1"},
          {"performerId":"performer-2"}
        ]"#;
        let video_two_json = r#"[{"performerId":"performer-1"}]"#;
        let image_json = r#"[{"performerId":"performer-3"}]"#;

        connection
            .execute(
                "INSERT INTO videos (id, title, relatedPerformersJson, createdAt, updatedAt)
                 VALUES ('video-1', 'One', ?1, '1', '1')",
                [video_one_json],
            )
            .expect("video one");
        connection
            .execute(
                "INSERT INTO videos (id, title, relatedPerformersJson, createdAt, updatedAt)
                 VALUES ('video-2', 'Two', ?1, '1', '1')",
                [video_two_json],
            )
            .expect("video two");
        connection
            .execute(
                "INSERT INTO images (id, title, relatedPerformersJson, createdAt, updatedAt)
                 VALUES ('image-1', 'Image', ?1, '1', '1')",
                [image_json],
            )
            .expect("image");

        connection
            .execute(
                "INSERT INTO credits (
                    id, workType, workId, performerId, characterName,
                    creditedAsMode, characterMode, billingOrder,
                    legacySourceKey, createdAt, updatedAt
                 ) VALUES (
                    'credit_legacy:video:video-1:0', 'video', 'video-1',
                    'manual-performer', '', 'auto', 'text', NULL, NULL, '1', '1'
                 )",
                [],
            )
            .expect("existing manual-style collision");

        initialize_schema(&connection).expect("collision-safe backfill");
        initialize_schema(&connection).expect("repeat collision-safe backfill");

        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM credits", [], |row| row.get(0))
            .expect("credit count");
        assert_eq!(count, 6);

        let migrated_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM credits WHERE legacySourceKey IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .expect("migrated credit count");
        assert_eq!(migrated_count, 5);

        let distinct_id_count: i64 = connection
            .query_row("SELECT COUNT(DISTINCT id) FROM credits", [], |row| {
                row.get(0)
            })
            .expect("distinct ids");
        assert_eq!(distinct_id_count, count);

        let duplicate_performer_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM credits
                 WHERE workType = 'video' AND workId = 'video-1'
                   AND performerId = 'performer-1'",
                [],
                |row| row.get(0),
            )
            .expect("duplicate performer credits");
        assert_eq!(duplicate_performer_count, 2);

        let stored_video_json: String = connection
            .query_row(
                "SELECT relatedPerformersJson FROM videos WHERE id = 'video-1'",
                [],
                |row| row.get(0),
            )
            .expect("legacy json");
        assert_eq!(stored_video_json, video_one_json);
    }

    #[test]
    fn schema_initialization_adds_related_columns_to_existing_tables() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE videos (
                  id TEXT PRIMARY KEY NOT NULL,
                  title TEXT NOT NULL,
                  categoriesJson TEXT NOT NULL DEFAULT '[]',
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL
                );
                CREATE TABLE images (
                  id TEXT PRIMARY KEY NOT NULL,
                  title TEXT NOT NULL,
                  categoriesJson TEXT NOT NULL DEFAULT '[]',
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL
                );
                CREATE TABLE performers (
                  id TEXT PRIMARY KEY NOT NULL,
                  name TEXT NOT NULL,
                  aliasesJson TEXT NOT NULL DEFAULT '[]',
                  categoriesJson TEXT NOT NULL DEFAULT '[]',
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL
                );
                CREATE TABLE managedCategories (
                  key TEXT PRIMARY KEY NOT NULL,
                  name TEXT NOT NULL,
                  parentKey TEXT,
                  description TEXT NOT NULL DEFAULT '',
                  thumbnailPath TEXT NOT NULL DEFAULT '',
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL
                );
                "#,
            )
            .expect("legacy tables");

        initialize_schema(&connection).expect("schema init");

        assert!(table_has_column(
            &connection,
            "videos",
            "relatedPerformersJson"
        ));
        assert!(table_has_column(&connection, "videos", "relatedImagesJson"));
        assert!(table_has_column(&connection, "videos", "source_links_json"));
        assert!(table_has_column(&connection, "videos", "resolution"));
        assert!(table_has_column(&connection, "videos", "fileSizeBytes"));
        assert!(table_has_column(&connection, "videos", "fileType"));
        assert!(table_has_column(
            &connection,
            "images",
            "relatedPerformersJson"
        ));
        assert!(table_has_column(&connection, "images", "relatedVideosJson"));
        assert!(table_has_column(&connection, "images", "source_links_json"));
        assert!(table_has_column(
            &connection,
            "images",
            "galleryImagePathsJson"
        ));
        assert!(table_has_column(&connection, "images", "mainResolution"));
        assert!(table_has_column(
            &connection,
            "images",
            "totalFileSizeBytes"
        ));
        assert!(table_has_column(&connection, "images", "mainFileType"));
        assert!(table_has_column(
            &connection,
            "performers",
            "performerThumbnailPathsJson"
        ));
        assert!(table_has_column(&connection, "performers", "debutDate"));
        assert!(table_has_column(&connection, "performers", "retiredDate"));
        assert!(table_has_column(&connection, "performers", "gender"));
        assert!(table_has_column(&connection, "performers", "birthplace"));
        assert!(table_has_column(&connection, "performers", "nationality"));
        assert!(table_has_column(&connection, "performers", "bloodType"));
        assert!(table_has_column(&connection, "performers", "heightCm"));
        assert!(table_has_column(&connection, "performers", "weightKg"));
        assert!(table_has_column(&connection, "performers", "measurements"));
        assert!(table_has_column(&connection, "performers", "cupSize"));
        assert!(table_has_column(
            &connection,
            "performers",
            "relatedVideosJson"
        ));
        assert!(table_has_column(
            &connection,
            "performers",
            "relatedImagesJson"
        ));
        assert!(table_has_column(
            &connection,
            "performers",
            "source_links_json"
        ));
        assert!(table_has_column(
            &connection,
            "managedCategories",
            "showInVideos"
        ));
        assert!(table_has_column(
            &connection,
            "managedCategories",
            "showInImages"
        ));
        assert!(table_has_column(
            &connection,
            "managedCategories",
            "showInPerformers"
        ));
        assert!(table_has_column(
            &connection,
            "managedCategories",
            "showInCredits"
        ));
        let credits_default: String = connection
            .query_row(
                "SELECT dflt_value FROM pragma_table_info('managedCategories')
                 WHERE name = 'showInCredits'",
                [],
                |row| row.get(0),
            )
            .expect("showInCredits default");
        assert_eq!(credits_default, "0");
    }

    #[test]
    fn schema_does_not_create_relational_category_or_content_tables() {
        let app_data_dir = unique_test_dir("sqlite-no-relations").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);

        let database = prepare_database(&app_data_dir).expect("database init");
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");

        for table_name in [
            "categories",
            "video_categories",
            "image_categories",
            "performer_categories",
            "related_videos",
            "related_images",
            "related_performers",
        ] {
            let count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table_name],
                    |row| row.get(0),
                )
                .expect("relation table count");
            assert_eq!(count, 0, "{table_name} should not exist");
        }

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn creates_default_backup_folder_inside_app_data() {
        let app_data_dir = unique_test_dir("backup-folder").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");

        let backup_folder = ensure_default_backup_folder(&database).expect("backup folder");

        assert_eq!(backup_folder, app_data_dir.join(BACKUP_FOLDER_NAME));
        assert!(backup_folder.is_dir());
        assert!(is_path_inside(&backup_folder, &app_data_dir));
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn creates_directory_backup_package_with_manifest_and_database_only() {
        let app_data_dir = unique_test_dir("backup-package").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "package_video", "Package Video");
        for cache_name in APP_GENERATED_CACHE_DIR_NAMES {
            let cache_dir = app_data_dir.join(cache_name);
            fs::create_dir_all(&cache_dir).expect("cache dir");
            fs::write(cache_dir.join("excluded.cache"), "excluded").expect("cache file");
        }

        let created = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            Some("  Manual note  ".to_string()),
            UNIX_EPOCH,
        )
        .expect("package");
        let package_path = PathBuf::from(&created.package_path);

        assert_eq!(
            package_path.file_name().and_then(|name| name.to_str()),
            Some("sakurava-backup-19700101-000000-manual")
        );
        assert!(package_path.join(BACKUP_DATABASE_FILE_NAME).is_file());
        assert!(package_path.join(BACKUP_MANIFEST_FILE_NAME).is_file());
        assert_eq!(created.manifest.note, "Manual note");
        assert_eq!(
            created.manifest.includes,
            BackupPackageIncludes {
                database: true,
                original_media: false,
                app_managed_assets: false,
            }
        );
        let entries = fs::read_dir(&package_path)
            .expect("package entries")
            .filter_map(Result::ok)
            .count();
        assert_eq!(entries, 2);
        let backup = Connection::open(package_path.join(BACKUP_DATABASE_FILE_NAME))
            .expect("open package database");
        let title: String = backup
            .query_row(
                "SELECT title FROM videos WHERE id = 'package_video'",
                [],
                |row| row.get(0),
            )
            .expect("backup row");
        assert_eq!(title, "Package Video");
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn package_delete_rejects_invalid_names_manifests_safety_and_legacy_files() {
        let app_data_dir =
            unique_test_dir("backup-package-delete-rejections").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");

        for package_name in ["", "../outside", "nested/package"] {
            assert!(
                delete_backup_package(&database, package_name).is_err(),
                "{package_name:?} should be rejected"
            );
        }

        let missing_manifest = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(101),
        )
        .expect("missing-manifest package");
        fs::remove_file(
            PathBuf::from(&missing_manifest.package_path).join(BACKUP_MANIFEST_FILE_NAME),
        )
        .expect("remove manifest");
        assert!(delete_backup_package(&database, &missing_manifest.package_name).is_err());
        assert!(PathBuf::from(&missing_manifest.package_path).is_dir());

        let safety = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(102),
        )
        .expect("safety fixture");
        set_backup_manifest_field(&safety, "backupType", serde_json::json!("safety"));
        assert!(delete_backup_package(&database, &safety.package_name).is_err());
        assert!(PathBuf::from(&safety.package_path).is_dir());

        let legacy_path = ensure_default_backup_folder(&database)
            .expect("backup folder")
            .join("legacy.sqlite");
        fs::write(&legacy_path, b"legacy").expect("legacy file");
        assert!(delete_backup_package(&database, "legacy.sqlite").is_err());
        assert!(legacy_path.is_file());
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn package_delete_removes_only_the_selected_normal_package() {
        let app_data_dir =
            unique_test_dir("backup-package-delete-selected").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let selected = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(103),
        )
        .expect("selected package");
        let sibling = create_backup_package_at(
            &database,
            BackupPackageType::Automatic,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(104),
        )
        .expect("sibling package");

        let result =
            delete_backup_package(&database, &selected.package_name).expect("delete package");

        assert!(result.deleted);
        assert_eq!(result.package_name, selected.package_name);
        assert!(!PathBuf::from(selected.package_path).exists());
        assert!(PathBuf::from(sibling.package_path).is_dir());
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn package_export_validates_source_and_copies_without_modifying_or_overwriting() {
        let root = unique_test_dir("backup-package-export");
        let app_data_dir = root.join(APP_DATA_FOLDER_NAME);
        let destination_root = root.join("exports");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&destination_root).expect("export destination");
        let database = prepare_database(&app_data_dir).expect("database init");
        let source = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            Some("Export me".to_string()),
            UNIX_EPOCH + std::time::Duration::from_secs(105),
        )
        .expect("source package");
        let source_path = PathBuf::from(&source.package_path);
        let source_manifest =
            fs::read(source_path.join(BACKUP_MANIFEST_FILE_NAME)).expect("source manifest");
        let existing_destination = destination_root.join(&source.package_name);
        fs::create_dir(&existing_destination).expect("existing destination");
        fs::write(existing_destination.join("keep.txt"), "keep").expect("existing marker");

        let result = export_backup_package(&database, &source.package_name, &destination_root)
            .expect("export package");
        let exported_path = PathBuf::from(&result.exported_path);

        assert!(result.exported);
        assert_eq!(result.package_name, source.package_name);
        assert_ne!(exported_path, existing_destination);
        assert!(exported_path.join(BACKUP_MANIFEST_FILE_NAME).is_file());
        assert!(exported_path.join(BACKUP_DATABASE_FILE_NAME).is_file());
        assert!(existing_destination.join("keep.txt").is_file());
        assert!(source_path.is_dir());
        assert_eq!(
            fs::read(source_path.join(BACKUP_MANIFEST_FILE_NAME)).expect("manifest after"),
            source_manifest
        );

        for invalid_name in ["", "../outside", "nested/package"] {
            assert!(export_backup_package(&database, invalid_name, &destination_root).is_err());
        }
        assert!(export_backup_package(&database, &source.package_name, "").is_err());
        assert!(export_backup_package(
            &database,
            &source.package_name,
            default_backup_folder(&database)
        )
        .is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn package_export_rejects_missing_manifest_and_safety_package() {
        let root = unique_test_dir("backup-package-export-rejections");
        let app_data_dir = root.join(APP_DATA_FOLDER_NAME);
        let destination_root = root.join("exports");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&destination_root).expect("export destination");
        let database = prepare_database(&app_data_dir).expect("database init");

        let missing_manifest = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(106),
        )
        .expect("missing manifest fixture");
        fs::remove_file(
            PathBuf::from(&missing_manifest.package_path).join(BACKUP_MANIFEST_FILE_NAME),
        )
        .expect("remove manifest");
        assert!(export_backup_package(
            &database,
            &missing_manifest.package_name,
            &destination_root
        )
        .is_err());

        let safety = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(107),
        )
        .expect("safety fixture");
        set_backup_manifest_field(&safety, "backupType", serde_json::json!("safety"));
        assert!(export_backup_package(&database, &safety.package_name, &destination_root).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn selected_package_import_handles_cancel_and_rejects_unsafe_selections() {
        let root = unique_test_dir("selected-package-import-safety");
        let app_data_dir = root.join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&root);
        let database = prepare_database(&app_data_dir).expect("database init");

        let cancelled =
            import_selected_backup_package(&database, None).expect("cancelled import result");
        assert!(cancelled.cancelled);
        assert!(!cancelled.imported);
        assert_eq!(cancelled.package_name, None);

        let missing = root.join("missing-package");
        assert_eq!(
            import_selected_backup_package(&database, Some(missing))
                .expect_err("missing directory")
                .code,
            "invalid_selected_package"
        );

        let file_selection = root.join("selected-file");
        fs::write(&file_selection, "not a directory").expect("selected file");
        assert_eq!(
            import_selected_backup_package(&database, Some(file_selection))
                .expect_err("file selection")
                .code,
            "invalid_selected_package"
        );

        let internal = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(108),
        )
        .expect("internal package");
        assert_eq!(
            import_selected_backup_package(&database, Some(PathBuf::from(internal.package_path)))
                .expect_err("internal package selection")
                .code,
            "invalid_selected_package"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn selected_package_import_rejects_invalid_package_content() {
        let root = unique_test_dir("selected-package-import-invalid");
        let app_data_dir = root.join(APP_DATA_FOLDER_NAME);
        let external_root = root.join("external");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&external_root).expect("external root");
        let database = prepare_database(&app_data_dir).expect("database init");

        let missing_manifest =
            create_external_backup_package(&database, &external_root, "missing-manifest", 109);
        fs::remove_file(missing_manifest.join(BACKUP_MANIFEST_FILE_NAME)).expect("remove manifest");
        assert!(import_selected_backup_package(&database, Some(missing_manifest)).is_err());

        let missing_database =
            create_external_backup_package(&database, &external_root, "missing-database", 110);
        fs::remove_file(missing_database.join(BACKUP_DATABASE_FILE_NAME)).expect("remove database");
        assert!(import_selected_backup_package(&database, Some(missing_database)).is_err());

        let malformed =
            create_external_backup_package(&database, &external_root, "malformed-manifest", 111);
        fs::write(malformed.join(BACKUP_MANIFEST_FILE_NAME), "{broken")
            .expect("malformed manifest");
        assert!(import_selected_backup_package(&database, Some(malformed)).is_err());

        let unsupported =
            create_external_backup_package(&database, &external_root, "unsupported-version", 112);
        let mut unsupported_manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(unsupported.join(BACKUP_MANIFEST_FILE_NAME))
                .expect("manifest text"),
        )
        .expect("manifest json");
        unsupported_manifest["version"] = serde_json::json!(2);
        fs::write(
            unsupported.join(BACKUP_MANIFEST_FILE_NAME),
            serde_json::to_string_pretty(&unsupported_manifest).expect("manifest serialize"),
        )
        .expect("unsupported manifest");
        assert!(import_selected_backup_package(&database, Some(unsupported)).is_err());

        let safety =
            create_external_backup_package(&database, &external_root, "safety-package", 113);
        let mut safety_manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(safety.join(BACKUP_MANIFEST_FILE_NAME)).expect("manifest text"),
        )
        .expect("manifest json");
        safety_manifest["backupType"] = serde_json::json!("safety");
        fs::write(
            safety.join(BACKUP_MANIFEST_FILE_NAME),
            serde_json::to_string_pretty(&safety_manifest).expect("manifest serialize"),
        )
        .expect("safety manifest");
        assert!(import_selected_backup_package(&database, Some(safety)).is_err());

        let corrupt =
            create_external_backup_package(&database, &external_root, "corrupt-database", 114);
        fs::write(corrupt.join(BACKUP_DATABASE_FILE_NAME), "not sqlite").expect("corrupt database");
        assert!(import_selected_backup_package(&database, Some(corrupt)).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn selected_package_import_copies_valid_package_uniquely_and_preserves_source() {
        let root = unique_test_dir("selected-package-import-valid");
        let app_data_dir = root.join(APP_DATA_FOLDER_NAME);
        let external_root = root.join("external");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&external_root).expect("external root");
        let database = prepare_database(&app_data_dir).expect("database init");
        let source = create_external_backup_package(
            &database,
            &external_root,
            "selected-valid-package",
            115,
        );
        let source_manifest =
            fs::read(source.join(BACKUP_MANIFEST_FILE_NAME)).expect("source manifest");
        let source_database =
            fs::read(source.join(BACKUP_DATABASE_FILE_NAME)).expect("source database");
        let collision = default_backup_folder(&database).join("selected-valid-package");
        fs::create_dir(&collision).expect("destination collision");
        fs::write(collision.join("keep.txt"), "keep").expect("collision marker");

        let result = import_selected_backup_package(&database, Some(source.clone()))
            .expect("valid selected package import");
        let imported_name = result.package_name.expect("imported package name");
        let imported_path = default_backup_folder(&database).join(&imported_name);

        assert!(!result.cancelled);
        assert!(result.imported);
        assert_eq!(imported_name, "selected-valid-package-1");
        assert!(collision.join("keep.txt").is_file());
        assert!(imported_path.join(BACKUP_MANIFEST_FILE_NAME).is_file());
        assert!(imported_path.join(BACKUP_DATABASE_FILE_NAME).is_file());
        assert_eq!(
            preview_backup_package(&database, &imported_name)
                .expect("imported package preview")
                .database
                .quick_check,
            "ok"
        );
        assert_eq!(
            fs::read(source.join(BACKUP_MANIFEST_FILE_NAME)).expect("source manifest after"),
            source_manifest
        );
        assert_eq!(
            fs::read(source.join(BACKUP_DATABASE_FILE_NAME)).expect("source database after"),
            source_database
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_package_collision_leaves_no_staging_or_broken_final_package() {
        let app_data_dir = unique_test_dir("backup-package-failure").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let created_at = UNIX_EPOCH + std::time::Duration::from_secs(1);
        create_backup_package_at(&database, BackupPackageType::Manual, None, created_at)
            .expect("first package");

        let error =
            create_backup_package_at(&database, BackupPackageType::Manual, None, created_at)
                .expect_err("collision");
        assert_eq!(
            error,
            "A backup package already exists for this second and type"
        );
        let backup_folder = default_backup_folder(&database);
        let entries = fs::read_dir(&backup_folder)
            .expect("backup entries")
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        assert_eq!(entries.len(), 1);
        assert!(entries
            .iter()
            .all(|entry| !entry.file_name().to_string_lossy().contains(".staging-")));
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn database_backup_failure_cleans_staging_without_finalizing_package() {
        let app_data_dir =
            unique_test_dir("backup-package-staging-failure").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let connection = database.connection();
        let _ = std::thread::spawn(move || {
            let _guard = connection.lock().expect("database lock");
            panic!("poison database lock for staging cleanup test");
        })
        .join();

        let error = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(3),
        )
        .expect_err("package backup should fail");

        assert_eq!(error, "Database connection is unavailable");
        let backup_folder = default_backup_folder(&database);
        let entries = fs::read_dir(&backup_folder)
            .expect("backup entries")
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
        assert!(entries.is_empty());
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn lists_valid_packages_and_ignores_files_and_invalid_folders() {
        let app_data_dir = unique_test_dir("backup-package-list").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let valid = create_backup_package_at(
            &database,
            BackupPackageType::Automatic,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(2),
        )
        .expect("valid package");
        let backup_folder = default_backup_folder(&database);
        fs::write(backup_folder.join("not-a-package.txt"), "ignored").expect("invalid file");
        let invalid_folder = backup_folder.join("invalid-package");
        fs::create_dir(&invalid_folder).expect("invalid folder");
        fs::write(invalid_folder.join("manifest.json"), "{}").expect("invalid manifest");

        let packages = list_backup_packages(&database).expect("packages");

        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].manifest, valid.manifest);
        assert_eq!(
            PathBuf::from(&packages[0].package_path),
            PathBuf::from(valid.package_path)
                .canonicalize()
                .expect("canonical valid package")
        );
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn previews_valid_package_metadata_counts_and_complete_schema_without_mutation() {
        let app_data_dir = unique_test_dir("backup-package-preview").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "preview_video", "Preview Video");
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let image_ref =
                allocate_sakurava_ref(&connection, "I", "0001").expect("preview image ref");
            connection
                .execute(
                    "INSERT INTO images (id, sakuravaRef, title, createdAt, updatedAt)
                     VALUES ('preview_image', ?1, 'Preview Image', '1', '1')",
                    [image_ref],
                )
                .expect("insert image");
            let performer_ref =
                allocate_sakurava_ref(&connection, "P", "0001").expect("preview performer ref");
            connection
                .execute(
                    "INSERT INTO performers (id, sakuravaRef, name, createdAt, updatedAt)
                     VALUES ('preview_performer', ?1, 'Preview Performer', '1', '1')",
                    [performer_ref],
                )
                .expect("insert performer");
            let category_ref =
                allocate_sakurava_ref(&connection, "C", "0001").expect("preview category ref");
            connection
                .execute(
                    "INSERT INTO managedCategories (key, sakuravaRef, name, createdAt, updatedAt)
                     VALUES ('preview_category', ?1, 'Preview Category', '1', '1')",
                    [category_ref],
                )
                .expect("insert category");
            let glossary_ref =
                allocate_sakurava_ref(&connection, "G", "0001").expect("preview glossary ref");
            connection
                .execute(
                    "INSERT INTO glossary_entries
                     (id, sakuravaRef, term, definition, created_at, updated_at)
                     VALUES ('preview_glossary', ?1, 'Preview Term', 'Definition', 1, 1)",
                    [glossary_ref],
                )
                .expect("insert glossary");
            connection
                .execute(
                    "INSERT INTO credits
                     (id, workType, workId, performerId, characterName, createdAt, updatedAt)
                     VALUES
                     ('preview_credit', 'video', 'preview_video', 'preview_performer', '', '1', '1')",
                    [],
                )
                .expect("insert credit");
        }
        let created = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            Some("Preview note".to_string()),
            UNIX_EPOCH + std::time::Duration::from_secs(40),
        )
        .expect("package");
        insert_video_title(&database, "active_only", "Active Only");
        let package_path = PathBuf::from(&created.package_path);
        let manifest_before =
            fs::read(package_path.join(BACKUP_MANIFEST_FILE_NAME)).expect("manifest bytes");
        let database_before =
            fs::read(package_path.join(BACKUP_DATABASE_FILE_NAME)).expect("database bytes");

        let preview =
            preview_backup_package(&database, &created.package_name).expect("preview succeeds");

        assert_eq!(preview.package_name, created.package_name);
        assert_eq!(preview.manifest, created.manifest);
        assert_eq!(preview.database.quick_check, "ok");
        assert!(preview.database.required_schema_present);
        assert_eq!(
            preview.database.counts,
            BackupPackagePreviewCounts {
                videos: 1,
                images: 1,
                performers: 1,
                categories: 1,
                glossary: 1,
                credits: 1,
            }
        );
        assert_eq!(
            preview.content,
            BackupPackagePreviewContent {
                database_included: true,
                original_media_included: false,
                app_managed_assets_included: false,
            }
        );
        assert!(preview
            .warnings
            .iter()
            .any(|warning| warning.contains("does not include future app-managed asset sections")));
        assert!(preview.errors.is_empty());
        assert_eq!(
            read_video_title(&database, "active_only"),
            Some("Active Only".to_string())
        );
        assert_eq!(
            fs::read(package_path.join(BACKUP_MANIFEST_FILE_NAME)).expect("manifest after"),
            manifest_before
        );
        assert_eq!(
            fs::read(package_path.join(BACKUP_DATABASE_FILE_NAME)).expect("database after"),
            database_before
        );
        assert_no_restore_safety_backup(&app_data_dir);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn preview_rejects_unsupported_manifest_format_and_version() {
        let app_data_dir =
            unique_test_dir("backup-preview-manifest-version").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let invalid_format = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(41),
        )
        .expect("format package");
        set_backup_manifest_field(&invalid_format, "format", serde_json::json!("other-format"));
        assert_eq!(
            preview_backup_package(&database, &invalid_format.package_name)
                .expect_err("format rejection")
                .code,
            "unsupported_format"
        );

        let invalid_version = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(42),
        )
        .expect("version package");
        set_backup_manifest_field(&invalid_version, "version", serde_json::json!(2));
        assert_eq!(
            preview_backup_package(&database, &invalid_version.package_name)
                .expect_err("version rejection")
                .code,
            "unsupported_version"
        );
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn preview_rejects_missing_or_malformed_package_files() {
        let app_data_dir =
            unique_test_dir("backup-preview-missing-files").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");

        let missing_manifest = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(43),
        )
        .expect("missing manifest package");
        fs::remove_file(
            PathBuf::from(&missing_manifest.package_path).join(BACKUP_MANIFEST_FILE_NAME),
        )
        .expect("remove manifest");
        assert_eq!(
            preview_backup_package(&database, &missing_manifest.package_name)
                .expect_err("missing manifest rejection")
                .code,
            "manifest_missing"
        );

        let malformed_manifest = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(44),
        )
        .expect("malformed package");
        fs::write(
            PathBuf::from(&malformed_manifest.package_path).join(BACKUP_MANIFEST_FILE_NAME),
            "{broken",
        )
        .expect("break manifest");
        assert_eq!(
            preview_backup_package(&database, &malformed_manifest.package_name)
                .expect_err("malformed manifest rejection")
                .code,
            "manifest_malformed"
        );

        let missing_database = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(45),
        )
        .expect("missing database package");
        fs::remove_file(
            PathBuf::from(&missing_database.package_path).join(BACKUP_DATABASE_FILE_NAME),
        )
        .expect("remove database");
        assert_eq!(
            preview_backup_package(&database, &missing_database.package_name)
                .expect_err("missing database rejection")
                .code,
            "database_missing"
        );
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn preview_rejects_traversal_nested_files_and_outside_packages() {
        let app_data_dir = unique_test_dir("backup-preview-containment").join(APP_DATA_FOLDER_NAME);
        let outside_dir = unique_test_dir("backup-preview-outside");
        let _ = fs::remove_dir_all(&app_data_dir);
        let _ = fs::remove_dir_all(&outside_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let backup_folder = ensure_default_backup_folder(&database).expect("backup folder");
        fs::create_dir_all(&outside_dir).expect("outside package");
        fs::write(backup_folder.join("package-file"), "not a folder").expect("package file");

        for invalid_name in [
            "../backup-preview-outside",
            "..\\backup-preview-outside",
            "nested/package",
            "nested\\package",
            ".",
            "..",
            " package ",
        ] {
            assert_eq!(
                preview_backup_package(&database, invalid_name)
                    .expect_err("invalid name rejection")
                    .code,
                "invalid_package_name"
            );
        }
        assert_eq!(
            preview_backup_package(&database, "package-file")
                .expect_err("file rejection")
                .code,
            "invalid_package_type"
        );
        assert!(outside_dir.is_dir());
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn preview_rejects_database_missing_any_current_schema_domain() {
        let app_data_dir = unique_test_dir("backup-preview-schema").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let package = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(46),
        )
        .expect("package");
        let package_database = PathBuf::from(&package.package_path).join(BACKUP_DATABASE_FILE_NAME);
        fs::remove_file(&package_database).expect("remove complete database");
        let incomplete = Connection::open(&package_database).expect("incomplete database");
        for table_name in [
            "videos",
            "images",
            "performers",
            "managedCategories",
            "glossary_entries",
        ] {
            incomplete
                .execute(&format!("CREATE TABLE \"{table_name}\" (id TEXT)"), [])
                .expect("partial table");
        }
        drop(incomplete);

        let error =
            preview_backup_package(&database, &package.package_name).expect_err("schema rejection");
        assert_eq!(error.code, "required_schema_missing");
        assert!(error.message.contains("credits"));
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn preview_rejects_symlink_package_when_platform_allows_symlink_creation() {
        let app_data_dir = unique_test_dir("backup-preview-symlink").join(APP_DATA_FOLDER_NAME);
        let outside_dir = unique_test_dir("backup-preview-symlink-target");
        let _ = fs::remove_dir_all(&app_data_dir);
        let _ = fs::remove_dir_all(&outside_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let backup_folder = ensure_default_backup_folder(&database).expect("backup folder");
        fs::create_dir_all(&outside_dir).expect("outside target");
        let link = backup_folder.join("linked-package");
        if std::os::windows::fs::symlink_dir(&outside_dir, &link).is_err() {
            let _ = fs::remove_dir_all(app_data_dir);
            let _ = fs::remove_dir_all(outside_dir);
            return;
        }

        assert_eq!(
            preview_backup_package(&database, "linked-package")
                .expect_err("symlink rejection")
                .code,
            "invalid_package_type"
        );
        let _ = fs::remove_dir_all(link);
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn restores_valid_package_after_revalidation_and_creates_database_only_safety_package() {
        let app_data_dir = unique_test_dir("package-restore-success").join(APP_DATA_FOLDER_NAME);
        let external_media_dir = unique_test_dir("package-restore-external-media");
        let _ = fs::remove_dir_all(&app_data_dir);
        let _ = fs::remove_dir_all(&external_media_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "restored_video", "Restored Video");
        let restored_package = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(50),
        )
        .expect("restore package");
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            connection
                .execute("DELETE FROM videos", [])
                .expect("clear source row");
        }
        insert_video_title(&database, "current_video", "Current Video");
        fs::create_dir_all(&external_media_dir).expect("external media dir");
        let external_media = external_media_dir.join("keep.mp4");
        fs::write(&external_media, "external media").expect("external media");

        let result =
            restore_backup_package(&database, &restored_package.package_name).expect("restore");

        assert!(result.database_restored);
        assert!(!result.rollback_attempted);
        assert!(!result.rollback_succeeded);
        assert!(result.errors.is_empty());
        assert_eq!(result.restored_package_name, restored_package.package_name);
        assert_eq!(read_video_title(&database, "current_video"), None);
        assert_eq!(
            read_video_title(&database, "restored_video"),
            Some("Restored Video".to_string())
        );
        assert!(PathBuf::from(&restored_package.package_path).is_dir());
        assert_eq!(
            fs::read_to_string(&external_media).expect("external media after"),
            "external media"
        );

        let safety = list_backup_packages(&database)
            .expect("package list")
            .into_iter()
            .find(|package| package.package_name == result.safety_package_name)
            .expect("safety package");
        assert_eq!(safety.manifest.backup_type, BackupPackageType::Safety);
        assert!(safety.manifest.includes.database);
        assert!(!safety.manifest.includes.original_media);
        assert!(!safety.manifest.includes.app_managed_assets);
        assert_eq!(
            Connection::open(PathBuf::from(&safety.package_path).join(BACKUP_DATABASE_FILE_NAME))
                .expect("safety database")
                .query_row(
                    "SELECT title FROM videos WHERE id = 'current_video'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .expect("safety current row"),
            "Current Video"
        );

        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(external_media_dir);
    }

    #[test]
    fn package_restore_rejects_invalid_names_manifests_content_and_databases_before_mutation() {
        let app_data_dir = unique_test_dir("package-restore-validation").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        assert_eq!(
            restore_backup_package(&database, "../outside")
                .expect_err("traversal rejection")
                .code,
            "invalid_package_name"
        );

        for (seconds, field, value, expected_code) in [
            (
                51,
                "format",
                serde_json::json!("unsupported"),
                "unsupported_format",
            ),
            (52, "version", serde_json::json!(2), "unsupported_version"),
        ] {
            let package = create_backup_package_at(
                &database,
                BackupPackageType::Manual,
                None,
                UNIX_EPOCH + std::time::Duration::from_secs(seconds),
            )
            .expect("invalid manifest package");
            set_backup_manifest_field(&package, field, value);
            assert_eq!(
                restore_backup_package(&database, &package.package_name)
                    .expect_err("manifest rejection")
                    .code,
                expected_code
            );
        }

        for (seconds, field, expected_code) in [
            (53, "originalMedia", "original_media_not_supported"),
            (54, "appManagedAssets", "app_managed_assets_not_supported"),
        ] {
            let package = create_backup_package_at(
                &database,
                BackupPackageType::Manual,
                None,
                UNIX_EPOCH + std::time::Duration::from_secs(seconds),
            )
            .expect("unsupported content package");
            let manifest_path =
                PathBuf::from(&package.package_path).join(BACKUP_MANIFEST_FILE_NAME);
            let mut manifest: serde_json::Value =
                serde_json::from_slice(&fs::read(&manifest_path).expect("manifest"))
                    .expect("manifest json");
            manifest["includes"][field] = serde_json::json!(true);
            fs::write(
                manifest_path,
                serde_json::to_vec_pretty(&manifest).expect("serialize"),
            )
            .expect("tamper includes");
            assert_eq!(
                restore_backup_package(&database, &package.package_name)
                    .expect_err("content rejection")
                    .code,
                expected_code
            );
        }

        let missing_database = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(55),
        )
        .expect("missing database package");
        fs::remove_file(
            PathBuf::from(&missing_database.package_path).join(BACKUP_DATABASE_FILE_NAME),
        )
        .expect("remove database");
        assert_eq!(
            restore_backup_package(&database, &missing_database.package_name)
                .expect_err("missing database rejection")
                .code,
            "database_missing"
        );

        let corrupt_database = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(56),
        )
        .expect("corrupt package");
        fs::write(
            PathBuf::from(&corrupt_database.package_path).join(BACKUP_DATABASE_FILE_NAME),
            "not sqlite",
        )
        .expect("corrupt database");
        assert_eq!(
            restore_backup_package(&database, &corrupt_database.package_name)
                .expect_err("corrupt database rejection")
                .code,
            "database_integrity_error"
        );

        let incomplete = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(57),
        )
        .expect("incomplete package");
        let incomplete_path =
            PathBuf::from(&incomplete.package_path).join(BACKUP_DATABASE_FILE_NAME);
        fs::remove_file(&incomplete_path).expect("remove complete database");
        Connection::open(&incomplete_path)
            .expect("incomplete database")
            .execute("CREATE TABLE videos (id TEXT)", [])
            .expect("partial schema");
        assert_eq!(
            restore_backup_package(&database, &incomplete.package_name)
                .expect_err("schema rejection")
                .code,
            "required_schema_missing"
        );

        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        assert!(list_backup_packages(&database)
            .expect("packages")
            .iter()
            .all(|package| package.manifest.backup_type != BackupPackageType::Safety));
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn package_restore_rejects_symlink_to_outside_backup_folder_when_supported() {
        let app_data_dir = unique_test_dir("package-restore-symlink").join(APP_DATA_FOLDER_NAME);
        let outside_dir = unique_test_dir("package-restore-symlink-target");
        let _ = fs::remove_dir_all(&app_data_dir);
        let _ = fs::remove_dir_all(&outside_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let backup_folder = ensure_default_backup_folder(&database).expect("backup folder");
        fs::create_dir_all(&outside_dir).expect("outside dir");
        let link = backup_folder.join("linked-restore-package");
        if std::os::windows::fs::symlink_dir(&outside_dir, &link).is_err() {
            let _ = fs::remove_dir_all(app_data_dir);
            let _ = fs::remove_dir_all(outside_dir);
            return;
        }

        assert_eq!(
            restore_backup_package(&database, "linked-restore-package")
                .expect_err("symlink restore rejection")
                .code,
            "invalid_package_type"
        );
        let _ = fs::remove_dir_all(link);
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn package_restore_revalidates_after_safety_snapshot_before_apply() {
        let app_data_dir =
            unique_test_dir("package-restore-revalidation").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "package_video", "Package Video");
        let package = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(58),
        )
        .expect("package");
        {
            let connection = database.connection();
            connection
                .lock()
                .expect("database lock")
                .execute("DELETE FROM videos", [])
                .expect("clear package row");
        }
        insert_video_title(&database, "current_video", "Current Video");

        let error = restore_backup_package_with_hooks(
            &database,
            &package.package_name,
            |package_path| {
                let manifest_path = package_path.join(BACKUP_MANIFEST_FILE_NAME);
                let mut manifest: serde_json::Value =
                    serde_json::from_slice(&fs::read(&manifest_path).expect("manifest"))
                        .expect("manifest json");
                manifest["version"] = serde_json::json!(2);
                fs::write(
                    manifest_path,
                    serde_json::to_vec_pretty(&manifest).expect("serialize"),
                )
                .expect("tamper between validation and apply");
                Ok(())
            },
            |connection, _| validate_restored_connection(connection),
            |_| Ok(()),
        )
        .expect_err("second validation rejection");

        assert_eq!(error.code, "unsupported_version");
        assert!(error.safety_package_name.is_some());
        assert!(!error.rollback_attempted);
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn package_restore_rolls_back_active_database_when_post_apply_check_fails() {
        let app_data_dir = unique_test_dir("package-restore-rollback").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "package_video", "Package Video");
        let package = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(59),
        )
        .expect("package");
        {
            let connection = database.connection();
            connection
                .lock()
                .expect("database lock")
                .execute("DELETE FROM videos", [])
                .expect("clear package row");
        }
        insert_video_title(&database, "current_video", "Current Video");

        let error = restore_backup_package_with_hooks(
            &database,
            &package.package_name,
            |_| Ok(()),
            |_, _| Err("Injected post-apply validation failure".to_string()),
            |_| Ok(()),
        )
        .expect_err("apply failure");

        assert_eq!(error.code, "restore_apply_failed");
        assert!(error.rollback_attempted);
        assert!(error.rollback_succeeded);
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        assert_eq!(read_video_title(&database, "package_video"), None);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn package_restore_reports_rollback_failure() {
        let app_data_dir =
            unique_test_dir("package-restore-rollback-failure").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "package_video", "Package Video");
        let package = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(60),
        )
        .expect("package");
        {
            let connection = database.connection();
            connection
                .lock()
                .expect("database lock")
                .execute("DELETE FROM videos", [])
                .expect("clear package row");
        }
        insert_video_title(&database, "current_video", "Current Video");

        let error = restore_backup_package_with_hooks(
            &database,
            &package.package_name,
            |_| Ok(()),
            |_, _| Err("Injected post-apply validation failure".to_string()),
            |_| Err("Injected rollback source failure".to_string()),
        )
        .expect_err("rollback failure");

        assert_eq!(error.code, "restore_rollback_failed");
        assert!(error.rollback_attempted);
        assert!(!error.rollback_succeeded);
        assert!(error.errors.len() >= 2);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn package_operations_reject_concurrent_backup_rotation_and_restore() {
        let app_data_dir = unique_test_dir("package-operation-lock").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let package = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(61),
        )
        .expect("package");
        let operation = database
            .package_operation
            .lock()
            .expect("package operation lock");

        assert_eq!(
            create_backup_package(&database, BackupPackageType::Manual, None)
                .expect_err("concurrent backup rejection"),
            "Another backup or restore package operation is already running"
        );
        assert_eq!(
            rotate_automatic_backup_packages(&database, 1)
                .expect_err("concurrent rotation rejection"),
            "Another backup or restore package operation is already running"
        );
        assert_eq!(
            restore_backup_package(&database, &package.package_name)
                .expect_err("concurrent restore rejection")
                .code,
            "package_operation_busy"
        );
        drop(operation);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn automatic_rotation_never_removes_manual_or_safety_packages() {
        let app_data_dir = unique_test_dir("package-rotation-safety").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        let manual = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(62),
        )
        .expect("manual");
        let safety = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            create_safety_backup_package(
                &database,
                &connection,
                &manual.package_name,
                UNIX_EPOCH + std::time::Duration::from_secs(63),
            )
            .expect("safety")
        };
        let old_automatic = create_backup_package_at(
            &database,
            BackupPackageType::Automatic,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(64),
        )
        .expect("old automatic");
        let new_automatic = create_backup_package_at(
            &database,
            BackupPackageType::Automatic,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(65),
        )
        .expect("new automatic");

        let result = rotate_automatic_backup_packages(&database, 1).expect("rotation");

        assert_eq!(result.removed_automatic, 1);
        assert!(PathBuf::from(manual.package_path).is_dir());
        assert!(PathBuf::from(safety.package_path).is_dir());
        assert!(!PathBuf::from(old_automatic.package_path).exists());
        assert!(PathBuf::from(new_automatic.package_path).is_dir());
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn rotation_deletes_only_old_automatic_packages_inside_backup_folder() {
        let app_data_dir = unique_test_dir("backup-package-rotation").join(APP_DATA_FOLDER_NAME);
        let outside_dir = unique_test_dir("backup-package-outside");
        let _ = fs::remove_dir_all(&app_data_dir);
        let _ = fs::remove_dir_all(&outside_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        fs::create_dir_all(&outside_dir).expect("outside dir");
        let outside_file = outside_dir.join("keep.txt");
        fs::write(&outside_file, "keep").expect("outside file");
        let manual = create_backup_package_at(
            &database,
            BackupPackageType::Manual,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(10),
        )
        .expect("manual");
        let automatic_old = create_backup_package_at(
            &database,
            BackupPackageType::Automatic,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(20),
        )
        .expect("old automatic");
        let automatic_new = create_backup_package_at(
            &database,
            BackupPackageType::Automatic,
            None,
            UNIX_EPOCH + std::time::Duration::from_secs(30),
        )
        .expect("new automatic");

        let result = rotate_automatic_backup_packages(&database, 1).expect("rotation");

        assert_eq!(result.kept_automatic, 1);
        assert_eq!(result.removed_automatic, 1);
        assert!(PathBuf::from(manual.package_path).is_dir());
        assert!(!PathBuf::from(automatic_old.package_path).exists());
        assert!(PathBuf::from(automatic_new.package_path).is_dir());
        assert!(outside_file.is_file());
        assert_eq!(
            rotate_automatic_backup_packages(&database, 0).expect_err("zero rotation must fail"),
            "Automatic backup rotation count must be between 1 and 100"
        );
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn backs_up_runtime_database_to_explicit_destination() {
        let app_data_dir = unique_test_dir("sqlite-backup").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);

        let database = prepare_database(&app_data_dir).expect("database init");
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            connection
                .execute(
                    "INSERT INTO videos (
                        id, title, originalTitle, code, censorship, availability, releaseDate,
                        durationMinutes, publisherLabel, coverPath, mediaPath, categoriesJson,
                        ratingJson, notes, favorite, createdAt, updatedAt
                    ) VALUES (
                        'video_backup_test', 'Backed Up Video', '', '', '', '', '',
                        NULL, '', 'C:/Media/cover.jpg', 'C:/Media/video.mp4', '[]',
                        '{}', '', 0, '1', '1'
                    )",
                    [],
                )
                .expect("insert video");
        }

        let destination_path = app_data_dir.join("sakurava-backup.sqlite");
        let result = backup_runtime_database(&database, &destination_path).expect("backup");

        assert_eq!(
            result,
            DatabaseBackupResult {
                destination_path: destination_path.display().to_string(),
                success: true
            }
        );
        assert!(destination_path.is_file());

        let backup = Connection::open(&destination_path).expect("open backup");
        let title: String = backup
            .query_row(
                "SELECT title FROM videos WHERE id = 'video_backup_test'",
                [],
                |row| row.get(0),
            )
            .expect("backup row");
        assert_eq!(title, "Backed Up Video");

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn rejects_backup_to_active_database_file() {
        let app_data_dir = unique_test_dir("sqlite-backup-active").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);

        let database = prepare_database(&app_data_dir).expect("database init");
        let error = backup_runtime_database(&database, &database.paths.database_file)
            .expect_err("active database backup should fail");

        assert_eq!(
            error,
            "Backup destination cannot be the active database file"
        );

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn rejects_restore_from_empty_path_without_changing_current_database() {
        let app_data_dir = unique_test_dir("sqlite-restore-empty").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        let error = restore_runtime_database(&database, Path::new(""))
            .expect_err("empty restore source should fail");

        assert_eq!(error, "Restore source path is required");
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        assert_no_restore_safety_backup(&app_data_dir);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn rejects_restore_from_directory_without_changing_current_database() {
        let app_data_dir = unique_test_dir("sqlite-restore-directory").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        let restore_dir = app_data_dir.join("restore-dir");
        fs::create_dir_all(&restore_dir).expect("restore dir");
        let error = restore_runtime_database(&database, &restore_dir)
            .expect_err("directory restore source should fail");

        assert_eq!(error, "Restore source must be a SQLite file, not a folder");
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        assert_no_restore_safety_backup(&app_data_dir);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn rejects_restore_from_corrupt_file_without_changing_current_database() {
        let app_data_dir = unique_test_dir("sqlite-restore-corrupt").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        let source_path = app_data_dir.join("corrupt.sqlite");
        fs::write(&source_path, "not sqlite").expect("corrupt sqlite file");
        let error = restore_runtime_database(&database, &source_path)
            .expect_err("corrupt restore source should fail");

        assert!(error.contains("Unable to validate restore source integrity"));
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        assert_no_restore_safety_backup(&app_data_dir);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn rejects_restore_from_sqlite_missing_required_tables_without_changing_current_database() {
        let app_data_dir =
            unique_test_dir("sqlite-restore-missing-tables").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        let source_path = app_data_dir.join("missing-tables.sqlite");
        let source = Connection::open(&source_path).expect("source sqlite");
        source
            .execute("CREATE TABLE videos (id TEXT PRIMARY KEY, title TEXT)", [])
            .expect("partial source schema");
        drop(source);

        let error = restore_runtime_database(&database, &source_path)
            .expect_err("missing table restore source should fail");

        assert_eq!(
            error,
            "Restore source is not a Sakurava database: missing images table"
        );
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        assert_no_restore_safety_backup(&app_data_dir);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn restores_valid_sakurava_sqlite_and_creates_safety_backup() {
        let app_data_dir = unique_test_dir("sqlite-restore-valid").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        let source_dir = unique_test_dir("sqlite-restore-source").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&source_dir);
        let source_database = prepare_database(&source_dir).expect("source database init");
        insert_video_title(&source_database, "restored_video", "Restored Video");
        let source_path = source_database.paths.database_file.clone();
        drop(source_database);

        let result = restore_runtime_database(&database, &source_path).expect("restore");

        assert_eq!(result.source_path, source_path.display().to_string());
        assert!(result.success);
        assert!(!result.restart_required);
        assert!(PathBuf::from(&result.safety_backup_path).is_file());
        assert_eq!(read_video_title(&database, "current_video"), None);
        assert_eq!(
            read_video_title(&database, "restored_video"),
            Some("Restored Video".to_string())
        );

        let safety_backup =
            Connection::open(&result.safety_backup_path).expect("open safety backup");
        let safety_title: String = safety_backup
            .query_row(
                "SELECT title FROM videos WHERE id = 'current_video'",
                [],
                |row| row.get(0),
            )
            .expect("safety backup row");
        assert_eq!(safety_title, "Current Video");

        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(source_dir);
    }

    #[test]
    fn clear_cache_reports_no_cache_without_changing_database() {
        let app_data_dir = unique_test_dir("clear-cache-empty").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        let result = clear_app_generated_cache(&database).expect("clear cache");

        assert_eq!(
            result,
            ClearCacheResult {
                success: true,
                message:
                    "No app-generated cache found. Source media and catalog records were not changed."
                        .to_string(),
                files_removed: 0,
                bytes_removed: 0,
                cleared_paths: vec![],
            }
        );
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );
        assert!(database.paths.database_file.is_file());

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn clear_cache_removes_only_scoped_app_generated_cache() {
        let app_data_dir = unique_test_dir("clear-cache-scoped").join(APP_DATA_FOLDER_NAME);
        let _ = fs::remove_dir_all(&app_data_dir);
        let database = prepare_database(&app_data_dir).expect("database init");
        insert_video_title(&database, "current_video", "Current Video");

        let generated_cache = app_data_dir.join("generated-cache");
        let thumbnail_cache = app_data_dir.join("thumbnail-cache").join("nested");
        let unrelated_app_file = app_data_dir.join("keep-me.txt");
        let source_media_dir = unique_test_dir("clear-cache-source-media");
        let source_media_file = source_media_dir.join("source-video.mp4");

        fs::create_dir_all(&generated_cache).expect("generated cache dir");
        fs::create_dir_all(&thumbnail_cache).expect("thumbnail cache dir");
        fs::create_dir_all(&source_media_dir).expect("source media dir");
        fs::write(generated_cache.join("one.cache"), "12345").expect("cache file");
        fs::write(thumbnail_cache.join("two.cache"), "1234567").expect("nested cache file");
        fs::write(&unrelated_app_file, "keep").expect("unrelated app file");
        fs::write(&source_media_file, "media").expect("source media file");

        let result = clear_app_generated_cache(&database).expect("clear cache");

        assert!(result.success);
        assert_eq!(result.files_removed, 2);
        assert_eq!(result.bytes_removed, 12);
        assert_eq!(result.cleared_paths.len(), 2);
        assert!(!generated_cache.exists());
        assert!(!app_data_dir.join("thumbnail-cache").exists());
        assert!(unrelated_app_file.is_file());
        assert!(source_media_file.is_file());
        assert!(database.paths.database_file.is_file());
        assert_eq!(
            read_video_title(&database, "current_video"),
            Some("Current Video".to_string())
        );

        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(source_media_dir);
    }

    fn insert_video_title(database: &RuntimeDatabase, id: &str, title: &str) {
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        let sakurava_ref = allocate_sakurava_ref(&connection, "V", "0001").expect("test video ref");
        connection
            .execute(
                "INSERT INTO videos (
                    id, sakuravaRef, title, originalTitle, code, censorship, availability, releaseDate,
                    durationMinutes, publisherLabel, coverPath, mediaPath, categoriesJson,
                    ratingJson, notes, favorite, createdAt, updatedAt
                ) VALUES (
                    ?1, ?2, ?3, '', '', '', '', '', NULL, '', '', '', '[]', '{}', '', 0, '1', '1'
                )",
                params![id, sakurava_ref, title],
            )
            .expect("insert video");
    }

    fn set_backup_manifest_field(
        package: &BackupPackageInfo,
        field: &str,
        value: serde_json::Value,
    ) {
        let manifest_path = PathBuf::from(&package.package_path).join(BACKUP_MANIFEST_FILE_NAME);
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest_path).expect("manifest bytes"))
                .expect("manifest json");
        manifest[field] = value;
        fs::write(
            manifest_path,
            serde_json::to_vec_pretty(&manifest).expect("manifest serialization"),
        )
        .expect("write manifest");
    }

    fn table_has_column(connection: &Connection, table_name: &str, column_name: &str) -> bool {
        let mut statement = connection
            .prepare(&format!("PRAGMA table_info({table_name})"))
            .expect("table info statement");
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .expect("table info rows")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("table columns");

        columns.iter().any(|column| column == column_name)
    }

    fn read_video_title(database: &RuntimeDatabase, id: &str) -> Option<String> {
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        connection
            .query_row("SELECT title FROM videos WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()
            .expect("read video title")
    }

    fn assert_no_restore_safety_backup(app_data_dir: &Path) {
        let backup_count = fs::read_dir(app_data_dir)
            .expect("app data entries")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .map(|name| name.starts_with("sakurava-before-restore-"))
                    .unwrap_or(false)
            })
            .count();
        assert_eq!(backup_count, 0);
    }
}
