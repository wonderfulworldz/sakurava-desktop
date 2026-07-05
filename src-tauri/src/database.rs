use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, DatabaseName};
use serde::{Deserialize, Serialize};
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

const CREATE_VIDEOS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY NOT NULL,
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

#[derive(Debug, Clone)]
pub struct RuntimeDatabasePaths {
    pub app_data_dir: PathBuf,
    pub database_file: PathBuf,
}

#[derive(Clone)]
pub struct RuntimeDatabase {
    pub paths: RuntimeDatabasePaths,
    connection: Arc<Mutex<Connection>>,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BackupPackageType {
    Manual,
    Automatic,
}

impl BackupPackageType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Automatic => "automatic",
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
    pub package_path: String,
    pub manifest: BackupPackageManifest,
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
            package_path: canonical_package_path.display().to_string(),
            manifest,
        });
    }
    packages.sort_by(|left, right| right.manifest.created_at.cmp(&left.manifest.created_at));
    Ok(packages)
}

pub fn rotate_automatic_backup_packages(
    database: &RuntimeDatabase,
    keep_count: usize,
) -> Result<BackupPackageRotationResult, String> {
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

    Ok(())
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

pub fn open_runtime_database(paths: RuntimeDatabasePaths) -> rusqlite::Result<RuntimeDatabase> {
    let connection = Connection::open(&paths.database_file)?;
    initialize_schema(&connection)?;

    Ok(RuntimeDatabase {
        paths,
        connection: Arc::new(Mutex::new(connection)),
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

    #[test]
    fn defines_runtime_database_names() {
        assert_eq!(APP_DATA_FOLDER_NAME, "app.sakurava.desktop");
        assert_eq!(DATABASE_FILE_NAME, "sakurava.sqlite");
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
        connection
            .execute(
                "INSERT INTO videos (
                    id, title, originalTitle, code, censorship, availability, releaseDate,
                    durationMinutes, publisherLabel, coverPath, mediaPath, categoriesJson,
                    ratingJson, notes, favorite, createdAt, updatedAt
                ) VALUES (
                    ?1, ?2, '', '', '', '', '', NULL, '', '', '', '[]', '{}', '', 0, '1', '1'
                )",
                [id, title],
            )
            .expect("insert video");
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
