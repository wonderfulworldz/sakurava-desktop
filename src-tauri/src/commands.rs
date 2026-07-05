use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{fs, io};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Scopes, State};

#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::{PROPERTYKEY, RPC_E_CHANGED_MODE, S_FALSE, S_OK},
        Storage::EnhancedStorage::{
            PKEY_Media_Duration, PKEY_Video_FrameHeight, PKEY_Video_FrameWidth,
        },
        System::Com::{
            CoInitializeEx, CoUninitialize, IBindCtx,
            StructuredStorage::{
                PropVariantClear, PropVariantToUInt32, PropVariantToUInt64, PROPVARIANT,
            },
            COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
        },
        UI::Shell::PropertiesSystem::{
            IPropertyStore, SHGetPropertyStoreFromParsingName, GPS_DEFAULT,
        },
    },
};

use crate::database::{
    backup_runtime_database, clear_app_generated_cache, create_backup_package,
    list_backup_packages, open_default_backup_folder, preview_backup_package,
    restore_runtime_database, rotate_automatic_backup_packages, BackupFolderOpenResult,
    BackupPackageInfo, BackupPackagePreview, BackupPackagePreviewError,
    BackupPackageRotationResult, BackupPackageType, ClearCacheResult, DatabaseBackupResult,
    DatabaseRestoreResult, RuntimeDatabase,
};

static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub id: String,
    pub title: String,
    pub original_title: String,
    pub code: String,
    pub censorship: String,
    pub availability: String,
    pub release_date: String,
    pub duration_minutes: Option<i64>,
    pub resolution: String,
    pub file_size_bytes: Option<i64>,
    pub file_type: String,
    pub publisher_label: String,
    pub cover_path: String,
    pub media_path: String,
    pub categories_json: String,
    pub related_performers_json: String,
    pub related_images_json: String,
    pub source_links_json: String,
    pub rating_json: String,
    pub notes: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInput {
    pub title: String,
    pub original_title: Option<String>,
    pub code: Option<String>,
    pub censorship: Option<String>,
    pub availability: Option<String>,
    pub release_date: Option<String>,
    pub duration_minutes: Option<i64>,
    pub resolution: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub file_type: Option<String>,
    pub publisher_label: Option<String>,
    pub cover_path: Option<String>,
    pub media_path: Option<String>,
    pub categories_json: Option<String>,
    pub related_performers_json: Option<String>,
    pub related_images_json: Option<String>,
    pub source_links_json: Option<String>,
    pub rating_json: Option<String>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPatch {
    pub title: Option<String>,
    pub original_title: Option<String>,
    pub code: Option<String>,
    pub censorship: Option<String>,
    pub availability: Option<String>,
    pub release_date: Option<String>,
    pub duration_minutes: Option<i64>,
    pub resolution: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub file_type: Option<String>,
    pub publisher_label: Option<String>,
    pub cover_path: Option<String>,
    pub media_path: Option<String>,
    pub categories_json: Option<String>,
    pub related_performers_json: Option<String>,
    pub related_images_json: Option<String>,
    pub source_links_json: Option<String>,
    pub rating_json: Option<String>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    pub id: String,
    pub title: String,
    pub original_title: String,
    pub code: String,
    pub censorship: String,
    pub availability: String,
    pub release_date: String,
    pub publisher_label: String,
    pub cover_path: String,
    pub folder_path: String,
    pub image_count: Option<i64>,
    pub main_resolution: String,
    pub total_file_size_bytes: Option<i64>,
    pub main_file_type: String,
    pub gallery_image_paths_json: String,
    pub categories_json: String,
    pub related_performers_json: String,
    pub related_videos_json: String,
    pub source_links_json: String,
    pub rating_json: String,
    pub notes: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInput {
    pub title: String,
    pub original_title: Option<String>,
    pub code: Option<String>,
    pub censorship: Option<String>,
    pub availability: Option<String>,
    pub release_date: Option<String>,
    pub publisher_label: Option<String>,
    pub cover_path: Option<String>,
    pub folder_path: Option<String>,
    pub image_count: Option<i64>,
    pub main_resolution: Option<String>,
    pub total_file_size_bytes: Option<i64>,
    pub main_file_type: Option<String>,
    pub gallery_image_paths_json: Option<String>,
    pub categories_json: Option<String>,
    pub related_performers_json: Option<String>,
    pub related_videos_json: Option<String>,
    pub source_links_json: Option<String>,
    pub rating_json: Option<String>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePatch {
    pub title: Option<String>,
    pub original_title: Option<String>,
    pub code: Option<String>,
    pub censorship: Option<String>,
    pub availability: Option<String>,
    pub release_date: Option<String>,
    pub publisher_label: Option<String>,
    pub cover_path: Option<String>,
    pub folder_path: Option<String>,
    pub image_count: Option<i64>,
    pub main_resolution: Option<String>,
    pub total_file_size_bytes: Option<i64>,
    pub main_file_type: Option<String>,
    pub gallery_image_paths_json: Option<String>,
    pub categories_json: Option<String>,
    pub related_performers_json: Option<String>,
    pub related_videos_json: Option<String>,
    pub source_links_json: Option<String>,
    pub rating_json: Option<String>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Performer {
    pub id: String,
    pub name: String,
    pub original_name: String,
    pub aliases_json: String,
    pub status: String,
    pub debut_date: String,
    pub retired_date: String,
    pub birth_date: String,
    pub gender: String,
    pub birthplace: String,
    pub nationality: String,
    pub blood_type: String,
    pub height_cm: Option<i64>,
    pub weight_kg: Option<i64>,
    pub measurements: String,
    pub cup_size: String,
    pub cover_path: String,
    pub performer_thumbnail_paths_json: String,
    pub filmography_count: Option<i64>,
    pub pictorials_count: Option<i64>,
    pub related_videos_json: String,
    pub related_images_json: String,
    pub source_links_json: String,
    pub categories_json: String,
    pub rating_json: String,
    pub notes: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformerInput {
    pub name: String,
    pub original_name: Option<String>,
    pub aliases_json: Option<String>,
    pub status: Option<String>,
    pub debut_date: Option<String>,
    pub retired_date: Option<String>,
    pub birth_date: Option<String>,
    pub gender: Option<String>,
    pub birthplace: Option<String>,
    pub nationality: Option<String>,
    pub blood_type: Option<String>,
    pub height_cm: Option<i64>,
    pub weight_kg: Option<i64>,
    pub measurements: Option<String>,
    pub cup_size: Option<String>,
    pub cover_path: Option<String>,
    pub performer_thumbnail_paths_json: Option<String>,
    pub filmography_count: Option<i64>,
    pub pictorials_count: Option<i64>,
    pub related_videos_json: Option<String>,
    pub related_images_json: Option<String>,
    pub source_links_json: Option<String>,
    pub categories_json: Option<String>,
    pub rating_json: Option<String>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformerPatch {
    pub name: Option<String>,
    pub original_name: Option<String>,
    pub aliases_json: Option<String>,
    pub status: Option<String>,
    pub debut_date: Option<String>,
    pub retired_date: Option<String>,
    pub birth_date: Option<String>,
    pub gender: Option<String>,
    pub birthplace: Option<String>,
    pub nationality: Option<String>,
    pub blood_type: Option<String>,
    pub height_cm: Option<Option<i64>>,
    pub weight_kg: Option<Option<i64>>,
    pub measurements: Option<String>,
    pub cup_size: Option<String>,
    pub cover_path: Option<String>,
    pub performer_thumbnail_paths_json: Option<String>,
    pub filmography_count: Option<Option<i64>>,
    pub pictorials_count: Option<Option<i64>>,
    pub related_videos_json: Option<String>,
    pub related_images_json: Option<String>,
    pub source_links_json: Option<String>,
    pub categories_json: Option<String>,
    pub rating_json: Option<String>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub id: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntry {
    pub id: String,
    pub term: String,
    pub definition: String,
    pub synonyms_json: String,
    pub category: String,
    pub parent_id: String,
    pub thumbnail_path: String,
    pub favorite: bool,
    pub source_title: String,
    pub source_url: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntryInput {
    pub term: String,
    pub definition: String,
    pub synonyms_json: Option<String>,
    pub category: Option<String>,
    pub parent_id: Option<String>,
    pub thumbnail_path: Option<String>,
    pub favorite: Option<bool>,
    pub source_title: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntryPatch {
    pub term: Option<String>,
    pub definition: Option<String>,
    pub synonyms_json: Option<String>,
    pub category: Option<String>,
    pub parent_id: Option<String>,
    pub thumbnail_path: Option<String>,
    pub favorite: Option<bool>,
    pub source_title: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCategory {
    pub key: String,
    pub name: String,
    pub parent_key: Option<String>,
    pub description: String,
    pub thumbnail_path: String,
    pub show_in_videos: bool,
    pub show_in_images: bool,
    pub show_in_performers: bool,
    pub show_in_credits: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCategoryInput {
    pub key: Option<String>,
    pub name: String,
    pub parent_key: Option<String>,
    pub description: Option<String>,
    pub thumbnail_path: Option<String>,
    pub show_in_videos: Option<bool>,
    pub show_in_images: Option<bool>,
    pub show_in_performers: Option<bool>,
    pub show_in_credits: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCategoryPatch {
    pub name: Option<String>,
    pub parent_key: Option<Option<String>>,
    pub description: Option<String>,
    pub thumbnail_path: Option<String>,
    pub show_in_videos: Option<bool>,
    pub show_in_images: Option<bool>,
    pub show_in_performers: Option<bool>,
    pub show_in_credits: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCategoryDeleteResult {
    pub key: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaAssetRootResult {
    pub root_path: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PathStatusKind {
    NotSet,
    Exists,
    Missing,
    Inaccessible,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PathKind {
    File,
    Folder,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathStatusResult {
    pub path: String,
    pub status: PathStatusKind,
    pub kind: PathKind,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaOpenResult {
    pub path: String,
    pub opened: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Credit {
    pub id: String,
    pub work_type: String,
    pub work_id: String,
    pub performer_id: String,
    pub character_name: String,
    pub character_original_name: Option<String>,
    pub credited_as: Option<String>,
    pub credited_as_mode: String,
    pub credit_type_category_id: Option<String>,
    pub role_importance_category_id: Option<String>,
    pub character_mode: String,
    pub character_id: Option<String>,
    pub billing_order: Option<i64>,
    pub note: Option<String>,
    pub legacy_source_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditInput {
    pub work_type: String,
    pub work_id: String,
    pub performer_id: String,
    pub character_name: Option<String>,
    pub character_original_name: Option<String>,
    pub credited_as: Option<String>,
    pub credited_as_mode: Option<String>,
    pub credit_type_category_id: Option<String>,
    pub role_importance_category_id: Option<String>,
    pub character_mode: Option<String>,
    pub character_id: Option<String>,
    pub billing_order: Option<i64>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPatch {
    pub work_type: Option<String>,
    pub work_id: Option<String>,
    pub performer_id: Option<String>,
    pub character_name: Option<String>,
    pub character_original_name: Option<Option<String>>,
    pub credited_as: Option<Option<String>>,
    pub credited_as_mode: Option<String>,
    pub credit_type_category_id: Option<Option<String>>,
    pub role_importance_category_id: Option<Option<String>>,
    pub character_mode: Option<String>,
    pub character_id: Option<Option<String>>,
    pub billing_order: Option<Option<i64>>,
    pub note: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DetailFileActionResult {
    pub source_path: String,
    pub destination_path: Option<String>,
    pub folder_path: Option<String>,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportCsvWriteResult {
    pub destination_path: String,
    pub bytes_written: usize,
    pub success: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportCsvReadResult {
    pub source_path: String,
    pub csv_content: String,
    pub bytes_read: usize,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GalleryFolderImagesResult {
    pub folder_path: String,
    pub image_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadataProbeResult {
    pub path: String,
    pub status: PathStatusKind,
    pub kind: PathKind,
    pub file_size_bytes: Option<i64>,
    pub file_type: String,
    pub duration_minutes: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub resolution: Option<String>,
    pub message: String,
}

#[tauri::command]
pub fn database_backup(
    database: State<'_, RuntimeDatabase>,
    destination_path: String,
) -> Result<DatabaseBackupResult, String> {
    backup_runtime_database(&database, destination_path)
}

#[tauri::command]
pub fn database_restore(
    database: State<'_, RuntimeDatabase>,
    source_path: String,
) -> Result<DatabaseRestoreResult, String> {
    restore_runtime_database(&database, source_path)
}

#[tauri::command]
pub fn backup_package_create(
    database: State<'_, RuntimeDatabase>,
    backup_type: BackupPackageType,
    note: Option<String>,
) -> Result<BackupPackageInfo, String> {
    create_backup_package(&database, backup_type, note)
}

#[tauri::command]
pub fn backup_package_list(
    database: State<'_, RuntimeDatabase>,
) -> Result<Vec<BackupPackageInfo>, String> {
    list_backup_packages(&database)
}

#[tauri::command]
pub fn backup_package_preview(
    database: State<'_, RuntimeDatabase>,
    package_name: String,
) -> Result<BackupPackagePreview, BackupPackagePreviewError> {
    preview_backup_package(&database, &package_name)
}

#[tauri::command]
pub fn backup_package_rotate_automatic(
    database: State<'_, RuntimeDatabase>,
    keep_count: usize,
) -> Result<BackupPackageRotationResult, String> {
    rotate_automatic_backup_packages(&database, keep_count)
}

#[tauri::command]
pub fn backup_folder_open(
    database: State<'_, RuntimeDatabase>,
) -> Result<BackupFolderOpenResult, String> {
    open_default_backup_folder(&database)
}

#[tauri::command]
pub fn clear_app_cache(database: State<'_, RuntimeDatabase>) -> Result<ClearCacheResult, String> {
    clear_app_generated_cache(&database)
}

#[tauri::command]
pub fn export_csv_write(
    destination_path: String,
    csv_content: String,
) -> Result<ExportCsvWriteResult, String> {
    write_export_csv_file(&destination_path, &csv_content)
}

#[tauri::command]
pub fn import_csv_read(source_path: String) -> Result<ImportCsvReadResult, String> {
    read_import_csv_file(&source_path)
}

#[tauri::command]
pub fn media_asset_allow_root(
    scopes: State<'_, Scopes>,
    root_path: String,
) -> Result<MediaAssetRootResult, String> {
    let root_path = validate_media_asset_root(&root_path)?;
    scopes
        .allow_directory(&root_path, true)
        .map_err(|error| format!("Unable to allow media asset root: {error}"))?;

    Ok(MediaAssetRootResult {
        root_path: root_path.display().to_string(),
        success: true,
    })
}

#[tauri::command]
pub fn video_create(
    database: State<'_, RuntimeDatabase>,
    input: VideoInput,
) -> Result<Video, String> {
    with_connection(&database, |connection| create_video(connection, input))
}

#[tauri::command]
pub fn video_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<Video>, String> {
    with_connection(&database, list_videos)
}

#[tauri::command]
pub fn video_get(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<Option<Video>, String> {
    with_connection(&database, |connection| get_video(connection, &id))
}

#[tauri::command]
pub fn video_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: VideoPatch,
) -> Result<Option<Video>, String> {
    with_connection(&database, |connection| update_video(connection, &id, patch))
}

#[tauri::command]
pub fn video_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    with_connection(&database, |connection| delete_row(connection, "videos", id))
}

#[tauri::command]
pub fn image_create(
    database: State<'_, RuntimeDatabase>,
    input: ImageInput,
) -> Result<Image, String> {
    with_connection(&database, |connection| create_image(connection, input))
}

#[tauri::command]
pub fn image_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<Image>, String> {
    with_connection(&database, list_images)
}

#[tauri::command]
pub fn image_get(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<Option<Image>, String> {
    with_connection(&database, |connection| get_image(connection, &id))
}

#[tauri::command]
pub fn image_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: ImagePatch,
) -> Result<Option<Image>, String> {
    with_connection(&database, |connection| update_image(connection, &id, patch))
}

#[tauri::command]
pub fn image_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    with_connection(&database, |connection| delete_row(connection, "images", id))
}

#[tauri::command]
pub fn performer_create(
    database: State<'_, RuntimeDatabase>,
    input: PerformerInput,
) -> Result<Performer, String> {
    with_connection(&database, |connection| create_performer(connection, input))
}

#[tauri::command]
pub fn performer_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<Performer>, String> {
    with_connection(&database, list_performers)
}

#[tauri::command]
pub fn performer_get(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<Option<Performer>, String> {
    with_connection(&database, |connection| get_performer(connection, &id))
}

#[tauri::command]
pub fn performer_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: PerformerPatch,
) -> Result<Option<Performer>, String> {
    with_connection(&database, |connection| {
        update_performer(connection, &id, patch)
    })
}

#[tauri::command]
pub fn performer_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    with_connection(&database, |connection| {
        delete_row(connection, "performers", id)
    })
}

#[tauri::command]
pub fn managed_category_create(
    database: State<'_, RuntimeDatabase>,
    input: ManagedCategoryInput,
) -> Result<ManagedCategory, String> {
    with_connection(&database, |connection| {
        create_managed_category(connection, input)
    })
}

#[tauri::command]
pub fn managed_category_list(
    database: State<'_, RuntimeDatabase>,
) -> Result<Vec<ManagedCategory>, String> {
    with_connection(&database, list_managed_categories)
}

#[tauri::command]
pub fn managed_category_get(
    database: State<'_, RuntimeDatabase>,
    key: String,
) -> Result<Option<ManagedCategory>, String> {
    with_connection(&database, |connection| {
        get_managed_category(connection, &key)
    })
}

#[tauri::command]
pub fn managed_category_update(
    database: State<'_, RuntimeDatabase>,
    key: String,
    patch: ManagedCategoryPatch,
) -> Result<Option<ManagedCategory>, String> {
    with_connection(&database, |connection| {
        update_managed_category(connection, &key, patch)
    })
}

#[tauri::command]
pub fn managed_category_delete(
    database: State<'_, RuntimeDatabase>,
    key: String,
) -> Result<ManagedCategoryDeleteResult, String> {
    with_connection(&database, |connection| {
        delete_managed_category_if_unused(connection, key)
    })
}

#[tauri::command]
pub fn glossary_create(
    database: State<'_, RuntimeDatabase>,
    input: GlossaryEntryInput,
) -> Result<GlossaryEntry, String> {
    with_connection(&database, |connection| {
        create_glossary_entry(connection, input)
    })
}

#[tauri::command]
pub fn glossary_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<GlossaryEntry>, String> {
    with_connection(&database, list_glossary_entries)
}

#[tauri::command]
pub fn glossary_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: GlossaryEntryPatch,
) -> Result<Option<GlossaryEntry>, String> {
    with_connection(&database, |connection| {
        update_glossary_entry(connection, &id, patch)
    })
}

#[tauri::command]
pub fn glossary_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    with_connection(&database, |connection| {
        let Some(_) = get_glossary_entry(connection, &id)? else {
            return Err("Glossary entry was not found".to_string());
        };
        if glossary_child_count(connection, &id)? > 0 {
            return Err("Glossary entry cannot be deleted while child entries use it.".to_string());
        }
        let deleted = connection
            .execute("DELETE FROM glossary_entries WHERE id = ?1", [&id])
            .map_err(database_error)?
            > 0;
        Ok(DeleteResult { id, deleted })
    })
}

#[tauri::command]
pub fn path_status_check(path: String) -> Result<PathStatusResult, String> {
    Ok(check_path_status(&path))
}

#[tauri::command]
pub fn media_metadata_probe(path: String) -> Result<MediaMetadataProbeResult, String> {
    Ok(probe_media_metadata(&path))
}

#[tauri::command]
pub fn open_media_path(path: String) -> Result<MediaOpenResult, String> {
    let media_path = validate_media_open_file_path(&path)?;
    open_media_file_with_default_app(&media_path)?;

    Ok(MediaOpenResult {
        path: media_path.display().to_string(),
        opened: true,
        message: "Media file open request sent".to_string(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLinkOpenResult {
    url: String,
    opened: bool,
    message: String,
}

#[tauri::command]
pub fn open_source_link(url: String) -> Result<SourceLinkOpenResult, String> {
    let safe_url = validate_source_link_url(&url)?;
    open_url_with_default_browser(&safe_url)?;

    Ok(SourceLinkOpenResult {
        url: safe_url,
        opened: true,
        message: "Source Link open request sent".to_string(),
    })
}

#[tauri::command]
pub fn credit_create(
    database: State<'_, RuntimeDatabase>,
    input: CreditInput,
) -> Result<Credit, String> {
    with_connection(&database, |connection| create_credit(connection, input))
}

#[tauri::command]
pub fn credit_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<Credit>, String> {
    with_connection(&database, list_credits)
}

#[tauri::command]
pub fn credit_get(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<Option<Credit>, String> {
    with_connection(&database, |connection| get_credit(connection, &id))
}

#[tauri::command]
pub fn credit_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: CreditPatch,
) -> Result<Option<Credit>, String> {
    with_connection(&database, |connection| {
        update_credit(connection, &id, patch)
    })
}

#[tauri::command]
pub fn credit_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    with_connection(&database, |connection| delete_credit(connection, id))
}

#[tauri::command]
pub fn credit_list_by_work(
    database: State<'_, RuntimeDatabase>,
    work_type: String,
    work_id: String,
) -> Result<Vec<Credit>, String> {
    with_connection(&database, |connection| {
        list_credits_by_work(connection, &work_type, &work_id)
    })
}

#[tauri::command]
pub fn credit_list_by_performer(
    database: State<'_, RuntimeDatabase>,
    performer_id: String,
) -> Result<Vec<Credit>, String> {
    with_connection(&database, |connection| {
        list_credits_by_performer(connection, &performer_id)
    })
}

#[tauri::command]
pub fn detail_source_file_copy_as(
    source_path: String,
    destination_path: String,
) -> Result<DetailFileActionResult, String> {
    copy_detail_source_file_as(&source_path, &destination_path)
}

#[tauri::command]
pub fn detail_source_folder_reveal(source_path: String) -> Result<DetailFileActionResult, String> {
    let source = validate_detail_source_file_path(&source_path)?;
    let folder = source
        .parent()
        .ok_or_else(|| "Source folder could not be resolved".to_string())?
        .to_path_buf();

    reveal_detail_source_folder(&source)?;

    Ok(DetailFileActionResult {
        source_path: source.display().to_string(),
        destination_path: None,
        folder_path: Some(folder.display().to_string()),
        success: true,
        message: "Source folder open request sent".to_string(),
    })
}

#[tauri::command]
pub fn gallery_folder_images_list(
    folder_path: String,
) -> Result<GalleryFolderImagesResult, String> {
    list_gallery_folder_images(&folder_path)
}

fn with_connection<T>(
    database: &RuntimeDatabase,
    action: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let connection = database.connection();
    let connection = connection
        .lock()
        .map_err(|_| "Database connection is unavailable".to_string())?;
    action(&connection)
}

fn create_video(connection: &Connection, input: VideoInput) -> Result<Video, String> {
    let title = require_text(input.title, "Video title is required")?;
    let timestamp = current_timestamp();
    let video = Video {
        id: new_id("video"),
        title,
        original_title: default_text(input.original_title),
        code: default_text(input.code),
        censorship: default_text(input.censorship),
        availability: default_text(input.availability),
        release_date: default_text(input.release_date),
        duration_minutes: input.duration_minutes,
        resolution: default_text(input.resolution),
        file_size_bytes: input.file_size_bytes,
        file_type: default_text(input.file_type),
        publisher_label: default_text(input.publisher_label),
        cover_path: default_text(input.cover_path),
        media_path: default_text(input.media_path),
        categories_json: normalize_string_array_json(input.categories_json),
        related_performers_json: normalize_related_performers_json(input.related_performers_json),
        related_images_json: normalize_related_catalog_records_json(input.related_images_json),
        source_links_json: normalize_source_links_json(input.source_links_json),
        rating_json: normalize_object_json(input.rating_json),
        notes: default_text(input.notes),
        favorite: input.favorite.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO videos (
                id, title, originalTitle, code, censorship, availability, releaseDate,
                durationMinutes, resolution, fileSizeBytes, fileType,
                publisherLabel, coverPath, mediaPath, categoriesJson,
                relatedPerformersJson, relatedImagesJson, source_links_json, ratingJson, notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
            params![
                video.id,
                video.title,
                video.original_title,
                video.code,
                video.censorship,
                video.availability,
                video.release_date,
                video.duration_minutes,
                video.resolution,
                video.file_size_bytes,
                video.file_type,
                video.publisher_label,
                video.cover_path,
                video.media_path,
                video.categories_json,
                video.related_performers_json,
                video.related_images_json,
                video.source_links_json,
                video.rating_json,
                video.notes,
                bool_to_int(video.favorite),
                video.created_at,
                video.updated_at
            ],
        )
        .map_err(database_error)?;

    get_video(connection, &video.id)?.ok_or_else(|| "Created video could not be read".to_string())
}

fn list_videos(connection: &Connection) -> Result<Vec<Video>, String> {
    let mut statement = connection
        .prepare("SELECT * FROM videos ORDER BY createdAt DESC, title ASC")
        .map_err(database_error)?;
    let rows = statement
        .query_map([], video_from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    Ok(rows)
}

fn get_video(connection: &Connection, id: &str) -> Result<Option<Video>, String> {
    connection
        .query_row("SELECT * FROM videos WHERE id = ?1", [id], video_from_row)
        .optional()
        .map_err(database_error)
}

fn update_video(
    connection: &Connection,
    id: &str,
    patch: VideoPatch,
) -> Result<Option<Video>, String> {
    let Some(mut video) = get_video(connection, id)? else {
        return Ok(None);
    };

    if let Some(title) = patch.title {
        video.title = require_text(title, "Video title is required")?;
    }
    apply_text(&mut video.original_title, patch.original_title);
    apply_text(&mut video.code, patch.code);
    apply_text(&mut video.censorship, patch.censorship);
    apply_text(&mut video.availability, patch.availability);
    apply_text(&mut video.release_date, patch.release_date);
    if patch.duration_minutes.is_some() {
        video.duration_minutes = patch.duration_minutes;
    }
    apply_text(&mut video.resolution, patch.resolution);
    if patch.file_size_bytes.is_some() {
        video.file_size_bytes = patch.file_size_bytes;
    }
    apply_text(&mut video.file_type, patch.file_type);
    apply_text(&mut video.publisher_label, patch.publisher_label);
    apply_text(&mut video.cover_path, patch.cover_path);
    apply_text(&mut video.media_path, patch.media_path);
    if patch.categories_json.is_some() {
        video.categories_json = normalize_string_array_json(patch.categories_json);
    }
    if patch.related_performers_json.is_some() {
        video.related_performers_json =
            normalize_related_performers_json(patch.related_performers_json);
    }
    if patch.related_images_json.is_some() {
        video.related_images_json =
            normalize_related_catalog_records_json(patch.related_images_json);
    }
    if patch.source_links_json.is_some() {
        video.source_links_json = normalize_source_links_json(patch.source_links_json);
    }
    if patch.rating_json.is_some() {
        video.rating_json = normalize_object_json(patch.rating_json);
    }
    apply_text(&mut video.notes, patch.notes);
    if let Some(favorite) = patch.favorite {
        video.favorite = favorite;
    }
    video.updated_at = current_timestamp();

    connection
        .execute(
            "UPDATE videos SET
                title = ?2, originalTitle = ?3, code = ?4, censorship = ?5,
                availability = ?6, releaseDate = ?7, durationMinutes = ?8,
                resolution = ?9, fileSizeBytes = ?10, fileType = ?11,
                publisherLabel = ?12, coverPath = ?13, mediaPath = ?14,
                categoriesJson = ?15, relatedPerformersJson = ?16,
                relatedImagesJson = ?17, source_links_json = ?18,
                ratingJson = ?19, notes = ?20,
                favorite = ?21, updatedAt = ?22
            WHERE id = ?1",
            params![
                video.id,
                video.title,
                video.original_title,
                video.code,
                video.censorship,
                video.availability,
                video.release_date,
                video.duration_minutes,
                video.resolution,
                video.file_size_bytes,
                video.file_type,
                video.publisher_label,
                video.cover_path,
                video.media_path,
                video.categories_json,
                video.related_performers_json,
                video.related_images_json,
                video.source_links_json,
                video.rating_json,
                video.notes,
                bool_to_int(video.favorite),
                video.updated_at
            ],
        )
        .map_err(database_error)?;

    get_video(connection, id)
}

fn create_image(connection: &Connection, input: ImageInput) -> Result<Image, String> {
    let title = require_text(input.title, "Image title is required")?;
    let timestamp = current_timestamp();
    let image = Image {
        id: new_id("image"),
        title,
        original_title: default_text(input.original_title),
        code: default_text(input.code),
        censorship: default_text(input.censorship),
        availability: default_text(input.availability),
        release_date: default_text(input.release_date),
        publisher_label: default_text(input.publisher_label),
        cover_path: default_text(input.cover_path),
        folder_path: default_text(input.folder_path),
        image_count: input.image_count,
        main_resolution: default_text(input.main_resolution),
        total_file_size_bytes: input.total_file_size_bytes,
        main_file_type: default_text(input.main_file_type),
        gallery_image_paths_json: normalize_gallery_image_paths_json(
            input.gallery_image_paths_json,
        ),
        categories_json: normalize_string_array_json(input.categories_json),
        related_performers_json: normalize_related_performers_json(input.related_performers_json),
        related_videos_json: normalize_related_catalog_records_json(input.related_videos_json),
        source_links_json: normalize_source_links_json(input.source_links_json),
        rating_json: normalize_object_json(input.rating_json),
        notes: default_text(input.notes),
        favorite: input.favorite.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO images (
                id, title, originalTitle, code, censorship, availability, releaseDate,
                publisherLabel, coverPath, folderPath, imageCount, galleryImagePathsJson,
                mainResolution, totalFileSizeBytes, mainFileType,
                categoriesJson, relatedPerformersJson, relatedVideosJson,
                source_links_json, ratingJson, notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
            params![
                image.id,
                image.title,
                image.original_title,
                image.code,
                image.censorship,
                image.availability,
                image.release_date,
                image.publisher_label,
                image.cover_path,
                image.folder_path,
                image.image_count,
                image.gallery_image_paths_json,
                image.main_resolution,
                image.total_file_size_bytes,
                image.main_file_type,
                image.categories_json,
                image.related_performers_json,
                image.related_videos_json,
                image.source_links_json,
                image.rating_json,
                image.notes,
                bool_to_int(image.favorite),
                image.created_at,
                image.updated_at
            ],
        )
        .map_err(database_error)?;

    get_image(connection, &image.id)?.ok_or_else(|| "Created image could not be read".to_string())
}

fn list_images(connection: &Connection) -> Result<Vec<Image>, String> {
    let mut statement = connection
        .prepare("SELECT * FROM images ORDER BY createdAt DESC, title ASC")
        .map_err(database_error)?;
    let rows = statement
        .query_map([], image_from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    Ok(rows)
}

fn get_image(connection: &Connection, id: &str) -> Result<Option<Image>, String> {
    connection
        .query_row("SELECT * FROM images WHERE id = ?1", [id], image_from_row)
        .optional()
        .map_err(database_error)
}

fn update_image(
    connection: &Connection,
    id: &str,
    patch: ImagePatch,
) -> Result<Option<Image>, String> {
    let Some(mut image) = get_image(connection, id)? else {
        return Ok(None);
    };

    if let Some(title) = patch.title {
        image.title = require_text(title, "Image title is required")?;
    }
    apply_text(&mut image.original_title, patch.original_title);
    apply_text(&mut image.code, patch.code);
    apply_text(&mut image.censorship, patch.censorship);
    apply_text(&mut image.availability, patch.availability);
    apply_text(&mut image.release_date, patch.release_date);
    apply_text(&mut image.publisher_label, patch.publisher_label);
    apply_text(&mut image.cover_path, patch.cover_path);
    apply_text(&mut image.folder_path, patch.folder_path);
    if patch.image_count.is_some() {
        image.image_count = patch.image_count;
    }
    apply_text(&mut image.main_resolution, patch.main_resolution);
    if patch.total_file_size_bytes.is_some() {
        image.total_file_size_bytes = patch.total_file_size_bytes;
    }
    apply_text(&mut image.main_file_type, patch.main_file_type);
    if patch.gallery_image_paths_json.is_some() {
        image.gallery_image_paths_json =
            normalize_gallery_image_paths_json(patch.gallery_image_paths_json);
    }
    if patch.categories_json.is_some() {
        image.categories_json = normalize_string_array_json(patch.categories_json);
    }
    if patch.related_performers_json.is_some() {
        image.related_performers_json =
            normalize_related_performers_json(patch.related_performers_json);
    }
    if patch.related_videos_json.is_some() {
        image.related_videos_json =
            normalize_related_catalog_records_json(patch.related_videos_json);
    }
    if patch.source_links_json.is_some() {
        image.source_links_json = normalize_source_links_json(patch.source_links_json);
    }
    if patch.rating_json.is_some() {
        image.rating_json = normalize_object_json(patch.rating_json);
    }
    apply_text(&mut image.notes, patch.notes);
    if let Some(favorite) = patch.favorite {
        image.favorite = favorite;
    }
    image.updated_at = current_timestamp();

    connection
        .execute(
            "UPDATE images SET
                title = ?2, originalTitle = ?3, code = ?4, censorship = ?5,
                availability = ?6, releaseDate = ?7, publisherLabel = ?8,
                coverPath = ?9, folderPath = ?10, imageCount = ?11,
                galleryImagePathsJson = ?12, mainResolution = ?13,
                totalFileSizeBytes = ?14, mainFileType = ?15, categoriesJson = ?16,
                relatedPerformersJson = ?17, relatedVideosJson = ?18,
                source_links_json = ?19, ratingJson = ?20, notes = ?21,
                favorite = ?22, updatedAt = ?23
            WHERE id = ?1",
            params![
                image.id,
                image.title,
                image.original_title,
                image.code,
                image.censorship,
                image.availability,
                image.release_date,
                image.publisher_label,
                image.cover_path,
                image.folder_path,
                image.image_count,
                image.gallery_image_paths_json,
                image.main_resolution,
                image.total_file_size_bytes,
                image.main_file_type,
                image.categories_json,
                image.related_performers_json,
                image.related_videos_json,
                image.source_links_json,
                image.rating_json,
                image.notes,
                bool_to_int(image.favorite),
                image.updated_at
            ],
        )
        .map_err(database_error)?;

    get_image(connection, id)
}

fn create_performer(connection: &Connection, input: PerformerInput) -> Result<Performer, String> {
    let name = require_text(input.name, "Performer name is required")?;
    let timestamp = current_timestamp();
    let performer = Performer {
        id: new_id("performer"),
        name,
        original_name: default_text(input.original_name),
        aliases_json: normalize_string_array_json(input.aliases_json),
        status: default_text(input.status),
        debut_date: default_text(input.debut_date),
        retired_date: default_text(input.retired_date),
        birth_date: default_text(input.birth_date),
        gender: default_text(input.gender),
        birthplace: default_text(input.birthplace),
        nationality: default_text(input.nationality),
        blood_type: default_text(input.blood_type),
        height_cm: input.height_cm,
        weight_kg: input.weight_kg,
        measurements: default_text(input.measurements),
        cup_size: default_text(input.cup_size),
        cover_path: default_text(input.cover_path),
        performer_thumbnail_paths_json: normalize_performer_thumbnail_paths_json(
            input.performer_thumbnail_paths_json,
        ),
        filmography_count: input.filmography_count,
        pictorials_count: input.pictorials_count,
        related_videos_json: normalize_related_catalog_records_json(input.related_videos_json),
        related_images_json: normalize_related_catalog_records_json(input.related_images_json),
        source_links_json: normalize_source_links_json(input.source_links_json),
        categories_json: normalize_string_array_json(input.categories_json),
        rating_json: normalize_object_json(input.rating_json),
        notes: default_text(input.notes),
        favorite: input.favorite.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO performers (
                id, name, originalName, aliasesJson, status, debutDate, retiredDate,
                birthDate, gender, birthplace, nationality, bloodType, heightCm, weightKg,
                measurements, cupSize, coverPath, performerThumbnailPathsJson,
                filmographyCount, pictorialsCount, relatedVideosJson,
                relatedImagesJson, source_links_json, categoriesJson, ratingJson,
                notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29)",
            params![
                performer.id,
                performer.name,
                performer.original_name,
                performer.aliases_json,
                performer.status,
                performer.debut_date,
                performer.retired_date,
                performer.birth_date,
                performer.gender,
                performer.birthplace,
                performer.nationality,
                performer.blood_type,
                performer.height_cm,
                performer.weight_kg,
                performer.measurements,
                performer.cup_size,
                performer.cover_path,
                performer.performer_thumbnail_paths_json,
                performer.filmography_count,
                performer.pictorials_count,
                performer.related_videos_json,
                performer.related_images_json,
                performer.source_links_json,
                performer.categories_json,
                performer.rating_json,
                performer.notes,
                bool_to_int(performer.favorite),
                performer.created_at,
                performer.updated_at
            ],
        )
        .map_err(database_error)?;

    get_performer(connection, &performer.id)?
        .ok_or_else(|| "Created performer could not be read".to_string())
}

fn list_performers(connection: &Connection) -> Result<Vec<Performer>, String> {
    let mut statement = connection
        .prepare("SELECT * FROM performers ORDER BY createdAt DESC, name ASC")
        .map_err(database_error)?;
    let rows = statement
        .query_map([], performer_from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    Ok(rows)
}

fn get_performer(connection: &Connection, id: &str) -> Result<Option<Performer>, String> {
    connection
        .query_row(
            "SELECT * FROM performers WHERE id = ?1",
            [id],
            performer_from_row,
        )
        .optional()
        .map_err(database_error)
}

fn update_performer(
    connection: &Connection,
    id: &str,
    patch: PerformerPatch,
) -> Result<Option<Performer>, String> {
    let Some(mut performer) = get_performer(connection, id)? else {
        return Ok(None);
    };

    if let Some(name) = patch.name {
        performer.name = require_text(name, "Performer name is required")?;
    }
    apply_text(&mut performer.original_name, patch.original_name);
    if patch.aliases_json.is_some() {
        performer.aliases_json = normalize_string_array_json(patch.aliases_json);
    }
    apply_text(&mut performer.status, patch.status);
    apply_text(&mut performer.debut_date, patch.debut_date);
    apply_text(&mut performer.retired_date, patch.retired_date);
    apply_text(&mut performer.birth_date, patch.birth_date);
    apply_text(&mut performer.gender, patch.gender);
    apply_text(&mut performer.birthplace, patch.birthplace);
    apply_text(&mut performer.nationality, patch.nationality);
    apply_text(&mut performer.blood_type, patch.blood_type);
    if let Some(height_cm) = patch.height_cm {
        performer.height_cm = height_cm;
    }
    if let Some(weight_kg) = patch.weight_kg {
        performer.weight_kg = weight_kg;
    }
    apply_text(&mut performer.measurements, patch.measurements);
    apply_text(&mut performer.cup_size, patch.cup_size);
    apply_text(&mut performer.cover_path, patch.cover_path);
    if patch.performer_thumbnail_paths_json.is_some() {
        performer.performer_thumbnail_paths_json =
            normalize_performer_thumbnail_paths_json(patch.performer_thumbnail_paths_json);
    }
    if let Some(filmography_count) = patch.filmography_count {
        performer.filmography_count = filmography_count;
    }
    if let Some(pictorials_count) = patch.pictorials_count {
        performer.pictorials_count = pictorials_count;
    }
    if patch.related_videos_json.is_some() {
        performer.related_videos_json =
            normalize_related_catalog_records_json(patch.related_videos_json);
    }
    if patch.related_images_json.is_some() {
        performer.related_images_json =
            normalize_related_catalog_records_json(patch.related_images_json);
    }
    if patch.source_links_json.is_some() {
        performer.source_links_json = normalize_source_links_json(patch.source_links_json);
    }
    if patch.categories_json.is_some() {
        performer.categories_json = normalize_string_array_json(patch.categories_json);
    }
    if patch.rating_json.is_some() {
        performer.rating_json = normalize_object_json(patch.rating_json);
    }
    apply_text(&mut performer.notes, patch.notes);
    if let Some(favorite) = patch.favorite {
        performer.favorite = favorite;
    }
    performer.updated_at = current_timestamp();

    connection
        .execute(
            "UPDATE performers SET
                name = ?2, originalName = ?3, aliasesJson = ?4, status = ?5,
                debutDate = ?6, retiredDate = ?7, birthDate = ?8,
                gender = ?9, birthplace = ?10, nationality = ?11, bloodType = ?12,
                heightCm = ?13, weightKg = ?14, measurements = ?15, cupSize = ?16,
                coverPath = ?17, performerThumbnailPathsJson = ?18,
                filmographyCount = ?19, pictorialsCount = ?20,
                relatedVideosJson = ?21, relatedImagesJson = ?22,
                source_links_json = ?23, categoriesJson = ?24, ratingJson = ?25,
                notes = ?26, favorite = ?27, updatedAt = ?28
            WHERE id = ?1",
            params![
                performer.id,
                performer.name,
                performer.original_name,
                performer.aliases_json,
                performer.status,
                performer.debut_date,
                performer.retired_date,
                performer.birth_date,
                performer.gender,
                performer.birthplace,
                performer.nationality,
                performer.blood_type,
                performer.height_cm,
                performer.weight_kg,
                performer.measurements,
                performer.cup_size,
                performer.cover_path,
                performer.performer_thumbnail_paths_json,
                performer.filmography_count,
                performer.pictorials_count,
                performer.related_videos_json,
                performer.related_images_json,
                performer.source_links_json,
                performer.categories_json,
                performer.rating_json,
                performer.notes,
                bool_to_int(performer.favorite),
                performer.updated_at
            ],
        )
        .map_err(database_error)?;

    get_performer(connection, id)
}

fn create_managed_category(
    connection: &Connection,
    input: ManagedCategoryInput,
) -> Result<ManagedCategory, String> {
    let name = require_text(input.name, "Category name is required")?;
    ensure_unique_managed_category_name(connection, &name, None)?;
    let parent_key = normalize_parent_key(input.parent_key);
    if let Some(parent_key) = &parent_key {
        validate_managed_category_parent(connection, "", Some(parent_key))?;
    }

    let timestamp = current_timestamp();
    let category = ManagedCategory {
        key: input
            .key
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| build_managed_category_key(&name)),
        name,
        parent_key,
        description: default_text(input.description)
            .chars()
            .take(500)
            .collect::<String>(),
        thumbnail_path: default_text(input.thumbnail_path),
        show_in_videos: input.show_in_videos.unwrap_or(true),
        show_in_images: input.show_in_images.unwrap_or(true),
        show_in_performers: input.show_in_performers.unwrap_or(true),
        show_in_credits: input.show_in_credits.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO managedCategories (
                key, name, parentKey, description, thumbnailPath,
                showInVideos, showInImages, showInPerformers, showInCredits, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                category.key,
                category.name,
                category.parent_key,
                category.description,
                category.thumbnail_path,
                category.show_in_videos,
                category.show_in_images,
                category.show_in_performers,
                category.show_in_credits,
                category.created_at,
                category.updated_at
            ],
        )
        .map_err(database_error)?;

    get_managed_category(connection, &category.key)?
        .ok_or_else(|| "Created category could not be read".to_string())
}

fn list_managed_categories(connection: &Connection) -> Result<Vec<ManagedCategory>, String> {
    let mut statement = connection
        .prepare("SELECT * FROM managedCategories ORDER BY name COLLATE NOCASE ASC")
        .map_err(database_error)?;
    let rows = statement
        .query_map([], managed_category_from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    Ok(rows)
}

fn get_managed_category(
    connection: &Connection,
    key: &str,
) -> Result<Option<ManagedCategory>, String> {
    connection
        .query_row(
            "SELECT * FROM managedCategories WHERE key = ?1",
            [key],
            managed_category_from_row,
        )
        .optional()
        .map_err(database_error)
}

fn update_managed_category(
    connection: &Connection,
    key: &str,
    patch: ManagedCategoryPatch,
) -> Result<Option<ManagedCategory>, String> {
    let Some(mut category) = get_managed_category(connection, key)? else {
        return Ok(None);
    };

    if let Some(name) = patch.name {
        category.name = require_text(name, "Category name is required")?;
    }
    ensure_unique_managed_category_name(connection, &category.name, Some(key))?;

    if let Some(parent_key) = patch.parent_key {
        category.parent_key = normalize_parent_key(parent_key);
    }
    validate_managed_category_parent(connection, key, category.parent_key.as_deref())?;

    if let Some(description) = patch.description {
        category.description = description.trim().chars().take(500).collect();
    }
    if let Some(thumbnail_path) = patch.thumbnail_path {
        category.thumbnail_path = thumbnail_path.trim().to_string();
    }
    if let Some(show_in_videos) = patch.show_in_videos {
        category.show_in_videos = show_in_videos;
    }
    if let Some(show_in_images) = patch.show_in_images {
        category.show_in_images = show_in_images;
    }
    if let Some(show_in_performers) = patch.show_in_performers {
        category.show_in_performers = show_in_performers;
    }
    if let Some(show_in_credits) = patch.show_in_credits {
        category.show_in_credits = show_in_credits;
    }
    category.updated_at = current_timestamp();

    connection
        .execute(
            "UPDATE managedCategories SET
                name = ?1, parentKey = ?2, description = ?3, thumbnailPath = ?4,
                showInVideos = ?5, showInImages = ?6, showInPerformers = ?7,
                showInCredits = ?8, updatedAt = ?9
             WHERE key = ?10",
            params![
                category.name,
                category.parent_key,
                category.description,
                category.thumbnail_path,
                category.show_in_videos,
                category.show_in_images,
                category.show_in_performers,
                category.show_in_credits,
                category.updated_at,
                key
            ],
        )
        .map_err(database_error)?;

    get_managed_category(connection, key)
}

fn delete_managed_category_if_unused(
    connection: &Connection,
    key: String,
) -> Result<ManagedCategoryDeleteResult, String> {
    let Some(category) = get_managed_category(connection, &key)? else {
        return Err("Managed category was not found".to_string());
    };

    let child_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM managedCategories WHERE parentKey = ?1",
            [&key],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if child_count > 0 {
        return Err("Category cannot be deleted while it has child categories.".to_string());
    }

    if category_usage_count(connection, &category.key, &category.name)? > 0 {
        return Err("Category cannot be deleted while records use it.".to_string());
    }

    let deleted = connection
        .execute("DELETE FROM managedCategories WHERE key = ?1", [&key])
        .map_err(database_error)?
        > 0;

    Ok(ManagedCategoryDeleteResult { key, deleted })
}

fn delete_row(
    connection: &Connection,
    table_name: &str,
    id: String,
) -> Result<DeleteResult, String> {
    let statement = match table_name {
        "videos" => "DELETE FROM videos WHERE id = ?1",
        "images" => "DELETE FROM images WHERE id = ?1",
        "performers" => "DELETE FROM performers WHERE id = ?1",
        _ => return Err("Unsupported table".to_string()),
    };
    let deleted = connection
        .execute(statement, [&id])
        .map_err(database_error)?
        > 0;

    Ok(DeleteResult { id, deleted })
}

fn create_glossary_entry(
    connection: &Connection,
    input: GlossaryEntryInput,
) -> Result<GlossaryEntry, String> {
    let term = require_text(input.term, "Glossary term is required")?;
    let definition = require_text(input.definition, "Glossary definition is required")?;
    let source_url = normalize_source_url(input.source_url)?;
    let parent_id = normalize_glossary_parent_id(connection, "", input.parent_id)?;
    let timestamp = current_timestamp_i64();
    let entry = GlossaryEntry {
        id: new_id("glossary"),
        term,
        definition,
        synonyms_json: normalize_string_array_json(input.synonyms_json),
        category: default_text(input.category),
        parent_id,
        thumbnail_path: default_text(input.thumbnail_path),
        favorite: input.favorite.unwrap_or(false),
        source_title: default_text(input.source_title),
        source_url,
        created_at: timestamp,
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO glossary_entries (
                id, term, definition, synonyms_json, category, parent_id,
                thumbnail_path, favorite, source_title, source_url,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                entry.id,
                entry.term,
                entry.definition,
                entry.synonyms_json,
                entry.category,
                entry.parent_id,
                entry.thumbnail_path,
                bool_to_int(entry.favorite),
                entry.source_title,
                entry.source_url,
                entry.created_at,
                entry.updated_at
            ],
        )
        .map_err(database_error)?;

    get_glossary_entry(connection, &entry.id)?
        .ok_or_else(|| "Created glossary entry could not be read".to_string())
}

fn list_glossary_entries(connection: &Connection) -> Result<Vec<GlossaryEntry>, String> {
    let mut statement = connection
        .prepare("SELECT * FROM glossary_entries ORDER BY updated_at DESC, term ASC")
        .map_err(database_error)?;
    let rows = statement
        .query_map([], glossary_entry_from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    Ok(rows)
}

fn get_glossary_entry(connection: &Connection, id: &str) -> Result<Option<GlossaryEntry>, String> {
    connection
        .query_row(
            "SELECT * FROM glossary_entries WHERE id = ?1",
            [id],
            glossary_entry_from_row,
        )
        .optional()
        .map_err(database_error)
}

fn normalize_glossary_parent_id(
    connection: &Connection,
    entry_id: &str,
    parent_id: Option<String>,
) -> Result<String, String> {
    let parent_id = default_text(parent_id);
    if parent_id.is_empty() {
        return Ok(String::new());
    }
    if !entry_id.is_empty() && parent_id == entry_id {
        return Err("A glossary entry cannot use itself as parent.".to_string());
    }

    get_glossary_entry(connection, &parent_id)?
        .ok_or_else(|| "Parent glossary entry could not be found.".to_string())?;

    let mut next_parent_id = parent_id.clone();
    while !next_parent_id.is_empty() {
        if next_parent_id == entry_id {
            return Err("Parent glossary entry would create a circular hierarchy.".to_string());
        }
        let Some(next_parent) = get_glossary_entry(connection, &next_parent_id)? else {
            break;
        };
        next_parent_id = next_parent.parent_id;
    }

    Ok(parent_id)
}

fn glossary_child_count(connection: &Connection, id: &str) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM glossary_entries WHERE parent_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(database_error)
}

fn update_glossary_entry(
    connection: &Connection,
    id: &str,
    patch: GlossaryEntryPatch,
) -> Result<Option<GlossaryEntry>, String> {
    let Some(mut entry) = get_glossary_entry(connection, id)? else {
        return Ok(None);
    };

    if let Some(term) = patch.term {
        entry.term = require_text(term, "Glossary term is required")?;
    }
    if let Some(definition) = patch.definition {
        entry.definition = require_text(definition, "Glossary definition is required")?;
    }
    if patch.synonyms_json.is_some() {
        entry.synonyms_json = normalize_string_array_json(patch.synonyms_json);
    }
    apply_text(&mut entry.category, patch.category);
    if patch.parent_id.is_some() {
        entry.parent_id = normalize_glossary_parent_id(connection, id, patch.parent_id)?;
    }
    apply_text(&mut entry.thumbnail_path, patch.thumbnail_path);
    if let Some(favorite) = patch.favorite {
        entry.favorite = favorite;
    }
    apply_text(&mut entry.source_title, patch.source_title);
    if patch.source_url.is_some() {
        entry.source_url = normalize_source_url(patch.source_url)?;
    }
    entry.updated_at = current_timestamp_i64();

    connection
        .execute(
            "UPDATE glossary_entries SET
                term = ?2, definition = ?3, synonyms_json = ?4, category = ?5,
                parent_id = ?6, thumbnail_path = ?7, favorite = ?8,
                source_title = ?9, source_url = ?10, updated_at = ?11
             WHERE id = ?1",
            params![
                entry.id,
                entry.term,
                entry.definition,
                entry.synonyms_json,
                entry.category,
                entry.parent_id,
                entry.thumbnail_path,
                bool_to_int(entry.favorite),
                entry.source_title,
                entry.source_url,
                entry.updated_at
            ],
        )
        .map_err(database_error)?;

    get_glossary_entry(connection, id)
}

fn check_path_status(path: &str) -> PathStatusResult {
    let trimmed = path.trim();

    if trimmed.is_empty() {
        return PathStatusResult {
            path: String::new(),
            status: PathStatusKind::NotSet,
            kind: PathKind::Unknown,
            message: "Path is not set".to_string(),
        };
    }

    match fs::metadata(trimmed) {
        Ok(metadata) => {
            let kind = if metadata.is_file() {
                PathKind::File
            } else if metadata.is_dir() {
                PathKind::Folder
            } else {
                PathKind::Unknown
            };

            PathStatusResult {
                path: trimmed.to_string(),
                status: PathStatusKind::Exists,
                kind,
                message: "Path exists".to_string(),
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => PathStatusResult {
            path: trimmed.to_string(),
            status: PathStatusKind::Missing,
            kind: PathKind::Unknown,
            message: "Path does not exist".to_string(),
        },
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => PathStatusResult {
            path: trimmed.to_string(),
            status: PathStatusKind::Inaccessible,
            kind: PathKind::Unknown,
            message: "Path is inaccessible".to_string(),
        },
        Err(_) => PathStatusResult {
            path: trimmed.to_string(),
            status: PathStatusKind::Unknown,
            kind: PathKind::Unknown,
            message: "Path status could not be checked".to_string(),
        },
    }
}

fn probe_media_metadata(path: &str) -> MediaMetadataProbeResult {
    let status = check_path_status(path);
    if status.status != PathStatusKind::Exists || status.kind != PathKind::File {
        return MediaMetadataProbeResult {
            path: status.path,
            status: status.status,
            kind: status.kind,
            file_size_bytes: None,
            file_type: String::new(),
            duration_minutes: None,
            width: None,
            height: None,
            resolution: None,
            message: status.message,
        };
    }

    let file_size_bytes = fs::metadata(&status.path)
        .ok()
        .and_then(|metadata| i64::try_from(metadata.len()).ok());
    let file_type = file_type_from_path(Path::new(&status.path));
    let path = Path::new(&status.path);
    let image_dimensions = image_dimensions_from_path(path).unwrap_or((None, None));
    let video_properties = video_shell_properties_from_path(path);
    let duration_minutes = video_properties.duration_minutes;
    let width = image_dimensions.0.or(video_properties.width);
    let height = image_dimensions.1.or(video_properties.height);
    let resolution = resolution_text_from_dimensions(width, height);

    MediaMetadataProbeResult {
        path: status.path,
        status: status.status,
        kind: status.kind,
        file_size_bytes,
        file_type,
        duration_minutes,
        width,
        height,
        resolution,
        message: "Metadata checked".to_string(),
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct VideoShellProperties {
    duration_minutes: Option<i64>,
    width: Option<i64>,
    height: Option<i64>,
}

fn resolution_text_from_dimensions(width: Option<i64>, height: Option<i64>) -> Option<String> {
    match (width, height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => Some(format!("{width}x{height}")),
        _ => None,
    }
}

fn duration_minutes_from_100ns(duration_100ns: u64) -> Option<i64> {
    if duration_100ns == 0 {
        return None;
    }

    const ONE_MINUTE_100NS: u64 = 600_000_000;
    let rounded_up = duration_100ns.checked_add(ONE_MINUTE_100NS - 1)? / ONE_MINUTE_100NS;
    i64::try_from(rounded_up)
        .ok()
        .filter(|minutes| *minutes > 0)
}

fn is_supported_video_metadata_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase)
            .as_deref(),
        Some("mp4" | "m4v" | "mov" | "wmv" | "avi" | "mkv" | "webm")
    )
}

#[cfg(not(target_os = "windows"))]
fn video_shell_properties_from_path(_path: &Path) -> VideoShellProperties {
    VideoShellProperties::default()
}

#[cfg(target_os = "windows")]
fn video_shell_properties_from_path(path: &Path) -> VideoShellProperties {
    if !is_supported_video_metadata_path(path) {
        return VideoShellProperties::default();
    }

    read_windows_shell_video_properties(path).unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn read_windows_shell_video_properties(path: &Path) -> Option<VideoShellProperties> {
    let _com = ComApartment::initialize()?;
    let wide_path = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    // This is the only Shell/COM boundary in metadata probing. It opens a
    // read-only property store for one explicit file path and reads scalar
    // media properties; it never writes or commits property values.
    let store: IPropertyStore = unsafe {
        SHGetPropertyStoreFromParsingName(
            PCWSTR(wide_path.as_ptr()),
            None::<&IBindCtx>,
            GPS_DEFAULT,
        )
        .ok()?
    };

    let duration_minutes =
        read_u64_property(&store, &PKEY_Media_Duration).and_then(duration_minutes_from_100ns);
    let width = read_u32_property(&store, &PKEY_Video_FrameWidth)
        .and_then(|value| i64::try_from(value).ok())
        .filter(|value| *value > 0);
    let height = read_u32_property(&store, &PKEY_Video_FrameHeight)
        .and_then(|value| i64::try_from(value).ok())
        .filter(|value| *value > 0);

    Some(VideoShellProperties {
        duration_minutes,
        width,
        height,
    })
}

#[cfg(target_os = "windows")]
struct ComApartment {
    should_uninitialize: bool,
}

#[cfg(target_os = "windows")]
impl ComApartment {
    fn initialize() -> Option<Self> {
        let flags = COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE;
        // COM initialization is required before opening the Windows Shell
        // property store. If the thread is already initialized with another
        // model, keep using that existing apartment and avoid CoUninitialize.
        let result = unsafe { CoInitializeEx(None, flags) };
        if result == S_OK || result == S_FALSE {
            return Some(Self {
                should_uninitialize: true,
            });
        }

        if result == RPC_E_CHANGED_MODE {
            return Some(Self {
                should_uninitialize: false,
            });
        }

        None
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComApartment {
    fn drop(&mut self) {
        if self.should_uninitialize {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn read_u64_property(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<u64> {
    let mut value = unsafe { store.GetValue(key).ok()? };
    let converted = unsafe { PropVariantToUInt64(&value).ok() };
    clear_prop_variant(&mut value);
    converted.filter(|value| *value > 0)
}

#[cfg(target_os = "windows")]
fn read_u32_property(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<u32> {
    let mut value = unsafe { store.GetValue(key).ok()? };
    let converted = unsafe { PropVariantToUInt32(&value).ok() };
    clear_prop_variant(&mut value);
    converted.filter(|value| *value > 0)
}

#[cfg(target_os = "windows")]
fn clear_prop_variant(value: &mut PROPVARIANT) {
    let _ = unsafe { PropVariantClear(value) };
}

fn file_type_from_path(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.trim().to_uppercase())
        .filter(|extension| !extension.is_empty())
        .unwrap_or_default()
}

fn image_dimensions_from_path(path: &Path) -> Result<(Option<i64>, Option<i64>), String> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_lowercase)
        .unwrap_or_default();
    if !matches!(extension.as_str(), "png" | "gif" | "jpg" | "jpeg" | "webp") {
        return Ok((None, None));
    }

    let bytes = read_file_prefix(path, 512 * 1024)?;
    let dimensions = match extension.as_str() {
        "png" => png_dimensions(&bytes),
        "gif" => gif_dimensions(&bytes),
        "jpg" | "jpeg" => jpeg_dimensions(&bytes),
        "webp" => webp_dimensions(&bytes),
        _ => None,
    };

    Ok(dimensions
        .map(|(width, height)| (Some(width), Some(height)))
        .unwrap_or((None, None)))
}

fn read_file_prefix(path: &Path, max_bytes: usize) -> Result<Vec<u8>, String> {
    use std::io::Read;

    let mut file =
        fs::File::open(path).map_err(|_| "Image dimensions could not be read".to_string())?;
    let mut bytes = Vec::new();
    file.by_ref()
        .take(max_bytes as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Image dimensions could not be read".to_string())?;
    Ok(bytes)
}

fn png_dimensions(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() < 24 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }

    Some((
        u32::from_be_bytes(bytes[16..20].try_into().ok()?) as i64,
        u32::from_be_bytes(bytes[20..24].try_into().ok()?) as i64,
    ))
}

fn gif_dimensions(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() < 10 || (&bytes[0..6] != b"GIF87a" && &bytes[0..6] != b"GIF89a") {
        return None;
    }

    Some((
        u16::from_le_bytes(bytes[6..8].try_into().ok()?) as i64,
        u16::from_le_bytes(bytes[8..10].try_into().ok()?) as i64,
    ))
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }

    let mut index = 2usize;
    while index + 9 < bytes.len() {
        if bytes[index] != 0xFF {
            index += 1;
            continue;
        }

        while index < bytes.len() && bytes[index] == 0xFF {
            index += 1;
        }
        if index >= bytes.len() {
            return None;
        }

        let marker = bytes[index];
        index += 1;
        if marker == 0xD9 || marker == 0xDA {
            return None;
        }
        if index + 2 > bytes.len() {
            return None;
        }

        let segment_length = u16::from_be_bytes(bytes[index..index + 2].try_into().ok()?) as usize;
        if segment_length < 2 || index + segment_length > bytes.len() {
            return None;
        }

        if matches!(
            marker,
            0xC0 | 0xC1
                | 0xC2
                | 0xC3
                | 0xC5
                | 0xC6
                | 0xC7
                | 0xC9
                | 0xCA
                | 0xCB
                | 0xCD
                | 0xCE
                | 0xCF
        ) {
            if index + 7 > bytes.len() {
                return None;
            }
            let height = u16::from_be_bytes(bytes[index + 3..index + 5].try_into().ok()?) as i64;
            let width = u16::from_be_bytes(bytes[index + 5..index + 7].try_into().ok()?) as i64;
            return Some((width, height));
        }

        index += segment_length;
    }

    None
}

fn webp_dimensions(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() < 30 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }

    match &bytes[12..16] {
        b"VP8 " if bytes.len() >= 30 => Some((
            (u16::from_le_bytes(bytes[26..28].try_into().ok()?) & 0x3fff) as i64,
            (u16::from_le_bytes(bytes[28..30].try_into().ok()?) & 0x3fff) as i64,
        )),
        b"VP8L" if bytes.len() >= 25 => {
            let b0 = bytes[21] as u32;
            let b1 = bytes[22] as u32;
            let b2 = bytes[23] as u32;
            let b3 = bytes[24] as u32;
            Some((
                (((b1 & 0x3f) << 8) | b0) as i64 + 1,
                (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) as i64 + 1,
            ))
        }
        b"VP8X" if bytes.len() >= 30 => Some((
            1 + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]) as i64,
            1 + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]) as i64,
        )),
        _ => None,
    }
}

fn validate_media_open_file_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();

    if trimmed.is_empty() {
        return Err("Media path is required".to_string());
    }

    let metadata = fs::metadata(trimmed).map_err(|error| match error.kind() {
        io::ErrorKind::NotFound => "Media file does not exist".to_string(),
        io::ErrorKind::PermissionDenied => "Media file is inaccessible".to_string(),
        _ => "Media file could not be checked".to_string(),
    })?;

    if !metadata.is_file() {
        return Err("Media path must be a file".to_string());
    }

    Ok(PathBuf::from(trimmed))
}

fn create_credit(connection: &Connection, input: CreditInput) -> Result<Credit, String> {
    let work_type = validate_credit_choice(input.work_type, &["video", "image"], "workType")?;
    let work_id = require_text(input.work_id, "Credit workId is required")?;
    let performer_id = require_text(input.performer_id, "Credit performerId is required")?;
    let credited_as_mode = validate_credit_choice(
        input.credited_as_mode.unwrap_or_else(|| "auto".to_string()),
        &["auto", "custom"],
        "creditedAsMode",
    )?;
    let character_mode = validate_credit_choice(
        input.character_mode.unwrap_or_else(|| "text".to_string()),
        &["text", "self", "linked"],
        "characterMode",
    )?;
    let timestamp = current_timestamp();
    let credit = Credit {
        id: new_id("credit"),
        work_type,
        work_id,
        performer_id,
        character_name: default_text(input.character_name),
        character_original_name: normalize_optional_text(input.character_original_name),
        credited_as: normalize_optional_text(input.credited_as),
        credited_as_mode,
        credit_type_category_id: normalize_optional_text(input.credit_type_category_id),
        role_importance_category_id: normalize_optional_text(input.role_importance_category_id),
        character_mode,
        character_id: normalize_optional_text(input.character_id),
        billing_order: input.billing_order,
        note: normalize_optional_text(input.note),
        legacy_source_key: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    connection
        .execute(
            "INSERT INTO credits (
                id, workType, workId, performerId, characterName, characterOriginalName,
                creditedAs, creditedAsMode, creditTypeCategoryId, roleImportanceCategoryId,
                characterMode, characterId, billingOrder, note, legacySourceKey,
                createdAt, updatedAt
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                credit.id,
                credit.work_type,
                credit.work_id,
                credit.performer_id,
                credit.character_name,
                credit.character_original_name,
                credit.credited_as,
                credit.credited_as_mode,
                credit.credit_type_category_id,
                credit.role_importance_category_id,
                credit.character_mode,
                credit.character_id,
                credit.billing_order,
                credit.note,
                credit.legacy_source_key,
                credit.created_at,
                credit.updated_at
            ],
        )
        .map_err(database_error)?;
    get_credit(connection, &credit.id)?
        .ok_or_else(|| "Created credit could not be read".to_string())
}

fn list_credits(connection: &Connection) -> Result<Vec<Credit>, String> {
    query_credits(
        connection,
        "SELECT * FROM credits ORDER BY createdAt ASC, id ASC",
        [],
    )
}

fn get_credit(connection: &Connection, id: &str) -> Result<Option<Credit>, String> {
    connection
        .query_row("SELECT * FROM credits WHERE id = ?1", [id], credit_from_row)
        .optional()
        .map_err(database_error)
}

fn update_credit(
    connection: &Connection,
    id: &str,
    patch: CreditPatch,
) -> Result<Option<Credit>, String> {
    let Some(mut credit) = get_credit(connection, id)? else {
        return Ok(None);
    };
    if let Some(value) = patch.work_type {
        credit.work_type = validate_credit_choice(value, &["video", "image"], "workType")?;
    }
    if let Some(value) = patch.work_id {
        credit.work_id = require_text(value, "Credit workId is required")?;
    }
    if let Some(value) = patch.performer_id {
        credit.performer_id = require_text(value, "Credit performerId is required")?;
    }
    if let Some(value) = patch.character_name {
        credit.character_name = value.trim().to_string();
    }
    if let Some(value) = patch.character_original_name {
        credit.character_original_name = normalize_optional_text(value);
    }
    if let Some(value) = patch.credited_as {
        credit.credited_as = normalize_optional_text(value);
    }
    if let Some(value) = patch.credited_as_mode {
        credit.credited_as_mode =
            validate_credit_choice(value, &["auto", "custom"], "creditedAsMode")?;
    }
    if let Some(value) = patch.credit_type_category_id {
        credit.credit_type_category_id = normalize_optional_text(value);
    }
    if let Some(value) = patch.role_importance_category_id {
        credit.role_importance_category_id = normalize_optional_text(value);
    }
    if let Some(value) = patch.character_mode {
        credit.character_mode =
            validate_credit_choice(value, &["text", "self", "linked"], "characterMode")?;
    }
    if let Some(value) = patch.character_id {
        credit.character_id = normalize_optional_text(value);
    }
    if let Some(value) = patch.billing_order {
        credit.billing_order = value;
    }
    if let Some(value) = patch.note {
        credit.note = normalize_optional_text(value);
    }
    credit.updated_at = current_timestamp();
    connection
        .execute(
            "UPDATE credits SET workType = ?1, workId = ?2, performerId = ?3,
                characterName = ?4, characterOriginalName = ?5, creditedAs = ?6,
                creditedAsMode = ?7, creditTypeCategoryId = ?8,
                roleImportanceCategoryId = ?9, characterMode = ?10, characterId = ?11,
                billingOrder = ?12, note = ?13, updatedAt = ?14 WHERE id = ?15",
            params![
                credit.work_type,
                credit.work_id,
                credit.performer_id,
                credit.character_name,
                credit.character_original_name,
                credit.credited_as,
                credit.credited_as_mode,
                credit.credit_type_category_id,
                credit.role_importance_category_id,
                credit.character_mode,
                credit.character_id,
                credit.billing_order,
                credit.note,
                credit.updated_at,
                id
            ],
        )
        .map_err(database_error)?;
    get_credit(connection, id)
}

fn delete_credit(connection: &Connection, id: String) -> Result<DeleteResult, String> {
    let deleted = connection
        .execute("DELETE FROM credits WHERE id = ?1", [&id])
        .map_err(database_error)?
        > 0;
    Ok(DeleteResult { id, deleted })
}

fn list_credits_by_work(
    connection: &Connection,
    work_type: &str,
    work_id: &str,
) -> Result<Vec<Credit>, String> {
    let work_type = validate_credit_choice(work_type.to_string(), &["video", "image"], "workType")?;
    let work_id = require_text(work_id.to_string(), "Credit workId is required")?;
    query_credits(
        connection,
        "SELECT * FROM credits WHERE workType = ?1 AND workId = ?2 ORDER BY billingOrder ASC, createdAt ASC, id ASC",
        params![work_type, work_id],
    )
}

fn list_credits_by_performer(
    connection: &Connection,
    performer_id: &str,
) -> Result<Vec<Credit>, String> {
    let performer_id = require_text(performer_id.to_string(), "Credit performerId is required")?;
    query_credits(
        connection,
        "SELECT * FROM credits WHERE performerId = ?1 ORDER BY createdAt ASC, id ASC",
        [performer_id],
    )
}

fn query_credits<P: rusqlite::Params>(
    connection: &Connection,
    sql: &str,
    params: P,
) -> Result<Vec<Credit>, String> {
    let mut statement = connection.prepare(sql).map_err(database_error)?;
    let credits = statement
        .query_map(params, credit_from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    Ok(credits)
}

fn validate_credit_choice(value: String, allowed: &[&str], field: &str) -> Result<String, String> {
    let value = value.trim().to_lowercase();
    if allowed.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(format!("Credit {field} is invalid"))
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn copy_detail_source_file_as(
    source_path: &str,
    destination_path: &str,
) -> Result<DetailFileActionResult, String> {
    let source = validate_detail_source_file_path(source_path)?;
    let destination = validate_detail_destination_file_path(destination_path)?;

    if paths_refer_to_same_file(&source, &destination) {
        return Err("Destination must be different from the source file".to_string());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "Destination folder could not be prepared".to_string())?;
    }

    fs::copy(&source, &destination).map_err(|_| "Source file could not be saved".to_string())?;

    Ok(DetailFileActionResult {
        source_path: source.display().to_string(),
        destination_path: Some(destination.display().to_string()),
        folder_path: None,
        success: true,
        message: "Source file saved".to_string(),
    })
}

fn validate_detail_source_file_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();

    if trimmed.is_empty() {
        return Err("Source file path is required".to_string());
    }

    let metadata = fs::metadata(trimmed).map_err(|error| match error.kind() {
        io::ErrorKind::NotFound => "Source file does not exist".to_string(),
        io::ErrorKind::PermissionDenied => "Source file is inaccessible".to_string(),
        _ => "Source file could not be checked".to_string(),
    })?;

    if !metadata.is_file() {
        return Err("Source path must be a file".to_string());
    }

    Ok(PathBuf::from(trimmed))
}

fn validate_detail_destination_file_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();

    if trimmed.is_empty() {
        return Err("Destination path is required".to_string());
    }

    let destination = PathBuf::from(trimmed);
    if destination.is_dir() {
        return Err("Destination must be a file path".to_string());
    }

    Ok(destination)
}

fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

#[cfg(target_os = "windows")]
fn reveal_detail_source_folder(path: &Path) -> Result<(), String> {
    const SW_SHOWNORMAL: i32 = 1;

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }

    let explorer = wide_null("explorer.exe");
    let parameters = wide_null(&format!("/select,\"{}\"", path.display()));

    let result = unsafe {
        ShellExecuteW(
            0,
            std::ptr::null(),
            explorer.as_ptr(),
            parameters.as_ptr(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    if result <= 32 {
        return Err("Source folder could not be opened".to_string());
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn reveal_detail_source_folder(_path: &Path) -> Result<(), String> {
    Err("Source folder open is unavailable on this platform".to_string())
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn write_export_csv_file(
    destination_path: &str,
    csv_content: &str,
) -> Result<ExportCsvWriteResult, String> {
    let destination_path = validate_export_csv_destination(destination_path)?;
    fs::write(&destination_path, csv_content)
        .map_err(|error| format!("CSV export could not be written: {error}"))?;

    Ok(ExportCsvWriteResult {
        destination_path: destination_path.display().to_string(),
        bytes_written: csv_content.len(),
        success: true,
    })
}

fn read_import_csv_file(source_path: &str) -> Result<ImportCsvReadResult, String> {
    let source_path = validate_import_csv_source(source_path)?;
    let csv_content = fs::read_to_string(&source_path)
        .map_err(|error| format!("CSV import file could not be read: {error}"))?;

    Ok(ImportCsvReadResult {
        source_path: source_path.display().to_string(),
        bytes_read: csv_content.len(),
        csv_content,
        success: true,
    })
}

fn validate_export_csv_destination(destination_path: &str) -> Result<PathBuf, String> {
    let trimmed = destination_path.trim();
    if trimmed.is_empty() {
        return Err("Export destination path is required".to_string());
    }

    let path = PathBuf::from(trimmed);
    if path.exists() && path.is_dir() {
        return Err("Export destination must be a file path".to_string());
    }

    Ok(path)
}

fn validate_import_csv_source(source_path: &str) -> Result<PathBuf, String> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        return Err("Import source path is required".to_string());
    }

    let path = PathBuf::from(trimmed);
    let metadata = fs::metadata(&path).map_err(|error| match error.kind() {
        io::ErrorKind::NotFound => "Import source file does not exist".to_string(),
        io::ErrorKind::PermissionDenied => "Import source file is inaccessible".to_string(),
        _ => "Import source file could not be checked".to_string(),
    })?;

    if !metadata.is_file() {
        return Err("Import source must be a CSV file path".to_string());
    }

    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("csv") {
        return Err("Import source must be a CSV file".to_string());
    }

    Ok(path)
}

#[cfg(target_os = "windows")]
fn open_media_file_with_default_app(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    const SW_SHOWNORMAL: i32 = 1;

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }

    let file_path: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let result = unsafe {
        ShellExecuteW(
            0,
            std::ptr::null(),
            file_path.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    if result <= 32 {
        return Err("Media file could not be opened".to_string());
    }

    Ok(())
}

fn validate_source_link_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    let remainder = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .ok_or_else(|| "Source Link URL must use http or https".to_string())?;
    let authority = remainder.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.chars().any(char::is_whitespace) {
        return Err("Source Link URL is invalid".to_string());
    }
    Ok(trimmed.to_string())
}

#[cfg(target_os = "windows")]
fn open_url_with_default_browser(url: &str) -> Result<(), String> {
    const SW_SHOWNORMAL: i32 = 1;

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }

    let wide_url = wide_null(url);
    let result = unsafe {
        ShellExecuteW(
            0,
            std::ptr::null(),
            wide_url.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    if result <= 32 {
        return Err("Source Link could not be opened".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn open_url_with_default_browser(_url: &str) -> Result<(), String> {
    Err("Source Link open is unavailable on this platform".to_string())
}

#[cfg(not(target_os = "windows"))]
fn open_media_file_with_default_app(_path: &Path) -> Result<(), String> {
    Err("Media file open is unavailable on this platform".to_string())
}

fn validate_media_asset_root(root_path: &str) -> Result<PathBuf, String> {
    let trimmed = root_path.trim();
    if trimmed.is_empty() {
        return Err("Media asset root path is required".to_string());
    }

    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Err("Media asset root folder does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Media asset root must be a folder".to_string());
    }
    if is_filesystem_root(&path) {
        return Err("Media asset root cannot be a drive or filesystem root".to_string());
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("Unable to resolve media asset root: {error}"))?;
    if is_filesystem_root(&canonical_path) {
        return Err("Media asset root cannot be a drive or filesystem root".to_string());
    }

    Ok(canonical_path)
}

fn is_filesystem_root(path: &Path) -> bool {
    path.parent().is_none()
}

fn video_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Video> {
    Ok(Video {
        id: row.get("id")?,
        title: row.get("title")?,
        original_title: row.get("originalTitle")?,
        code: row.get("code")?,
        censorship: row.get("censorship")?,
        availability: row.get("availability")?,
        release_date: row.get("releaseDate")?,
        duration_minutes: row.get("durationMinutes")?,
        resolution: row.get("resolution")?,
        file_size_bytes: row.get("fileSizeBytes")?,
        file_type: row.get("fileType")?,
        publisher_label: row.get("publisherLabel")?,
        cover_path: row.get("coverPath")?,
        media_path: row.get("mediaPath")?,
        categories_json: row.get("categoriesJson")?,
        related_performers_json: row.get("relatedPerformersJson")?,
        related_images_json: row.get("relatedImagesJson")?,
        source_links_json: row.get("source_links_json")?,
        rating_json: row.get("ratingJson")?,
        notes: row.get("notes")?,
        favorite: int_to_bool(row.get("favorite")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn image_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Image> {
    Ok(Image {
        id: row.get("id")?,
        title: row.get("title")?,
        original_title: row.get("originalTitle")?,
        code: row.get("code")?,
        censorship: row.get("censorship")?,
        availability: row.get("availability")?,
        release_date: row.get("releaseDate")?,
        publisher_label: row.get("publisherLabel")?,
        cover_path: row.get("coverPath")?,
        folder_path: row.get("folderPath")?,
        image_count: row.get("imageCount")?,
        main_resolution: row.get("mainResolution")?,
        total_file_size_bytes: row.get("totalFileSizeBytes")?,
        main_file_type: row.get("mainFileType")?,
        gallery_image_paths_json: row.get("galleryImagePathsJson")?,
        categories_json: row.get("categoriesJson")?,
        related_performers_json: row.get("relatedPerformersJson")?,
        related_videos_json: row.get("relatedVideosJson")?,
        source_links_json: row.get("source_links_json")?,
        rating_json: row.get("ratingJson")?,
        notes: row.get("notes")?,
        favorite: int_to_bool(row.get("favorite")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn performer_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Performer> {
    Ok(Performer {
        id: row.get("id")?,
        name: row.get("name")?,
        original_name: row.get("originalName")?,
        aliases_json: row.get("aliasesJson")?,
        status: row.get("status")?,
        debut_date: row.get("debutDate")?,
        retired_date: row.get("retiredDate")?,
        birth_date: row.get("birthDate")?,
        gender: row.get("gender")?,
        birthplace: row.get("birthplace")?,
        nationality: row.get("nationality")?,
        blood_type: row.get("bloodType")?,
        height_cm: row.get("heightCm")?,
        weight_kg: row.get("weightKg")?,
        measurements: row.get("measurements")?,
        cup_size: row.get("cupSize")?,
        cover_path: row.get("coverPath")?,
        performer_thumbnail_paths_json: row.get("performerThumbnailPathsJson")?,
        filmography_count: row.get("filmographyCount")?,
        pictorials_count: row.get("pictorialsCount")?,
        related_videos_json: row.get("relatedVideosJson")?,
        related_images_json: row.get("relatedImagesJson")?,
        source_links_json: row.get("source_links_json")?,
        categories_json: row.get("categoriesJson")?,
        rating_json: row.get("ratingJson")?,
        notes: row.get("notes")?,
        favorite: int_to_bool(row.get("favorite")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn managed_category_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ManagedCategory> {
    Ok(ManagedCategory {
        key: row.get("key")?,
        name: row.get("name")?,
        parent_key: row.get("parentKey")?,
        description: row.get("description")?,
        thumbnail_path: row.get("thumbnailPath")?,
        show_in_videos: row.get("showInVideos")?,
        show_in_images: row.get("showInImages")?,
        show_in_performers: row.get("showInPerformers")?,
        show_in_credits: row.get("showInCredits")?,
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn glossary_entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GlossaryEntry> {
    Ok(GlossaryEntry {
        id: row.get("id")?,
        term: row.get("term")?,
        definition: row.get("definition")?,
        synonyms_json: row.get("synonyms_json")?,
        category: row.get("category")?,
        parent_id: row.get("parent_id")?,
        thumbnail_path: row.get("thumbnail_path")?,
        favorite: int_to_bool(row.get("favorite")?),
        source_title: row.get("source_title")?,
        source_url: row.get("source_url")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn require_text(value: String, message: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(message.to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_parent_key(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn ensure_unique_managed_category_name(
    connection: &Connection,
    name: &str,
    current_key: Option<&str>,
) -> Result<(), String> {
    let existing: Option<String> = connection
        .query_row(
            "SELECT key FROM managedCategories WHERE lower(name) = lower(?1)",
            [name],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;

    if let Some(existing_key) = existing {
        if current_key != Some(existing_key.as_str()) {
            return Err("That category name already exists.".to_string());
        }
    }

    Ok(())
}

fn validate_managed_category_parent(
    connection: &Connection,
    key: &str,
    parent_key: Option<&str>,
) -> Result<(), String> {
    let Some(parent_key) = parent_key else {
        return Ok(());
    };

    if !key.is_empty() && parent_key == key {
        return Err("A category cannot be its own parent.".to_string());
    }

    let parent = get_managed_category(connection, parent_key)?
        .ok_or_else(|| "Parent category could not be found.".to_string())?;
    if parent.parent_key.is_some() {
        return Err("Only categories with No Parent can be selected as a parent.".to_string());
    }

    if !key.is_empty() && managed_category_child_count(connection, key)? > 0 {
        return Err("A category with child categories must stay at No Parent.".to_string());
    }

    let mut next_parent_key = Some(parent_key.to_string());
    let mut visited: Vec<String> = Vec::new();

    while let Some(parent) = next_parent_key {
        if parent == key || visited.iter().any(|item| item == &parent) {
            return Err("Parent category would create a circular hierarchy.".to_string());
        }
        visited.push(parent.clone());
        next_parent_key = connection
            .query_row(
                "SELECT parentKey FROM managedCategories WHERE key = ?1",
                [&parent],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?
            .flatten();
    }

    Ok(())
}

fn managed_category_child_count(connection: &Connection, key: &str) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM managedCategories WHERE parentKey = ?1",
            [key],
            |row| row.get(0),
        )
        .map_err(database_error)
}

fn category_usage_count(
    connection: &Connection,
    category_key: &str,
    category_name: &str,
) -> Result<i64, String> {
    let target = category_name.trim().to_lowercase();
    let mut total = 0;

    for table_name in ["videos", "images", "performers"] {
        let mut statement = connection
            .prepare(&format!("SELECT categoriesJson FROM {table_name}"))
            .map_err(database_error)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(database_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error)?;

        for categories_json in rows {
            if parse_text_label_array(&categories_json)
                .iter()
                .any(|label| label.trim().to_lowercase() == target)
            {
                total += 1;
            }
        }
    }

    total += connection
        .query_row(
            "SELECT COUNT(*) FROM credits
             WHERE creditTypeCategoryId = ?1 OR roleImportanceCategoryId = ?1",
            [category_key],
            |row| row.get::<_, i64>(0),
        )
        .map_err(database_error)?;

    Ok(total)
}

fn parse_text_label_array(value: &str) -> Vec<String> {
    let parsed: Value = match serde_json::from_str(value) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    parsed
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|value| value.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn build_managed_category_key(name: &str) -> String {
    let slug = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let slug = if slug.is_empty() {
        "category".to_string()
    } else {
        slug
    };

    format!("cat-{slug}-{}", hash_text(name))
}

fn hash_text(value: &str) -> String {
    let mut hash: u32 = 2166136261;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16777619);
    }
    base36(hash)
}

fn base36(mut value: u32) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }

    let mut output = Vec::new();
    while value > 0 {
        output.push(DIGITS[(value % 36) as usize] as char);
        value /= 36;
    }
    output.iter().rev().collect()
}

fn default_text(value: Option<String>) -> String {
    value.unwrap_or_default().trim().to_string()
}

fn apply_text(target: &mut String, value: Option<String>) {
    if let Some(value) = value {
        *target = value.trim().to_string();
    }
}

fn normalize_string_array_json(value: Option<String>) -> String {
    let Some(value) = value else {
        return "[]".to_string();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&value) else {
        return "[]".to_string();
    };
    let labels = items
        .into_iter()
        .filter_map(|item| item.as_str().map(str::trim).map(str::to_string))
        .filter(|label| !label.is_empty())
        .collect::<Vec<_>>();
    serde_json::to_string(&labels).unwrap_or_else(|_| "[]".to_string())
}

fn normalize_performer_thumbnail_paths_json(value: Option<String>) -> String {
    const MAX_THUMBNAIL_PATHS: usize = 4;

    let Some(value) = value else {
        return "[]".to_string();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&value) else {
        return "[]".to_string();
    };

    let mut seen = Vec::new();
    let mut paths = Vec::new();

    for item in items {
        let Some(path) = item.as_str().map(str::trim) else {
            continue;
        };
        if path.is_empty() || seen.iter().any(|existing| existing == path) {
            continue;
        }

        seen.push(path.to_string());
        paths.push(path.to_string());

        if paths.len() >= MAX_THUMBNAIL_PATHS {
            break;
        }
    }

    serde_json::to_string(&paths).unwrap_or_else(|_| "[]".to_string())
}

fn normalize_gallery_image_paths_json(value: Option<String>) -> String {
    let Some(value) = value else {
        return "[]".to_string();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&value) else {
        return "[]".to_string();
    };

    let mut seen = Vec::new();
    let mut paths = Vec::new();

    for item in items {
        let Some(path) = item.as_str().map(str::trim) else {
            continue;
        };
        if path.is_empty() || seen.iter().any(|existing| existing == path) {
            continue;
        }

        seen.push(path.to_string());
        paths.push(path.to_string());
    }

    serde_json::to_string(&paths).unwrap_or_else(|_| "[]".to_string())
}

fn list_gallery_folder_images(folder_path: &str) -> Result<GalleryFolderImagesResult, String> {
    let folder_path = folder_path.trim();
    if folder_path.is_empty() {
        return Err("Gallery folder is required".to_string());
    }

    let folder = PathBuf::from(folder_path);
    if !folder.is_dir() {
        return Err("Gallery folder could not be read".to_string());
    }

    let entries =
        fs::read_dir(&folder).map_err(|_| "Gallery folder could not be read".to_string())?;
    let mut image_paths = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_file() {
                return None;
            }

            let path = entry.path();
            if !is_supported_gallery_image_path(&path) {
                return None;
            }

            Some(path)
        })
        .collect::<Vec<_>>();

    image_paths.sort_by(|left, right| {
        let left_name = left
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();
        let right_name = right
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase();

        left_name.cmp(&right_name)
    });

    Ok(GalleryFolderImagesResult {
        folder_path: folder.display().to_string(),
        image_paths: image_paths
            .into_iter()
            .map(|path| path.display().to_string())
            .collect(),
    })
}

fn is_supported_gallery_image_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase)
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "gif")
    )
}

fn normalize_object_json(value: Option<String>) -> String {
    let Some(value) = value else {
        return "{}".to_string();
    };
    match serde_json::from_str::<Value>(&value) {
        Ok(Value::Object(map)) => serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string()),
        _ => "{}".to_string(),
    }
}

fn normalize_source_url(value: Option<String>) -> Result<String, String> {
    let normalized = default_text(value);
    if normalized.is_empty()
        || normalized.starts_with("http://")
        || normalized.starts_with("https://")
    {
        return Ok(normalized);
    }

    Err("Source URL must start with http:// or https://.".to_string())
}

fn normalize_related_performers_json(value: Option<String>) -> String {
    let Some(value) = value else {
        return "[]".to_string();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&value) else {
        return "[]".to_string();
    };

    let mut seen = Vec::new();
    let mut references = Vec::new();

    for item in items {
        let Value::Object(map) = item else {
            continue;
        };
        let performer_id = map
            .get("performerId")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string();
        let name_snapshot = map
            .get("nameSnapshot")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string();

        if performer_id.is_empty() && name_snapshot.is_empty() {
            continue;
        }

        let key = if performer_id.is_empty() {
            name_snapshot.to_lowercase()
        } else {
            performer_id.clone()
        };
        if seen.iter().any(|existing| existing == &key) {
            continue;
        }

        seen.push(key);
        references.push(json!({
            "performerId": performer_id,
            "nameSnapshot": name_snapshot,
        }));
    }

    serde_json::to_string(&references).unwrap_or_else(|_| "[]".to_string())
}

fn normalize_related_catalog_records_json(value: Option<String>) -> String {
    let Some(value) = value else {
        return "[]".to_string();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&value) else {
        return "[]".to_string();
    };

    let mut seen = Vec::new();
    let mut references = Vec::new();

    for item in items {
        let Value::Object(map) = item else {
            continue;
        };
        let record_id = map
            .get("recordId")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string();
        let title_snapshot = map
            .get("titleSnapshot")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string();

        if record_id.is_empty() && title_snapshot.is_empty() {
            continue;
        }

        let key = if record_id.is_empty() {
            title_snapshot.to_lowercase()
        } else {
            record_id.clone()
        };
        if seen.iter().any(|existing| existing == &key) {
            continue;
        }

        seen.push(key);
        references.push(json!({
            "recordId": record_id,
            "titleSnapshot": title_snapshot,
        }));
    }

    serde_json::to_string(&references).unwrap_or_else(|_| "[]".to_string())
}

fn credit_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Credit> {
    Ok(Credit {
        id: row.get("id")?,
        work_type: row.get("workType")?,
        work_id: row.get("workId")?,
        performer_id: row.get("performerId")?,
        character_name: row.get("characterName")?,
        character_original_name: row.get("characterOriginalName")?,
        credited_as: row.get("creditedAs")?,
        credited_as_mode: row.get("creditedAsMode")?,
        credit_type_category_id: row.get("creditTypeCategoryId")?,
        role_importance_category_id: row.get("roleImportanceCategoryId")?,
        character_mode: row.get("characterMode")?,
        character_id: row.get("characterId")?,
        billing_order: row.get("billingOrder")?,
        note: row.get("note")?,
        legacy_source_key: row.get("legacySourceKey")?,
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn normalize_source_links_json(value: Option<String>) -> String {
    let Some(value) = value else {
        return "[]".to_string();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&value) else {
        return "[]".to_string();
    };

    let mut links = Vec::new();

    for item in items {
        let Value::Object(map) = item else {
            continue;
        };
        let title = map
            .get("title")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string();
        let url = map
            .get("url")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string();

        if title.is_empty() && url.is_empty() {
            continue;
        }

        links.push(json!({
            "title": title,
            "url": url,
        }));
    }

    serde_json::to_string(&links).unwrap_or_else(|_| "[]".to_string())
}

fn current_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn current_timestamp_i64() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id(prefix: &str) -> String {
    let timestamp = current_timestamp();
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{timestamp}_{counter}")
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn int_to_bool(value: i64) -> bool {
    value == 1
}

fn database_error(error: rusqlite::Error) -> String {
    format!("Database error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::initialize_schema;

    fn test_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema init");
        connection
    }

    fn glossary_delete_for_test(
        connection: &Connection,
        id: String,
    ) -> Result<DeleteResult, String> {
        let deleted = connection
            .execute("DELETE FROM glossary_entries WHERE id = ?1", [&id])
            .map_err(database_error)?
            > 0;
        Ok(DeleteResult { id, deleted })
    }

    #[test]
    fn glossary_crud_uses_independent_sqlite_table() {
        let connection = test_connection();
        let created = create_glossary_entry(
            &connection,
            GlossaryEntryInput {
                term: "  Source Citation  ".to_string(),
                definition: "  Stores a source title and URL as text.  ".to_string(),
                synonyms_json: Some(
                    r#"["Reference link"," Reference link ","Source note",7]"#.to_string(),
                ),
                category: Some("  Reference  ".to_string()),
                parent_id: None,
                thumbnail_path: Some("  D:/Glossary/thumb.png  ".to_string()),
                favorite: Some(true),
                source_title: Some("  Safety plan  ".to_string()),
                source_url: Some(" https://example.invalid/source ".to_string()),
            },
        )
        .expect("create glossary");

        assert!(created.id.starts_with("glossary_"));
        assert_eq!(created.term, "Source Citation");
        assert_eq!(created.definition, "Stores a source title and URL as text.");
        assert_eq!(
            created.synonyms_json,
            r#"["Reference link","Reference link","Source note"]"#
        );
        assert_eq!(created.category, "Reference");
        assert_eq!(created.parent_id, "");
        assert_eq!(created.thumbnail_path, "D:/Glossary/thumb.png");
        assert!(created.favorite);
        assert_eq!(created.source_title, "Safety plan");
        assert_eq!(created.source_url, "https://example.invalid/source");
        assert!(created.created_at > 0);
        assert!(created.updated_at >= created.created_at);

        let listed = list_glossary_entries(&connection).expect("list glossary");
        assert_eq!(listed, vec![created.clone()]);

        std::thread::sleep(std::time::Duration::from_millis(1));
        let updated = update_glossary_entry(
            &connection,
            &created.id,
            GlossaryEntryPatch {
                term: Some("Updated Citation".to_string()),
                definition: Some("Updated definition".to_string()),
                synonyms_json: Some(r#"["Updated"]"#.to_string()),
                category: Some("Updated Category".to_string()),
                parent_id: None,
                thumbnail_path: Some("D:/Glossary/updated.png".to_string()),
                favorite: Some(false),
                source_title: Some("Updated Source".to_string()),
                source_url: Some("http://example.invalid/updated".to_string()),
            },
        )
        .expect("update glossary")
        .expect("updated glossary entry");

        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at >= created.updated_at);
        assert_eq!(updated.term, "Updated Citation");
        assert_eq!(updated.definition, "Updated definition");
        assert_eq!(updated.synonyms_json, r#"["Updated"]"#);
        assert_eq!(updated.category, "Updated Category");
        assert_eq!(updated.parent_id, "");
        assert_eq!(updated.thumbnail_path, "D:/Glossary/updated.png");
        assert!(!updated.favorite);
        assert_eq!(updated.source_title, "Updated Source");
        assert_eq!(updated.source_url, "http://example.invalid/updated");

        let deleted =
            glossary_delete_for_test(&connection, updated.id.clone()).expect("delete glossary");
        assert_eq!(
            deleted,
            DeleteResult {
                id: updated.id,
                deleted: true
            }
        );
        assert!(list_glossary_entries(&connection)
            .expect("list after delete")
            .is_empty());

        for table_name in ["videos", "images", "performers", "managedCategories"] {
            let count: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table_name}"), [], |row| {
                    row.get(0)
                })
                .expect("catalog table count");
            assert_eq!(count, 0, "{table_name} should not be mutated");
        }
    }

    #[test]
    fn glossary_validation_rejects_required_and_url_errors() {
        let connection = test_connection();

        assert_eq!(
            create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    term: " ".to_string(),
                    definition: "Definition".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                },
            )
            .expect_err("term required"),
            "Glossary term is required"
        );

        assert_eq!(
            create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    term: "Term".to_string(),
                    definition: " ".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                },
            )
            .expect_err("definition required"),
            "Glossary definition is required"
        );

        assert_eq!(
            create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    term: "Term".to_string(),
                    definition: "Definition".to_string(),
                    synonyms_json: Some("{bad json".to_string()),
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: Some("example.invalid/source".to_string()),
                },
            )
            .expect_err("source url protocol required"),
            "Source URL must start with http:// or https://."
        );

        let created = create_glossary_entry(
            &connection,
            GlossaryEntryInput {
                term: "Term".to_string(),
                definition: "Definition".to_string(),
                synonyms_json: Some("{bad json".to_string()),
                category: None,
                parent_id: None,
                thumbnail_path: None,
                favorite: None,
                source_title: None,
                source_url: None,
            },
        )
        .expect("bad synonyms normalize");
        assert_eq!(created.synonyms_json, "[]");
    }

    #[test]
    fn glossary_parent_relation_is_glossary_only_and_blocks_dangling_delete() {
        let connection = test_connection();
        let parent = create_glossary_entry(
            &connection,
            GlossaryEntryInput {
                term: "Parent Term".to_string(),
                definition: "Parent definition".to_string(),
                synonyms_json: None,
                category: None,
                parent_id: None,
                thumbnail_path: None,
                favorite: None,
                source_title: None,
                source_url: None,
            },
        )
        .expect("create parent");

        let child = create_glossary_entry(
            &connection,
            GlossaryEntryInput {
                term: "Child Term".to_string(),
                definition: "Child definition".to_string(),
                synonyms_json: None,
                category: None,
                parent_id: Some(parent.id.clone()),
                thumbnail_path: None,
                favorite: None,
                source_title: None,
                source_url: None,
            },
        )
        .expect("create child");

        assert_eq!(child.parent_id, parent.id);
        assert_eq!(
            glossary_child_count(&connection, &parent.id).expect("child count"),
            1
        );
        assert_eq!(
            update_glossary_entry(
                &connection,
                &parent.id,
                GlossaryEntryPatch {
                    term: None,
                    definition: None,
                    synonyms_json: None,
                    category: None,
                    parent_id: Some(child.id),
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                },
            )
            .expect_err("cycle rejected"),
            "Parent glossary entry would create a circular hierarchy."
        );
    }

    #[test]
    fn video_crud_uses_sqlite_schema_and_json_text_labels() {
        let connection = test_connection();
        let created = create_video(
            &connection,
            VideoInput {
                title: " Video Title ".to_string(),
                original_title: None,
                code: Some("ABC-123".to_string()),
                censorship: None,
                availability: None,
                release_date: None,
                duration_minutes: Some(90),
                resolution: Some("1920 x 1080".to_string()),
                file_size_bytes: Some(1024),
                file_type: Some("MP4".to_string()),
                publisher_label: None,
                cover_path: None,
                media_path: None,
                categories_json: Some(r#"["Drama", "", 3, "Action"]"#.to_string()),
                related_performers_json: Some(
                    r#"[{"performerId":" performer-1 ","nameSnapshot":" Performer One "},{"performerId":"performer-1","nameSnapshot":"Duplicate"},{"performerId":"","nameSnapshot":"Legacy Name"}]"#.to_string(),
                ),
                related_images_json: Some(
                    r#"[{"recordId":" image-1 ","titleSnapshot":" Image One "},{"recordId":"image-1","titleSnapshot":"Duplicate"},{"recordId":"","titleSnapshot":"Legacy Image"}]"#.to_string(),
                ),
                source_links_json: Some(
                    r#"[{"title":" Studio ","url":" https://example.invalid/video "},{"title":"","url":""}]"#.to_string(),
                ),
                rating_json: Some(r#"{"score":4,"source":"manual"}"#.to_string()),
                notes: None,
                favorite: None,
            },
        )
        .expect("create video");

        assert_eq!(created.title, "Video Title");
        assert_eq!(created.categories_json, r#"["Drama","Action"]"#);
        assert_eq!(
            created.related_performers_json,
            r#"[{"nameSnapshot":"Performer One","performerId":"performer-1"},{"nameSnapshot":"Legacy Name","performerId":""}]"#
        );
        assert_eq!(
            created.related_images_json,
            r#"[{"recordId":"image-1","titleSnapshot":"Image One"},{"recordId":"","titleSnapshot":"Legacy Image"}]"#
        );
        assert_eq!(
            created.source_links_json,
            r#"[{"title":"Studio","url":"https://example.invalid/video"}]"#
        );
        assert_eq!(created.rating_json, r#"{"score":4,"source":"manual"}"#);
        assert!(!created.favorite);
        assert!(!created.created_at.is_empty());
        assert!(!created.updated_at.is_empty());

        let listed = list_videos(&connection).expect("list videos");
        assert_eq!(listed.len(), 1);
        assert_eq!(
            get_video(&connection, &created.id).expect("get video"),
            Some(created.clone())
        );

        let updated = update_video(
            &connection,
            &created.id,
            VideoPatch {
                title: Some("Updated Video".to_string()),
                original_title: None,
                code: None,
                censorship: None,
                availability: None,
                release_date: None,
                duration_minutes: None,
                resolution: None,
                file_size_bytes: None,
                file_type: None,
                publisher_label: None,
                cover_path: None,
                media_path: None,
                categories_json: Some(r#"["Updated"]"#.to_string()),
                related_performers_json: Some("invalid".to_string()),
                related_images_json: Some(
                    r#"[{"recordId":"image-2","titleSnapshot":"Image Two"}]"#.to_string(),
                ),
                source_links_json: Some("invalid".to_string()),
                rating_json: Some("invalid".to_string()),
                notes: Some("note".to_string()),
                favorite: Some(true),
            },
        )
        .expect("update video")
        .expect("updated video");
        assert_eq!(updated.title, "Updated Video");
        assert_eq!(updated.categories_json, r#"["Updated"]"#);
        assert_eq!(updated.related_performers_json, "[]");
        assert_eq!(
            updated.related_images_json,
            r#"[{"recordId":"image-2","titleSnapshot":"Image Two"}]"#
        );
        assert_eq!(updated.source_links_json, "[]");
        assert_eq!(updated.rating_json, "{}");
        assert!(updated.favorite);

        let deleted = delete_row(&connection, "videos", created.id.clone()).expect("delete video");
        assert_eq!(
            deleted,
            DeleteResult {
                id: created.id.clone(),
                deleted: true
            }
        );
        assert!(get_video(&connection, &created.id)
            .expect("missing video")
            .is_none());
    }

    #[test]
    fn image_crud_uses_sqlite_schema_and_json_text_labels() {
        let connection = test_connection();
        let created = create_image(
            &connection,
            ImageInput {
                title: "Image Title".to_string(),
                original_title: None,
                code: None,
                censorship: None,
                availability: None,
                release_date: None,
                publisher_label: None,
                cover_path: None,
                folder_path: Some("C:/Images".to_string()),
                image_count: Some(24),
                main_resolution: Some("1200 x 800".to_string()),
                total_file_size_bytes: Some(2048),
                main_file_type: Some("JPG".to_string()),
                gallery_image_paths_json: Some(
                    r#"[" C:/Images/one.jpg ","","C:/Images/two.jpg","C:/Images/one.jpg",7]"#
                        .to_string(),
                ),
                categories_json: Some(r#"["Portrait","Set"]"#.to_string()),
                related_performers_json: Some(
                    r#"[{"performerId":"performer-1","nameSnapshot":"Performer One"}]"#.to_string(),
                ),
                related_videos_json: Some(
                    r#"[{"recordId":"video-1","titleSnapshot":"Video One"}]"#.to_string(),
                ),
                source_links_json: Some(
                    r#"[{"title":"Image Source","url":"https://example.invalid/image"}]"#
                        .to_string(),
                ),
                rating_json: Some(r#"{"score":5}"#.to_string()),
                notes: None,
                favorite: None,
            },
        )
        .expect("create image");

        assert_eq!(created.categories_json, r#"["Portrait","Set"]"#);
        assert_eq!(
            created.gallery_image_paths_json,
            r#"["C:/Images/one.jpg","C:/Images/two.jpg"]"#
        );
        assert_eq!(
            created.related_performers_json,
            r#"[{"nameSnapshot":"Performer One","performerId":"performer-1"}]"#
        );
        assert_eq!(
            created.related_videos_json,
            r#"[{"recordId":"video-1","titleSnapshot":"Video One"}]"#
        );
        assert_eq!(
            created.source_links_json,
            r#"[{"title":"Image Source","url":"https://example.invalid/image"}]"#
        );
        assert_eq!(created.rating_json, r#"{"score":5}"#);
        assert!(!created.favorite);
        assert!(!created.created_at.is_empty());

        assert_eq!(list_images(&connection).expect("list images").len(), 1);
        assert_eq!(
            get_image(&connection, &created.id).expect("get image"),
            Some(created.clone())
        );

        let updated = update_image(
            &connection,
            &created.id,
            ImagePatch {
                title: Some("Updated Image".to_string()),
                original_title: None,
                code: None,
                censorship: None,
                availability: None,
                release_date: None,
                publisher_label: None,
                cover_path: None,
                folder_path: None,
                image_count: Some(30),
                main_resolution: None,
                total_file_size_bytes: None,
                main_file_type: None,
                gallery_image_paths_json: Some("{}".to_string()),
                categories_json: Some("{}".to_string()),
                related_performers_json: Some(
                    r#"[{"performerId":"performer-2","nameSnapshot":"Performer Two"}]"#.to_string(),
                ),
                related_videos_json: Some("invalid".to_string()),
                source_links_json: Some(
                    r#"[{"title":"","url":"https://example.invalid/url-only"}]"#.to_string(),
                ),
                rating_json: Some(r#"{"quality":"high"}"#.to_string()),
                notes: None,
                favorite: Some(true),
            },
        )
        .expect("update image")
        .expect("updated image");
        assert_eq!(updated.image_count, Some(30));
        assert_eq!(updated.gallery_image_paths_json, "[]");
        assert_eq!(updated.categories_json, "[]");
        assert_eq!(
            updated.related_performers_json,
            r#"[{"nameSnapshot":"Performer Two","performerId":"performer-2"}]"#
        );
        assert_eq!(updated.related_videos_json, "[]");
        assert_eq!(
            updated.source_links_json,
            r#"[{"title":"","url":"https://example.invalid/url-only"}]"#
        );
        assert_eq!(updated.rating_json, r#"{"quality":"high"}"#);
        assert!(updated.favorite);

        assert!(
            delete_row(&connection, "images", created.id.clone())
                .expect("delete image")
                .deleted
        );
        assert!(get_image(&connection, &created.id)
            .expect("missing image")
            .is_none());
    }

    #[test]
    fn gallery_folder_images_list_reads_direct_supported_images_only() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-gallery-folder-test-{}",
            std::process::id()
        ));
        let child_folder = temp_root.join("child");
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&child_folder).expect("create gallery folder");

        for file_name in ["b.PNG", "a.jpg", "c.JPEG", "d.webp", "e.GIF", "ignore.txt"] {
            std::fs::write(temp_root.join(file_name), "not read").expect("write direct file");
        }
        std::fs::write(child_folder.join("nested.jpg"), "not read").expect("write nested file");

        let result = list_gallery_folder_images(temp_root.to_string_lossy().as_ref())
            .expect("list gallery folder images");

        let file_names = result
            .image_paths
            .iter()
            .map(|path| {
                PathBuf::from(path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                    .to_string()
            })
            .collect::<Vec<_>>();

        assert_eq!(
            file_names,
            vec!["a.jpg", "b.PNG", "c.JPEG", "d.webp", "e.GIF"]
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn gallery_folder_images_list_rejects_missing_folder_safely() {
        let missing_path = std::env::temp_dir().join(format!(
            "sakurava-gallery-folder-missing-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&missing_path);

        assert_eq!(
            list_gallery_folder_images(missing_path.to_string_lossy().as_ref())
                .expect_err("missing folder should fail"),
            "Gallery folder could not be read"
        );
    }

    #[test]
    fn performer_crud_uses_aliases_and_json_text_labels() {
        let connection = test_connection();
        let created = create_performer(
            &connection,
            PerformerInput {
                name: "Performer Name".to_string(),
                original_name: None,
                aliases_json: Some(r#"["Alias A","Alias B"]"#.to_string()),
                status: Some("active".to_string()),
                debut_date: Some("2020-01-02".to_string()),
                retired_date: None,
                birth_date: Some("1999-04-12".to_string()),
                gender: Some("Woman".to_string()),
                birthplace: Some("Tokyo".to_string()),
                nationality: Some("Japanese".to_string()),
                blood_type: Some("A".to_string()),
                height_cm: Some(160),
                weight_kg: Some(48),
                measurements: Some("80 / 58 / 84 cm".to_string()),
                cup_size: Some("C".to_string()),
                cover_path: None,
                performer_thumbnail_paths_json: Some(
                    r#"[" C:/thumbs/one.jpg ","","C:/thumbs/two.jpg","C:/thumbs/one.jpg","C:/thumbs/three.jpg","C:/thumbs/four.jpg","C:/thumbs/five.jpg"]"#.to_string(),
                ),
                filmography_count: Some(3),
                pictorials_count: Some(2),
                related_videos_json: Some(
                    r#"[{"recordId":"video-1","titleSnapshot":"Video One"}]"#.to_string(),
                ),
                related_images_json: Some(
                    r#"[{"recordId":"image-1","titleSnapshot":"Image One"}]"#.to_string(),
                ),
                source_links_json: Some(
                    r#"[{"title":"Performer Source","url":"https://example.invalid/performer"}]"#.to_string(),
                ),
                categories_json: Some(r#"["Featured"]"#.to_string()),
                rating_json: Some(r#"{"score":3}"#.to_string()),
                notes: None,
                favorite: None,
            },
        )
        .expect("create performer");

        assert_eq!(created.aliases_json, r#"["Alias A","Alias B"]"#);
        assert_eq!(
            created.performer_thumbnail_paths_json,
            r#"["C:/thumbs/one.jpg","C:/thumbs/two.jpg","C:/thumbs/three.jpg","C:/thumbs/four.jpg"]"#
        );
        assert_eq!(created.categories_json, r#"["Featured"]"#);
        assert_eq!(created.rating_json, r#"{"score":3}"#);
        assert_eq!(
            created.related_videos_json,
            r#"[{"recordId":"video-1","titleSnapshot":"Video One"}]"#
        );
        assert_eq!(
            created.related_images_json,
            r#"[{"recordId":"image-1","titleSnapshot":"Image One"}]"#
        );
        assert_eq!(
            created.source_links_json,
            r#"[{"title":"Performer Source","url":"https://example.invalid/performer"}]"#
        );
        assert_eq!(created.debut_date, "2020-01-02");
        assert_eq!(created.gender, "Woman");
        assert_eq!(created.birthplace, "Tokyo");
        assert_eq!(created.height_cm, Some(160));
        assert!(!created.favorite);

        assert_eq!(
            list_performers(&connection).expect("list performers").len(),
            1
        );
        assert_eq!(
            get_performer(&connection, &created.id).expect("get performer"),
            Some(created.clone())
        );

        let updated = update_performer(
            &connection,
            &created.id,
            PerformerPatch {
                name: Some("Updated Performer".to_string()),
                original_name: None,
                aliases_json: Some(r#"["Alias C", 7]"#.to_string()),
                status: None,
                debut_date: Some("2021-03-04".to_string()),
                retired_date: Some("2024-05-06".to_string()),
                birth_date: None,
                gender: Some("Non-binary".to_string()),
                birthplace: Some("Osaka".to_string()),
                nationality: None,
                blood_type: None,
                height_cm: Some(None),
                weight_kg: Some(Some(49)),
                measurements: Some("81 / 59 / 85 cm".to_string()),
                cup_size: Some("D".to_string()),
                cover_path: None,
                performer_thumbnail_paths_json: Some("{bad json".to_string()),
                filmography_count: Some(None),
                pictorials_count: Some(Some(4)),
                related_videos_json: Some("{bad json".to_string()),
                related_images_json: Some(
                    r#"[{"recordId":"image-2","titleSnapshot":"Image Two"}]"#.to_string(),
                ),
                source_links_json: Some("{bad json".to_string()),
                categories_json: None,
                rating_json: Some("[]".to_string()),
                notes: Some("note".to_string()),
                favorite: Some(true),
            },
        )
        .expect("update performer")
        .expect("updated performer");
        assert_eq!(updated.name, "Updated Performer");
        assert_eq!(updated.aliases_json, r#"["Alias C"]"#);
        assert_eq!(updated.performer_thumbnail_paths_json, "[]");
        assert_eq!(updated.rating_json, "{}");
        assert_eq!(updated.debut_date, "2021-03-04");
        assert_eq!(updated.retired_date, "2024-05-06");
        assert_eq!(updated.gender, "Non-binary");
        assert_eq!(updated.birthplace, "Osaka");
        assert_eq!(updated.height_cm, None);
        assert_eq!(updated.weight_kg, Some(49));
        assert_eq!(updated.filmography_count, None);
        assert_eq!(updated.pictorials_count, Some(4));
        assert_eq!(updated.related_videos_json, "[]");
        assert_eq!(
            updated.related_images_json,
            r#"[{"recordId":"image-2","titleSnapshot":"Image Two"}]"#
        );
        assert_eq!(updated.source_links_json, "[]");
        assert!(updated.favorite);

        assert!(
            delete_row(&connection, "performers", created.id.clone())
                .expect("delete performer")
                .deleted
        );
        assert!(get_performer(&connection, &created.id)
            .expect("missing performer")
            .is_none());
    }

    #[test]
    fn required_titles_and_names_are_validated() {
        let connection = test_connection();

        assert_eq!(
            create_video(&connection, empty_video_input()).expect_err("video title error"),
            "Video title is required"
        );
        assert_eq!(
            create_image(&connection, empty_image_input()).expect_err("image title error"),
            "Image title is required"
        );
        assert_eq!(
            create_performer(&connection, empty_performer_input())
                .expect_err("performer name error"),
            "Performer name is required"
        );
    }

    #[test]
    fn media_asset_root_validation_requires_existing_non_root_folder() {
        assert_eq!(
            validate_media_asset_root(" ").expect_err("empty root should fail"),
            "Media asset root path is required"
        );

        let temp_root =
            std::env::temp_dir().join(format!("sakurava-media-root-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create media root");

        assert_eq!(
            validate_media_asset_root(temp_root.join("missing").to_string_lossy().as_ref())
                .expect_err("missing root should fail"),
            "Media asset root folder does not exist"
        );

        let file_path = temp_root.join("cover.jpg");
        std::fs::write(&file_path, "not an image").expect("write file");
        assert_eq!(
            validate_media_asset_root(file_path.to_string_lossy().as_ref())
                .expect_err("file root should fail"),
            "Media asset root must be a folder"
        );

        let filesystem_root = temp_root.ancestors().last().expect("filesystem root");
        assert_eq!(
            validate_media_asset_root(filesystem_root.to_string_lossy().as_ref())
                .expect_err("filesystem root should fail"),
            "Media asset root cannot be a drive or filesystem root"
        );

        let accepted = validate_media_asset_root(temp_root.to_string_lossy().as_ref())
            .expect("existing folder should pass");
        assert_eq!(accepted, temp_root.canonicalize().expect("canonical root"));

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn path_status_check_reports_not_set_for_empty_paths() {
        assert_eq!(
            check_path_status("   "),
            PathStatusResult {
                path: String::new(),
                status: PathStatusKind::NotSet,
                kind: PathKind::Unknown,
                message: "Path is not set".to_string()
            }
        );
    }

    #[test]
    fn path_status_check_reports_existing_file() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-path-status-file-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create temp root");
        let file_path = temp_root.join("cover.jpg");
        std::fs::write(&file_path, "not read by status check").expect("write temp file");

        let result = check_path_status(file_path.to_string_lossy().as_ref());

        assert_eq!(result.status, PathStatusKind::Exists);
        assert_eq!(result.kind, PathKind::File);
        assert_eq!(result.message, "Path exists");

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn path_status_check_reports_existing_folder() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-path-status-folder-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create temp root");

        let result = check_path_status(temp_root.to_string_lossy().as_ref());

        assert_eq!(result.status, PathStatusKind::Exists);
        assert_eq!(result.kind, PathKind::Folder);
        assert_eq!(result.message, "Path exists");

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn path_status_check_reports_missing_path() {
        let missing_path = std::env::temp_dir().join(format!(
            "sakurava-path-status-missing-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&missing_path);

        let result = check_path_status(missing_path.to_string_lossy().as_ref());

        assert_eq!(result.status, PathStatusKind::Missing);
        assert_eq!(result.kind, PathKind::Unknown);
        assert_eq!(result.message, "Path does not exist");
    }

    #[test]
    fn media_metadata_probe_reports_missing_path_without_crashing() {
        let missing_path = std::env::temp_dir().join(format!(
            "sakurava-metadata-missing-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&missing_path);

        let result = probe_media_metadata(missing_path.to_string_lossy().as_ref());

        assert_eq!(result.status, PathStatusKind::Missing);
        assert_eq!(result.kind, PathKind::Unknown);
        assert_eq!(result.duration_minutes, None);
        assert_eq!(result.width, None);
        assert_eq!(result.height, None);
        assert_eq!(result.resolution, None);
    }

    #[test]
    fn media_metadata_probe_keeps_size_and_type_for_unsupported_file() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-metadata-unsupported-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create temp root");
        let file_path = temp_root.join("sample.bin");
        std::fs::write(&file_path, b"not a supported media file").expect("write temp file");

        let result = probe_media_metadata(file_path.to_string_lossy().as_ref());

        assert_eq!(result.status, PathStatusKind::Exists);
        assert_eq!(result.kind, PathKind::File);
        assert_eq!(result.file_size_bytes, Some(26));
        assert_eq!(result.file_type, "BIN");
        assert_eq!(result.duration_minutes, None);
        assert_eq!(result.resolution, None);

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn video_duration_conversion_never_returns_zero_fallback() {
        assert_eq!(duration_minutes_from_100ns(0), None);
        assert_eq!(duration_minutes_from_100ns(1), Some(1));
        assert_eq!(duration_minutes_from_100ns(600_000_000), Some(1));
        assert_eq!(duration_minutes_from_100ns(600_000_001), Some(2));
    }

    #[test]
    fn resolution_text_requires_valid_width_and_height() {
        assert_eq!(
            resolution_text_from_dimensions(Some(1920), Some(1080)),
            Some("1920x1080".to_string())
        );
        assert_eq!(resolution_text_from_dimensions(Some(1920), None), None);
        assert_eq!(resolution_text_from_dimensions(Some(0), Some(1080)), None);
    }

    #[test]
    fn media_open_validation_rejects_empty_path() {
        assert_eq!(
            validate_media_open_file_path("   ").expect_err("empty media path should fail"),
            "Media path is required"
        );
    }

    #[test]
    fn media_open_validation_rejects_missing_path() {
        let missing_path = std::env::temp_dir().join(format!(
            "sakurava-media-open-missing-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&missing_path);

        assert_eq!(
            validate_media_open_file_path(missing_path.to_string_lossy().as_ref())
                .expect_err("missing media file should fail"),
            "Media file does not exist"
        );
    }

    #[test]
    fn media_open_validation_rejects_folder_path() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-media-open-folder-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create temp root");

        assert_eq!(
            validate_media_open_file_path(temp_root.to_string_lossy().as_ref())
                .expect_err("folder path should fail"),
            "Media path must be a file"
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn media_open_validation_accepts_existing_file_without_opening_it() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-media-open-file-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create temp root");
        let file_path = temp_root.join("video.mp4");
        std::fs::write(&file_path, "not opened by validation test").expect("write temp file");

        let accepted =
            validate_media_open_file_path(file_path.to_string_lossy().as_ref()).expect("file path");
        assert_eq!(accepted, file_path);

        let _ = std::fs::remove_dir_all(temp_root);
    }

    fn credit_input(work_type: &str, work_id: &str, performer_id: &str) -> CreditInput {
        CreditInput {
            work_type: work_type.to_string(),
            work_id: work_id.to_string(),
            performer_id: performer_id.to_string(),
            character_name: Some("  Lead  ".to_string()),
            character_original_name: Some(" ".to_string()),
            credited_as: Some(" Stage Name ".to_string()),
            credited_as_mode: Some("custom".to_string()),
            credit_type_category_id: None,
            role_importance_category_id: None,
            character_mode: Some("text".to_string()),
            character_id: None,
            billing_order: Some(2),
            note: Some(" Note ".to_string()),
        }
    }

    #[test]
    fn credit_crud_and_filtered_lists_use_independent_credit_rows() {
        let connection = test_connection();
        let first = create_credit(&connection, credit_input("video", "video-1", "performer-1"))
            .expect("create credit");
        let second = create_credit(&connection, credit_input("image", "image-1", "performer-1"))
            .expect("create second credit");
        create_credit(&connection, credit_input("video", "video-1", "performer-2"))
            .expect("create third credit");

        assert_eq!(first.character_name, "Lead");
        assert_eq!(first.character_original_name, None);
        assert_eq!(first.credited_as.as_deref(), Some("Stage Name"));
        assert_eq!(first.note.as_deref(), Some("Note"));
        assert_eq!(list_credits(&connection).expect("list").len(), 3);
        assert_eq!(
            get_credit(&connection, &first.id).expect("get"),
            Some(first.clone())
        );
        assert_eq!(
            list_credits_by_work(&connection, "video", "video-1")
                .expect("list by work")
                .len(),
            2
        );
        assert_eq!(
            list_credits_by_performer(&connection, "performer-1")
                .expect("list by performer")
                .len(),
            2
        );

        let updated = update_credit(
            &connection,
            &first.id,
            CreditPatch {
                work_type: None,
                work_id: None,
                performer_id: None,
                character_name: Some("Updated Role".to_string()),
                character_original_name: None,
                credited_as: Some(None),
                credited_as_mode: Some("auto".to_string()),
                credit_type_category_id: None,
                role_importance_category_id: None,
                character_mode: Some("self".to_string()),
                character_id: None,
                billing_order: Some(None),
                note: Some(None),
            },
        )
        .expect("update")
        .expect("updated credit");
        assert_eq!(updated.character_name, "Updated Role");
        assert_eq!(updated.credited_as, None);
        assert_eq!(updated.credited_as_mode, "auto");
        assert_eq!(updated.character_mode, "self");
        assert_eq!(updated.billing_order, None);
        assert_eq!(updated.note, None);

        assert!(
            delete_credit(&connection, second.id.clone())
                .expect("delete")
                .deleted
        );
        assert!(get_credit(&connection, &second.id)
            .expect("get deleted")
            .is_none());
    }

    #[test]
    fn credit_validation_rejects_invalid_modes_and_required_ids() {
        let connection = test_connection();
        let mut invalid = credit_input("audio", "work", "performer");
        assert_eq!(
            create_credit(&connection, invalid).expect_err("work type"),
            "Credit workType is invalid"
        );
        invalid = credit_input("video", " ", "performer");
        assert_eq!(
            create_credit(&connection, invalid).expect_err("work id"),
            "Credit workId is required"
        );
        invalid = credit_input("image", "work", " ");
        assert_eq!(
            create_credit(&connection, invalid).expect_err("performer id"),
            "Credit performerId is required"
        );
        invalid = credit_input("video", "work", "performer");
        invalid.character_mode = Some("library".to_string());
        assert_eq!(
            create_credit(&connection, invalid).expect_err("character mode"),
            "Credit characterMode is invalid"
        );
    }

    #[test]
    fn managed_category_credits_scope_round_trips_and_credit_keys_block_delete() {
        let connection = test_connection();
        let created = create_managed_category(
            &connection,
            ManagedCategoryInput {
                key: Some("cat-credit-type-voice".to_string()),
                name: "Voice".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: Some(false),
                show_in_images: Some(false),
                show_in_performers: Some(false),
                show_in_credits: Some(true),
            },
        )
        .expect("create credit category");
        assert!(created.show_in_credits);
        assert_eq!(
            list_managed_categories(&connection)
                .expect("list categories")
                .first()
                .map(|category| category.show_in_credits),
            Some(true)
        );

        let updated = update_managed_category(
            &connection,
            &created.key,
            ManagedCategoryPatch {
                name: None,
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: None,
                show_in_images: None,
                show_in_performers: None,
                show_in_credits: Some(false),
            },
        )
        .expect("update category")
        .expect("updated category");
        assert!(!updated.show_in_credits);

        let credit = create_credit(
            &connection,
            CreditInput {
                work_type: "video".to_string(),
                work_id: "video-credits".to_string(),
                performer_id: "performer-credits".to_string(),
                character_name: Some(created.key.clone()),
                character_original_name: None,
                credited_as: None,
                credited_as_mode: None,
                credit_type_category_id: Some(created.key.clone()),
                role_importance_category_id: None,
                character_mode: None,
                character_id: None,
                billing_order: None,
                note: None,
            },
        )
        .expect("credit using category");
        let credit_before = get_credit(&connection, &credit.id)
            .expect("get credit")
            .expect("stored credit");

        assert_eq!(
            delete_managed_category_if_unused(&connection, created.key.clone())
                .expect_err("used category blocks delete"),
            "Category cannot be deleted while records use it."
        );
        assert_eq!(
            get_credit(&connection, &credit.id).expect("credit after usage check"),
            Some(credit_before)
        );

        let character_only = create_managed_category(
            &connection,
            ManagedCategoryInput {
                key: Some("cat-character-text".to_string()),
                name: "Character Text".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: None,
                show_in_images: None,
                show_in_performers: None,
                show_in_credits: Some(true),
            },
        )
        .expect("character-text category");
        connection
            .execute(
                "UPDATE credits SET characterName = ?1 WHERE id = ?2",
                params![character_only.key, credit.id],
            )
            .expect("set character text");
        assert!(
            delete_managed_category_if_unused(&connection, character_only.key)
                .expect("characterName is not category usage")
                .deleted
        );

        let role_category = create_managed_category(
            &connection,
            ManagedCategoryInput {
                key: Some("cat-role-main".to_string()),
                name: "Main".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: None,
                show_in_images: None,
                show_in_performers: None,
                show_in_credits: Some(true),
            },
        )
        .expect("role category");
        connection
            .execute(
                "UPDATE credits SET creditTypeCategoryId = NULL,
                 roleImportanceCategoryId = ?1 WHERE id = ?2",
                params![role_category.key, credit.id],
            )
            .expect("set role category");
        assert_eq!(
            delete_managed_category_if_unused(&connection, role_category.key)
                .expect_err("role usage blocks delete"),
            "Category cannot be deleted while records use it."
        );
    }

    #[test]
    fn detail_source_copy_rejects_missing_source() {
        let missing_path = std::env::temp_dir().join(format!(
            "sakurava-detail-copy-missing-test-{}",
            std::process::id()
        ));
        let destination_path = std::env::temp_dir().join(format!(
            "sakurava-detail-copy-destination-test-{}.mp4",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&missing_path);
        let _ = std::fs::remove_file(&destination_path);

        assert_eq!(
            copy_detail_source_file_as(
                missing_path.to_string_lossy().as_ref(),
                destination_path.to_string_lossy().as_ref(),
            )
            .expect_err("missing source should fail"),
            "Source file does not exist"
        );
        assert!(!destination_path.exists());
    }

    #[test]
    fn detail_source_copy_writes_destination_without_deleting_original() {
        let temp_root =
            std::env::temp_dir().join(format!("sakurava-detail-copy-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create temp root");
        let source_path = temp_root.join("source.mp4");
        let destination_path = temp_root.join("export").join("source-copy.mp4");
        std::fs::write(&source_path, "source bytes").expect("write source");

        let result = copy_detail_source_file_as(
            source_path.to_string_lossy().as_ref(),
            destination_path.to_string_lossy().as_ref(),
        )
        .expect("copy source");

        assert!(result.success);
        assert!(source_path.is_file());
        assert!(destination_path.is_file());
        assert_eq!(
            std::fs::read_to_string(&source_path).expect("read source"),
            "source bytes"
        );
        assert_eq!(
            std::fs::read_to_string(&destination_path).expect("read destination"),
            "source bytes"
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn detail_source_folder_reveal_validation_rejects_missing_path() {
        assert_eq!(
            validate_detail_source_file_path("   ").expect_err("empty path should fail"),
            "Source file path is required"
        );
    }

    #[test]
    fn detail_source_copy_rejects_same_source_and_destination() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-detail-same-path-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create temp root");
        let source_path = temp_root.join("source.mp4");
        std::fs::write(&source_path, "source bytes").expect("write source");

        assert_eq!(
            copy_detail_source_file_as(
                source_path.to_string_lossy().as_ref(),
                source_path.to_string_lossy().as_ref(),
            )
            .expect_err("same path should fail"),
            "Destination must be different from the source file"
        );
        assert!(source_path.is_file());

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn export_csv_write_rejects_empty_path() {
        assert_eq!(
            write_export_csv_file("   ", "title\r\nExample")
                .expect_err("empty export path should fail"),
            "Export destination path is required"
        );
    }

    #[test]
    fn export_csv_write_rejects_directory_path() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-export-directory-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create export folder");

        assert_eq!(
            write_export_csv_file(temp_root.to_string_lossy().as_ref(), "title\r\nExample")
                .expect_err("directory path should fail"),
            "Export destination must be a file path"
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn export_csv_write_writes_csv_text_without_database_access() {
        let temp_root =
            std::env::temp_dir().join(format!("sakurava-export-write-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create export folder");
        let destination = temp_root.join("export.csv");
        let content = "title,notes\r\n\"A, B\",\"Line one\nLine two\"";

        let result = write_export_csv_file(destination.to_string_lossy().as_ref(), content)
            .expect("write csv export");

        assert!(result.success);
        assert_eq!(result.bytes_written, content.len());
        assert_eq!(
            std::fs::read_to_string(&destination).expect("read csv export"),
            content
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn import_csv_read_rejects_empty_path() {
        assert_eq!(
            read_import_csv_file("   ").expect_err("empty import path should fail"),
            "Import source path is required"
        );
    }

    #[test]
    fn import_csv_read_rejects_directory_path() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-import-directory-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create import folder");

        assert_eq!(
            read_import_csv_file(temp_root.to_string_lossy().as_ref())
                .expect_err("directory path should fail"),
            "Import source must be a CSV file path"
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn import_csv_read_rejects_non_csv_extension() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-import-extension-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create import folder");
        let source = temp_root.join("import.txt");
        std::fs::write(&source, "Action,Sakurava Ref").expect("write import text");

        assert_eq!(
            read_import_csv_file(source.to_string_lossy().as_ref())
                .expect_err("non-csv path should fail"),
            "Import source must be a CSV file"
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn import_csv_read_reads_csv_text_without_database_access() {
        let temp_root =
            std::env::temp_dir().join(format!("sakurava-import-read-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create import folder");
        let source = temp_root.join("import.csv");
        let content = "Action,Sakurava Ref,Title\r\nAuto,VID-ABC1234,\"A, B\"";
        std::fs::write(&source, content).expect("write import csv");

        let result =
            read_import_csv_file(source.to_string_lossy().as_ref()).expect("read csv import");

        assert!(result.success);
        assert_eq!(result.bytes_read, content.len());
        assert_eq!(result.csv_content, content);

        let _ = std::fs::remove_dir_all(temp_root);
    }

    fn empty_video_input() -> VideoInput {
        VideoInput {
            title: " ".to_string(),
            original_title: None,
            code: None,
            censorship: None,
            availability: None,
            release_date: None,
            duration_minutes: None,
            resolution: None,
            file_size_bytes: None,
            file_type: None,
            publisher_label: None,
            cover_path: None,
            media_path: None,
            categories_json: None,
            related_performers_json: None,
            related_images_json: None,
            source_links_json: None,
            rating_json: None,
            notes: None,
            favorite: None,
        }
    }

    fn empty_image_input() -> ImageInput {
        ImageInput {
            title: " ".to_string(),
            original_title: None,
            code: None,
            censorship: None,
            availability: None,
            release_date: None,
            publisher_label: None,
            cover_path: None,
            folder_path: None,
            image_count: None,
            main_resolution: None,
            total_file_size_bytes: None,
            main_file_type: None,
            gallery_image_paths_json: None,
            categories_json: None,
            related_performers_json: None,
            related_videos_json: None,
            source_links_json: None,
            rating_json: None,
            notes: None,
            favorite: None,
        }
    }

    fn empty_performer_input() -> PerformerInput {
        PerformerInput {
            name: " ".to_string(),
            original_name: None,
            aliases_json: None,
            status: None,
            debut_date: None,
            retired_date: None,
            birth_date: None,
            gender: None,
            birthplace: None,
            nationality: None,
            blood_type: None,
            height_cm: None,
            weight_kg: None,
            measurements: None,
            cup_size: None,
            cover_path: None,
            performer_thumbnail_paths_json: None,
            filmography_count: None,
            pictorials_count: None,
            related_videos_json: None,
            related_images_json: None,
            source_links_json: None,
            categories_json: None,
            rating_json: None,
            notes: None,
            favorite: None,
        }
    }
}
