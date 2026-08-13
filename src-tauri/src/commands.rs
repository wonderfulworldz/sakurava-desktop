use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{fs, io};

use rusqlite::{params, Connection, DropBehavior, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Scopes, State};
use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn ReplaceFileW(
        replaced_file_name: *const u16,
        replacement_file_name: *const u16,
        backup_file_name: *const u16,
        replace_flags: u32,
        exclude: *mut std::ffi::c_void,
        reserved: *mut std::ffi::c_void,
    ) -> i32;
}
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

#[cfg(test)]
use crate::database::preview_backup_package;
use crate::database::{
    allocate_sakurava_ref, backup_runtime_database, claim_or_allocate_sakurava_ref, clear_app_generated_cache,
    create_import_safety_backup_package, credit_ref_yymm, migrate_sakurava_refs,
    open_default_backup_folder, register_current_sakurava_ref_alias,
    format_sakurava_ref, require_migrated_sakurava_refs, resolve_sakurava_ref, restore_runtime_database,
    sakurava_ref_migration_status, BackupFolderOpenResult, BackupPackageDeleteResult,
    BackupPackageExportResult, BackupPackageImportError, BackupPackageImportResult,
    BackupPackageInfo, BackupPackagePreviewError, BackupPackageRestoreError,
    BackupPackageRestoreResult, BackupPackageRotationResult, BackupPackageType, ClearCacheResult,
    DatabaseBackupResult, DatabaseRestoreResult, RuntimeDatabase, SakuravaRefMigrationResult,
    SakuravaRefMigrationStatus,
};
use crate::managed_media::catalog_lifecycle::{
    queue_missing_or_outdated, reconcile_owner_mutation, ManualRegenerationQueueResult,
    OwnerSources,
};
use crate::managed_media::{
    descriptors::{
        resolve_descriptor_batch, ManagedMediaDescriptor, ManagedMediaDescriptorRequest,
    },
    path::ManagedMediaRoot,
    production::ProductionManagedMediaRuntime,
    status::{load_managed_media_progress_status, ManagedMediaProgressStatus},
};
use crate::restore_coordinator::{
    begin_restore, complete_recovery, complete_restore, create_backup_package_v2,
    delete_backup_package_v2_or_legacy, export_backup_package_v2_or_legacy,
    import_selected_backup_package_v2_or_legacy, list_backup_packages_v2_and_legacy,
    preview_backup_package_v2_or_legacy, recovery_status, rollback_after_state_failure,
    rotate_automatic_backup_packages_v2_and_legacy, RestorePackagePreview, RestoreRecoveryStatus,
    RestoreRollbackTransition, RestoreStateTransition,
};
use crate::safe_filter::{
    sanitize_related_json, sanitize_string_array_json, visible_catalog_ids, VisibleCatalogIds,
};

static ID_COUNTER: AtomicU64 = AtomicU64::new(1);
const IMPORT_PLAN_PROCESSING_FAILURE: &str =
    "The import plan could not be processed. No catalog changes were saved. Preview the file again before retrying.";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub id: String,
    pub sakurava_ref: String,
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
    pub glossary_refs_json: String,
    pub rating_json: String,
    pub r_plus: bool,
    pub notes: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInput {
    pub issuance_yymm: Option<String>,
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
    pub glossary_refs_json: Option<String>,
    pub rating_json: Option<String>,
    pub r_plus: Option<bool>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
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
    pub glossary_refs_json: Option<String>,
    pub rating_json: Option<String>,
    pub r_plus: Option<bool>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    pub id: String,
    pub sakurava_ref: String,
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
    pub glossary_refs_json: String,
    pub rating_json: String,
    pub r_plus: bool,
    pub notes: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInput {
    pub issuance_yymm: Option<String>,
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
    pub glossary_refs_json: Option<String>,
    pub rating_json: Option<String>,
    pub r_plus: Option<bool>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
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
    pub glossary_refs_json: Option<String>,
    pub rating_json: Option<String>,
    pub r_plus: Option<bool>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Performer {
    pub id: String,
    pub sakurava_ref: String,
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
    pub glossary_refs_json: String,
    pub categories_json: String,
    pub rating_json: String,
    pub r_plus: bool,
    pub notes: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformerInput {
    pub issuance_yymm: Option<String>,
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
    pub glossary_refs_json: Option<String>,
    pub categories_json: Option<String>,
    pub rating_json: Option<String>,
    pub r_plus: Option<bool>,
    pub notes: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
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
    pub glossary_refs_json: Option<String>,
    pub categories_json: Option<String>,
    pub rating_json: Option<String>,
    pub r_plus: Option<bool>,
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
pub struct SafeFilterRecord<T> {
    pub state: String,
    pub record: Option<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntry {
    pub id: String,
    pub sakurava_ref: String,
    pub term: String,
    pub definition: String,
    pub synonyms_json: String,
    pub category: String,
    pub parent_id: String,
    pub thumbnail_path: String,
    pub favorite: bool,
    pub source_title: String,
    pub source_url: String,
    pub r_plus: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntryInput {
    pub issuance_yymm: Option<String>,
    pub term: String,
    pub definition: String,
    pub synonyms_json: Option<String>,
    pub category: Option<String>,
    pub parent_id: Option<String>,
    pub thumbnail_path: Option<String>,
    pub favorite: Option<bool>,
    pub source_title: Option<String>,
    pub source_url: Option<String>,
    pub r_plus: Option<bool>,
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
    pub r_plus: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCategory {
    pub key: String,
    pub sakurava_ref: String,
    pub name: String,
    pub parent_key: Option<String>,
    pub description: String,
    pub thumbnail_path: String,
    pub show_in_videos: bool,
    pub show_in_images: bool,
    pub show_in_performers: bool,
    pub show_in_credits: bool,
    pub r_plus: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCategoryInput {
    pub issuance_yymm: Option<String>,
    pub key: Option<String>,
    pub name: String,
    pub parent_key: Option<String>,
    pub description: Option<String>,
    pub thumbnail_path: Option<String>,
    pub show_in_videos: Option<bool>,
    pub show_in_images: Option<bool>,
    pub show_in_performers: Option<bool>,
    pub show_in_credits: Option<bool>,
    pub r_plus: Option<bool>,
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
    pub r_plus: Option<bool>,
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
    pub sakurava_ref: String,
    pub work_type: String,
    pub work_id: String,
    pub performer_id: String,
    pub character_name: String,
    pub character_original_name: Option<String>,
    pub credited_as: Option<String>,
    pub credit_type_text: Option<String>,
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
    pub credit_type_text: Option<String>,
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
    pub credit_type_text: Option<Option<String>>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportFileWriteResult {
    pub destination_path: String,
    pub display_name: String,
    pub bytes_written: usize,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportFileInput {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportFileSetWriteResult {
    pub destination_path: String,
    pub display_names: Vec<String>,
    pub files_written: usize,
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

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogFileReadResult {
    pub source_path: String,
    pub display_name: String,
    pub format: String,
    pub bytes: Vec<u8>,
    pub bytes_read: usize,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogApplyPlan {
    pub contract_version: u32,
    pub issuance_yymm: String,
    pub source_fingerprint: String,
    pub operation_fingerprint: String,
    pub catalog_snapshot: Value,
    pub operations: Vec<ImportCatalogPlanOperation>,
    pub skipped_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogPlanOperation {
    pub source_identity: String,
    pub source_row_number: usize,
    pub section: String,
    pub action: String,
    pub stable_record_identifier: String,
    pub record_id: Option<String>,
    pub temporary_identifier: Option<String>,
    pub current_record: Option<Value>,
    pub proposed_values: Value,
    pub field_differences: Vec<Value>,
    pub cleared_fields: Vec<String>,
    pub warnings: Vec<String>,
    pub blocking_issues: Vec<String>,
    pub dependency_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogApplyResult {
    pub transaction_status: String,
    pub backup_package_name: Option<String>,
    pub created_count: usize,
    pub updated_count: usize,
    pub cleared_field_count: usize,
    pub deleted_count: usize,
    pub skipped_count: usize,
    pub failure_stage: Option<String>,
    /// Development-facing gate identifier. The frontend intentionally renders
    /// only the concise `message` and never exposes this implementation detail.
    pub failure_code: Option<String>,
    pub message: String,
    pub rollback_completed: bool,
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
    database.ensure_restore_resolved()?;
    backup_runtime_database(&database, destination_path)
}

#[tauri::command]
pub fn database_restore(
    database: State<'_, RuntimeDatabase>,
    source_path: String,
) -> Result<DatabaseRestoreResult, String> {
    database.ensure_restore_resolved()?;
    restore_runtime_database(&database, source_path)
}

#[tauri::command]
pub fn backup_package_create(
    database: State<'_, RuntimeDatabase>,
    backup_type: BackupPackageType,
    note: Option<String>,
    protected_state: String,
) -> Result<BackupPackageInfo, String> {
    create_backup_package_v2(&database, backup_type, note, protected_state)
}

#[tauri::command]
pub fn backup_package_list(
    database: State<'_, RuntimeDatabase>,
) -> Result<Vec<BackupPackageInfo>, String> {
    list_backup_packages_v2_and_legacy(&database)
}

#[tauri::command]
pub fn backup_package_preview(
    database: State<'_, RuntimeDatabase>,
    package_name: String,
) -> Result<RestorePackagePreview, BackupPackagePreviewError> {
    preview_backup_package_v2_or_legacy(&database, &package_name)
}

#[tauri::command]
pub fn backup_package_restore(
    database: State<'_, RuntimeDatabase>,
    package_name: String,
    migration_yymm: String,
    current_protected_state: String,
) -> Result<RestoreStateTransition, BackupPackageRestoreError> {
    begin_restore(
        &database,
        &package_name,
        &migration_yymm,
        current_protected_state,
    )
}

#[tauri::command]
pub fn backup_package_restore_complete(
    database: State<'_, RuntimeDatabase>,
    operation_id: String,
    applied_state_sha256: String,
) -> Result<BackupPackageRestoreResult, BackupPackageRestoreError> {
    complete_restore(&database, &operation_id, &applied_state_sha256)
}

#[tauri::command]
pub fn backup_package_restore_rollback(
    database: State<'_, RuntimeDatabase>,
    operation_id: String,
) -> Result<RestoreRollbackTransition, BackupPackageRestoreError> {
    rollback_after_state_failure(&database, &operation_id)
}

#[tauri::command]
pub fn backup_restore_recovery_status(
    database: State<'_, RuntimeDatabase>,
) -> Result<RestoreRecoveryStatus, BackupPackageRestoreError> {
    recovery_status(&database)
}

#[tauri::command]
pub fn backup_restore_recovery_complete(
    database: State<'_, RuntimeDatabase>,
    operation_id: String,
    mode: String,
    applied_state_sha256: String,
) -> Result<Option<BackupPackageRestoreResult>, BackupPackageRestoreError> {
    complete_recovery(&database, &operation_id, &mode, &applied_state_sha256)
}

#[tauri::command]
pub fn sakurava_ref_migration_get_status(
    database: State<'_, RuntimeDatabase>,
) -> Result<SakuravaRefMigrationStatus, String> {
    sakurava_ref_migration_status(&database)
}

#[tauri::command]
pub fn sakurava_ref_migration_apply(
    database: State<'_, RuntimeDatabase>,
    migration_yymm: String,
) -> Result<SakuravaRefMigrationResult, String> {
    database.ensure_restore_resolved()?;
    migrate_sakurava_refs(&database, &migration_yymm)
}

#[tauri::command]
pub fn backup_package_rotate_automatic(
    database: State<'_, RuntimeDatabase>,
    keep_count: usize,
) -> Result<BackupPackageRotationResult, String> {
    rotate_automatic_backup_packages_v2_and_legacy(&database, keep_count)
}

#[tauri::command]
pub fn backup_package_delete(
    database: State<'_, RuntimeDatabase>,
    package_name: String,
) -> Result<BackupPackageDeleteResult, String> {
    delete_backup_package_v2_or_legacy(&database, &package_name)
}

#[tauri::command]
pub fn backup_package_export(
    database: State<'_, RuntimeDatabase>,
    package_name: String,
    destination_root: String,
) -> Result<BackupPackageExportResult, String> {
    export_backup_package_v2_or_legacy(&database, &package_name, Path::new(&destination_root))
}

#[tauri::command]
pub async fn backup_package_import_selected(
    app: AppHandle,
    database: State<'_, RuntimeDatabase>,
) -> Result<BackupPackageImportResult, BackupPackageImportError> {
    let selected = app
        .dialog()
        .file()
        .set_title("Restore from Sakurava Backup")
        .add_filter("Sakurava Backup", &["skv"])
        .blocking_pick_file();
    let selected_path = selected
        .map(|path| {
            path.into_path().map_err(|error| BackupPackageImportError {
                code: "invalid_selected_package".to_string(),
                message: format!("Unable to read selected backup package path: {error}"),
            })
        })
        .transpose()?;
    import_selected_backup_package_v2_or_legacy(&database, selected_path)
}

#[tauri::command]
pub fn backup_folder_open(
    database: State<'_, RuntimeDatabase>,
) -> Result<BackupFolderOpenResult, String> {
    open_default_backup_folder(&database)
}

#[tauri::command]
pub fn clear_app_cache(database: State<'_, RuntimeDatabase>) -> Result<ClearCacheResult, String> {
    database.ensure_restore_resolved()?;
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
pub fn export_file_write(
    destination_path: String,
    bytes: Vec<u8>,
    expected_extension: String,
) -> Result<ExportFileWriteResult, String> {
    write_export_file(&destination_path, &bytes, &expected_extension)
}

#[tauri::command]
pub fn export_file_set_write(
    destination_folder: String,
    files: Vec<ExportFileInput>,
) -> Result<ExportFileSetWriteResult, String> {
    write_export_file_set(&destination_folder, files)
}

#[tauri::command]
pub fn import_csv_read(source_path: String) -> Result<ImportCsvReadResult, String> {
    read_import_csv_file(&source_path)
}

#[tauri::command]
pub fn import_catalog_file_read(
    source_path: String,
) -> Result<ImportCatalogFileReadResult, String> {
    read_import_catalog_file(&source_path)
}

#[tauri::command]
pub fn import_catalog_apply(
    database: State<'_, RuntimeDatabase>,
    plan: ImportCatalogApplyPlan,
) -> ImportCatalogApplyResult {
    if let Err(message) = database.ensure_restore_resolved() {
        return import_apply_failure(
            "blocked",
            "restore_recovery",
            &message,
            false,
            None,
            plan.operations.len(),
        );
    }
    apply_import_catalog_plan(&database, plan)
}

#[tauri::command]
pub fn media_asset_allow_root(
    database: State<'_, RuntimeDatabase>,
    scopes: State<'_, Scopes>,
    root_path: String,
) -> Result<MediaAssetRootResult, String> {
    database.ensure_restore_resolved()?;
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
pub fn managed_media_descriptor_resolve_batch(
    database: State<'_, RuntimeDatabase>,
    scopes: State<'_, Scopes>,
    requests: Vec<ManagedMediaDescriptorRequest>,
) -> Result<Vec<ManagedMediaDescriptor>, String> {
    let root = ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir)?;
    let descriptors = with_connection(&database, |connection| {
        Ok(resolve_descriptor_batch(connection, &root, requests))
    })?;

    for descriptor in &descriptors {
        if matches!(
            descriptor.selected_source_class.as_str(),
            "managed_standard" | "managed_native_fallback"
        ) {
            let Some(asset_path) = descriptor.asset_path.as_deref() else {
                continue;
            };
            let validated =
                root.resolve(Path::new(asset_path).strip_prefix(root.as_path()).map_err(
                    |_| "Managed descriptor asset path escaped its protected root.".to_string(),
                )?)?;
            scopes
                .allow_file(&validated)
                .map_err(|error| format!("Unable to allow managed media asset: {error}"))?;
        }
    }

    Ok(descriptors)
}

#[tauri::command]
pub fn managed_media_progress_get(
    database: State<'_, RuntimeDatabase>,
) -> Result<ManagedMediaProgressStatus, String> {
    with_connection(&database, |connection| {
        load_managed_media_progress_status(connection).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn managed_media_regenerate_missing_or_outdated(
    database: State<'_, RuntimeDatabase>,
    runtime: State<'_, ProductionManagedMediaRuntime>,
) -> Result<ManualRegenerationQueueResult, String> {
    database.ensure_restore_resolved()?;
    let root = ManagedMediaRoot::from_app_data_dir(&database.paths.app_data_dir)?;
    let result = with_creation_transaction(&database, |connection| {
        queue_missing_or_outdated(connection, &root, &current_timestamp())
    })?;
    wake_after_manual_regeneration_queue(&result, || {
        let _ = runtime.wake();
    });
    Ok(result)
}

fn wake_after_manual_regeneration_queue(
    result: &ManualRegenerationQueueResult,
    wake: impl FnOnce(),
) {
    if result.queued_count > 0 {
        wake();
    }
}

#[tauri::command]
pub fn video_create(
    database: State<'_, RuntimeDatabase>,
    input: VideoInput,
) -> Result<Video, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let video = create_video(connection, input)?;
        reconcile_catalog_lifecycle(connection, None, Some(owner_sources_from_video(&video)))?;
        require_migrated_sakurava_refs(connection)?;
        Ok(video)
    })
}

#[tauri::command]
pub fn video_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<Video>, String> {
    with_connection(&database, list_videos)
}

#[tauri::command]
pub fn video_list_visible(database: State<'_, RuntimeDatabase>) -> Result<Vec<Video>, String> {
    with_connection(&database, |connection| {
        let visible = visible_catalog_ids(connection)?;
        Ok(list_videos(connection)?
            .into_iter()
            .filter(|video| visible.videos.contains(&video.id))
            .map(|video| sanitize_video(video, &visible))
            .collect())
    })
}

#[tauri::command]
pub fn video_get(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<Option<Video>, String> {
    with_connection(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "V", "videos", "id", &id)?;
        get_video(connection, &id)
    })
}

#[tauri::command]
pub fn video_get_visible(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<SafeFilterRecord<Video>, String> {
    with_connection(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "V", "videos", "id", &id)?;
        let Some(video) = get_video(connection, &id)? else {
            return Ok(SafeFilterRecord {
                state: "missing".to_string(),
                record: None,
            });
        };
        let visible = visible_catalog_ids(connection)?;
        Ok(if visible.videos.contains(&video.id) {
            SafeFilterRecord {
                state: "visible".to_string(),
                record: Some(sanitize_video(video, &visible)),
            }
        } else {
            SafeFilterRecord {
                state: "hidden".to_string(),
                record: None,
            }
        })
    })
}

#[tauri::command]
pub fn video_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: VideoPatch,
) -> Result<Option<Video>, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "V", "videos", "id", &id)?;
        let previous = get_video(connection, &id)?.map(|video| owner_sources_from_video(&video));
        let updated = update_video(connection, &id, patch)?;
        if let Some(updated) = &updated {
            reconcile_catalog_lifecycle(
                connection,
                previous,
                Some(owner_sources_from_video(updated)),
            )?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(updated)
    })
}

#[tauri::command]
pub fn video_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "V", "videos", "id", &id)?;
        let previous = get_video(connection, &id)?.map(|video| owner_sources_from_video(&video));
        let result = delete_catalog_entity_in_transaction(connection, "videos", id)?;
        if result.deleted {
            reconcile_catalog_lifecycle(connection, previous, None)?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(result)
    })
}

#[tauri::command]
pub fn image_create(
    database: State<'_, RuntimeDatabase>,
    input: ImageInput,
) -> Result<Image, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let image = create_image(connection, input)?;
        reconcile_catalog_lifecycle(connection, None, Some(owner_sources_from_image(&image)))?;
        require_migrated_sakurava_refs(connection)?;
        Ok(image)
    })
}

#[tauri::command]
pub fn image_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<Image>, String> {
    with_connection(&database, list_images)
}

#[tauri::command]
pub fn image_list_visible(database: State<'_, RuntimeDatabase>) -> Result<Vec<Image>, String> {
    with_connection(&database, |connection| {
        let visible = visible_catalog_ids(connection)?;
        Ok(list_images(connection)?
            .into_iter()
            .filter(|image| visible.images.contains(&image.id))
            .map(|image| sanitize_image(image, &visible))
            .collect())
    })
}

#[tauri::command]
pub fn image_get(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<Option<Image>, String> {
    with_connection(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "I", "images", "id", &id)?;
        get_image(connection, &id)
    })
}

#[tauri::command]
pub fn image_get_visible(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<SafeFilterRecord<Image>, String> {
    with_connection(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "I", "images", "id", &id)?;
        let Some(image) = get_image(connection, &id)? else {
            return Ok(SafeFilterRecord {
                state: "missing".to_string(),
                record: None,
            });
        };
        let visible = visible_catalog_ids(connection)?;
        Ok(if visible.images.contains(&image.id) {
            SafeFilterRecord {
                state: "visible".to_string(),
                record: Some(sanitize_image(image, &visible)),
            }
        } else {
            SafeFilterRecord {
                state: "hidden".to_string(),
                record: None,
            }
        })
    })
}

#[tauri::command]
pub fn image_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: ImagePatch,
) -> Result<Option<Image>, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "I", "images", "id", &id)?;
        let previous = get_image(connection, &id)?.map(|image| owner_sources_from_image(&image));
        let updated = update_image(connection, &id, patch)?;
        if let Some(updated) = &updated {
            reconcile_catalog_lifecycle(
                connection,
                previous,
                Some(owner_sources_from_image(updated)),
            )?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(updated)
    })
}

#[tauri::command]
pub fn image_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "I", "images", "id", &id)?;
        let previous = get_image(connection, &id)?.map(|image| owner_sources_from_image(&image));
        let result = delete_catalog_entity_in_transaction(connection, "images", id)?;
        if result.deleted {
            reconcile_catalog_lifecycle(connection, previous, None)?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(result)
    })
}

#[tauri::command]
pub fn performer_create(
    database: State<'_, RuntimeDatabase>,
    input: PerformerInput,
) -> Result<Performer, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let performer = create_performer(connection, input)?;
        reconcile_catalog_lifecycle(
            connection,
            None,
            Some(owner_sources_from_performer(&performer)),
        )?;
        require_migrated_sakurava_refs(connection)?;
        Ok(performer)
    })
}

#[tauri::command]
pub fn performer_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<Performer>, String> {
    with_connection(&database, list_performers)
}

#[tauri::command]
pub fn performer_list_visible(
    database: State<'_, RuntimeDatabase>,
) -> Result<Vec<Performer>, String> {
    with_connection(&database, |connection| {
        let visible = visible_catalog_ids(connection)?;
        Ok(list_performers(connection)?
            .into_iter()
            .filter(|performer| visible.performers.contains(&performer.id))
            .map(|performer| sanitize_performer(performer, &visible))
            .collect())
    })
}

#[tauri::command]
pub fn performer_get(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<Option<Performer>, String> {
    with_connection(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "P", "performers", "id", &id)?;
        get_performer(connection, &id)
    })
}

#[tauri::command]
pub fn performer_get_visible(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<SafeFilterRecord<Performer>, String> {
    with_connection(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "P", "performers", "id", &id)?;
        let Some(performer) = get_performer(connection, &id)? else {
            return Ok(SafeFilterRecord {
                state: "missing".to_string(),
                record: None,
            });
        };
        let visible = visible_catalog_ids(connection)?;
        Ok(if visible.performers.contains(&performer.id) {
            SafeFilterRecord {
                state: "visible".to_string(),
                record: Some(sanitize_performer(performer, &visible)),
            }
        } else {
            SafeFilterRecord {
                state: "hidden".to_string(),
                record: None,
            }
        })
    })
}

#[tauri::command]
pub fn performer_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: PerformerPatch,
) -> Result<Option<Performer>, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "P", "performers", "id", &id)?;
        let previous = get_performer(connection, &id)?
            .map(|performer| owner_sources_from_performer(&performer));
        let updated = update_performer(connection, &id, patch)?;
        if let Some(updated) = &updated {
            reconcile_catalog_lifecycle(
                connection,
                previous,
                Some(owner_sources_from_performer(updated)),
            )?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(updated)
    })
}

#[tauri::command]
pub fn performer_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "P", "performers", "id", &id)?;
        let previous = get_performer(connection, &id)?
            .map(|performer| owner_sources_from_performer(&performer));
        let result = delete_catalog_entity_in_transaction(connection, "performers", id)?;
        if result.deleted {
            reconcile_catalog_lifecycle(connection, previous, None)?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(result)
    })
}

#[tauri::command]
pub fn managed_category_create(
    database: State<'_, RuntimeDatabase>,
    input: ManagedCategoryInput,
) -> Result<ManagedCategory, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let category = create_managed_category(connection, input)?;
        reconcile_catalog_lifecycle(
            connection,
            None,
            Some(owner_sources_from_category(&category)),
        )?;
        require_migrated_sakurava_refs(connection)?;
        Ok(category)
    })
}

#[tauri::command]
pub fn managed_category_list(
    database: State<'_, RuntimeDatabase>,
) -> Result<Vec<ManagedCategory>, String> {
    with_connection(&database, list_managed_categories)
}

#[tauri::command]
pub fn managed_category_list_visible(
    database: State<'_, RuntimeDatabase>,
) -> Result<Vec<ManagedCategory>, String> {
    with_connection(&database, |connection| {
        let visible = visible_catalog_ids(connection)?;
        Ok(list_managed_categories(connection)?
            .into_iter()
            .filter(|category| visible.categories.contains(&category.key))
            .map(|mut category| {
                if category
                    .parent_key
                    .as_ref()
                    .is_some_and(|parent_key| !visible.categories.contains(parent_key))
                {
                    category.parent_key = None;
                }
                category
            })
            .collect())
    })
}

#[tauri::command]
pub fn managed_category_get(
    database: State<'_, RuntimeDatabase>,
    key: String,
) -> Result<Option<ManagedCategory>, String> {
    with_connection(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let key = resolve_identity_or_technical(connection, "C", "managedCategories", "key", &key)?;
        get_managed_category(connection, &key)
    })
}

#[tauri::command]
pub fn managed_category_update(
    database: State<'_, RuntimeDatabase>,
    key: String,
    patch: ManagedCategoryPatch,
) -> Result<Option<ManagedCategory>, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let key = resolve_identity_or_technical(connection, "C", "managedCategories", "key", &key)?;
        let previous = get_managed_category(connection, &key)?
            .map(|category| owner_sources_from_category(&category));
        let updated = update_managed_category(connection, &key, patch)?;
        if let Some(updated) = &updated {
            reconcile_catalog_lifecycle(
                connection,
                previous,
                Some(owner_sources_from_category(updated)),
            )?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(updated)
    })
}

#[tauri::command]
pub fn managed_category_delete(
    database: State<'_, RuntimeDatabase>,
    key: String,
) -> Result<ManagedCategoryDeleteResult, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let key = resolve_identity_or_technical(connection, "C", "managedCategories", "key", &key)?;
        let previous = get_managed_category(connection, &key)?
            .map(|category| owner_sources_from_category(&category));
        let result = delete_managed_category_if_unused(connection, key)?;
        if result.deleted {
            reconcile_catalog_lifecycle(connection, previous, None)?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(result)
    })
}

#[tauri::command]
pub fn glossary_create(
    database: State<'_, RuntimeDatabase>,
    input: GlossaryEntryInput,
) -> Result<GlossaryEntry, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let entry = create_glossary_entry(connection, input)?;
        reconcile_catalog_lifecycle(connection, None, Some(owner_sources_from_glossary(&entry)))?;
        require_migrated_sakurava_refs(connection)?;
        Ok(entry)
    })
}

#[tauri::command]
pub fn glossary_list(database: State<'_, RuntimeDatabase>) -> Result<Vec<GlossaryEntry>, String> {
    with_connection(&database, list_glossary_entries)
}

#[tauri::command]
pub fn glossary_list_visible(
    database: State<'_, RuntimeDatabase>,
) -> Result<Vec<GlossaryEntry>, String> {
    with_connection(&database, |connection| {
        let visible = visible_catalog_ids(connection)?;
        Ok(list_glossary_entries(connection)?
            .into_iter()
            .filter(|entry| visible.glossary.contains(&entry.id))
            .map(|mut entry| {
                if !entry.parent_id.is_empty() && !visible.glossary.contains(&entry.parent_id) {
                    entry.parent_id.clear();
                }
                entry
            })
            .collect())
    })
}

#[tauri::command]
pub fn glossary_update(
    database: State<'_, RuntimeDatabase>,
    id: String,
    patch: GlossaryEntryPatch,
) -> Result<Option<GlossaryEntry>, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "G", "glossary_entries", "id", &id)?;
        let previous =
            get_glossary_entry(connection, &id)?.map(|entry| owner_sources_from_glossary(&entry));
        let updated = update_glossary_entry(connection, &id, patch)?;
        if let Some(updated) = &updated {
            reconcile_catalog_lifecycle(
                connection,
                previous,
                Some(owner_sources_from_glossary(updated)),
            )?;
            require_migrated_sakurava_refs(connection)?;
        }
        Ok(updated)
    })
}

#[tauri::command]
pub fn glossary_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    database.ensure_restore_resolved()?;
    with_creation_transaction(&database, |connection| {
        require_migrated_sakurava_refs(connection)?;
        let id = resolve_identity_or_technical(connection, "G", "glossary_entries", "id", &id)?;
        let Some(entry) = get_glossary_entry(connection, &id)? else {
            return Err("Glossary entry was not found".to_string());
        };
        if glossary_child_count(connection, &id)? > 0 {
            return Err("Glossary entry cannot be deleted while child entries use it.".to_string());
        }
        let deleted = connection
            .execute("DELETE FROM glossary_entries WHERE id = ?1", [&id])
            .map_err(database_error)?
            > 0;
        if deleted {
            reconcile_catalog_lifecycle(
                connection,
                Some(owner_sources_from_glossary(&entry)),
                None,
            )?;
            require_migrated_sakurava_refs(connection)?;
        }
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
    database.ensure_restore_resolved()?;
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
    database.ensure_restore_resolved()?;
    with_connection(&database, |connection| {
        update_credit(connection, &id, patch)
    })
}

#[tauri::command]
pub fn credit_delete(
    database: State<'_, RuntimeDatabase>,
    id: String,
) -> Result<DeleteResult, String> {
    database.ensure_restore_resolved()?;
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

fn with_creation_transaction<T>(
    database: &RuntimeDatabase,
    action: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let connection = database.connection();
    let mut connection = connection
        .lock()
        .map_err(|_| "Database connection is unavailable".to_string())?;
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let result = action(&transaction)?;
    transaction.commit().map_err(database_error)?;
    Ok(result)
}

fn owner_sources_from_video(video: &Video) -> OwnerSources {
    OwnerSources::video(video.id.clone(), video.cover_path.clone())
}

fn owner_sources_from_image(image: &Image) -> OwnerSources {
    OwnerSources::image(
        image.id.clone(),
        image.cover_path.clone(),
        image.gallery_image_paths_json.clone(),
    )
}

fn owner_sources_from_performer(performer: &Performer) -> OwnerSources {
    OwnerSources::performer(
        performer.id.clone(),
        performer.cover_path.clone(),
        performer.performer_thumbnail_paths_json.clone(),
    )
}

fn owner_sources_from_category(category: &ManagedCategory) -> OwnerSources {
    OwnerSources::category(category.key.clone(), category.thumbnail_path.clone())
}

fn owner_sources_from_glossary(entry: &GlossaryEntry) -> OwnerSources {
    OwnerSources::glossary(entry.id.clone(), entry.thumbnail_path.clone())
}

fn load_owner_sources(
    connection: &Connection,
    section: &str,
    id: &str,
) -> Result<Option<OwnerSources>, String> {
    match section {
        "videos" => Ok(get_video(connection, id)?.map(|value| owner_sources_from_video(&value))),
        "images" => Ok(get_image(connection, id)?.map(|value| owner_sources_from_image(&value))),
        "performers" => {
            Ok(get_performer(connection, id)?.map(|value| owner_sources_from_performer(&value)))
        }
        "categories" => {
            Ok(get_managed_category(connection, id)?
                .map(|value| owner_sources_from_category(&value)))
        }
        "glossary" => Ok(
            get_glossary_entry(connection, id)?.map(|value| owner_sources_from_glossary(&value))
        ),
        _ => Ok(None),
    }
}

fn reconcile_catalog_lifecycle(
    connection: &Connection,
    previous: Option<OwnerSources>,
    final_state: Option<OwnerSources>,
) -> Result<(), String> {
    let mut token_generator = || Ok(new_id("media_slot"));
    reconcile_owner_mutation(
        connection,
        previous.as_ref(),
        final_state.as_ref(),
        &mut token_generator,
        &current_timestamp(),
    )
}

fn resolve_identity_or_technical(
    connection: &Connection,
    section_code: &str,
    table: &str,
    key_column: &str,
    identity: &str,
) -> Result<String, String> {
    if let Some(key) = resolve_sakurava_ref(connection, section_code, identity)? {
        return Ok(key);
    }
    let exists: Option<String> = connection
        .query_row(
            &format!("SELECT {key_column} FROM {table} WHERE {key_column} = ?1"),
            [identity],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    exists.ok_or_else(|| "Sakurava Ref was not found.".to_string())
}

fn create_video(connection: &Connection, input: VideoInput) -> Result<Video, String> {
    create_video_with_requested_ref(connection, input, None)
}

fn create_video_with_requested_ref(
    connection: &Connection,
    input: VideoInput,
    requested_sakurava_ref: Option<&str>,
) -> Result<Video, String> {
    let title = require_text(input.title, "Video title is required")?;
    let sakurava_ref = claim_or_allocate_sakurava_ref(
        connection,
        "V",
        input
            .issuance_yymm
            .as_deref()
            .ok_or("Issuance month is required")?,
        requested_sakurava_ref,
    )?;
    let timestamp = current_timestamp();
    let video = Video {
        id: new_id("video"),
        sakurava_ref,
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
        glossary_refs_json: normalize_string_array_json(input.glossary_refs_json),
        rating_json: normalize_object_json(input.rating_json),
        r_plus: input.r_plus.unwrap_or(false),
        notes: default_text(input.notes),
        favorite: input.favorite.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO videos (
                id, sakuravaRef, title, originalTitle, code, censorship, availability, releaseDate,
                durationMinutes, resolution, fileSizeBytes, fileType,
                publisherLabel, coverPath, mediaPath, categoriesJson,
                relatedPerformersJson, relatedImagesJson, source_links_json, glossaryRefsJson, ratingJson, rPlus, notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26)",
            params![
                video.id,
                video.sakurava_ref,
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
                video.glossary_refs_json,
                video.rating_json,
                bool_to_int(video.r_plus),
                video.notes,
                bool_to_int(video.favorite),
                video.created_at,
                video.updated_at
            ],
        )
        .map_err(database_error)?;
    register_current_sakurava_ref_alias(connection, "V", &video.sakurava_ref)?;

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
    if patch.glossary_refs_json.is_some() {
        video.glossary_refs_json = normalize_string_array_json(patch.glossary_refs_json);
    }
    if patch.rating_json.is_some() {
        video.rating_json = normalize_object_json(patch.rating_json);
    }
    apply_text(&mut video.notes, patch.notes);
    if let Some(favorite) = patch.favorite {
        video.favorite = favorite;
    }
    if let Some(r_plus) = patch.r_plus {
        video.r_plus = r_plus;
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
                relatedImagesJson = ?17, source_links_json = ?18, glossaryRefsJson = ?19,
                ratingJson = ?20, rPlus = ?21, notes = ?22,
                favorite = ?23, updatedAt = ?24
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
                video.glossary_refs_json,
                video.rating_json,
                bool_to_int(video.r_plus),
                video.notes,
                bool_to_int(video.favorite),
                video.updated_at
            ],
        )
        .map_err(database_error)?;

    get_video(connection, id)
}

fn create_image(connection: &Connection, input: ImageInput) -> Result<Image, String> {
    create_image_with_requested_ref(connection, input, None)
}

fn create_image_with_requested_ref(
    connection: &Connection,
    input: ImageInput,
    requested_sakurava_ref: Option<&str>,
) -> Result<Image, String> {
    let title = require_text(input.title, "Image title is required")?;
    let sakurava_ref = claim_or_allocate_sakurava_ref(
        connection,
        "I",
        input
            .issuance_yymm
            .as_deref()
            .ok_or("Issuance month is required")?,
        requested_sakurava_ref,
    )?;
    let timestamp = current_timestamp();
    let image = Image {
        id: new_id("image"),
        sakurava_ref,
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
        glossary_refs_json: normalize_string_array_json(input.glossary_refs_json),
        rating_json: normalize_object_json(input.rating_json),
        r_plus: input.r_plus.unwrap_or(false),
        notes: default_text(input.notes),
        favorite: input.favorite.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO images (
                id, sakuravaRef, title, originalTitle, code, censorship, availability, releaseDate,
                publisherLabel, coverPath, folderPath, imageCount, galleryImagePathsJson,
                mainResolution, totalFileSizeBytes, mainFileType,
                categoriesJson, relatedPerformersJson, relatedVideosJson,
                source_links_json, glossaryRefsJson, ratingJson, rPlus, notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
            params![
                image.id,
                image.sakurava_ref,
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
                image.glossary_refs_json,
                image.rating_json,
                bool_to_int(image.r_plus),
                image.notes,
                bool_to_int(image.favorite),
                image.created_at,
                image.updated_at
            ],
        )
        .map_err(database_error)?;
    register_current_sakurava_ref_alias(connection, "I", &image.sakurava_ref)?;

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
    if patch.glossary_refs_json.is_some() {
        image.glossary_refs_json = normalize_string_array_json(patch.glossary_refs_json);
    }
    if patch.rating_json.is_some() {
        image.rating_json = normalize_object_json(patch.rating_json);
    }
    apply_text(&mut image.notes, patch.notes);
    if let Some(favorite) = patch.favorite {
        image.favorite = favorite;
    }
    if let Some(r_plus) = patch.r_plus {
        image.r_plus = r_plus;
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
                source_links_json = ?19, glossaryRefsJson = ?20, ratingJson = ?21,
                rPlus = ?22, notes = ?23, favorite = ?24, updatedAt = ?25
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
                image.glossary_refs_json,
                image.rating_json,
                bool_to_int(image.r_plus),
                image.notes,
                bool_to_int(image.favorite),
                image.updated_at
            ],
        )
        .map_err(database_error)?;

    get_image(connection, id)
}

fn create_performer(connection: &Connection, input: PerformerInput) -> Result<Performer, String> {
    create_performer_with_requested_ref(connection, input, None)
}

fn create_performer_with_requested_ref(
    connection: &Connection,
    input: PerformerInput,
    requested_sakurava_ref: Option<&str>,
) -> Result<Performer, String> {
    let name = require_text(input.name, "Performer name is required")?;
    let sakurava_ref = claim_or_allocate_sakurava_ref(
        connection,
        "P",
        input
            .issuance_yymm
            .as_deref()
            .ok_or("Issuance month is required")?,
        requested_sakurava_ref,
    )?;
    let timestamp = current_timestamp();
    let performer = Performer {
        id: new_id("performer"),
        sakurava_ref,
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
        glossary_refs_json: normalize_string_array_json(input.glossary_refs_json),
        categories_json: normalize_string_array_json(input.categories_json),
        rating_json: normalize_object_json(input.rating_json),
        r_plus: input.r_plus.unwrap_or(false),
        notes: default_text(input.notes),
        favorite: input.favorite.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO performers (
                id, sakuravaRef, name, originalName, aliasesJson, status, debutDate, retiredDate,
                birthDate, gender, birthplace, nationality, bloodType, heightCm, weightKg,
                measurements, cupSize, coverPath, performerThumbnailPathsJson,
                filmographyCount, pictorialsCount, relatedVideosJson,
                relatedImagesJson, source_links_json, glossaryRefsJson, categoriesJson, ratingJson,
                rPlus, notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32)",
            params![
                performer.id,
                performer.sakurava_ref,
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
                performer.glossary_refs_json,
                performer.categories_json,
                performer.rating_json,
                bool_to_int(performer.r_plus),
                performer.notes,
                bool_to_int(performer.favorite),
                performer.created_at,
                performer.updated_at
            ],
        )
        .map_err(database_error)?;
    register_current_sakurava_ref_alias(connection, "P", &performer.sakurava_ref)?;

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
    if patch.glossary_refs_json.is_some() {
        performer.glossary_refs_json = normalize_string_array_json(patch.glossary_refs_json);
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
    if let Some(r_plus) = patch.r_plus {
        performer.r_plus = r_plus;
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
                source_links_json = ?23, glossaryRefsJson = ?24, categoriesJson = ?25,
                ratingJson = ?26, rPlus = ?27, notes = ?28, favorite = ?29, updatedAt = ?30
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
                performer.glossary_refs_json,
                performer.categories_json,
                performer.rating_json,
                bool_to_int(performer.r_plus),
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
    create_managed_category_with_requested_ref(connection, input, None)
}

fn create_managed_category_with_requested_ref(
    connection: &Connection,
    input: ManagedCategoryInput,
    requested_sakurava_ref: Option<&str>,
) -> Result<ManagedCategory, String> {
    let name = require_text(input.name, "Category name is required")?;
    let sakurava_ref = claim_or_allocate_sakurava_ref(
        connection,
        "C",
        input
            .issuance_yymm
            .as_deref()
            .ok_or("Issuance month is required")?,
        requested_sakurava_ref,
    )?;
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
        sakurava_ref,
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
        r_plus: input.r_plus.unwrap_or(false),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO managedCategories (
                key, sakuravaRef, name, parentKey, description, thumbnailPath,
                showInVideos, showInImages, showInPerformers, showInCredits, rPlus, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                category.key,
                category.sakurava_ref,
                category.name,
                category.parent_key,
                category.description,
                category.thumbnail_path,
                category.show_in_videos,
                category.show_in_images,
                category.show_in_performers,
                category.show_in_credits,
                bool_to_int(category.r_plus),
                category.created_at,
                category.updated_at
            ],
        )
        .map_err(database_error)?;
    register_current_sakurava_ref_alias(connection, "C", &category.sakurava_ref)?;

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
    if let Some(r_plus) = patch.r_plus {
        category.r_plus = r_plus;
    }
    category.updated_at = current_timestamp();

    connection
        .execute(
            "UPDATE managedCategories SET
                name = ?1, parentKey = ?2, description = ?3, thumbnailPath = ?4,
                showInVideos = ?5, showInImages = ?6, showInPerformers = ?7,
                showInCredits = ?8, rPlus = ?9, updatedAt = ?10
             WHERE key = ?11",
            params![
                category.name,
                category.parent_key,
                category.description,
                category.thumbnail_path,
                category.show_in_videos,
                category.show_in_images,
                category.show_in_performers,
                category.show_in_credits,
                bool_to_int(category.r_plus),
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

fn delete_catalog_entity_in_transaction(
    connection: &Connection,
    table_name: &str,
    id: String,
) -> Result<DeleteResult, String> {
    if connection.is_autocommit() {
        return Err("Catalog deletion requires an active transaction.".to_string());
    }
    require_migrated_sakurava_refs(connection)?;

    let exists_statement = match table_name {
        "videos" => "SELECT EXISTS(SELECT 1 FROM videos WHERE id = ?1)",
        "images" => "SELECT EXISTS(SELECT 1 FROM images WHERE id = ?1)",
        "performers" => "SELECT EXISTS(SELECT 1 FROM performers WHERE id = ?1)",
        _ => return Err("Unsupported table".to_string()),
    };
    let exists: bool = connection
        .query_row(exists_statement, [&id], |row| row.get(0))
        .map_err(database_error)?;
    if !exists {
        return Ok(DeleteResult { id, deleted: false });
    }

    match table_name {
        "videos" => {
            connection
                .execute(
                    "DELETE FROM credits WHERE workType = 'video' AND workId = ?1",
                    [&id],
                )
                .map_err(database_error)?;
            remove_inbound_json_reference(
                connection,
                "images",
                "relatedVideosJson",
                "recordId",
                &id,
            )?;
            remove_inbound_json_reference(
                connection,
                "performers",
                "relatedVideosJson",
                "recordId",
                &id,
            )?;
        }
        "images" => {
            connection
                .execute(
                    "DELETE FROM credits WHERE workType = 'image' AND workId = ?1",
                    [&id],
                )
                .map_err(database_error)?;
            remove_inbound_json_reference(
                connection,
                "videos",
                "relatedImagesJson",
                "recordId",
                &id,
            )?;
            remove_inbound_json_reference(
                connection,
                "performers",
                "relatedImagesJson",
                "recordId",
                &id,
            )?;
        }
        "performers" => {
            connection
                .execute("DELETE FROM credits WHERE performerId = ?1", [&id])
                .map_err(database_error)?;
            remove_inbound_json_reference(
                connection,
                "videos",
                "relatedPerformersJson",
                "performerId",
                &id,
            )?;
            remove_inbound_json_reference(
                connection,
                "images",
                "relatedPerformersJson",
                "performerId",
                &id,
            )?;
        }
        _ => unreachable!(),
    }

    let result = delete_row(connection, table_name, id)?;
    if !result.deleted {
        return Err("Catalog delete target changed before it could be removed.".to_string());
    }
    require_migrated_sakurava_refs(connection)?;
    Ok(result)
}

fn remove_inbound_json_reference(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    id_field: &str,
    target_id: &str,
) -> Result<(), String> {
    let supported = matches!(
        (table_name, column_name, id_field),
        ("videos", "relatedPerformersJson", "performerId")
            | ("videos", "relatedImagesJson", "recordId")
            | ("images", "relatedPerformersJson", "performerId")
            | ("images", "relatedVideosJson", "recordId")
            | ("performers", "relatedVideosJson", "recordId")
            | ("performers", "relatedImagesJson", "recordId")
    );
    if !supported {
        return Err("Unsupported catalog relationship cleanup.".to_string());
    }

    let query = format!("SELECT id, {column_name} FROM {table_name}");
    let mut statement = connection.prepare(&query).map_err(database_error)?;
    let records = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    drop(statement);

    let update = format!("UPDATE {table_name} SET {column_name} = ?1 WHERE id = ?2");
    for (record_id, raw_json) in records {
        let Value::Array(mut relationships) = serde_json::from_str::<Value>(&raw_json)
            .map_err(|_| "Catalog relationship data is invalid.".to_string())?
        else {
            return Err("Catalog relationship data is invalid.".to_string());
        };
        let original_len = relationships.len();
        relationships.retain(|relationship| {
            relationship.get(id_field).and_then(Value::as_str) != Some(target_id)
        });
        if relationships.len() == original_len {
            continue;
        }
        let next_json = serde_json::to_string(&relationships)
            .map_err(|_| "Catalog relationship cleanup could not be serialized.".to_string())?;
        let updated = connection
            .execute(&update, params![next_json, record_id])
            .map_err(database_error)?;
        if updated != 1 {
            return Err("Catalog relationship cleanup target changed.".to_string());
        }
    }
    Ok(())
}

fn create_glossary_entry(
    connection: &Connection,
    input: GlossaryEntryInput,
) -> Result<GlossaryEntry, String> {
    create_glossary_entry_with_requested_ref(connection, input, None)
}

fn create_glossary_entry_with_requested_ref(
    connection: &Connection,
    input: GlossaryEntryInput,
    requested_sakurava_ref: Option<&str>,
) -> Result<GlossaryEntry, String> {
    let term = require_text(input.term, "Glossary term is required")?;
    let definition = require_text(input.definition, "Glossary definition is required")?;
    let sakurava_ref = claim_or_allocate_sakurava_ref(
        connection,
        "G",
        input
            .issuance_yymm
            .as_deref()
            .ok_or("Issuance month is required")?,
        requested_sakurava_ref,
    )?;
    let source_url = normalize_source_url(input.source_url)?;
    let parent_id = normalize_glossary_parent_id(connection, "", input.parent_id)?;
    let timestamp = current_timestamp_i64();
    let entry = GlossaryEntry {
        id: new_id("glossary"),
        sakurava_ref,
        term,
        definition,
        synonyms_json: normalize_string_array_json(input.synonyms_json),
        category: default_text(input.category),
        parent_id,
        thumbnail_path: default_text(input.thumbnail_path),
        favorite: input.favorite.unwrap_or(false),
        source_title: default_text(input.source_title),
        source_url,
        r_plus: input.r_plus.unwrap_or(false),
        created_at: timestamp,
        updated_at: timestamp,
    };

    connection
        .execute(
            "INSERT INTO glossary_entries (
                id, sakuravaRef, term, definition, synonyms_json, category, parent_id,
                thumbnail_path, favorite, source_title, source_url, rPlus,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                entry.id,
                entry.sakurava_ref,
                entry.term,
                entry.definition,
                entry.synonyms_json,
                entry.category,
                entry.parent_id,
                entry.thumbnail_path,
                bool_to_int(entry.favorite),
                entry.source_title,
                entry.source_url,
                bool_to_int(entry.r_plus),
                entry.created_at,
                entry.updated_at
            ],
        )
        .map_err(database_error)?;
    register_current_sakurava_ref_alias(connection, "G", &entry.sakurava_ref)?;

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
    if let Some(r_plus) = patch.r_plus {
        entry.r_plus = r_plus;
    }
    entry.updated_at = current_timestamp_i64();

    connection
        .execute(
            "UPDATE glossary_entries SET
                term = ?2, definition = ?3, synonyms_json = ?4, category = ?5,
                parent_id = ?6, thumbnail_path = ?7, favorite = ?8,
                source_title = ?9, source_url = ?10, rPlus = ?11, updated_at = ?12
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
                bool_to_int(entry.r_plus),
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
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("Unable to start Credit create transaction: {error}"))?;
    let created = create_credit_in_transaction(&transaction, input, None)?;
    transaction
        .commit()
        .map_err(|error| format!("Unable to commit Credit create transaction: {error}"))?;
    Ok(created)
}

/// Creates a Credit on the caller's already-open transaction. Import Apply
/// uses this so relationship validation, R allocation, ledger/alias writes,
/// and the row insert either commit together or all roll back together.
fn create_credit_in_transaction(
    connection: &Connection,
    input: CreditInput,
    issuance_yymm: Option<&str>,
) -> Result<Credit, String> {
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
    let credit_type_category_id = normalize_optional_text(input.credit_type_category_id);
    let role_importance_category_id = normalize_optional_text(input.role_importance_category_id);
    let credit_type_text = normalize_optional_text(input.credit_type_text);
    validate_credit_relationships(
        connection,
        &work_type,
        &work_id,
        &performer_id,
        credit_type_category_id.as_deref(),
        role_importance_category_id.as_deref(),
    )?;
    validate_credit_capacity(connection, &work_type, &work_id, &performer_id)?;
    let timestamp = current_timestamp();
    let allocation_yymm = match issuance_yymm {
        // Import carries a validated YYMM issuance month just like the other
        // catalog import sections. Do not parse it as a Credit timestamp.
        Some(value) => value.to_string(),
        None => credit_ref_yymm(&timestamp, "0001")?,
    };
    let sakurava_ref = allocate_sakurava_ref(connection, "R", &allocation_yymm)?;
    let credit = Credit {
        id: new_id("credit"),
        sakurava_ref,
        work_type,
        work_id,
        performer_id,
        character_name: default_text(input.character_name),
        character_original_name: normalize_optional_text(input.character_original_name),
        credited_as: normalize_optional_text(input.credited_as),
        credit_type_text,
        credited_as_mode,
        credit_type_category_id,
        role_importance_category_id,
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
                id, sakuravaRef, workType, workId, performerId, characterName, characterOriginalName,
                creditedAs, creditTypeText, creditedAsMode, creditTypeCategoryId, roleImportanceCategoryId,
                characterMode, characterId, billingOrder, note, legacySourceKey,
                createdAt, updatedAt
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                credit.id,
                credit.sakurava_ref,
                credit.work_type,
                credit.work_id,
                credit.performer_id,
                credit.character_name,
                credit.character_original_name,
                credit.credited_as,
                credit.credit_type_text,
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
    register_current_sakurava_ref_alias(connection, "R", &credit.sakurava_ref)?;
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
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("Unable to start Credit update transaction: {error}"))?;
    let updated = update_credit_in_transaction(&transaction, id, patch)?;
    transaction
        .commit()
        .map_err(|error| format!("Unable to commit Credit update transaction: {error}"))?;
    Ok(updated)
}

fn update_credit_in_transaction(
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
    if let Some(value) = patch.credit_type_text {
        credit.credit_type_text = normalize_optional_text(value);
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
    validate_credit_relationships(
        connection,
        &credit.work_type,
        &credit.work_id,
        &credit.performer_id,
        credit.credit_type_category_id.as_deref(),
        credit.role_importance_category_id.as_deref(),
    )?;
    validate_credit_update_capacity(
        connection,
        id,
        &credit.work_type,
        &credit.work_id,
        &credit.performer_id,
    )?;
    credit.updated_at = current_timestamp();
    connection
        .execute(
            "UPDATE credits SET workType = ?1, workId = ?2, performerId = ?3,
                characterName = ?4, characterOriginalName = ?5, creditedAs = ?6,
                creditTypeText = ?7, creditedAsMode = ?8, creditTypeCategoryId = ?9,
                roleImportanceCategoryId = ?10, characterMode = ?11, characterId = ?12,
                billingOrder = ?13, note = ?14, updatedAt = ?15 WHERE id = ?16",
            params![
                credit.work_type,
                credit.work_id,
                credit.performer_id,
                credit.character_name,
                credit.character_original_name,
                credit.credited_as,
                credit.credit_type_text,
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

fn validate_credit_relationships(
    connection: &Connection,
    work_type: &str,
    work_id: &str,
    performer_id: &str,
    credit_type_category_id: Option<&str>,
    role_importance_category_id: Option<&str>,
) -> Result<(), String> {
    let work_table = match work_type {
        "video" => "videos",
        "image" => "images",
        _ => return Err("Credit workType is invalid".to_string()),
    };
    let work_exists: i64 = connection
        .query_row(
            &format!("SELECT COUNT(*) FROM {work_table} WHERE id = ?1"),
            [work_id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if work_exists != 1 {
        return Err("Credit work target was not found.".to_string());
    }
    let performer_exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM performers WHERE id = ?1",
            [performer_id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if performer_exists != 1 {
        return Err("Credit performer target was not found.".to_string());
    }
    for (category_id, field_name) in [
        (credit_type_category_id, "Credit Type"),
        (role_importance_category_id, "Role Importance"),
    ] {
        let Some(category_id) = category_id else {
            continue;
        };
        let category_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM managedCategories WHERE key = ?1",
                [category_id],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        if category_exists != 1 {
            return Err(format!("Credit {field_name} category was not found."));
        }
    }
    Ok(())
}

const MAX_CREDITS_PER_WORK_PERFORMER: i64 = 5;

fn validate_credit_capacity(
    connection: &Connection,
    work_type: &str,
    work_id: &str,
    performer_id: &str,
) -> Result<(), String> {
    let existing: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM credits WHERE workType = ?1 AND workId = ?2 AND performerId = ?3",
            params![work_type, work_id, performer_id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if existing >= MAX_CREDITS_PER_WORK_PERFORMER {
        return Err("A Work may have at most five Credits for the same Performer.".to_string());
    }
    Ok(())
}

fn validate_credit_update_capacity(
    connection: &Connection,
    id: &str,
    work_type: &str,
    work_id: &str,
    performer_id: &str,
) -> Result<(), String> {
    let siblings: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM credits WHERE workType = ?1 AND workId = ?2 AND performerId = ?3 AND id <> ?4",
            params![work_type, work_id, performer_id, id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if siblings >= MAX_CREDITS_PER_WORK_PERFORMER {
        return Err("A Work may have at most five Credits for the same Performer.".to_string());
    }
    Ok(())
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

fn write_export_file(
    destination_path: &str,
    bytes: &[u8],
    expected_extension: &str,
) -> Result<ExportFileWriteResult, String> {
    let destination_path = validate_export_file_destination(destination_path, expected_extension)?;
    if expected_extension == "xlsx" {
        return write_xlsx_export_file(&destination_path, bytes);
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination_path)
        .map_err(|error| match error.kind() {
            io::ErrorKind::AlreadyExists => {
                "Export file already exists; choose a new filename".to_string()
            }
            _ => format!("Export file could not be created: {error}"),
        })?;
    std::io::Write::write_all(&mut file, bytes)
        .map_err(|error| format!("Export file could not be written: {error}"))?;
    let display_name = destination_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Sakurava export")
        .to_string();
    Ok(ExportFileWriteResult {
        destination_path: destination_path.display().to_string(),
        display_name,
        bytes_written: bytes.len(),
        success: true,
    })
}

fn write_xlsx_export_file(
    destination_path: &Path,
    bytes: &[u8],
) -> Result<ExportFileWriteResult, String> {
    write_xlsx_export_file_with_replace(destination_path, bytes, replace_xlsx_export_destination)
}

fn write_xlsx_export_file_with_replace<F>(
    destination_path: &Path,
    bytes: &[u8],
    replace: F,
) -> Result<ExportFileWriteResult, String>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    let (temporary_path, mut temporary_file) = create_xlsx_export_temporary_file(destination_path)?;
    let write_result = (|| -> Result<(), String> {
        std::io::Write::write_all(&mut temporary_file, bytes)
            .map_err(|error| format!("XLSX export could not be written: {error}"))?;
        temporary_file
            .sync_all()
            .map_err(|error| format!("XLSX export could not be synchronized: {error}"))?;
        let written_bytes = temporary_file
            .metadata()
            .map_err(|error| format!("XLSX export could not be validated: {error}"))?
            .len();
        if written_bytes != bytes.len() as u64 {
            return Err("XLSX export could not be validated after writing".to_string());
        }
        Ok(())
    })();
    drop(temporary_file);
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    if let Err(error) = replace(&temporary_path, destination_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!(
            "The export file could not be replaced. Close any application using the file or choose another destination, then try again: {error}"
        ));
    }

    let display_name = destination_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Sakurava export")
        .to_string();
    Ok(ExportFileWriteResult {
        destination_path: destination_path.display().to_string(),
        display_name,
        bytes_written: bytes.len(),
        success: true,
    })
}

fn create_xlsx_export_temporary_file(
    destination_path: &Path,
) -> Result<(PathBuf, fs::File), String> {
    let parent = destination_path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = destination_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Export destination file name is not valid".to_string())?;
    for _ in 0..32 {
        let unique = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
        let temporary_path = parent.join(format!(
            ".{file_name}.sakurava-export-{}-{unique}.tmp",
            std::process::id(),
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
        {
            Ok(file) => return Ok((temporary_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "XLSX export temporary file could not be created: {error}"
                ))
            }
        }
    }
    Err("XLSX export temporary file name could not be allocated".to_string())
}

#[cfg(target_os = "windows")]
fn replace_xlsx_export_destination(
    temporary_path: &Path,
    destination_path: &Path,
) -> io::Result<()> {
    if !destination_path.exists() {
        return fs::rename(temporary_path, destination_path);
    }
    let destination = destination_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let replacement = temporary_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let replaced = unsafe {
        ReplaceFileW(
            destination.as_ptr(),
            replacement.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if replaced == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_xlsx_export_destination(
    temporary_path: &Path,
    destination_path: &Path,
) -> io::Result<()> {
    fs::rename(temporary_path, destination_path)
}

fn write_export_file_set(
    destination_folder: &str,
    files: Vec<ExportFileInput>,
) -> Result<ExportFileSetWriteResult, String> {
    let folder = PathBuf::from(destination_folder.trim());
    if destination_folder.trim().is_empty() || !folder.is_dir() {
        return Err("Export destination must be an existing folder".to_string());
    }
    if files.is_empty() {
        return Err("At least one CSV export file is required".to_string());
    }

    let mut destinations = Vec::with_capacity(files.len());
    for input in &files {
        validate_export_file_name(&input.file_name, "csv")?;
        let destination = folder.join(&input.file_name);
        if destination.exists() {
            return Err(format!("Export file already exists: {}", input.file_name));
        }
        destinations.push(destination);
    }

    let mut created = Vec::new();
    let mut bytes_written = 0usize;
    for (input, destination) in files.iter().zip(destinations.iter()) {
        let write_result = (|| -> Result<(), String> {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(destination)
                .map_err(|error| format!("Export file could not be created: {error}"))?;
            std::io::Write::write_all(&mut file, &input.bytes)
                .map_err(|error| format!("Export file could not be written: {error}"))
        })();
        if let Err(error) = write_result {
            for created_path in &created {
                let _ = fs::remove_file(created_path);
            }
            return Err(error);
        }
        created.push(destination.clone());
        bytes_written += input.bytes.len();
    }

    Ok(ExportFileSetWriteResult {
        destination_path: folder.display().to_string(),
        display_names: files.iter().map(|file| file.file_name.clone()).collect(),
        files_written: files.len(),
        bytes_written,
        success: true,
    })
}

fn validate_export_file_destination(
    destination_path: &str,
    expected_extension: &str,
) -> Result<PathBuf, String> {
    let trimmed = destination_path.trim();
    if trimmed.is_empty() {
        return Err("Export destination path is required".to_string());
    }
    if expected_extension != "csv" && expected_extension != "xlsx" {
        return Err("Export format must be csv or xlsx".to_string());
    }
    let path = PathBuf::from(trimmed);
    if path.exists() && path.is_dir() {
        return Err("Export destination must be a file path".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case(expected_extension) {
        return Err(format!("Export destination must use .{expected_extension}"));
    }
    Ok(path)
}

fn validate_export_file_name(file_name: &str, expected_extension: &str) -> Result<(), String> {
    let path = Path::new(file_name);
    if file_name.trim().is_empty()
        || path.file_name().and_then(|name| name.to_str()) != Some(file_name)
        || path.components().count() != 1
    {
        return Err("Export filename must not contain a path".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case(expected_extension) {
        return Err(format!("Export filename must use .{expected_extension}"));
    }
    Ok(())
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

fn read_import_catalog_file(source_path: &str) -> Result<ImportCatalogFileReadResult, String> {
    let source_path = validate_import_catalog_source(source_path)?;
    const MAX_IMPORT_FILE_BYTES: u64 = 25 * 1024 * 1024;
    let file_size = fs::metadata(&source_path)
        .map_err(|_| "Import file details could not be read.".to_string())?
        .len();
    if file_size > MAX_IMPORT_FILE_BYTES {
        return Err("Choose a Sakurava import file no larger than 25 MB.".to_string());
    }
    let bytes = fs::read(&source_path)
        .map_err(|error| format!("Import file could not be read: {error}"))?;
    let display_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Sakurava import")
        .to_string();
    let format = source_path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    Ok(ImportCatalogFileReadResult {
        source_path: source_path.display().to_string(),
        display_name,
        format,
        bytes_read: bytes.len(),
        bytes,
        success: true,
    })
}

fn apply_import_catalog_plan(
    database: &RuntimeDatabase,
    plan: ImportCatalogApplyPlan,
) -> ImportCatalogApplyResult {
    if !matches!(plan.contract_version, 1 | 2 | 3) {
        return import_apply_failure(
            "blocked",
            "validation",
            "This import contract version is not supported.",
            false,
            None,
            plan.skipped_count,
        );
    }
    if !valid_import_fingerprint(&plan.source_fingerprint, "skvf1-") {
        return import_apply_failure(
            "blocked",
            "validation",
            "The selected import file fingerprint is not valid.",
            false,
            None,
            plan.skipped_count,
        );
    }
    if plan.operations.iter().any(|operation| {
        !operation.blocking_issues.is_empty()
            || operation.warnings.iter().any(|warning| {
                warning.starts_with("Unknown category:")
                    || warning.starts_with("Unresolved related reference:")
                    || warning.starts_with("Unresolved related value:")
            })
            || !matches!(
                operation.section.as_str(),
                "videos" | "images" | "performers" | "categories" | "glossary" | "credits"
            )
            || !matches!(operation.action.as_str(), "create" | "update" | "delete")
    }) {
        return import_apply_failure(
            "blocked",
            "validation",
            "The import plan contains unsupported or unresolved operations.",
            false,
            None,
            plan.skipped_count,
        );
    }
    if import_plan_fingerprint(&plan) != plan.operation_fingerprint {
        eprintln!(
            "Sakurava import apply blocked: gate=PLAN_FINGERPRINT_MISMATCH expected={} actual={} operations={} skipped={}",
            plan.operation_fingerprint,
            import_plan_fingerprint(&plan),
            plan.operations.len(),
            plan.skipped_count,
        );
        return import_apply_failure_with_code(
            "blocked",
            "validation",
            "PLAN_FINGERPRINT_MISMATCH",
            IMPORT_PLAN_PROCESSING_FAILURE,
            false,
            None,
            plan.skipped_count,
        );
    }

    let _package_operation = match database.lock_package_operation() {
        Ok(operation) => operation,
        Err(_) => {
            return import_apply_failure(
                "blocked",
                "backup",
                "A safety backup cannot start while another backup operation is running.",
                false,
                None,
                plan.skipped_count,
            )
        }
    };
    let connection = database.connection();
    let mut connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            return import_apply_failure(
                "blocked",
                "validation",
                "The catalog is temporarily unavailable.",
                false,
                None,
                plan.skipped_count,
            )
        }
    };

    if let Err(message) = require_migrated_sakurava_refs(&connection) {
        return import_apply_failure(
            "blocked",
            "validation",
            &message,
            false,
            None,
            plan.skipped_count,
        );
    }

    let current_snapshot = match import_catalog_snapshot(&connection) {
        Ok(snapshot) => snapshot,
        Err(_) => {
            return import_apply_failure(
                "blocked",
                "validation",
                "Sakurava could not revalidate the catalog.",
                false,
                None,
                plan.skipped_count,
            )
        }
    };
    let planned_revalidation = match import_revalidation_snapshot(&plan, &plan.catalog_snapshot) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            eprintln!(
                "Sakurava import apply blocked: gate=PLAN_REVALIDATION_INVALID detail={error}"
            );
            return import_apply_failure_with_code(
                "blocked",
                "validation",
                "PLAN_REVALIDATION_INVALID",
                IMPORT_PLAN_PROCESSING_FAILURE,
                false,
                None,
                plan.skipped_count,
            );
        }
    };
    let current_revalidation = match import_revalidation_snapshot(&plan, &current_snapshot) {
        Ok(snapshot) => snapshot,
        Err(_) => {
            return import_apply_failure(
                "blocked",
                "validation",
                "Sakurava could not revalidate the affected catalog dependencies.",
                false,
                None,
                plan.skipped_count,
            )
        }
    };
    if canonical_json(&current_revalidation) != canonical_json(&planned_revalidation) {
        return import_apply_failure(
            "blocked",
            "stalePreview",
            "The catalog changed after this Preview. Preview the file again before applying.",
            false,
            None,
            plan.skipped_count,
        );
    }
    // The live catalog was already compared with the Preview snapshot above.
    // Validate operation targets against the immutable Preview snapshot here,
    // rather than re-comparing full transport-shaped records from a fresh
    // query. That keeps plan integrity distinct from catalog staleness.
    if let Err(message) = validate_import_plan_targets(&plan, &plan.catalog_snapshot) {
        eprintln!("Sakurava import plan integrity validation failed before backup: {message}");
        return import_apply_failure_with_code(
            "blocked",
            "validation",
            "PLAN_TARGET_INVALID",
            IMPORT_PLAN_PROCESSING_FAILURE,
            false,
            None,
            plan.skipped_count,
        );
    }

    let backup = match create_import_safety_backup_package(database, &connection) {
        Ok(backup) => backup,
        Err(_) => return import_apply_failure(
            "blocked",
            "backup",
            "Sakurava could not create the required safety backup. No catalog changes were made.",
            false,
            None,
            plan.skipped_count,
        ),
    };
    let backup_name = Some(backup.package_name.clone());
    let mut transaction = match connection.transaction() {
        Ok(transaction) => transaction,
        Err(_) => {
            return import_apply_failure(
                "blocked",
                "apply",
                "Sakurava could not start the catalog transaction. No changes were made.",
                false,
                backup_name,
                plan.skipped_count,
            )
        }
    };

    let apply_result = apply_import_operations(&transaction, &plan.operations, &plan.issuance_yymm);
    let (created, updated, cleared, deleted) = match apply_result {
        Ok(counts) => counts,
        Err(_) => {
            let rollback_completed = transaction.rollback().is_ok();
            return import_apply_failure(
                "rolledBack",
                "apply",
                "The import could not be applied. Sakurava cancelled all changes from this import.",
                rollback_completed,
                backup_name,
                plan.skipped_count,
            );
        }
    };
    // Do not commit an operation that leaves a catalog which the authoritative
    // migration-state validator would reject after restart.  This covers both
    // the valid empty migrated catalog and any surviving relationship (for
    // example a Credit) that still points at a deleted record.
    if let Err(error) = require_migrated_sakurava_refs(&transaction) {
        eprintln!("Sakurava import final integrity validation failed before commit: {error}");
        let rollback_completed = transaction.rollback().is_ok();
        return import_apply_failure(
            "rolledBack",
            "validation",
            "The import would leave invalid catalog references. Sakurava cancelled all changes from this import.",
            rollback_completed,
            backup_name,
            plan.skipped_count,
        );
    }
    if transaction.execute_batch("COMMIT").is_err() {
        let rollback_completed = transaction.execute_batch("ROLLBACK").is_ok();
        transaction.set_drop_behavior(DropBehavior::Ignore);
        return import_apply_failure(
            "rolledBack",
            "commit",
            "The import could not be finalized. Sakurava did not report partial success.",
            rollback_completed,
            backup_name,
            plan.skipped_count,
        );
    }
    transaction.set_drop_behavior(DropBehavior::Ignore);

    ImportCatalogApplyResult {
        transaction_status: "committed".to_string(),
        backup_package_name: backup_name,
        created_count: created,
        updated_count: updated,
        cleared_field_count: cleared,
        deleted_count: deleted,
        skipped_count: plan.skipped_count,
        failure_stage: None,
        failure_code: None,
        message: "Catalog import applied successfully.".to_string(),
        rollback_completed: false,
    }
}

fn apply_import_operations(
    connection: &Connection,
    operations: &[ImportCatalogPlanOperation],
    issuance_yymm: &str,
) -> Result<(usize, usize, usize, usize), String> {
    let mut created = 0usize;
    let mut updated = 0usize;
    let mut cleared = 0usize;
    let mut deleted = 0usize;
    let mut generated_ids = std::collections::HashMap::<String, String>::new();
    let mut created_records = Vec::<CreatedImportRecord>::new();
    let mut lifecycle_mutations = BTreeMap::<(String, String), PendingLifecycleMutation>::new();
    // Credit Adds must evaluate the final Work/Performer capacity. Execute
    // explicit Credit Deletes first so a same-plan Delete can free a slot,
    // while the enclosing transaction preserves full rollback semantics.
    let mut credit_deletes = operations
        .iter()
        .filter(|operation| operation.action == "delete" && operation.section == "credits")
        .collect::<Vec<_>>();
    credit_deletes.sort_by_key(|operation| operation.source_row_number);
    for operation in credit_deletes {
        apply_import_delete(connection, operation)?;
        deleted += 1;
    }
    let mut creates = operations
        .iter()
        .filter(|operation| operation.action == "create")
        .cloned()
        .collect::<Vec<_>>();
    creates.sort_by_key(|operation| operation.source_row_number);

    for operation in creates
        .iter()
        .filter(|operation| operation.section != "glossary")
    {
        let created_id = apply_import_create(connection, operation, &generated_ids, issuance_yymm)?;
        if let Some(created_record) = created_id {
            record_import_created_owner(
                connection,
                &mut lifecycle_mutations,
                &operation.section,
                &created_record.id,
            )?;
            created_records.push(created_record);
        }
        created += 1;
        cleared += operation.cleared_fields.len();
    }

    let mut glossary_creates = creates
        .into_iter()
        .filter(|operation| operation.section == "glossary")
        .collect::<Vec<_>>();
    while !glossary_creates.is_empty() {
        let mut progressed = false;
        let mut remaining = Vec::new();
        for operation in glossary_creates {
            if operation
                .dependency_refs
                .iter()
                .any(|dependency| !generated_ids.contains_key(dependency))
            {
                remaining.push(operation);
                continue;
            }
            let created_id =
                apply_import_create(connection, &operation, &generated_ids, issuance_yymm)?;
            if let Some(created_record) = created_id {
                record_import_created_owner(
                    connection,
                    &mut lifecycle_mutations,
                    "glossary",
                    &created_record.id,
                )?;
                if let Some(temporary) = &operation.temporary_identifier {
                    generated_ids.insert(temporary.clone(), created_record.id.clone());
                }
                created_records.push(created_record);
            }
            created += 1;
            cleared += operation.cleared_fields.len();
            progressed = true;
        }
        if !progressed {
            return Err("Glossary creation dependencies could not be resolved.".to_string());
        }
        glossary_creates = remaining;
    }

    for created_record in &created_records {
        apply_deferred_import_parent_reference(connection, created_record)?;
        canonicalize_created_import_references(connection, created_record)?;
    }

    let mut updates = operations
        .iter()
        .filter(|operation| operation.action == "update")
        .collect::<Vec<_>>();
    updates.sort_by_key(|operation| operation.source_row_number);
    for operation in updates {
        record_import_owner_before(connection, &mut lifecycle_mutations, operation)?;
        apply_import_update(connection, operation, &generated_ids)?;
        record_import_owner_after(connection, &mut lifecycle_mutations, operation)?;
        updated += 1;
        cleared += operation.cleared_fields.len();
    }

    let mut deletes = operations
        .iter()
        .filter(|operation| operation.action == "delete" && operation.section != "credits")
        .collect::<Vec<_>>();
    deletes.sort_by(|left, right| {
        let left_phase = delete_phase(&left.section);
        let right_phase = delete_phase(&right.section);
        let left_depth = delete_hierarchy_depth(connection, left).unwrap_or(0);
        let right_depth = delete_hierarchy_depth(connection, right).unwrap_or(0);
        left_phase
            .cmp(&right_phase)
            .then(right_depth.cmp(&left_depth))
            .then(left.source_row_number.cmp(&right.source_row_number))
    });
    for operation in deletes {
        record_import_owner_before(connection, &mut lifecycle_mutations, operation)?;
        apply_import_delete(connection, operation)?;
        record_import_owner_after(connection, &mut lifecycle_mutations, operation)?;
        deleted += 1;
    }
    reconcile_import_lifecycle(connection, lifecycle_mutations)?;
    Ok((created, updated, cleared, deleted))
}

#[derive(Debug)]
struct PendingLifecycleMutation {
    previous: Option<OwnerSources>,
    final_state: Option<OwnerSources>,
}

#[derive(Debug)]
struct CreatedImportRecord {
    section: String,
    id: String,
    deferred_parent_ref: Option<String>,
}

fn apply_deferred_import_parent_reference(
    connection: &Connection,
    created: &CreatedImportRecord,
) -> Result<(), String> {
    let Some(reference) = created.deferred_parent_ref.as_deref() else {
        return Ok(());
    };
    match created.section.as_str() {
        "categories" => {
            let key = resolve_sakurava_ref(connection, "C", reference)?
                .ok_or_else(|| "Imported Category parent Ref was not found after create planning.".to_string())?;
            update_managed_category(
                connection,
                &created.id,
                ManagedCategoryPatch {
                    name: None,
                    parent_key: Some(Some(key)),
                    description: None,
                    thumbnail_path: None,
                    show_in_videos: None,
                    show_in_images: None,
                    show_in_performers: None,
                    show_in_credits: None,
                    r_plus: None,
                },
            )?.ok_or_else(|| "Created Category parent target changed.".to_string())?;
        }
        "glossary" => {
            let id = resolve_sakurava_ref(connection, "G", reference)?
                .ok_or_else(|| "Imported Glossary parent Ref was not found after create planning.".to_string())?;
            update_glossary_entry(
                connection,
                &created.id,
                GlossaryEntryPatch {
                    term: None,
                    definition: None,
                    synonyms_json: None,
                    category: None,
                    parent_id: Some(id),
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                    r_plus: None,
                },
            )?.ok_or_else(|| "Created Glossary parent target changed.".to_string())?;
        }
        _ => {}
    }
    Ok(())
}

fn canonicalize_created_import_references(
    connection: &Connection,
    created: &CreatedImportRecord,
) -> Result<(), String> {
    match created.section.as_str() {
        "videos" => {
            let record = get_video(connection, &created.id)?
                .ok_or_else(|| "Created Video could not be read for reference resolution.".to_string())?;
            let mut values = json!({
                "categoriesJson": record.categories_json,
                "relatedPerformersJson": record.related_performers_json,
                "relatedImagesJson": record.related_images_json,
                "glossaryRefsJson": record.glossary_refs_json,
            });
            resolve_import_public_reference_fields(connection, &mut values, false)?;
            let object = values.as_object().ok_or_else(|| "Resolved Video values are invalid.".to_string())?;
            update_video(connection, &created.id, VideoPatch {
                categories_json: object.get("categoriesJson").and_then(Value::as_str).map(str::to_string),
                related_performers_json: object.get("relatedPerformersJson").and_then(Value::as_str).map(str::to_string),
                related_images_json: object.get("relatedImagesJson").and_then(Value::as_str).map(str::to_string),
                glossary_refs_json: object.get("glossaryRefsJson").and_then(Value::as_str).map(str::to_string),
                ..Default::default()
            })?.ok_or_else(|| "Created Video changed during reference resolution.".to_string())?;
        }
        "images" => {
            let record = get_image(connection, &created.id)?
                .ok_or_else(|| "Created Image could not be read for reference resolution.".to_string())?;
            let mut values = json!({
                "categoriesJson": record.categories_json,
                "relatedPerformersJson": record.related_performers_json,
                "relatedVideosJson": record.related_videos_json,
                "glossaryRefsJson": record.glossary_refs_json,
            });
            resolve_import_public_reference_fields(connection, &mut values, false)?;
            let object = values.as_object().ok_or_else(|| "Resolved Image values are invalid.".to_string())?;
            update_image(connection, &created.id, ImagePatch {
                categories_json: object.get("categoriesJson").and_then(Value::as_str).map(str::to_string),
                related_performers_json: object.get("relatedPerformersJson").and_then(Value::as_str).map(str::to_string),
                related_videos_json: object.get("relatedVideosJson").and_then(Value::as_str).map(str::to_string),
                glossary_refs_json: object.get("glossaryRefsJson").and_then(Value::as_str).map(str::to_string),
                ..Default::default()
            })?.ok_or_else(|| "Created Image changed during reference resolution.".to_string())?;
        }
        "performers" => {
            let record = get_performer(connection, &created.id)?
                .ok_or_else(|| "Created Performer could not be read for reference resolution.".to_string())?;
            let mut values = json!({
                "categoriesJson": record.categories_json,
                "relatedVideosJson": record.related_videos_json,
                "relatedImagesJson": record.related_images_json,
                "glossaryRefsJson": record.glossary_refs_json,
            });
            resolve_import_public_reference_fields(connection, &mut values, false)?;
            let object = values.as_object().ok_or_else(|| "Resolved Performer values are invalid.".to_string())?;
            update_performer(connection, &created.id, PerformerPatch {
                categories_json: object.get("categoriesJson").and_then(Value::as_str).map(str::to_string),
                related_videos_json: object.get("relatedVideosJson").and_then(Value::as_str).map(str::to_string),
                related_images_json: object.get("relatedImagesJson").and_then(Value::as_str).map(str::to_string),
                glossary_refs_json: object.get("glossaryRefsJson").and_then(Value::as_str).map(str::to_string),
                ..Default::default()
            })?.ok_or_else(|| "Created Performer changed during reference resolution.".to_string())?;
        }
        _ => {}
    }
    Ok(())
}

fn lifecycle_section(section: &str) -> bool {
    matches!(
        section,
        "videos" | "images" | "performers" | "categories" | "glossary"
    )
}

fn record_import_created_owner(
    connection: &Connection,
    mutations: &mut BTreeMap<(String, String), PendingLifecycleMutation>,
    section: &str,
    id: &str,
) -> Result<(), String> {
    if !lifecycle_section(section) {
        return Ok(());
    }
    let final_state = load_owner_sources(connection, section, id)?.ok_or_else(|| {
        "Created catalog owner could not be read for lifecycle planning.".to_string()
    })?;
    mutations.insert(
        (section.to_string(), id.to_string()),
        PendingLifecycleMutation {
            previous: None,
            final_state: Some(final_state),
        },
    );
    Ok(())
}

fn record_import_owner_before(
    connection: &Connection,
    mutations: &mut BTreeMap<(String, String), PendingLifecycleMutation>,
    operation: &ImportCatalogPlanOperation,
) -> Result<(), String> {
    if !lifecycle_section(&operation.section) {
        return Ok(());
    }
    let id = operation
        .record_id
        .as_deref()
        .ok_or_else(|| "Catalog owner was not resolved for lifecycle planning.".to_string())?;
    let key = (operation.section.clone(), id.to_string());
    if mutations.contains_key(&key) {
        return Ok(());
    }
    let previous = load_owner_sources(connection, &operation.section, id)?;
    mutations.insert(
        key,
        PendingLifecycleMutation {
            final_state: previous.clone(),
            previous,
        },
    );
    Ok(())
}

fn record_import_owner_after(
    connection: &Connection,
    mutations: &mut BTreeMap<(String, String), PendingLifecycleMutation>,
    operation: &ImportCatalogPlanOperation,
) -> Result<(), String> {
    if !lifecycle_section(&operation.section) {
        return Ok(());
    }
    let id = operation
        .record_id
        .as_deref()
        .ok_or_else(|| "Catalog owner was not resolved for lifecycle planning.".to_string())?;
    let final_state = load_owner_sources(connection, &operation.section, id)?;
    let key = (operation.section.clone(), id.to_string());
    let mutation = mutations
        .get_mut(&key)
        .ok_or_else(|| "Catalog lifecycle mutation was not initialized.".to_string())?;
    mutation.final_state = final_state;
    Ok(())
}

fn reconcile_import_lifecycle(
    connection: &Connection,
    mutations: BTreeMap<(String, String), PendingLifecycleMutation>,
) -> Result<(), String> {
    let now = current_timestamp();
    let mut token_generator = || Ok(new_id("media_slot"));
    for mutation in mutations.into_values() {
        reconcile_owner_mutation(
            connection,
            mutation.previous.as_ref(),
            mutation.final_state.as_ref(),
            &mut token_generator,
            &now,
        )?;
    }
    Ok(())
}

fn delete_phase(section: &str) -> usize {
    match section {
        "credits" => 0,
        // A Category may be used by these records, so they must leave first.
        "videos" | "images" | "performers" => 0,
        "glossary" => 1,
        "categories" => 2,
        _ => 3,
    }
}

fn delete_hierarchy_depth(
    connection: &Connection,
    operation: &ImportCatalogPlanOperation,
) -> Result<usize, String> {
    let id = operation.record_id.as_deref().unwrap_or_default();
    match operation.section.as_str() {
        "glossary" => glossary_depth(connection, id),
        "categories" => managed_category_depth(connection, id),
        _ => Ok(0),
    }
}

fn apply_import_create(
    connection: &Connection,
    operation: &ImportCatalogPlanOperation,
    generated_ids: &std::collections::HashMap<String, String>,
    issuance_yymm: &str,
) -> Result<Option<CreatedImportRecord>, String> {
    let mut proposed =
        resolve_import_dependencies(connection, operation.proposed_values.clone(), generated_ids, true)?;
    let object = proposed
        .as_object_mut()
        .ok_or_else(|| "Import Create values are invalid.".to_string())?;
    let requested_sakurava_ref = object
        .remove("requestedSakuravaRef")
        .and_then(|value| value.as_str().map(str::to_string));
    object.insert(
        "issuanceYymm".to_string(),
        Value::String(issuance_yymm.to_string()),
    );
    let deferred_parent_ref = match operation.section.as_str() {
        "categories" => take_unresolved_public_ref(object, "parentKey", "C"),
        "glossary" => take_unresolved_public_ref(object, "parentId", "G"),
        _ => None,
    };
    let id = match operation.section.as_str() {
        "videos" =>
            create_video_with_requested_ref(
                connection,
                decode_import_value(proposed)?,
                requested_sakurava_ref.as_deref(),
            )?.id,
        "images" =>
            create_image_with_requested_ref(
                connection,
                decode_import_value(proposed)?,
                requested_sakurava_ref.as_deref(),
            )?.id,
        "performers" =>
            create_performer_with_requested_ref(
                connection,
                decode_import_value(proposed)?,
                requested_sakurava_ref.as_deref(),
            )?.id,
        "categories" =>
            create_managed_category_with_requested_ref(
                connection,
                decode_import_value(proposed)?,
                requested_sakurava_ref.as_deref(),
            )?.key,
        "glossary" =>
            create_glossary_entry_with_requested_ref(
                connection,
                decode_import_value(proposed)?,
                requested_sakurava_ref.as_deref(),
            )?.id,
        "credits" =>
            create_credit_in_transaction(
                connection,
                decode_import_value(proposed)?,
                Some(issuance_yymm),
            )?.id,
        _ => return Err("Unsupported import section.".to_string()),
    };
    Ok(Some(CreatedImportRecord {
        section: operation.section.clone(),
        id,
        deferred_parent_ref,
    }))
}

fn apply_import_update(
    connection: &Connection,
    operation: &ImportCatalogPlanOperation,
    generated_ids: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let id = operation
        .record_id
        .as_deref()
        .ok_or_else(|| "Update record was not resolved.".to_string())?;
    let proposed = resolve_import_dependencies(connection, operation.proposed_values.clone(), generated_ids, false)?;
    match operation.section.as_str() {
        "videos" => update_video(connection, id, decode_import_value(proposed)?)?
            .map(|_| ())
            .ok_or_else(|| "Video changed after Preview.".to_string()),
        "images" => update_image(connection, id, decode_import_value(proposed)?)?
            .map(|_| ())
            .ok_or_else(|| "Image changed after Preview.".to_string()),
        "performers" => {
            let mut patch: PerformerPatch = decode_import_value(proposed.clone())?;
            if proposed.get("heightCm") == Some(&Value::Null) {
                patch.height_cm = Some(None);
            }
            if proposed.get("weightKg") == Some(&Value::Null) {
                patch.weight_kg = Some(None);
            }
            update_performer(connection, id, patch)?
                .map(|_| ())
                .ok_or_else(|| "Performer changed after Preview.".to_string())
        }
        "categories" => {
            let mut patch: ManagedCategoryPatch = decode_import_value(proposed.clone())?;
            if proposed.get("parentKey") == Some(&Value::Null) {
                patch.parent_key = Some(None);
            }
            update_managed_category(connection, id, patch)?
                .map(|_| ())
                .ok_or_else(|| "Category changed after Preview.".to_string())
        }
        "glossary" => update_glossary_entry(connection, id, decode_import_value(proposed)?)?
            .map(|_| ())
            .ok_or_else(|| "Glossary record changed after Preview.".to_string()),
        "credits" => update_credit_in_transaction(connection, id, decode_import_value(proposed)?)?
            .map(|_| ())
            .ok_or_else(|| "Credit changed after Preview.".to_string()),
        _ => Err("Unsupported import section.".to_string()),
    }
}

fn apply_import_delete(
    connection: &Connection,
    operation: &ImportCatalogPlanOperation,
) -> Result<(), String> {
    let id = operation
        .record_id
        .clone()
        .ok_or_else(|| "Delete record was not resolved.".to_string())?;
    match operation.section.as_str() {
        "videos" | "images" | "performers" => {
            delete_catalog_entity_in_transaction(connection, &operation.section, id).and_then(
                |result| {
                    if result.deleted {
                        Ok(())
                    } else {
                        Err("Delete target changed after Preview.".to_string())
                    }
                },
            )
        }
        "categories" => delete_managed_category_if_unused(connection, id).and_then(|result| {
            if result.deleted {
                Ok(())
            } else {
                Err("Category delete target changed after Preview.".to_string())
            }
        }),
        "glossary" => {
            if glossary_child_count(connection, &id)? > 0 {
                return Err("Glossary record still has child records.".to_string());
            }
            let deleted = connection
                .execute("DELETE FROM glossary_entries WHERE id = ?1", [&id])
                .map_err(database_error)?
                > 0;
            if deleted {
                Ok(())
            } else {
                Err("Glossary delete target changed after Preview.".to_string())
            }
        }
        "credits" => delete_credit(connection, id).and_then(|result| {
            if result.deleted {
                Ok(())
            } else {
                Err("Credit delete target changed after Preview.".to_string())
            }
        }),
        _ => Err("Unsupported import section.".to_string()),
    }
}

fn resolve_import_dependencies(
    connection: &Connection,
    mut proposed: Value,
    generated_ids: &std::collections::HashMap<String, String>,
    allow_unresolved_public_refs: bool,
) -> Result<Value, String> {
    if let Some(parent) = proposed
        .get("parentId")
        .and_then(Value::as_str)
        .filter(|value| value.starts_with("GLO-NEW-"))
    {
        let resolved = generated_ids
            .get(parent)
            .ok_or_else(|| "Glossary parent dependency was not created.".to_string())?
            .clone();
        proposed["parentId"] = Value::String(resolved);
    }
    resolve_import_public_reference_fields(connection, &mut proposed, allow_unresolved_public_refs)?;
    Ok(proposed)
}

fn take_unresolved_public_ref(
    proposed: &mut serde_json::Map<String, Value>,
    field: &str,
    section: &str,
) -> Option<String> {
    let value = proposed.get(field)?.as_str()?;
    let canonical = format_sakurava_ref(value)?.replace('-', "");
    if canonical.starts_with(section) {
        proposed.remove(field);
        Some(canonical)
    } else {
        None
    }
}

fn resolve_import_public_reference_fields(
    connection: &Connection,
    proposed: &mut Value,
    allow_unresolved: bool,
) -> Result<(), String> {
    let object = proposed
        .as_object_mut()
        .ok_or_else(|| "Import values are invalid.".to_string())?;
    resolve_import_reference_scalar(connection, object, "parentKey", "C", allow_unresolved)?;
    resolve_import_reference_scalar(connection, object, "parentId", "G", allow_unresolved)?;
    if let Some(work_section) = object
        .get("workType")
        .and_then(Value::as_str)
        .and_then(|value| match value.to_ascii_lowercase().as_str() {
            "video" => Some("V"),
            "image" => Some("I"),
            _ => None,
        })
    {
        resolve_import_reference_scalar(connection, object, "workId", work_section, allow_unresolved)?;
    }
    resolve_import_reference_scalar(connection, object, "performerId", "P", allow_unresolved)?;

    resolve_import_categories(connection, object, allow_unresolved)?;
    resolve_import_glossary_refs(connection, object, allow_unresolved)?;
    resolve_import_related_json(connection, object, "relatedPerformersJson", "performerId", "P", allow_unresolved)?;
    resolve_import_related_json(connection, object, "relatedImagesJson", "recordId", "I", allow_unresolved)?;
    resolve_import_related_json(connection, object, "relatedVideosJson", "recordId", "V", allow_unresolved)?;
    Ok(())
}

fn resolve_import_reference_scalar(
    connection: &Connection,
    object: &mut serde_json::Map<String, Value>,
    field: &str,
    section: &str,
    allow_unresolved: bool,
) -> Result<(), String> {
    let Some(value) = object.get(field).and_then(Value::as_str).map(str::to_string) else {
        return Ok(());
    };
    let Some(reference) = format_sakurava_ref(&value).map(|value| value.replace('-', "")) else {
        return Ok(());
    };
    if !reference.starts_with(section) {
        return Err("Imported public Ref has the wrong section.".to_string());
    }
    if let Some(id) = resolve_sakurava_ref(connection, section, &reference)? {
        object.insert(field.to_string(), Value::String(id));
    } else if !allow_unresolved {
        return Err("Imported public Ref was not found after create planning.".to_string());
    }
    Ok(())
}

fn resolve_import_categories(
    connection: &Connection,
    object: &mut serde_json::Map<String, Value>,
    allow_unresolved: bool,
) -> Result<(), String> {
    let Some(text) = object.get("categoriesJson").and_then(Value::as_str) else {
        return Ok(());
    };
    let values = serde_json::from_str::<Vec<String>>(text).unwrap_or_default();
    let mut resolved = Vec::with_capacity(values.len());
    for value in values {
        let Some(reference) = format_sakurava_ref(&value).map(|value| value.replace('-', "")) else {
            resolved.push(value);
            continue;
        };
        if !reference.starts_with('C') {
            return Err("Imported Category Ref has the wrong section.".to_string());
        }
        if let Some(key) = resolve_sakurava_ref(connection, "C", &reference)? {
            let category = get_managed_category(connection, &key)?
                .ok_or_else(|| "Resolved Category Ref has no catalog record.".to_string())?;
            resolved.push(category.name);
        } else if allow_unresolved {
            resolved.push(reference);
        } else {
            return Err("Imported Category Ref was not found after create planning.".to_string());
        }
    }
    object.insert(
        "categoriesJson".to_string(),
        Value::String(serde_json::to_string(&resolved).unwrap_or_else(|_| "[]".to_string())),
    );
    Ok(())
}

fn resolve_import_glossary_refs(
    connection: &Connection,
    object: &mut serde_json::Map<String, Value>,
    allow_unresolved: bool,
) -> Result<(), String> {
    let Some(text) = object.get("glossaryRefsJson").and_then(Value::as_str) else {
        return Ok(());
    };
    let values = serde_json::from_str::<Vec<String>>(text).unwrap_or_default();
    let mut resolved = Vec::with_capacity(values.len());
    for value in values {
        let Some(reference) = format_sakurava_ref(&value).map(|value| value.replace('-', "")) else {
            resolved.push(value);
            continue;
        };
        if !reference.starts_with('G') {
            return Err("Imported Glossary Ref has the wrong section.".to_string());
        }
        if let Some(id) = resolve_sakurava_ref(connection, "G", &reference)? {
            resolved.push(id);
        } else if allow_unresolved {
            resolved.push(reference);
        } else {
            return Err("Imported Glossary Ref was not found after create planning.".to_string());
        }
    }
    object.insert(
        "glossaryRefsJson".to_string(),
        Value::String(serde_json::to_string(&resolved).unwrap_or_else(|_| "[]".to_string())),
    );
    Ok(())
}

fn resolve_import_related_json(
    connection: &Connection,
    object: &mut serde_json::Map<String, Value>,
    field: &str,
    id_field: &str,
    section: &str,
    allow_unresolved: bool,
) -> Result<(), String> {
    let Some(text) = object.get(field).and_then(Value::as_str) else {
        return Ok(());
    };
    let mut items = serde_json::from_str::<Vec<serde_json::Map<String, Value>>>(text).unwrap_or_default();
    for item in &mut items {
        let Some(value) = item.get(id_field).and_then(Value::as_str).map(str::to_string) else {
            continue;
        };
        let Some(reference) = format_sakurava_ref(&value).map(|value| value.replace('-', "")) else {
            continue;
        };
        if !reference.starts_with(section) {
            return Err("Imported related Ref has the wrong section.".to_string());
        }
        if let Some(id) = resolve_sakurava_ref(connection, section, &reference)? {
            item.insert(id_field.to_string(), Value::String(id.clone()));
            let label = match section {
                "V" => get_video(connection, &id)?.map(|record| record.title),
                "I" => get_image(connection, &id)?.map(|record| record.title),
                "P" => get_performer(connection, &id)?.map(|record| record.name),
                _ => None,
            }.ok_or_else(|| "Resolved related Ref has no catalog record.".to_string())?;
            let label_field = if id_field == "performerId" { "nameSnapshot" } else { "titleSnapshot" };
            item.insert(label_field.to_string(), Value::String(label));
        } else if !allow_unresolved {
            return Err("Imported related Ref was not found after create planning.".to_string());
        }
    }
    object.insert(
        field.to_string(),
        Value::String(serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())),
    );
    Ok(())
}

fn decode_import_value<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, String> {
    serde_json::from_value(value)
        .map_err(|_| "Imported values do not match the supported catalog contract.".to_string())
}

fn glossary_depth(connection: &Connection, id: &str) -> Result<usize, String> {
    let mut depth = 0usize;
    let mut current = id.to_string();
    let mut seen = std::collections::HashSet::new();
    while !current.is_empty() && seen.insert(current.clone()) {
        let Some(entry) = get_glossary_entry(connection, &current)? else {
            break;
        };
        current = entry.parent_id;
        depth += 1;
    }
    Ok(depth)
}

fn managed_category_depth(connection: &Connection, id: &str) -> Result<usize, String> {
    let categories = list_managed_categories(connection)?;
    let by_key = categories
        .iter()
        .map(|category| (category.key.as_str(), category))
        .collect::<std::collections::HashMap<_, _>>();
    let mut depth = 0usize;
    let mut current = id;
    let mut seen = std::collections::HashSet::new();
    while !current.is_empty() && seen.insert(current.to_string()) {
        let Some(category) = by_key.get(current) else {
            break;
        };
        current = category.parent_key.as_deref().unwrap_or_default();
        depth += 1;
    }
    Ok(depth)
}

fn import_catalog_snapshot(connection: &Connection) -> Result<Value, String> {
    let mut videos = list_videos(connection)?;
    let mut images = list_images(connection)?;
    let mut performers = list_performers(connection)?;
    let mut categories = list_managed_categories(connection)?;
    let mut glossary = list_glossary_entries(connection)?;
    let mut credits = list_credits(connection)?;
    videos.sort_by(|left, right| left.id.cmp(&right.id));
    images.sort_by(|left, right| left.id.cmp(&right.id));
    performers.sort_by(|left, right| left.id.cmp(&right.id));
    categories.sort_by(|left, right| left.key.cmp(&right.key));
    glossary.sort_by(|left, right| left.id.cmp(&right.id));
    credits.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(
        json!({ "videos": videos, "images": images, "performers": performers, "categories": categories, "glossary": glossary, "credits": credits }),
    )
}

fn import_revalidation_snapshot(
    plan: &ImportCatalogApplyPlan,
    snapshot: &Value,
) -> Result<Value, String> {
    const SECTIONS: [&str; 6] = [
        "videos",
        "images",
        "performers",
        "categories",
        "glossary",
        "credits",
    ];
    let mut included =
        std::collections::BTreeMap::<String, std::collections::BTreeSet<String>>::new();
    for section in SECTIONS {
        included.insert(section.to_string(), std::collections::BTreeSet::new());
        snapshot_records(snapshot, section)?;
    }

    for operation in &plan.operations {
        if let Some(id) = operation.record_id.as_deref() {
            include_snapshot_id(&mut included, &operation.section, id);
        }
        collect_import_record_references(&operation.proposed_values, snapshot, &mut included)?;
        if let Some(current) = operation.current_record.as_ref() {
            collect_import_record_references(current, snapshot, &mut included)?;
        }

        if operation.section == "categories" {
            collect_category_operation_dependencies(operation, snapshot, &mut included)?;
        }
        if operation.section == "credits" {
            collect_credit_operation_dependencies(operation, snapshot, &mut included)?;
        }
    }

    expand_glossary_relationship_scope(snapshot, &mut included)?;

    let mut scoped = serde_json::Map::new();
    for section in SECTIONS {
        let ids = included
            .get(section)
            .ok_or_else(|| "Import revalidation scope is incomplete.".to_string())?;
        let records = snapshot_records(snapshot, section)?
            .iter()
            .filter(|record| {
                snapshot_record_id(section, record)
                    .map(|id| ids.contains(id))
                    .unwrap_or(false)
            })
            .cloned()
            .collect::<Vec<_>>();
        scoped.insert(section.to_string(), Value::Array(records));
    }
    Ok(Value::Object(scoped))
}

fn collect_credit_operation_dependencies(
    operation: &ImportCatalogPlanOperation,
    snapshot: &Value,
    included: &mut std::collections::BTreeMap<String, std::collections::BTreeSet<String>>,
) -> Result<(), String> {
    let current = operation.current_record.as_ref();
    let work_type = operation
        .proposed_values
        .get("workType")
        .and_then(Value::as_str)
        .or_else(|| {
            current
                .and_then(|value| value.get("workType"))
                .and_then(Value::as_str)
        });
    let work_id = operation
        .proposed_values
        .get("workId")
        .and_then(Value::as_str)
        .or_else(|| {
            current
                .and_then(|value| value.get("workId"))
                .and_then(Value::as_str)
        });
    let performer_id = operation
        .proposed_values
        .get("performerId")
        .and_then(Value::as_str)
        .or_else(|| {
            current
                .and_then(|value| value.get("performerId"))
                .and_then(Value::as_str)
        });
    if let (Some(work_type), Some(work_id), Some(performer_id)) = (work_type, work_id, performer_id)
    {
        for credit in snapshot_records(snapshot, "credits")? {
            if credit.get("workType").and_then(Value::as_str) == Some(work_type)
                && credit.get("workId").and_then(Value::as_str) == Some(work_id)
                && credit.get("performerId").and_then(Value::as_str) == Some(performer_id)
            {
                if let Some(id) = snapshot_record_id("credits", credit) {
                    include_snapshot_id(included, "credits", id);
                }
            }
        }
    }
    Ok(())
}

fn snapshot_records<'a>(snapshot: &'a Value, section: &str) -> Result<&'a Vec<Value>, String> {
    snapshot
        .get(section)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Snapshot section is missing: {section}."))
}

fn snapshot_record_id<'a>(section: &str, record: &'a Value) -> Option<&'a str> {
    record
        .get(if section == "categories" { "key" } else { "id" })
        .and_then(Value::as_str)
}

fn include_snapshot_id(
    included: &mut std::collections::BTreeMap<String, std::collections::BTreeSet<String>>,
    section: &str,
    id: &str,
) {
    if let Some(ids) = included.get_mut(section) {
        if !id.trim().is_empty() {
            ids.insert(id.to_string());
        }
    }
}

fn collect_import_record_references(
    record: &Value,
    snapshot: &Value,
    included: &mut std::collections::BTreeMap<String, std::collections::BTreeSet<String>>,
) -> Result<(), String> {
    if let Some(work_id) = record.get("workId").and_then(Value::as_str) {
        match record.get("workType").and_then(Value::as_str) {
            Some("video") => include_snapshot_id(included, "videos", work_id),
            Some("image") => include_snapshot_id(included, "images", work_id),
            _ => {}
        }
    }
    if let Some(performer_id) = record.get("performerId").and_then(Value::as_str) {
        include_snapshot_id(included, "performers", performer_id);
    }
    for field in ["creditTypeCategoryId", "roleImportanceCategoryId"] {
        if let Some(category_id) = record.get(field).and_then(Value::as_str) {
            include_snapshot_id(included, "categories", category_id);
        }
    }
    for (field, section) in [
        ("relatedPerformersJson", "performers"),
        ("relatedImagesJson", "images"),
        ("relatedVideosJson", "videos"),
    ] {
        let Some(text) = record.get(field).and_then(Value::as_str) else {
            continue;
        };
        let Ok(references) = serde_json::from_str::<Value>(text) else {
            continue;
        };
        if let Some(references) = references.as_array() {
            for reference in references {
                if let Some(id) = reference.get("recordId").and_then(Value::as_str) {
                    include_snapshot_id(included, section, id);
                }
            }
        }
    }

    if let Some(text) = record.get("categoriesJson").and_then(Value::as_str) {
        if let Ok(labels) = serde_json::from_str::<Vec<String>>(text) {
            for category in snapshot_records(snapshot, "categories")? {
                let name = category
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if labels.iter().any(|label| label.eq_ignore_ascii_case(name)) {
                    if let Some(id) = snapshot_record_id("categories", category) {
                        include_snapshot_id(included, "categories", id);
                    }
                }
            }
        }
    }

    if let Some(parent_key) = record.get("parentKey").and_then(Value::as_str) {
        include_snapshot_id(included, "categories", parent_key);
    }
    if let Some(parent_id) = record
        .get("parentId")
        .and_then(Value::as_str)
        .filter(|value| !value.starts_with("GLO-NEW-"))
    {
        include_snapshot_id(included, "glossary", parent_id);
    }
    Ok(())
}

fn collect_category_operation_dependencies(
    operation: &ImportCatalogPlanOperation,
    snapshot: &Value,
    included: &mut std::collections::BTreeMap<String, std::collections::BTreeSet<String>>,
) -> Result<(), String> {
    let desired_name = operation
        .proposed_values
        .get("name")
        .and_then(Value::as_str)
        .or_else(|| {
            operation
                .current_record
                .as_ref()
                .and_then(|record| record.get("name"))
                .and_then(Value::as_str)
        })
        .unwrap_or_default();
    for category in snapshot_records(snapshot, "categories")? {
        if category
            .get("name")
            .and_then(Value::as_str)
            .map(|name| name.eq_ignore_ascii_case(desired_name))
            .unwrap_or(false)
        {
            if let Some(id) = snapshot_record_id("categories", category) {
                include_snapshot_id(included, "categories", id);
            }
        }
    }

    let Some(target_key) = operation.record_id.as_deref() else {
        return Ok(());
    };
    for category in snapshot_records(snapshot, "categories")? {
        if category.get("parentKey").and_then(Value::as_str) == Some(target_key) {
            if let Some(id) = snapshot_record_id("categories", category) {
                include_snapshot_id(included, "categories", id);
            }
        }
    }
    if operation.action != "delete" {
        return Ok(());
    }

    let target_name = operation
        .current_record
        .as_ref()
        .and_then(|record| record.get("name"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    for section in ["videos", "images", "performers"] {
        for record in snapshot_records(snapshot, section)? {
            let uses_target = record
                .get("categoriesJson")
                .and_then(Value::as_str)
                .and_then(|text| serde_json::from_str::<Vec<String>>(text).ok())
                .map(|labels| {
                    labels
                        .iter()
                        .any(|label| label.eq_ignore_ascii_case(target_name))
                })
                .unwrap_or(false);
            if uses_target {
                if let Some(id) = snapshot_record_id(section, record) {
                    include_snapshot_id(included, section, id);
                }
            }
        }
    }
    for credit in snapshot_records(snapshot, "credits")? {
        let uses_target = credit.get("creditTypeCategoryId").and_then(Value::as_str)
            == Some(target_key)
            || credit
                .get("roleImportanceCategoryId")
                .and_then(Value::as_str)
                == Some(target_key);
        if uses_target {
            if let Some(id) = snapshot_record_id("credits", credit) {
                include_snapshot_id(included, "credits", id);
            }
        }
    }
    Ok(())
}

fn expand_glossary_relationship_scope(
    snapshot: &Value,
    included: &mut std::collections::BTreeMap<String, std::collections::BTreeSet<String>>,
) -> Result<(), String> {
    loop {
        let before = included.get("glossary").map_or(0, |ids| ids.len());
        let current_ids = included.get("glossary").cloned().unwrap_or_default();
        for entry in snapshot_records(snapshot, "glossary")? {
            let id = snapshot_record_id("glossary", entry).unwrap_or_default();
            let parent_id = entry
                .get("parentId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if current_ids.contains(id) || current_ids.contains(parent_id) {
                include_snapshot_id(included, "glossary", id);
                include_snapshot_id(included, "glossary", parent_id);
            }
        }
        if included.get("glossary").map_or(0, |ids| ids.len()) == before {
            return Ok(());
        }
    }
}

fn validate_import_plan_targets(
    plan: &ImportCatalogApplyPlan,
    snapshot: &Value,
) -> Result<(), String> {
    let mut affected = std::collections::HashMap::<(String, String), usize>::new();
    let mut temporary = std::collections::HashSet::<String>::new();
    let mut source_identities = std::collections::HashSet::<String>::new();
    let permanent_glossary_ids = snapshot_records(snapshot, "glossary")?
        .iter()
        .filter_map(|record| snapshot_record_id("glossary", record))
        .collect::<std::collections::HashSet<_>>();
    for (operation_index, operation) in plan.operations.iter().enumerate() {
        if operation.source_identity.trim().is_empty()
            || !source_identities.insert(operation.source_identity.clone())
        {
            return Err("Import operation source identity is missing or duplicated.".to_string());
        }
        if operation.action != "create" && operation.temporary_identifier.is_some() {
            return Err("Only Glossary Create may use a temporary identifier.".to_string());
        }
        if operation.action == "create" {
            if operation.record_id.is_some()
                || operation.current_record.is_some()
                || operation.proposed_values.get("id").is_some()
                || operation.proposed_values.get("key").is_some()
            {
                return Err("Create operation contains an existing target.".to_string());
            }
            if let Some(identifier) = &operation.temporary_identifier {
                if operation.section != "glossary"
                    || !valid_temporary_glossary_identifier(identifier)
                    || operation.stable_record_identifier != *identifier
                    || permanent_glossary_ids.contains(identifier.as_str())
                    || !temporary.insert(identifier.clone())
                {
                    return Err("Temporary identifier is invalid or duplicated.".to_string());
                }
            } else if operation.stable_record_identifier.starts_with("GLO-NEW-") {
                return Err("Temporary Glossary identifier was not declared.".to_string());
            }
            continue;
        }
        let id = operation
            .record_id
            .as_ref()
            .ok_or_else(|| "Existing operation has no target.".to_string())?;
        let target = (operation.section.clone(), id.clone());
        if let Some(first_operation_index) = affected.insert(target.clone(), operation_index) {
            return Err(format!(
                "A catalog record appears more than once in the operation plan: section={} record={} firstOperation={} duplicateOperation={}.",
                target.0, target.1, first_operation_index, operation_index,
            ));
        }
        let records = snapshot
            .get(&operation.section)
            .and_then(Value::as_array)
            .ok_or_else(|| "Snapshot section is missing.".to_string())?;
        let record = records
            .iter()
            .find(|record| {
                record
                    .get(if operation.section == "categories" {
                        "key"
                    } else {
                        "id"
                    })
                    .and_then(Value::as_str)
                    == Some(id.as_str())
            })
            .ok_or_else(|| "Operation target is missing from the snapshot.".to_string())?;
        if operation.current_record.as_ref().map(canonical_json) != Some(canonical_json(record)) {
            return Err("Operation target snapshot does not match.".to_string());
        }
    }
    for operation in &plan.operations {
        let proposed_temporary_parent = operation
            .proposed_values
            .get("parentId")
            .and_then(Value::as_str)
            .filter(|value| value.starts_with("GLO-NEW-"));
        let dependency_declaration_matches = match proposed_temporary_parent {
            Some(parent) => {
                operation.dependency_refs.len() == 1 && operation.dependency_refs[0] == parent
            }
            None => operation.dependency_refs.is_empty(),
        };
        if !dependency_declaration_matches {
            return Err(
                "Operation dependency declarations do not match the proposed parent.".to_string(),
            );
        }
        if operation
            .dependency_refs
            .iter()
            .any(|dependency| !temporary.contains(dependency))
        {
            return Err("Operation dependency is unresolved.".to_string());
        }
    }
    Ok(())
}

fn valid_temporary_glossary_identifier(value: &str) -> bool {
    let Some(suffix) = value.strip_prefix("GLO-NEW-") else {
        return false;
    };
    !suffix.is_empty()
        && suffix.len() <= 64
        && suffix.bytes().all(|byte| {
            byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        })
}

fn import_plan_fingerprint(plan: &ImportCatalogApplyPlan) -> String {
    let mut value = serde_json::to_value(plan).unwrap_or(Value::Null);
    if let Some(object) = value.as_object_mut() {
        object.remove("operationFingerprint");
        if let Some(operations) = object.get_mut("operations").and_then(Value::as_array_mut) {
            for operation in operations {
                if let Some(operation) = operation.as_object_mut() {
                    operation.remove("fieldDifferences");
                    operation.remove("warnings");
                    operation.remove("blockingIssues");
                }
            }
        }
    }
    fingerprint_value(&value)
}

fn valid_import_fingerprint(value: &str, prefix: &str) -> bool {
    value.len() == prefix.len() + 8
        && value.starts_with(prefix)
        && value[prefix.len()..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn fingerprint_value(value: &Value) -> String {
    let mut hash = 0x811c9dc5u32;
    for byte in canonical_json(value).as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("skv1-{hash:08x}")
}

fn canonical_json(value: &Value) -> String {
    match value {
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(canonical_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(values) => {
            let mut entries = values.iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(right.0));
            format!(
                "{{{}}}",
                entries
                    .into_iter()
                    .map(|(key, value)| format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap_or_default(),
                        canonical_json(value)
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        _ => serde_json::to_string(value).unwrap_or_else(|_| "null".to_string()),
    }
}

fn import_apply_failure(
    status: &str,
    stage: &str,
    message: &str,
    rollback_completed: bool,
    backup_package_name: Option<String>,
    skipped_count: usize,
) -> ImportCatalogApplyResult {
    let failure_code = import_apply_failure_code(stage, message, rollback_completed);
    import_apply_failure_with_code(
        status,
        stage,
        failure_code,
        message,
        rollback_completed,
        backup_package_name,
        skipped_count,
    )
}

fn import_apply_failure_with_code(
    status: &str,
    stage: &str,
    failure_code: &str,
    message: &str,
    rollback_completed: bool,
    backup_package_name: Option<String>,
    skipped_count: usize,
) -> ImportCatalogApplyResult {
    eprintln!("Sakurava import apply blocked: gate={failure_code} stage={stage}");
    ImportCatalogApplyResult {
        transaction_status: status.to_string(),
        backup_package_name,
        created_count: 0,
        updated_count: 0,
        cleared_field_count: 0,
        deleted_count: 0,
        skipped_count,
        failure_stage: Some(stage.to_string()),
        failure_code: Some(failure_code.to_string()),
        message: message.to_string(),
        rollback_completed,
    }
}

fn import_apply_failure_code(stage: &str, message: &str, rollback_completed: bool) -> &'static str {
    match message {
        "This import contract version is not supported."
        | "The selected import file fingerprint is not valid."
        | "The import plan contains unsupported or unresolved operations." => "PLAN_STRUCTURE_INVALID",
        IMPORT_PLAN_PROCESSING_FAILURE => {
            "PLAN_FINGERPRINT_MISMATCH"
        }
        "A safety backup cannot start while another backup operation is running." => "PACKAGE_OPERATION_BUSY",
        "The catalog is temporarily unavailable." => "DATABASE_UNAVAILABLE",
        "Sakurava could not revalidate the catalog."
        | "Sakurava could not revalidate the affected catalog dependencies." => "CATALOG_SNAPSHOT_INVALID",
        "The catalog changed after this Preview. Preview the file again before applying." => "CATALOG_STALE",
        "Sakurava could not create the required safety backup. No catalog changes were made." => "BACKUP_CREATE_FAILED",
        "Sakurava could not start the catalog transaction. No changes were made." => "TRANSACTION_START_FAILED",
        "The import could not be applied. Sakurava cancelled all changes from this import."
        | "The import could not be applied. No catalog changes were saved." => {
            if rollback_completed { "TRANSACTION_FAILED" } else { "ROLLBACK_FAILED" }
        }
        "The import would leave invalid catalog references. Sakurava cancelled all changes from this import." => {
            if rollback_completed { "FINAL_INTEGRITY_FAILED" } else { "ROLLBACK_FAILED" }
        }
        "The import could not be finalized. Sakurava did not report partial success." => {
            if rollback_completed { "COMMIT_FAILED" } else { "ROLLBACK_FAILED" }
        }
        _ if stage == "validation" => "MIGRATION_STATE_INVALID",
        _ => "IMPORT_RUNTIME_FAILED",
    }
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

fn validate_import_catalog_source(source_path: &str) -> Result<PathBuf, String> {
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
        return Err("Import source must be a CSV or XLSX file path".to_string());
    }
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("csv") && !extension.eq_ignore_ascii_case("xlsx") {
        return Err("Import source must be a CSV or XLSX file".to_string());
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

fn sanitize_video(mut video: Video, visible: &VisibleCatalogIds) -> Video {
    video.categories_json =
        sanitize_string_array_json(&video.categories_json, &visible.category_names, true);
    video.glossary_refs_json =
        sanitize_string_array_json(&video.glossary_refs_json, &visible.glossary, false);
    video.related_performers_json = sanitize_related_json(
        &video.related_performers_json,
        "performerId",
        &visible.performers,
    );
    video.related_images_json =
        sanitize_related_json(&video.related_images_json, "recordId", &visible.images);
    video
}

fn sanitize_image(mut image: Image, visible: &VisibleCatalogIds) -> Image {
    image.categories_json =
        sanitize_string_array_json(&image.categories_json, &visible.category_names, true);
    image.glossary_refs_json =
        sanitize_string_array_json(&image.glossary_refs_json, &visible.glossary, false);
    image.related_performers_json = sanitize_related_json(
        &image.related_performers_json,
        "performerId",
        &visible.performers,
    );
    image.related_videos_json =
        sanitize_related_json(&image.related_videos_json, "recordId", &visible.videos);
    image
}

fn sanitize_performer(mut performer: Performer, visible: &VisibleCatalogIds) -> Performer {
    performer.categories_json =
        sanitize_string_array_json(&performer.categories_json, &visible.category_names, true);
    performer.glossary_refs_json =
        sanitize_string_array_json(&performer.glossary_refs_json, &visible.glossary, false);
    performer.related_videos_json =
        sanitize_related_json(&performer.related_videos_json, "recordId", &visible.videos);
    performer.related_images_json =
        sanitize_related_json(&performer.related_images_json, "recordId", &visible.images);
    performer
}

fn video_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Video> {
    Ok(Video {
        id: row.get("id")?,
        sakurava_ref: row.get("sakuravaRef")?,
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
        glossary_refs_json: row.get("glossaryRefsJson")?,
        rating_json: row.get("ratingJson")?,
        r_plus: int_to_bool(row.get("rPlus")?),
        notes: row.get("notes")?,
        favorite: int_to_bool(row.get("favorite")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn image_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Image> {
    Ok(Image {
        id: row.get("id")?,
        sakurava_ref: row.get("sakuravaRef")?,
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
        glossary_refs_json: row.get("glossaryRefsJson")?,
        rating_json: row.get("ratingJson")?,
        r_plus: int_to_bool(row.get("rPlus")?),
        notes: row.get("notes")?,
        favorite: int_to_bool(row.get("favorite")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn performer_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Performer> {
    Ok(Performer {
        id: row.get("id")?,
        sakurava_ref: row.get("sakuravaRef")?,
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
        glossary_refs_json: row.get("glossaryRefsJson")?,
        categories_json: row.get("categoriesJson")?,
        rating_json: row.get("ratingJson")?,
        r_plus: int_to_bool(row.get("rPlus")?),
        notes: row.get("notes")?,
        favorite: int_to_bool(row.get("favorite")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn managed_category_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ManagedCategory> {
    Ok(ManagedCategory {
        key: row.get("key")?,
        sakurava_ref: row.get("sakuravaRef")?,
        name: row.get("name")?,
        parent_key: row.get("parentKey")?,
        description: row.get("description")?,
        thumbnail_path: row.get("thumbnailPath")?,
        show_in_videos: row.get("showInVideos")?,
        show_in_images: row.get("showInImages")?,
        show_in_performers: row.get("showInPerformers")?,
        show_in_credits: row.get("showInCredits")?,
        r_plus: int_to_bool(row.get("rPlus")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn glossary_entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GlossaryEntry> {
    Ok(GlossaryEntry {
        id: row.get("id")?,
        sakurava_ref: row.get("sakuravaRef")?,
        term: row.get("term")?,
        definition: row.get("definition")?,
        synonyms_json: row.get("synonyms_json")?,
        category: row.get("category")?,
        parent_id: row.get("parent_id")?,
        thumbnail_path: row.get("thumbnail_path")?,
        favorite: int_to_bool(row.get("favorite")?),
        source_title: row.get("source_title")?,
        source_url: row.get("source_url")?,
        r_plus: int_to_bool(row.get("rPlus")?),
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
        sakurava_ref: row.get("sakuravaRef")?,
        work_type: row.get("workType")?,
        work_id: row.get("workId")?,
        performer_id: row.get("performerId")?,
        character_name: row.get("characterName")?,
        character_original_name: row.get("characterOriginalName")?,
        credited_as: row.get("creditedAs")?,
        credit_type_text: row.get("creditTypeText")?,
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
    use crate::database::{initialize_schema, open_runtime_database, SakuravaRefMigrationState};

    fn test_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema init");
        connection
    }

    #[test]
    fn manual_regeneration_wakes_only_after_durable_queue_acceptance() {
        let queued = ManualRegenerationQueueResult {
            queued_count: 1,
            already_active_count: 0,
        };
        let mut wake_count = 0;
        wake_after_manual_regeneration_queue(&queued, || wake_count += 1);
        assert_eq!(wake_count, 1);

        let nothing_queued = ManualRegenerationQueueResult {
            queued_count: 0,
            already_active_count: 1,
        };
        wake_after_manual_regeneration_queue(&nothing_queued, || wake_count += 1);
        assert_eq!(wake_count, 1);
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
                issuance_yymm: Some("2607".to_string()),
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
                r_plus: None,
            },
        )
        .expect("create glossary");

        assert!(created.id.starts_with("glossary_"));
        assert_eq!(created.sakurava_ref, "G26070001");
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
                r_plus: None,
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
                    issuance_yymm: Some("2607".to_string()),
                    term: " ".to_string(),
                    definition: "Definition".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                    r_plus: None,
                },
            )
            .expect_err("term required"),
            "Glossary term is required"
        );

        assert_eq!(
            create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    issuance_yymm: Some("2607".to_string()),
                    term: "Term".to_string(),
                    definition: " ".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                    r_plus: None,
                },
            )
            .expect_err("definition required"),
            "Glossary definition is required"
        );

        assert_eq!(
            create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    issuance_yymm: Some("2607".to_string()),
                    term: "Term".to_string(),
                    definition: "Definition".to_string(),
                    synonyms_json: Some("{bad json".to_string()),
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: Some("example.invalid/source".to_string()),
                    r_plus: None,
                },
            )
            .expect_err("source url protocol required"),
            "Source URL must start with http:// or https://."
        );

        let created = create_glossary_entry(
            &connection,
            GlossaryEntryInput {
                issuance_yymm: Some("2607".to_string()),
                term: "Term".to_string(),
                definition: "Definition".to_string(),
                synonyms_json: Some("{bad json".to_string()),
                category: None,
                parent_id: None,
                thumbnail_path: None,
                favorite: None,
                source_title: None,
                source_url: None,
                r_plus: None,
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
                issuance_yymm: Some("2607".to_string()),
                term: "Parent Term".to_string(),
                definition: "Parent definition".to_string(),
                synonyms_json: None,
                category: None,
                parent_id: None,
                thumbnail_path: None,
                favorite: None,
                source_title: None,
                source_url: None,
                r_plus: None,
            },
        )
        .expect("create parent");

        let child = create_glossary_entry(
            &connection,
            GlossaryEntryInput {
                issuance_yymm: Some("2607".to_string()),
                term: "Child Term".to_string(),
                definition: "Child definition".to_string(),
                synonyms_json: None,
                category: None,
                parent_id: Some(parent.id.clone()),
                thumbnail_path: None,
                favorite: None,
                source_title: None,
                source_url: None,
                r_plus: None,
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
                    r_plus: None,
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
                issuance_yymm: Some("2607".to_string()),
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
                glossary_refs_json: None,
                rating_json: Some(r#"{"score":4,"source":"manual"}"#.to_string()),
                r_plus: None,
                notes: None,
                favorite: None,
            },
        )
        .expect("create video");

        assert_eq!(created.title, "Video Title");
        assert_eq!(created.sakurava_ref, "V26070001");
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
                glossary_refs_json: None,
                rating_json: Some("invalid".to_string()),
                r_plus: None,
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
                issuance_yymm: Some("2607".to_string()),
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
                glossary_refs_json: None,
                rating_json: Some(r#"{"score":5}"#.to_string()),
                r_plus: None,
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
        assert_eq!(created.sakurava_ref, "I26070001");
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
                glossary_refs_json: None,
                rating_json: Some(r#"{"quality":"high"}"#.to_string()),
                r_plus: None,
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
                issuance_yymm: Some("2607".to_string()),
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
                glossary_refs_json: None,
                rating_json: Some(r#"{"score":3}"#.to_string()),
                r_plus: None,
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
        assert_eq!(created.sakurava_ref, "P26070001");
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
                glossary_refs_json: None,
                rating_json: Some("[]".to_string()),
                r_plus: None,
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
            credit_type_text: Some(" Credit A ".to_string()),
            credited_as_mode: Some("custom".to_string()),
            credit_type_category_id: None,
            role_importance_category_id: None,
            character_mode: Some("text".to_string()),
            character_id: None,
            billing_order: Some(2),
            note: Some(" Note ".to_string()),
        }
    }

    fn credit_fixture_connection() -> Connection {
        let connection = test_connection();
        connection
            .execute(
                "INSERT INTO videos (id, title, createdAt, updatedAt) VALUES ('video-1', 'Video', '1', '1')",
                [],
            )
            .expect("video target");
        connection
            .execute(
                "INSERT INTO images (id, title, createdAt, updatedAt) VALUES ('image-1', 'Image', '1', '1')",
                [],
            )
            .expect("image target");
        connection
            .execute(
                "INSERT INTO performers (id, name, createdAt, updatedAt) VALUES ('performer-1', 'Performer One', '1', '1'), ('performer-2', 'Performer Two', '1', '1')",
                [],
            )
            .expect("performer targets");
        connection
            .execute(
                "INSERT INTO managedCategories (key, name, showInCredits, createdAt, updatedAt) VALUES ('category-credit', 'Credit Category', 1, '1', '1')",
                [],
            )
            .expect("category target");
        connection
    }

    #[test]
    fn credit_crud_and_filtered_lists_use_independent_credit_rows() {
        let connection = credit_fixture_connection();
        let first = create_credit(&connection, credit_input("video", "video-1", "performer-1"))
            .expect("create credit");
        let second = create_credit(&connection, credit_input("image", "image-1", "performer-1"))
            .expect("create second credit");
        create_credit(&connection, credit_input("video", "video-1", "performer-2"))
            .expect("create third credit");

        assert_eq!(first.character_name, "Lead");
        assert!(first.sakurava_ref.starts_with('R'));
        assert_eq!(first.character_original_name, None);
        assert_eq!(first.credited_as.as_deref(), Some("Stage Name"));
        assert_eq!(first.credit_type_text.as_deref(), Some("Credit A"));
        assert_eq!(first.credit_type_category_id, None);
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
                credit_type_text: None,
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
        assert_eq!(updated.sakurava_ref, first.sakurava_ref);
        assert_eq!(updated.character_name, "Updated Role");
        assert_eq!(updated.credited_as, None);
        assert_eq!(updated.credit_type_text.as_deref(), Some("Credit A"));
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
        let connection = credit_fixture_connection();
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
    fn credit_relationship_validation_is_atomic_for_create_and_update() {
        let connection = credit_fixture_connection();
        let before_counter: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sakuravaRefCounters WHERE sectionCode = 'R'",
                [],
                |row| row.get(0),
            )
            .expect("counter count");
        let mut invalid = credit_input("video", "video-1", "performer-1");
        invalid.credit_type_category_id = Some("Credit A".to_string());
        assert_eq!(
            create_credit(&connection, invalid).expect_err("missing category"),
            "Credit Credit Type category was not found."
        );
        let credit_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM credits", [], |row| row.get(0))
            .expect("credit count");
        let alias_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sakuravaRefAliases WHERE sectionCode = 'R'",
                [],
                |row| row.get(0),
            )
            .expect("R aliases");
        let after_counter: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sakuravaRefCounters WHERE sectionCode = 'R'",
                [],
                |row| row.get(0),
            )
            .expect("counter count after rejection");
        assert_eq!(credit_count, 0);
        assert_eq!(alias_count, 0);
        assert_eq!(after_counter, before_counter);

        let valid_null =
            create_credit(&connection, credit_input("video", "video-1", "performer-1"))
                .expect("null category accepted");
        let mut valid_category = credit_input("video", "video-1", "performer-1");
        valid_category.credit_type_category_id = Some("category-credit".to_string());
        let duplicate =
            create_credit(&connection, valid_category).expect("valid category accepted");
        assert_ne!(valid_null.id, duplicate.id);
        assert_ne!(valid_null.sakurava_ref, duplicate.sakurava_ref);
        assert_eq!(
            duplicate.credit_type_category_id.as_deref(),
            Some("category-credit")
        );

        let updated = update_credit(
            &connection,
            &valid_null.id,
            CreditPatch {
                work_type: None,
                work_id: None,
                performer_id: None,
                character_name: Some("Updated Role".to_string()),
                character_original_name: None,
                credited_as: None,
                credit_type_text: Some(Some("Credit B".to_string())),
                credited_as_mode: None,
                credit_type_category_id: Some(Some("category-credit".to_string())),
                role_importance_category_id: None,
                character_mode: None,
                character_id: None,
                billing_order: None,
                note: None,
            },
        )
        .expect("valid update")
        .expect("updated credit");
        assert_eq!(updated.sakurava_ref, valid_null.sakurava_ref);
        assert_eq!(updated.credit_type_text.as_deref(), Some("Credit B"));
        assert_eq!(
            updated.credit_type_category_id.as_deref(),
            Some("category-credit")
        );

        let rejected = update_credit(
            &connection,
            &valid_null.id,
            CreditPatch {
                work_type: None,
                work_id: None,
                performer_id: None,
                character_name: Some("Should Not Persist".to_string()),
                character_original_name: None,
                credited_as: None,
                credit_type_text: Some(None),
                credited_as_mode: None,
                credit_type_category_id: Some(Some("missing-category".to_string())),
                role_importance_category_id: None,
                character_mode: None,
                character_id: None,
                billing_order: None,
                note: None,
            },
        )
        .expect_err("invalid update rejected");
        assert_eq!(rejected, "Credit Credit Type category was not found.");
        assert_eq!(
            get_credit(&connection, &valid_null.id)
                .expect("read previous credit")
                .expect("previous credit remains"),
            updated
        );

        let cleared = update_credit(
            &connection,
            &valid_null.id,
            CreditPatch {
                work_type: None,
                work_id: None,
                performer_id: None,
                character_name: None,
                character_original_name: None,
                credited_as: None,
                credit_type_text: Some(None),
                credited_as_mode: None,
                credit_type_category_id: Some(None),
                role_importance_category_id: None,
                character_mode: None,
                character_id: None,
                billing_order: None,
                note: None,
            },
        )
        .expect("clear nullable category")
        .expect("cleared credit");
        assert_eq!(cleared.sakurava_ref, valid_null.sakurava_ref);
        assert_eq!(cleared.credit_type_text, None);
        assert_eq!(cleared.credit_type_category_id, None);
    }

    #[test]
    fn managed_category_credits_scope_round_trips_and_credit_keys_block_delete() {
        let connection = credit_fixture_connection();
        let created = create_managed_category(
            &connection,
            ManagedCategoryInput {
                issuance_yymm: Some("2607".to_string()),
                key: Some("cat-credit-type-voice".to_string()),
                name: "Voice".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: Some(false),
                show_in_images: Some(false),
                show_in_performers: Some(false),
                show_in_credits: Some(true),
                r_plus: None,
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
                r_plus: None,
            },
        )
        .expect("update category")
        .expect("updated category");
        assert!(!updated.show_in_credits);

        let credit = create_credit(
            &connection,
            CreditInput {
                work_type: "video".to_string(),
                work_id: "video-1".to_string(),
                performer_id: "performer-1".to_string(),
                character_name: Some(created.key.clone()),
                character_original_name: None,
                credited_as: None,
                credit_type_text: None,
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
                issuance_yymm: Some("2607".to_string()),
                key: Some("cat-character-text".to_string()),
                name: "Character Text".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: None,
                show_in_images: None,
                show_in_performers: None,
                show_in_credits: Some(true),
                r_plus: None,
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
                issuance_yymm: Some("2607".to_string()),
                key: Some("cat-role-main".to_string()),
                name: "Main".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: None,
                show_in_images: None,
                show_in_performers: None,
                show_in_credits: Some(true),
                r_plus: None,
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
    fn export_file_write_validates_extension_and_safely_replaces_xlsx() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-export-safe-write-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create export folder");
        let destination = temp_root.join("skv-vid.xlsx");

        assert_eq!(
            write_export_file(
                temp_root.join("wrong.csv").to_string_lossy().as_ref(),
                b"xlsx",
                "xlsx",
            )
            .expect_err("wrong extension should fail"),
            "Export destination must use .xlsx"
        );

        let result = write_export_file(destination.to_string_lossy().as_ref(), b"first", "xlsx")
            .expect("write new export");
        assert_eq!(result.display_name, "skv-vid.xlsx");
        assert_eq!(std::fs::read(&destination).expect("read export"), b"first");
        write_export_file(destination.to_string_lossy().as_ref(), b"second", "xlsx")
            .expect("replace existing xlsx export");
        assert_eq!(
            std::fs::read(&destination).expect("read replacement"),
            b"second"
        );
        assert_eq!(
            std::fs::read_dir(&temp_root)
                .expect("read export folder")
                .count(),
            1,
            "successful replacement must clean its owned temporary file"
        );

        let csv_destination = temp_root.join("skv-vid.csv");
        write_export_file(
            csv_destination.to_string_lossy().as_ref(),
            b"csv-first",
            "csv",
        )
        .expect("write new csv export");
        assert_eq!(
            write_export_file(
                csv_destination.to_string_lossy().as_ref(),
                b"csv-second",
                "csv"
            )
            .expect_err("CSV export must retain no-overwrite behavior"),
            "Export file already exists; choose a new filename"
        );
        assert_eq!(
            std::fs::read(&csv_destination).expect("read original csv"),
            b"csv-first"
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn xlsx_replacement_failure_preserves_existing_destination_and_cleans_owned_temp() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-xlsx-replace-failure-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create export folder");
        let destination = temp_root.join("skv-vid.xlsx");
        let unrelated_sibling = temp_root.join("keep.txt");
        std::fs::write(&destination, b"previous workbook").expect("write previous export");
        std::fs::write(&unrelated_sibling, b"keep").expect("write unrelated sibling");

        let error = write_xlsx_export_file_with_replace(
            &destination,
            b"new workbook",
            |_temporary, _destination| {
                Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "replacement denied",
                ))
            },
        )
        .expect_err("replacement failure must be reported");

        assert!(error.contains("could not be replaced"));
        assert_eq!(
            std::fs::read(&destination).expect("read preserved export"),
            b"previous workbook"
        );
        assert_eq!(
            std::fs::read(&unrelated_sibling).expect("read unrelated sibling"),
            b"keep"
        );
        assert_eq!(
            std::fs::read_dir(&temp_root)
                .expect("read export folder")
                .count(),
            2,
            "replacement failure must clean only its owned temporary file"
        );

        let _ = std::fs::remove_dir_all(temp_root);
    }

    #[test]
    fn export_file_set_writes_same_folder_and_rejects_paths_or_conflicts() {
        let temp_root =
            std::env::temp_dir().join(format!("sakurava-export-set-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create export folder");

        assert_eq!(
            write_export_file_set(
                temp_root.to_string_lossy().as_ref(),
                vec![ExportFileInput {
                    file_name: "../unsafe.csv".to_string(),
                    bytes: vec![1],
                }],
            )
            .expect_err("path filename should fail"),
            "Export filename must not contain a path"
        );

        let files = vec![
            ExportFileInput {
                file_name: "skv-vid.csv".to_string(),
                bytes: b"videos".to_vec(),
            },
            ExportFileInput {
                file_name: "skv-img.csv".to_string(),
                bytes: b"images".to_vec(),
            },
        ];
        let result = write_export_file_set(temp_root.to_string_lossy().as_ref(), files)
            .expect("write export set");
        assert_eq!(result.files_written, 2);
        assert_eq!(result.display_names, vec!["skv-vid.csv", "skv-img.csv"]);
        assert!(temp_root.join("skv-vid.csv").is_file());
        assert!(temp_root.join("skv-img.csv").is_file());

        assert_eq!(
            write_export_file_set(
                temp_root.to_string_lossy().as_ref(),
                vec![ExportFileInput {
                    file_name: "skv-vid.csv".to_string(),
                    bytes: vec![2],
                }],
            )
            .expect_err("existing file should fail"),
            "Export file already exists: skv-vid.csv"
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

    #[test]
    fn import_catalog_read_accepts_csv_and_xlsx_bytes_only() {
        let temp_root = std::env::temp_dir().join(format!(
            "sakurava-import-catalog-read-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).expect("create import folder");
        let xlsx = temp_root.join("catalog.xlsx");
        std::fs::write(&xlsx, [80u8, 75, 3, 4]).expect("write xlsx bytes");
        let result =
            read_import_catalog_file(xlsx.to_string_lossy().as_ref()).expect("read xlsx bytes");
        assert_eq!(result.display_name, "catalog.xlsx");
        assert_eq!(result.format, "xlsx");
        assert_eq!(result.bytes, vec![80, 75, 3, 4]);

        let unsupported = temp_root.join("catalog.ods");
        std::fs::write(&unsupported, b"no").expect("write unsupported file");
        assert_eq!(
            read_import_catalog_file(unsupported.to_string_lossy().as_ref())
                .expect_err("unsupported extension should fail"),
            "Import source must be a CSV or XLSX file"
        );
        let _ = std::fs::remove_dir_all(temp_root);
    }

    fn empty_video_input() -> VideoInput {
        VideoInput {
            issuance_yymm: Some("2607".to_string()),
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
            glossary_refs_json: None,
            rating_json: None,
            r_plus: None,
            notes: None,
            favorite: None,
        }
    }

    fn import_test_database(name: &str) -> (PathBuf, RuntimeDatabase) {
        let root = std::env::temp_dir().join(format!(
            "sakurava-import-{name}-{}-{}",
            std::process::id(),
            ID_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        let database = crate::database::prepare_database(root.join("app.sakurava.desktop"))
            .expect("import test database");
        (root, database)
    }

    fn plan_operation(
        section: &str,
        action: &str,
        row: usize,
        proposed: Value,
    ) -> ImportCatalogPlanOperation {
        ImportCatalogPlanOperation {
            source_identity: format!("test:{section}:{row}"),
            source_row_number: row,
            section: section.to_string(),
            action: action.to_string(),
            stable_record_identifier: String::new(),
            record_id: None,
            temporary_identifier: None,
            current_record: None,
            proposed_values: proposed,
            field_differences: Vec::new(),
            cleared_fields: Vec::new(),
            warnings: Vec::new(),
            blocking_issues: Vec::new(),
            dependency_refs: Vec::new(),
        }
    }

    fn signed_import_plan(
        database: &RuntimeDatabase,
        operations: Vec<ImportCatalogPlanOperation>,
    ) -> ImportCatalogApplyPlan {
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        let snapshot = import_catalog_snapshot(&connection).expect("snapshot");
        drop(connection);
        let mut plan = ImportCatalogApplyPlan {
            contract_version: 1,
            issuance_yymm: "2607".to_string(),
            source_fingerprint: "skvf1-00000000".to_string(),
            operation_fingerprint: String::new(),
            catalog_snapshot: snapshot,
            operations,
            skipped_count: 0,
        };
        plan.operation_fingerprint = import_plan_fingerprint(&plan);
        plan
    }

    #[test]
    fn import_apply_retains_available_requested_refs_and_allocates_duplicate_adds_deterministically() {
        let (root, database) = import_test_database("requested-public-refs");
        let plan = signed_import_plan(
            &database,
            vec![
                plan_operation(
                    "videos",
                    "create",
                    2,
                    json!({ "title": "First", "requestedSakuravaRef": "V26070077" }),
                ),
                plan_operation(
                    "videos",
                    "create",
                    3,
                    json!({ "title": "Second", "requestedSakuravaRef": "V26070077" }),
                ),
            ],
        );

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "committed");
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        let videos = list_videos(&connection).expect("videos");
        assert!(videos.iter().any(|video| video.sakurava_ref == "V26070077"));
        assert!(videos.iter().any(|video| video.sakurava_ref == "V26070078"));
        let high_water: i64 = connection.query_row(
            "SELECT lastSequence FROM sakuravaRefCounters WHERE sectionCode = 'V' AND issuanceYymm = '2607'",
            [],
            |row| row.get(0),
        ).expect("high water");
        assert_eq!(high_water, 78);
        drop(connection);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_resolves_same_batch_public_relationships_to_authoritative_targets() {
        let (root, database) = import_test_database("same-batch-public-relations");
        let plan = signed_import_plan(
            &database,
            vec![
                plan_operation(
                    "videos",
                    "create",
                    2,
                    json!({
                        "title": "Video",
                        "requestedSakuravaRef": "V26070001",
                        "relatedPerformersJson": "[{\"performerId\":\"P26070001\",\"nameSnapshot\":\"Stale\"}]",
                    }),
                ),
                plan_operation(
                    "performers",
                    "create",
                    3,
                    json!({ "name": "Performer", "requestedSakuravaRef": "P26070001" }),
                ),
            ],
        );

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "committed");
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        let video = list_videos(&connection).expect("videos").pop().expect("video");
        let performer = list_performers(&connection).expect("performers").pop().expect("performer");
        assert_eq!(
            serde_json::from_str::<Value>(&video.related_performers_json)
                .expect("related json"),
            json!([{ "performerId": performer.id, "nameSnapshot": "Performer" }]),
        );
        drop(connection);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_credit_create_allocates_r_inside_the_catalog_transaction() {
        let (root, database) = import_test_database("credit-create");
        let (work, performer) = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let work = create_video(
                &connection,
                VideoInput {
                    title: "Credit import work".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("work");
            let performer = create_performer(
                &connection,
                PerformerInput {
                    name: "Credit import performer".to_string(),
                    ..empty_performer_input()
                },
            )
            .expect("performer");
            (work, performer)
        };
        let operation = plan_operation(
            "credits",
            "create",
            2,
            json!({
                "workType": "video",
                "workId": work.id,
                "performerId": performer.id,
                "characterName": "Imported role",
                "creditedAsMode": "auto",
                "creditTypeText": "Credit A",
                "characterMode": "text",
                "billingOrder": 1,
                "note": null,
                "characterOriginalName": null,
                "creditedAs": null,
                "roleImportanceCategoryId": null
            }),
        );
        let plan = signed_import_plan(&database, vec![operation]);
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.created_count, 1);
        let connection = database.connection();
        let credits = list_credits(&connection.lock().expect("database lock")).expect("credits");
        assert_eq!(credits.len(), 1);
        assert!(credits[0].sakurava_ref.starts_with("R2607"));
        assert_eq!(credits[0].credit_type_text.as_deref(), Some("Credit A"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_mixed_credit_crud_preserves_identity_and_deleted_high_water() {
        let (root, database) = import_test_database("credit-mixed-crud");
        let (work, performer, updated_credit, deleted_credit) = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let work = create_video(
                &connection,
                VideoInput {
                    title: "Credit import work".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("work");
            let performer = create_performer(
                &connection,
                PerformerInput {
                    name: "Credit import performer".to_string(),
                    ..empty_performer_input()
                },
            )
            .expect("performer");
            let input = |credit_type_text: &str| CreditInput {
                work_type: "video".to_string(),
                work_id: work.id.clone(),
                performer_id: performer.id.clone(),
                character_name: Some("Role".to_string()),
                character_original_name: None,
                credited_as: None,
                credit_type_text: Some(credit_type_text.to_string()),
                credited_as_mode: Some("auto".to_string()),
                credit_type_category_id: None,
                role_importance_category_id: None,
                character_mode: Some("text".to_string()),
                character_id: None,
                billing_order: Some(1),
                note: None,
            };
            let updated_credit =
                create_credit(&connection, input("Before update")).expect("updated credit");
            let deleted_credit =
                create_credit(&connection, input("Delete me")).expect("deleted credit");
            (work, performer, updated_credit, deleted_credit)
        };
        let credit_issuance_yymm = updated_credit
            .sakurava_ref
            .get(1..5)
            .expect("credit R Ref has a YYMM namespace");

        let mut update = plan_operation(
            "credits",
            "update",
            2,
            json!({ "creditTypeText": "After update" }),
        );
        update.record_id = Some(updated_credit.id.clone());
        update.current_record =
            Some(serde_json::to_value(&updated_credit).expect("updated snapshot"));
        let mut delete = plan_operation("credits", "delete", 3, json!({}));
        delete.record_id = Some(deleted_credit.id.clone());
        delete.current_record =
            Some(serde_json::to_value(&deleted_credit).expect("deleted snapshot"));
        let create = plan_operation(
            "credits",
            "create",
            4,
            json!({
                "workType": "video",
                "workId": work.id,
                "performerId": performer.id,
                "characterName": "Role",
                "creditedAsMode": "auto",
                "creditTypeText": "New duplicate",
                "characterMode": "text",
                "billingOrder": 1,
                "note": null,
                "characterOriginalName": null,
                "creditedAs": null,
                "roleImportanceCategoryId": null
            }),
        );
        let mut plan = signed_import_plan(&database, vec![update, delete, create]);
        plan.issuance_yymm = credit_issuance_yymm.to_string();
        plan.operation_fingerprint = import_plan_fingerprint(&plan);
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.created_count, 1);
        assert_eq!(result.updated_count, 1);
        assert_eq!(result.deleted_count, 1);
        assert!(result.backup_package_name.is_some());

        let connection = database.connection();
        let credits = list_credits(&connection.lock().expect("database lock")).expect("credits");
        assert_eq!(credits.len(), 2);
        let updated = credits
            .iter()
            .find(|credit| credit.id == updated_credit.id)
            .expect("updated row");
        assert_eq!(updated.sakurava_ref, updated_credit.sakurava_ref);
        assert_eq!(updated.credit_type_text.as_deref(), Some("After update"));
        assert!(!credits.iter().any(|credit| credit.id == deleted_credit.id));
        let created = credits
            .iter()
            .find(|credit| credit.id != updated_credit.id)
            .expect("created row");
        assert_eq!(created.sakurava_ref, format!("R{credit_issuance_yymm}0003"));
        assert_ne!(created.sakurava_ref, deleted_credit.sakurava_ref);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_allows_unrelated_video_and_credit_changes_after_preview() {
        let (root, database) = import_test_database("unrelated-change");
        let affected = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            create_video(
                &connection,
                VideoInput {
                    title: "Affected before".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("affected video")
        };
        let mut update =
            plan_operation("videos", "update", 2, json!({ "title": "Affected after" }));
        update.record_id = Some(affected.id.clone());
        update.current_record = Some(serde_json::to_value(&affected).expect("affected value"));
        let plan = signed_import_plan(&database, vec![update]);
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let unrelated_video = create_video(
                &connection,
                VideoInput {
                    title: "Unrelated video".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("unrelated video");
            let unrelated_performer = create_performer(
                &connection,
                PerformerInput {
                    name: "Unrelated performer".to_string(),
                    ..empty_performer_input()
                },
            )
            .expect("unrelated performer");
            create_credit(
                &connection,
                CreditInput {
                    work_type: "video".to_string(),
                    work_id: unrelated_video.id,
                    performer_id: unrelated_performer.id,
                    character_name: None,
                    character_original_name: None,
                    credited_as: None,
                    credit_type_text: None,
                    credited_as_mode: None,
                    credit_type_category_id: None,
                    role_importance_category_id: None,
                    character_mode: None,
                    character_id: None,
                    billing_order: None,
                    note: None,
                },
            )
            .expect("unrelated credit");
        }
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.updated_count, 1);
        assert!(result.backup_package_name.is_some());
        let connection = database.connection();
        let updated = get_video(&connection.lock().expect("database lock"), &affected.id)
            .expect("video query")
            .expect("affected video");
        assert_eq!(updated.title, "Affected after");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_rejects_an_affected_record_change_before_backup() {
        let (root, database) = import_test_database("affected-change");
        let affected = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            create_video(
                &connection,
                VideoInput {
                    title: "Preview title".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("affected video")
        };
        let mut update =
            plan_operation("videos", "update", 2, json!({ "title": "Imported title" }));
        update.record_id = Some(affected.id.clone());
        update.current_record = Some(serde_json::to_value(&affected).expect("affected value"));
        let plan = signed_import_plan(&database, vec![update]);
        {
            let connection = database.connection();
            connection
                .lock()
                .expect("database lock")
                .execute(
                    "UPDATE videos SET title = 'Changed elsewhere' WHERE id = ?1",
                    [&affected.id],
                )
                .expect("external update");
        }

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "blocked");
        assert_eq!(result.failure_stage.as_deref(), Some("stalePreview"));
        assert_eq!(result.failure_code.as_deref(), Some("CATALOG_STALE"));
        assert_eq!(
            result.message,
            "The catalog changed after this Preview. Preview the file again before applying."
        );
        assert!(result.backup_package_name.is_none());
        let backup_folder = root.join("app.sakurava.desktop").join("backups");
        assert!(
            !backup_folder.exists()
                || fs::read_dir(backup_folder)
                    .expect("backup folder")
                    .next()
                    .is_none()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_validates_operation_targets_against_the_immutable_preview_snapshot() {
        let (root, database) = import_test_database("plan-integrity-snapshot");
        let video = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let created = create_video(
                &connection,
                VideoInput {
                    title: "Preview title".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("video");
            created
        };
        let mut update =
            plan_operation("videos", "update", 2, json!({ "title": "Imported title" }));
        update.record_id = Some(video.id.clone());
        update.current_record = Some(serde_json::to_value(&video).expect("video value"));
        let mut plan = signed_import_plan(&database, vec![update]);
        plan.operations[0].current_record =
            Some(json!({ "id": video.id, "title": "mutated plan" }));
        plan.operation_fingerprint = import_plan_fingerprint(&plan);

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "blocked");
        assert_eq!(result.failure_stage.as_deref(), Some("validation"));
        assert_eq!(result.failure_code.as_deref(), Some("PLAN_TARGET_INVALID"));
        assert_eq!(result.message, IMPORT_PLAN_PROCESSING_FAILURE);
        assert!(result.backup_package_name.is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_treats_new_category_credit_usage_as_stale_reference_state() {
        let (root, database) = import_test_database("stale-credit-reference");
        let category = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            create_managed_category(
                &connection,
                ManagedCategoryInput {
                    issuance_yymm: Some("2607".to_string()),
                    key: Some("cat-import".to_string()),
                    name: "Import Category".to_string(),
                    parent_key: None,
                    description: None,
                    thumbnail_path: None,
                    show_in_videos: None,
                    show_in_images: None,
                    show_in_performers: None,
                    show_in_credits: Some(true),
                    r_plus: None,
                },
            )
            .expect("category")
        };
        let mut delete = plan_operation("categories", "delete", 2, json!({}));
        delete.record_id = Some(category.key.clone());
        delete.current_record = Some(serde_json::to_value(&category).expect("category value"));
        let plan = signed_import_plan(&database, vec![delete]);
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let work = create_video(
                &connection,
                VideoInput {
                    title: "Credit work".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("credit work");
            let performer = create_performer(
                &connection,
                PerformerInput {
                    name: "Credit performer".to_string(),
                    ..empty_performer_input()
                },
            )
            .expect("credit performer");
            create_credit(
                &connection,
                CreditInput {
                    work_type: "video".to_string(),
                    work_id: work.id,
                    performer_id: performer.id,
                    character_name: None,
                    character_original_name: None,
                    credited_as: None,
                    credit_type_text: None,
                    credited_as_mode: None,
                    credit_type_category_id: Some(category.key.clone()),
                    role_importance_category_id: None,
                    character_mode: None,
                    character_id: None,
                    billing_order: None,
                    note: None,
                },
            )
            .expect("credit");
        }
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.failure_stage.as_deref(), Some("stalePreview"));
        assert!(result.backup_package_name.is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_treats_a_deleted_preview_target_as_stale_before_backup() {
        let (root, database) = import_test_database("stale-deleted-target");
        let video = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            create_video(
                &connection,
                VideoInput {
                    title: "Preview target".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("video")
        };
        let mut update = plan_operation("videos", "update", 2, json!({ "title": "Changed" }));
        update.record_id = Some(video.id.clone());
        update.current_record = Some(serde_json::to_value(&video).expect("video value"));
        let plan = signed_import_plan(&database, vec![update]);
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            delete_row(&connection, "videos", video.id).expect("delete elsewhere");
        }

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "blocked");
        assert_eq!(result.failure_stage.as_deref(), Some("stalePreview"));
        assert!(result.backup_package_name.is_none());
        let backup_folder = root.join("app.sakurava.desktop").join("backups");
        assert!(
            !backup_folder.exists()
                || fs::read_dir(backup_folder)
                    .expect("backup folder")
                    .next()
                    .is_none()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_treats_a_changed_existing_glossary_parent_as_stale() {
        let (root, database) = import_test_database("stale-glossary-parent");
        let parent = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    issuance_yymm: Some("2607".to_string()),
                    term: "Existing parent".to_string(),
                    definition: "Preview definition".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                    r_plus: None,
                },
            )
            .expect("parent")
        };
        let child = plan_operation(
            "glossary",
            "create",
            2,
            json!({
                "term": "New child",
                "definition": "Child definition",
                "parentId": parent.id.clone()
            }),
        );
        let plan = signed_import_plan(&database, vec![child]);
        {
            let connection = database.connection();
            connection
                .lock()
                .expect("database lock")
                .execute(
                    "UPDATE glossary_entries SET definition = 'Changed elsewhere' WHERE id = ?1",
                    [&parent.id],
                )
                .expect("external parent update");
        }

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "blocked");
        assert_eq!(result.failure_stage.as_deref(), Some("stalePreview"));
        assert!(result.backup_package_name.is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_rolls_back_every_operation_when_one_create_fails() {
        let (root, database) = import_test_database("rollback");
        let plan = signed_import_plan(
            &database,
            vec![
                plan_operation("videos", "create", 2, json!({ "title": "Created first" })),
                plan_operation("videos", "create", 3, json!({ "title": "" })),
            ],
        );
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "rolledBack");
        assert!(result.rollback_completed);
        assert_eq!(result.created_count, 0);
        let connection = database.connection();
        assert!(list_videos(&connection.lock().expect("database lock"))
            .expect("videos")
            .is_empty());
        assert!(result.backup_package_name.is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_backup_failure_prevents_transaction_start() {
        let (root, database) = import_test_database("backup-blocked");
        let plan = signed_import_plan(
            &database,
            vec![plan_operation(
                "videos",
                "create",
                2,
                json!({ "title": "Not created" }),
            )],
        );
        let package_operation = database.lock_package_operation().expect("package lock");
        let result = apply_import_catalog_plan(&database, plan);
        drop(package_operation);
        assert_eq!(result.transaction_status, "blocked");
        assert_eq!(result.failure_stage.as_deref(), Some("backup"));
        let connection = database.connection();
        assert!(list_videos(&connection.lock().expect("database lock"))
            .expect("videos")
            .is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_rejects_a_changed_source_fingerprint_before_backup() {
        let (root, database) = import_test_database("source-fingerprint");
        let mut plan = signed_import_plan(
            &database,
            vec![plan_operation(
                "videos",
                "create",
                2,
                json!({ "title": "Not created" }),
            )],
        );
        plan.source_fingerprint = "skvf1-11111111".to_string();

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "blocked");
        assert_eq!(result.failure_stage.as_deref(), Some("validation"));
        assert!(result.backup_package_name.is_none());
        let connection = database.connection();
        assert!(list_videos(&connection.lock().expect("database lock"))
            .expect("videos")
            .is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_rolls_back_explicit_clear_when_a_later_update_fails() {
        let (root, database) = import_test_database("clear-rollback");
        let (first, second) = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let first = create_video(
                &connection,
                VideoInput {
                    title: "First".to_string(),
                    notes: Some("Keep note".to_string()),
                    ..empty_video_input()
                },
            )
            .expect("first");
            let second = create_video(
                &connection,
                VideoInput {
                    title: "Second".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("second");
            (first, second)
        };
        let mut clear = plan_operation("videos", "update", 2, json!({ "notes": "" }));
        clear.record_id = Some(first.id.clone());
        clear.current_record = Some(serde_json::to_value(&first).expect("first value"));
        clear.cleared_fields = vec!["Notes".to_string()];
        let mut invalid = plan_operation("videos", "update", 3, json!({ "title": "" }));
        invalid.record_id = Some(second.id.clone());
        invalid.current_record = Some(serde_json::to_value(&second).expect("second value"));
        let plan = signed_import_plan(&database, vec![clear, invalid]);
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "rolledBack");
        let connection = database.connection();
        let restored = get_video(&connection.lock().expect("database lock"), &first.id)
            .expect("video")
            .expect("first exists");
        assert_eq!(restored.notes, "Keep note");
        assert_eq!(result.cleared_field_count, 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_parent_delete_cleans_dependent_credit_in_same_transaction() {
        let (root, database) = import_test_database("credit-post-condition");
        let (video, performer) = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let video = create_video(
                &connection,
                VideoInput {
                    title: "Credited work".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("video");
            let performer = create_performer(
                &connection,
                PerformerInput {
                    name: "Credited performer".to_string(),
                    ..empty_performer_input()
                },
            )
            .expect("performer");
            create_credit(&connection, credit_input("video", &video.id, &performer.id))
                .expect("credit");
            (video, performer)
        };
        let mut delete = plan_operation("videos", "delete", 2, json!({}));
        delete.record_id = Some(video.id.clone());
        delete.current_record = Some(serde_json::to_value(&video).expect("video value"));
        let result =
            apply_import_catalog_plan(&database, signed_import_plan(&database, vec![delete]));

        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.deleted_count, 1);
        assert_eq!(result.failure_stage, None);
        assert!(!result.rollback_completed);
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        assert!(get_video(&connection, &video.id)
            .expect("video query")
            .is_none());
        assert!(get_performer(&connection, &performer.id)
            .expect("performer query")
            .is_some());
        assert!(list_credits(&connection).expect("credits").is_empty());
        require_migrated_sakurava_refs(&connection).expect("valid final catalog");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_preserves_credit_work_and_clears_its_deleted_category() {
        let (root, database) = import_test_database("credit-preserved-category-cleanup");
        let (video, performer, category, credit) = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let category = create_managed_category(
                &connection,
                ManagedCategoryInput {
                    issuance_yymm: Some("2607".to_string()),
                    key: Some("credit-preserved-category".to_string()),
                    name: "Credit preserved category".to_string(),
                    parent_key: None,
                    description: None,
                    thumbnail_path: None,
                    show_in_videos: None,
                    show_in_images: None,
                    show_in_performers: None,
                    show_in_credits: None,
                    r_plus: None,
                },
            )
            .expect("category");
            let video = create_video(
                &connection,
                VideoInput {
                    title: "Credited work".to_string(),
                    categories_json: Some("[\"Credit preserved category\"]".to_string()),
                    ..empty_video_input()
                },
            )
            .expect("video");
            let performer = create_performer(
                &connection,
                PerformerInput {
                    name: "Credited performer".to_string(),
                    ..empty_performer_input()
                },
            )
            .expect("performer");
            let credit =
                create_credit(&connection, credit_input("video", &video.id, &performer.id))
                    .expect("credit");
            (video, performer, category, credit)
        };

        let mut cleanup = plan_operation("videos", "update", 0, json!({ "categoriesJson": "[]" }));
        cleanup.source_identity = "cleanup:videos:credit-preserved-category".to_string();
        cleanup.record_id = Some(video.id.clone());
        cleanup.current_record = Some(serde_json::to_value(&video).expect("video value"));
        let mut delete_category = plan_operation("categories", "delete", 2, json!({}));
        delete_category.record_id = Some(category.key.clone());
        delete_category.current_record =
            Some(serde_json::to_value(&category).expect("category value"));

        let result = apply_import_catalog_plan(
            &database,
            signed_import_plan(&database, vec![cleanup, delete_category]),
        );
        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.deleted_count, 1);
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        let preserved = get_video(&connection, &video.id)
            .expect("video query")
            .expect("preserved video");
        assert_eq!(preserved.categories_json, "[]");
        assert!(get_managed_category(&connection, &category.key)
            .expect("category query")
            .is_none());
        assert_eq!(
            get_credit(&connection, &credit.id).expect("credit query"),
            Some(credit)
        );
        assert!(get_performer(&connection, &performer.id)
            .expect("performer query")
            .is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn valid_delete_all_leaves_empty_migrated_catalog_and_all_creates_available() {
        let (root, database) = import_test_database("delete-all-empty");
        let (video, image, performer, category, glossary) = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let video = create_video(
                &connection,
                VideoInput {
                    title: "Delete video".to_string(),
                    ..empty_video_input()
                },
            )
            .expect("video");
            let image = create_image(
                &connection,
                ImageInput {
                    title: "Delete image".to_string(),
                    ..empty_image_input()
                },
            )
            .expect("image");
            let performer = create_performer(
                &connection,
                PerformerInput {
                    name: "Delete performer".to_string(),
                    ..empty_performer_input()
                },
            )
            .expect("performer");
            let category = create_managed_category(
                &connection,
                ManagedCategoryInput {
                    issuance_yymm: Some("2607".to_string()),
                    key: Some("delete-category".to_string()),
                    name: "Delete category".to_string(),
                    parent_key: None,
                    description: None,
                    thumbnail_path: None,
                    show_in_videos: None,
                    show_in_images: None,
                    show_in_performers: None,
                    show_in_credits: None,
                    r_plus: None,
                },
            )
            .expect("category");
            let glossary = create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    issuance_yymm: Some("2607".to_string()),
                    term: "Delete term".to_string(),
                    definition: "Delete definition".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                    r_plus: None,
                },
            )
            .expect("glossary");
            (video, image, performer, category, glossary)
        };
        let mut operations = Vec::new();
        for (section, row, id, value) in [
            (
                "videos",
                2,
                video.id.clone(),
                serde_json::to_value(&video).expect("video value"),
            ),
            (
                "images",
                3,
                image.id.clone(),
                serde_json::to_value(&image).expect("image value"),
            ),
            (
                "performers",
                4,
                performer.id.clone(),
                serde_json::to_value(&performer).expect("performer value"),
            ),
            (
                "categories",
                5,
                category.key.clone(),
                serde_json::to_value(&category).expect("category value"),
            ),
            (
                "glossary",
                6,
                glossary.id.clone(),
                serde_json::to_value(&glossary).expect("glossary value"),
            ),
        ] {
            let mut operation = plan_operation(section, "delete", row, json!({}));
            operation.record_id = Some(id);
            operation.current_record = Some(value);
            operations.push(operation);
        }
        let result =
            apply_import_catalog_plan(&database, signed_import_plan(&database, operations));
        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.deleted_count, 5);

        let reopened_paths = database.paths.clone();
        drop(database);
        let reopened = open_runtime_database(reopened_paths).expect("reopen empty catalog");
        assert_eq!(
            sakurava_ref_migration_status(&reopened)
                .expect("migrated status")
                .state,
            SakuravaRefMigrationState::Migrated
        );
        let connection = reopened.connection();
        let connection = connection.lock().expect("database lock");
        assert!(list_videos(&connection).expect("videos").is_empty());
        assert!(list_images(&connection).expect("images").is_empty());
        assert!(list_performers(&connection).expect("performers").is_empty());
        assert!(list_managed_categories(&connection)
            .expect("categories")
            .is_empty());
        assert!(list_glossary_entries(&connection)
            .expect("glossary")
            .is_empty());
        let next_video = create_video(
            &connection,
            VideoInput {
                title: "New video".to_string(),
                ..empty_video_input()
            },
        )
        .expect("new video");
        let next_image = create_image(
            &connection,
            ImageInput {
                title: "New image".to_string(),
                ..empty_image_input()
            },
        )
        .expect("new image");
        let next_performer = create_performer(
            &connection,
            PerformerInput {
                name: "New performer".to_string(),
                ..empty_performer_input()
            },
        )
        .expect("new performer");
        let next_category = create_managed_category(
            &connection,
            ManagedCategoryInput {
                issuance_yymm: Some("2607".to_string()),
                key: Some("new-category".to_string()),
                name: "New category".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: None,
                show_in_videos: None,
                show_in_images: None,
                show_in_performers: None,
                show_in_credits: None,
                r_plus: None,
            },
        )
        .expect("new category");
        let next_glossary = create_glossary_entry(
            &connection,
            GlossaryEntryInput {
                issuance_yymm: Some("2607".to_string()),
                term: "New term".to_string(),
                definition: "New definition".to_string(),
                synonyms_json: None,
                category: None,
                parent_id: None,
                thumbnail_path: None,
                favorite: None,
                source_title: None,
                source_url: None,
                r_plus: None,
            },
        )
        .expect("new glossary");
        assert_eq!(next_video.sakurava_ref, "V26070002");
        assert_eq!(next_image.sakurava_ref, "I26070002");
        assert_eq!(next_performer.sakurava_ref, "P26070002");
        assert_eq!(next_category.sakurava_ref, "C26070002");
        assert_eq!(next_glossary.sakurava_ref, "G26070002");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_delete_all_fixture_commits_273_safe_deletes_and_preserves_five_credit_targets()
    {
        let (root, database) = import_test_database("delete-all-278-credit-protected");
        let (protected_video, protected_image, protected_performers, cleanup_category) = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let cleanup_category = create_managed_category(
                &connection,
                ManagedCategoryInput {
                    issuance_yymm: Some("2607".to_string()),
                    key: Some("credit-protected-category".to_string()),
                    name: "Credit protected category".to_string(),
                    parent_key: None,
                    description: None,
                    thumbnail_path: None,
                    show_in_videos: None,
                    show_in_images: None,
                    show_in_performers: None,
                    show_in_credits: None,
                    r_plus: None,
                },
            )
            .expect("cleanup category");
            let protected_video = create_video(
                &connection,
                VideoInput {
                    title: "Protected video".to_string(),
                    categories_json: Some("[\"Credit protected category\"]".to_string()),
                    ..empty_video_input()
                },
            )
            .expect("protected video");
            let protected_image = create_image(
                &connection,
                ImageInput {
                    title: "Protected image".to_string(),
                    ..empty_image_input()
                },
            )
            .expect("protected image");
            let protected_performers = (0..3)
                .map(|index| {
                    create_performer(
                        &connection,
                        PerformerInput {
                            name: format!("Protected performer {index}"),
                            ..empty_performer_input()
                        },
                    )
                    .expect("protected performer")
                })
                .collect::<Vec<_>>();
            create_credit(
                &connection,
                credit_input("video", &protected_video.id, &protected_performers[0].id),
            )
            .expect("video credit one");
            create_credit(
                &connection,
                credit_input("image", &protected_image.id, &protected_performers[1].id),
            )
            .expect("image credit");
            create_credit(
                &connection,
                credit_input("video", &protected_video.id, &protected_performers[2].id),
            )
            .expect("video credit two");
            (
                protected_video,
                protected_image,
                protected_performers,
                cleanup_category,
            )
        };

        let mut operations = Vec::new();
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            for index in 0..99 {
                let record = create_video(
                    &connection,
                    VideoInput {
                        title: format!("Delete video {index}"),
                        ..empty_video_input()
                    },
                )
                .expect("video");
                let mut operation = plan_operation("videos", "delete", index + 2, json!({}));
                operation.record_id = Some(record.id.clone());
                operation.current_record = Some(serde_json::to_value(record).expect("video value"));
                operations.push(operation);
            }
            for index in 0..99 {
                let record = create_image(
                    &connection,
                    ImageInput {
                        title: format!("Delete image {index}"),
                        ..empty_image_input()
                    },
                )
                .expect("image");
                let mut operation = plan_operation("images", "delete", index + 102, json!({}));
                operation.record_id = Some(record.id.clone());
                operation.current_record = Some(serde_json::to_value(record).expect("image value"));
                operations.push(operation);
            }
            for index in 0..67 {
                let record = create_performer(
                    &connection,
                    PerformerInput {
                        name: format!("Delete performer {index}"),
                        ..empty_performer_input()
                    },
                )
                .expect("performer");
                let mut operation = plan_operation("performers", "delete", index + 202, json!({}));
                operation.record_id = Some(record.id.clone());
                operation.current_record =
                    Some(serde_json::to_value(record).expect("performer value"));
                operations.push(operation);
            }
            for index in 0..4 {
                let record = create_managed_category(
                    &connection,
                    ManagedCategoryInput {
                        issuance_yymm: Some("2607".to_string()),
                        key: Some(format!("delete-category-{index}")),
                        name: format!("Delete category {index}"),
                        parent_key: None,
                        description: None,
                        thumbnail_path: None,
                        show_in_videos: None,
                        show_in_images: None,
                        show_in_performers: None,
                        show_in_credits: None,
                        r_plus: None,
                    },
                )
                .expect("category");
                let mut operation = plan_operation("categories", "delete", index + 269, json!({}));
                operation.record_id = Some(record.key.clone());
                operation.current_record =
                    Some(serde_json::to_value(record).expect("category value"));
                operations.push(operation);
            }
            for index in 0..3 {
                let record = create_glossary_entry(
                    &connection,
                    GlossaryEntryInput {
                        issuance_yymm: Some("2607".to_string()),
                        term: format!("Delete glossary {index}"),
                        definition: "Definition".to_string(),
                        synonyms_json: None,
                        category: None,
                        parent_id: None,
                        thumbnail_path: None,
                        favorite: None,
                        source_title: None,
                        source_url: None,
                        r_plus: None,
                    },
                )
                .expect("glossary");
                let mut operation = plan_operation("glossary", "delete", index + 273, json!({}));
                operation.record_id = Some(record.id.clone());
                operation.current_record =
                    Some(serde_json::to_value(record).expect("glossary value"));
                operations.push(operation);
            }
            let mut cleanup =
                plan_operation("videos", "update", 0, json!({ "categoriesJson": "[]" }));
            cleanup.source_identity = "cleanup:videos:credit-protected-category:update".to_string();
            cleanup.record_id = Some(protected_video.id.clone());
            cleanup.current_record =
                Some(serde_json::to_value(&protected_video).expect("protected video value"));
            operations.push(cleanup);
            let mut category_delete = plan_operation("categories", "delete", 278, json!({}));
            category_delete.record_id = Some(cleanup_category.key.clone());
            category_delete.current_record =
                Some(serde_json::to_value(&cleanup_category).expect("cleanup category value"));
            operations.push(category_delete);
        }

        assert_eq!(
            operations
                .iter()
                .filter(|operation| operation.action == "delete")
                .count(),
            273
        );
        let result =
            apply_import_catalog_plan(&database, signed_import_plan(&database, operations));
        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.deleted_count, 273);
        let paths = database.paths.clone();
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        assert_eq!(list_videos(&connection).expect("videos").len(), 1);
        assert_eq!(list_images(&connection).expect("images").len(), 1);
        assert_eq!(list_performers(&connection).expect("performers").len(), 3);
        assert!(list_managed_categories(&connection)
            .expect("categories")
            .is_empty());
        assert!(list_glossary_entries(&connection)
            .expect("glossary")
            .is_empty());
        assert_eq!(list_credits(&connection).expect("credits").len(), 3);
        assert_eq!(
            get_video(&connection, &protected_video.id)
                .expect("protected video query")
                .expect("protected video")
                .categories_json,
            "[]"
        );
        assert!(get_image(&connection, &protected_image.id)
            .expect("protected image query")
            .is_some());
        for performer in protected_performers {
            assert!(get_performer(&connection, &performer.id)
                .expect("protected performer query")
                .is_some());
        }
        drop(connection);
        drop(database);
        let reopened = open_runtime_database(paths).expect("reopen catalog");
        assert_eq!(
            sakurava_ref_migration_status(&reopened)
                .expect("migration status")
                .state,
            SakuravaRefMigrationState::Migrated
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_rolls_back_earlier_creates_when_delete_validation_fails() {
        let (root, database) = import_test_database("delete-rollback");
        let parent = {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            let parent = create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    issuance_yymm: Some("2607".to_string()),
                    term: "Protected parent".to_string(),
                    definition: "Parent definition".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: None,
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                    r_plus: None,
                },
            )
            .expect("parent");
            create_glossary_entry(
                &connection,
                GlossaryEntryInput {
                    issuance_yymm: Some("2607".to_string()),
                    term: "Existing child".to_string(),
                    definition: "Child definition".to_string(),
                    synonyms_json: None,
                    category: None,
                    parent_id: Some(parent.id.clone()),
                    thumbnail_path: None,
                    favorite: None,
                    source_title: None,
                    source_url: None,
                    r_plus: None,
                },
            )
            .expect("child");
            parent
        };
        let create = plan_operation("videos", "create", 2, json!({ "title": "Must roll back" }));
        let mut delete = plan_operation("glossary", "delete", 3, json!({}));
        delete.record_id = Some(parent.id.clone());
        delete.current_record = Some(serde_json::to_value(&parent).expect("parent value"));
        let plan = signed_import_plan(&database, vec![create, delete]);

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "rolledBack");
        assert_eq!(result.failure_stage.as_deref(), Some("apply"));
        assert!(result.rollback_completed);
        assert_eq!(result.created_count, 0);
        assert_eq!(result.deleted_count, 0);
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        assert!(list_videos(&connection).expect("videos").is_empty());
        assert!(get_glossary_entry(&connection, &parent.id)
            .expect("parent query")
            .is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_creates_same_file_glossary_dependencies_in_one_transaction() {
        let (root, database) = import_test_database("glossary-dependency");
        let mut parent = plan_operation(
            "glossary",
            "create",
            2,
            json!({ "term": "Parent", "definition": "Parent definition", "parentId": "" }),
        );
        parent.temporary_identifier = Some("GLO-NEW-PARENT".to_string());
        parent.stable_record_identifier = "GLO-NEW-PARENT".to_string();
        let mut child = plan_operation(
            "glossary",
            "create",
            3,
            json!({ "term": "Child", "definition": "Child definition", "parentId": "GLO-NEW-PARENT" }),
        );
        child.temporary_identifier = Some("GLO-NEW-CHILD".to_string());
        child.stable_record_identifier = "GLO-NEW-CHILD".to_string();
        child.dependency_refs = vec!["GLO-NEW-PARENT".to_string()];
        let plan = signed_import_plan(&database, vec![child, parent]);
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "committed");
        assert_eq!(result.created_count, 2);
        let backup_name = result
            .backup_package_name
            .as_deref()
            .expect("safety backup");
        let backup_preview = preview_backup_package(&database, backup_name)
            .expect("existing Backup & Recovery reader accepts import safety package");
        assert_eq!(backup_preview.package_name, backup_name);
        let connection = database.connection();
        let entries =
            list_glossary_entries(&connection.lock().expect("database lock")).expect("glossary");
        let parent = entries
            .iter()
            .find(|entry| entry.term == "Parent")
            .expect("parent");
        let child = entries
            .iter()
            .find(|entry| entry.term == "Child")
            .expect("child");
        assert_eq!(child.parent_id, parent.id);
        assert!(!parent.id.starts_with("GLO-NEW-"));
        assert!(!child.id.starts_with("GLO-NEW-"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_blocks_temporary_glossary_identifier_collision_before_backup() {
        let (root, database) = import_test_database("glossary-temp-collision");
        {
            let connection = database.connection();
            connection
                .lock()
                .expect("database lock")
                .execute(
                    "INSERT INTO glossary_entries (
                        id, term, definition, synonyms_json, category, parent_id,
                        thumbnail_path, favorite, source_title, source_url, created_at, updated_at
                    ) VALUES (?1, 'Permanent', 'Permanent definition', '[]', '', '', '', 0, '', '', 1, 1)",
                    ["GLO-NEW-COLLISION"],
                )
                .expect("permanent collision fixture");
        }
        let mut create = plan_operation(
            "glossary",
            "create",
            2,
            json!({ "term": "New", "definition": "New definition", "parentId": "" }),
        );
        create.stable_record_identifier = "GLO-NEW-COLLISION".to_string();
        create.temporary_identifier = Some("GLO-NEW-COLLISION".to_string());
        let plan = signed_import_plan(&database, vec![create]);

        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "blocked");
        assert_eq!(result.failure_stage.as_deref(), Some("validation"));
        assert!(result.backup_package_name.is_none());
        let connection = database.connection();
        let entries = list_glossary_entries(&connection.lock().expect("database lock"))
            .expect("glossary entries");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "GLO-NEW-COLLISION");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_fingerprint_matches_the_frontend_utf8_contract() {
        assert_eq!(
            fingerprint_value(&json!({ "b": [1, true, null], "a": "é" })),
            "skv1-d6f5215a"
        );
        assert_eq!(
            fingerprint_value(&json!({
                "catalogSnapshot": { "videos": [{ "id": "video-1" }] },
                "operations": [{ "proposedValues": { "title": "Updated" } }],
            })),
            "skv1-03789877"
        );
    }

    #[test]
    fn import_plan_json_payload_deserializes_with_the_transport_normalized_shape() {
        let payload = json!({
            "contractVersion": 3,
            "issuanceYymm": "2607",
            "sourceFingerprint": "skvf1-00000000",
            "operationFingerprint": "skv1-00000000",
            "catalogSnapshot": {
                "videos": [{ "id": "video-1" }],
                "images": [], "performers": [], "categories": [], "glossary": [], "credits": [],
            },
            "operations": [],
            "skippedCount": 5,
        });
        let plan = serde_json::from_value::<ImportCatalogApplyPlan>(payload)
            .expect("transport-normalized plan payload");
        assert_eq!(plan.skipped_count, 5);
        assert_eq!(plan.catalog_snapshot["videos"][0]["id"], "video-1");
    }

    fn catalog_delete_test_video(connection: &Connection, title: &str) -> Video {
        let mut input = empty_video_input();
        input.title = title.to_string();
        create_video(connection, input).expect("create delete-test Video")
    }

    fn catalog_delete_test_image(connection: &Connection, title: &str) -> Image {
        let mut input = empty_image_input();
        input.title = title.to_string();
        create_image(connection, input).expect("create delete-test Image")
    }

    fn catalog_delete_test_performer(connection: &Connection, name: &str) -> Performer {
        let mut input = empty_performer_input();
        input.name = name.to_string();
        create_performer(connection, input).expect("create delete-test Performer")
    }

    fn commit_dependency_safe_delete(
        connection: &mut Connection,
        table: &str,
        id: &str,
    ) -> Result<DeleteResult, String> {
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(database_error)?;
        let result = delete_catalog_entity_in_transaction(&transaction, table, id.to_string())?;
        transaction.commit().map_err(database_error)?;
        Ok(result)
    }

    fn text_column(connection: &Connection, table: &str, column: &str, id: &str) -> String {
        connection
            .query_row(
                &format!("SELECT {column} FROM {table} WHERE id = ?1"),
                [id],
                |row| row.get(0),
            )
            .expect("relationship JSON")
    }

    #[test]
    fn dependency_safe_catalog_delete_video_cleans_only_owned_dependencies() {
        let mut connection = test_connection();
        let target = catalog_delete_test_video(&connection, "Delete Video");
        let unrelated_video = catalog_delete_test_video(&connection, "Keep Video");
        let inbound_image = catalog_delete_test_image(&connection, "Inbound Image");
        let inbound_performer = catalog_delete_test_performer(&connection, "Inbound Performer");
        let unrelated_performer = catalog_delete_test_performer(&connection, "Unrelated Performer");
        update_image(
            &connection,
            &inbound_image.id,
            ImagePatch {
                related_videos_json: Some(
                    json!([
                        { "recordId": target.id, "titleSnapshot": target.title },
                        { "recordId": unrelated_video.id, "titleSnapshot": unrelated_video.title }
                    ])
                    .to_string(),
                ),
                ..ImagePatch::default()
            },
        )
        .expect("link Image")
        .expect("Image exists");
        update_performer(
            &connection,
            &inbound_performer.id,
            PerformerPatch {
                related_videos_json: Some(
                    json!([
                        { "recordId": target.id, "titleSnapshot": target.title },
                        { "recordId": unrelated_video.id, "titleSnapshot": unrelated_video.title }
                    ])
                    .to_string(),
                ),
                ..PerformerPatch::default()
            },
        )
        .expect("link Performer")
        .expect("Performer exists");
        let first = create_credit(
            &connection,
            credit_input("video", &target.id, &inbound_performer.id),
        )
        .expect("first dependent Credit");
        let second = create_credit(
            &connection,
            credit_input("video", &target.id, &inbound_performer.id),
        )
        .expect("logical duplicate dependent Credit");
        let unrelated_credit = create_credit(
            &connection,
            credit_input("video", &unrelated_video.id, &unrelated_performer.id),
        )
        .expect("unrelated Credit");
        let counter_before: i64 = connection
            .query_row(
                "SELECT lastSequence FROM sakuravaRefCounters WHERE sectionCode = 'V' AND issuanceYymm = '2607'",
                [],
                |row| row.get(0),
            )
            .expect("Video counter");

        let result = commit_dependency_safe_delete(&mut connection, "videos", &target.id)
            .expect("dependency-safe Video delete");

        assert!(result.deleted);
        assert!(get_video(&connection, &target.id)
            .expect("target query")
            .is_none());
        assert!(get_credit(&connection, &first.id)
            .expect("first Credit query")
            .is_none());
        assert!(get_credit(&connection, &second.id)
            .expect("second Credit query")
            .is_none());
        assert_eq!(
            get_credit(&connection, &unrelated_credit.id).expect("unrelated Credit query"),
            Some(unrelated_credit)
        );
        assert_eq!(
            text_column(
                &connection,
                "images",
                "relatedVideosJson",
                &inbound_image.id
            ),
            json!([{ "recordId": unrelated_video.id, "titleSnapshot": unrelated_video.title }])
                .to_string()
        );
        assert_eq!(
            text_column(
                &connection,
                "performers",
                "relatedVideosJson",
                &inbound_performer.id
            ),
            json!([{ "recordId": unrelated_video.id, "titleSnapshot": unrelated_video.title }])
                .to_string()
        );
        assert!(get_image(&connection, &inbound_image.id)
            .expect("surviving Image")
            .is_some());
        assert!(get_performer(&connection, &inbound_performer.id)
            .expect("surviving Performer")
            .is_some());
        require_migrated_sakurava_refs(&connection).expect("valid final references");
        let alias_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sakuravaRefAliases WHERE sectionCode = 'V' AND sakuravaRef = ?1",
                [&target.sakurava_ref],
                |row| row.get(0),
            )
            .expect("durable alias count");
        assert_eq!(alias_count, 1);
        let counter_after: i64 = connection
            .query_row(
                "SELECT lastSequence FROM sakuravaRefCounters WHERE sectionCode = 'V' AND issuanceYymm = '2607'",
                [],
                |row| row.get(0),
            )
            .expect("Video counter after delete");
        assert_eq!(counter_after, counter_before);
        let replacement = catalog_delete_test_video(&connection, "Replacement Video");
        assert_ne!(replacement.sakurava_ref, target.sakurava_ref);
    }

    #[test]
    fn dependency_safe_catalog_delete_image_cleans_credits_and_inbound_links() {
        let mut connection = test_connection();
        let target = catalog_delete_test_image(&connection, "Delete Image");
        let surviving_video = catalog_delete_test_video(&connection, "Surviving Video");
        let surviving_performer = catalog_delete_test_performer(&connection, "Surviving Performer");
        update_video(
            &connection,
            &surviving_video.id,
            VideoPatch {
                related_images_json: Some(
                    json!([{ "recordId": target.id, "titleSnapshot": target.title }]).to_string(),
                ),
                ..VideoPatch::default()
            },
        )
        .expect("link Video")
        .expect("Video exists");
        update_performer(
            &connection,
            &surviving_performer.id,
            PerformerPatch {
                related_images_json: Some(
                    json!([{ "recordId": target.id, "titleSnapshot": target.title }]).to_string(),
                ),
                ..PerformerPatch::default()
            },
        )
        .expect("link Performer")
        .expect("Performer exists");
        let first = create_credit(
            &connection,
            credit_input("image", &target.id, &surviving_performer.id),
        )
        .expect("first dependent Credit");
        let second = create_credit(
            &connection,
            credit_input("image", &target.id, &surviving_performer.id),
        )
        .expect("second dependent Credit");

        commit_dependency_safe_delete(&mut connection, "images", &target.id)
            .expect("dependency-safe Image delete");

        assert!(get_image(&connection, &target.id)
            .expect("target query")
            .is_none());
        assert!(get_credit(&connection, &first.id)
            .expect("first Credit")
            .is_none());
        assert!(get_credit(&connection, &second.id)
            .expect("second Credit")
            .is_none());
        assert_eq!(
            text_column(
                &connection,
                "videos",
                "relatedImagesJson",
                &surviving_video.id
            ),
            "[]"
        );
        assert_eq!(
            text_column(
                &connection,
                "performers",
                "relatedImagesJson",
                &surviving_performer.id
            ),
            "[]"
        );
        assert!(get_video(&connection, &surviving_video.id)
            .expect("surviving Video")
            .is_some());
        assert!(get_performer(&connection, &surviving_performer.id)
            .expect("surviving Performer")
            .is_some());
        require_migrated_sakurava_refs(&connection).expect("valid final references");
    }

    #[test]
    fn dependency_safe_catalog_delete_performer_cleans_cross_work_credits() {
        let mut connection = test_connection();
        let target = catalog_delete_test_performer(&connection, "Delete Performer");
        let unrelated_performer = catalog_delete_test_performer(&connection, "Keep Performer");
        let video = catalog_delete_test_video(&connection, "Credited Video");
        let image = catalog_delete_test_image(&connection, "Credited Image");
        update_video(
            &connection,
            &video.id,
            VideoPatch {
                related_performers_json: Some(json!([
                    { "performerId": target.id, "nameSnapshot": target.name },
                    { "performerId": unrelated_performer.id, "nameSnapshot": unrelated_performer.name }
                ]).to_string()),
                ..VideoPatch::default()
            },
        )
        .expect("link Video")
        .expect("Video exists");
        update_image(
            &connection,
            &image.id,
            ImagePatch {
                related_performers_json: Some(
                    json!([{ "performerId": target.id, "nameSnapshot": target.name }]).to_string(),
                ),
                ..ImagePatch::default()
            },
        )
        .expect("link Image")
        .expect("Image exists");
        let video_credit = create_credit(&connection, credit_input("video", &video.id, &target.id))
            .expect("Video Credit");
        let image_credit = create_credit(&connection, credit_input("image", &image.id, &target.id))
            .expect("Image Credit");
        let unrelated_credit = create_credit(
            &connection,
            credit_input("video", &video.id, &unrelated_performer.id),
        )
        .expect("unrelated Credit");

        commit_dependency_safe_delete(&mut connection, "performers", &target.id)
            .expect("dependency-safe Performer delete");

        assert!(get_performer(&connection, &target.id)
            .expect("target query")
            .is_none());
        assert!(get_credit(&connection, &video_credit.id)
            .expect("Video Credit")
            .is_none());
        assert!(get_credit(&connection, &image_credit.id)
            .expect("Image Credit")
            .is_none());
        assert!(get_credit(&connection, &unrelated_credit.id)
            .expect("unrelated Credit")
            .is_some());
        assert_eq!(
            text_column(&connection, "videos", "relatedPerformersJson", &video.id),
            json!([{ "performerId": unrelated_performer.id, "nameSnapshot": unrelated_performer.name }]).to_string()
        );
        assert_eq!(
            text_column(&connection, "images", "relatedPerformersJson", &image.id),
            "[]"
        );
        require_migrated_sakurava_refs(&connection).expect("valid final references");
    }

    #[test]
    fn dependency_safe_catalog_delete_rolls_back_and_rejects_invalid_catalogs() {
        let mut connection = test_connection();
        let target = catalog_delete_test_video(&connection, "Rollback Video");
        let performer = catalog_delete_test_performer(&connection, "Rollback Performer");
        let credit = create_credit(
            &connection,
            credit_input("video", &target.id, &performer.id),
        )
        .expect("rollback Credit");

        {
            let transaction = connection
                .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
                .expect("rollback transaction");
            let deleted =
                delete_catalog_entity_in_transaction(&transaction, "videos", target.id.clone())
                    .expect("delete before injected rollback");
            assert!(deleted.deleted);
            transaction.rollback().expect("injected rollback");
        }
        assert!(get_video(&connection, &target.id)
            .expect("rolled-back Video")
            .is_some());
        assert!(get_credit(&connection, &credit.id)
            .expect("rolled-back Credit")
            .is_some());

        connection
            .execute(
                "UPDATE performers SET relatedVideosJson = '[{\"recordId\":\"missing-video\",\"titleSnapshot\":\"Missing\"}]' WHERE id = ?1",
                [&performer.id],
            )
            .expect("inject pre-existing invalid relationship");
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("invalid-state transaction");
        let error = delete_catalog_entity_in_transaction(&transaction, "videos", target.id.clone())
            .expect_err("invalid catalog must reject delete");
        assert_eq!(
            error,
            "Catalog references need recovery before this action is available."
        );
        transaction.rollback().expect("invalid-state rollback");
        assert!(get_video(&connection, &target.id)
            .expect("preserved Video")
            .is_some());
        assert!(get_credit(&connection, &credit.id)
            .expect("preserved Credit")
            .is_some());
    }

    #[test]
    fn dependency_safe_catalog_delete_absent_target_is_non_mutating() {
        let mut connection = test_connection();
        let video = catalog_delete_test_video(&connection, "Keep Video");
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("no-op transaction");
        let result = delete_catalog_entity_in_transaction(
            &transaction,
            "videos",
            "missing-video".to_string(),
        )
        .expect("safe no-op");
        transaction.commit().expect("commit no-op");

        assert!(!result.deleted);
        assert!(get_video(&connection, &video.id)
            .expect("preserved Video")
            .is_some());
        require_migrated_sakurava_refs(&connection).expect("valid no-op state");
    }

    #[test]
    fn catalog_lifecycle_create_update_and_delete_cover_all_supported_owner_types() {
        let mut connection = test_connection();
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("create transaction");
        let video = create_video(
            &transaction,
            VideoInput {
                title: "Lifecycle Video".to_string(),
                cover_path: Some("video-cover.jpg".to_string()),
                ..empty_video_input()
            },
        )
        .expect("video");
        reconcile_catalog_lifecycle(&transaction, None, Some(owner_sources_from_video(&video)))
            .expect("video lifecycle");
        let image = create_image(
            &transaction,
            ImageInput {
                title: "Lifecycle Image".to_string(),
                cover_path: Some("image-cover.jpg".to_string()),
                gallery_image_paths_json: Some(r#"["gallery.jpg"]"#.to_string()),
                ..empty_image_input()
            },
        )
        .expect("image");
        reconcile_catalog_lifecycle(&transaction, None, Some(owner_sources_from_image(&image)))
            .expect("image lifecycle");
        let performer = create_performer(
            &transaction,
            PerformerInput {
                name: "Lifecycle Performer".to_string(),
                cover_path: Some("performer-cover.jpg".to_string()),
                performer_thumbnail_paths_json: Some(r#"["mini.jpg"]"#.to_string()),
                ..empty_performer_input()
            },
        )
        .expect("performer");
        reconcile_catalog_lifecycle(
            &transaction,
            None,
            Some(owner_sources_from_performer(&performer)),
        )
        .expect("performer lifecycle");
        let category = create_managed_category(
            &transaction,
            ManagedCategoryInput {
                issuance_yymm: Some("2607".to_string()),
                key: Some("lifecycle-category".to_string()),
                name: "Lifecycle Category".to_string(),
                parent_key: None,
                description: None,
                thumbnail_path: Some("category.jpg".to_string()),
                show_in_videos: None,
                show_in_images: None,
                show_in_performers: None,
                show_in_credits: None,
                r_plus: None,
            },
        )
        .expect("category");
        reconcile_catalog_lifecycle(
            &transaction,
            None,
            Some(owner_sources_from_category(&category)),
        )
        .expect("category lifecycle");
        let glossary = create_glossary_entry(
            &transaction,
            GlossaryEntryInput {
                issuance_yymm: Some("2607".to_string()),
                term: "Lifecycle Glossary".to_string(),
                definition: "Definition".to_string(),
                synonyms_json: None,
                category: None,
                parent_id: None,
                thumbnail_path: Some("glossary.jpg".to_string()),
                favorite: None,
                source_title: None,
                source_url: None,
                r_plus: None,
            },
        )
        .expect("glossary");
        reconcile_catalog_lifecycle(
            &transaction,
            None,
            Some(owner_sources_from_glossary(&glossary)),
        )
        .expect("glossary lifecycle");
        transaction.commit().expect("create commit");

        let item_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM managed_media_items", [], |row| {
                row.get(0)
            })
            .expect("item count");
        assert_eq!(item_count, 7);
        let initial_intents: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                [],
                |row| row.get(0),
            )
            .expect("intent count");
        assert_eq!(initial_intents, 7);

        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("update transaction");
        let previous = get_video(&transaction, &video.id)
            .expect("video read")
            .map(|value| owner_sources_from_video(&value));
        let updated = update_video(
            &transaction,
            &video.id,
            serde_json::from_value(json!({ "notes": "metadata only" })).expect("metadata patch"),
        )
        .expect("metadata update")
        .expect("video exists");
        reconcile_catalog_lifecycle(
            &transaction,
            previous,
            Some(owner_sources_from_video(&updated)),
        )
        .expect("metadata reconciliation");
        transaction.commit().expect("update commit");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("intent count"),
            initial_intents
        );

        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("delete transaction");
        let previous = Some(owner_sources_from_category(&category));
        let deleted = delete_managed_category_if_unused(&transaction, category.key.clone())
            .expect("delete category");
        assert!(deleted.deleted);
        reconcile_catalog_lifecycle(&transaction, previous, None).expect("retire category");
        transaction.commit().expect("delete commit");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents
                     WHERE lifecycle_action = 'retire'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("retirement count"),
            1
        );
    }

    #[test]
    fn import_apply_preview_stale_and_rollback_boundaries_do_not_leak_lifecycle_rows() {
        let (root, database) = import_test_database("managed-lifecycle-boundaries");
        let plan = signed_import_plan(
            &database,
            vec![plan_operation(
                "videos",
                "create",
                2,
                json!({ "title": "Lifecycle Video", "coverPath": "cover.jpg" }),
            )],
        );
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            assert_eq!(
                connection
                    .query_row("SELECT COUNT(*) FROM managed_media_items", [], |row| {
                        row.get::<_, i64>(0)
                    })
                    .expect("preview item count"),
                0
            );
        }
        let result = apply_import_catalog_plan(&database, plan);
        assert_eq!(result.transaction_status, "committed");
        assert!(result.backup_package_name.is_some());
        {
            let connection = database.connection();
            let connection = connection.lock().expect("database lock");
            assert_eq!(
                connection
                    .query_row("SELECT COUNT(*) FROM managed_media_items", [], |row| {
                        row.get::<_, i64>(0)
                    })
                    .expect("committed item count"),
                1
            );
            assert_eq!(
                connection
                    .query_row(
                        "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                        [],
                        |row| row.get::<_, i64>(0),
                    )
                    .expect("committed intent count"),
                1
            );
        }

        let existing_video = {
            let connection = database.connection();
            let video = list_videos(&connection.lock().expect("database lock"))
                .expect("videos")
                .into_iter()
                .next()
                .expect("created video");
            video
        };
        let mut stale_update =
            plan_operation("videos", "update", 3, json!({ "title": "Stale Update" }));
        stale_update.record_id = Some(existing_video.id.clone());
        stale_update.current_record =
            Some(serde_json::to_value(&existing_video).expect("video value"));
        let stale_plan = signed_import_plan(&database, vec![stale_update]);
        {
            let connection = database.connection();
            update_video(
                &connection.lock().expect("database lock"),
                &existing_video.id,
                serde_json::from_value(json!({ "title": "Changed elsewhere" }))
                    .expect("video patch"),
            )
            .expect("snapshot mutation")
            .expect("video exists");
        }
        let stale_result = apply_import_catalog_plan(&database, stale_plan);
        assert_eq!(stale_result.transaction_status, "blocked");
        assert_eq!(stale_result.failure_stage.as_deref(), Some("stalePreview"));

        let rollback_plan = signed_import_plan(
            &database,
            vec![
                plan_operation(
                    "images",
                    "create",
                    4,
                    json!({ "title": "Would Roll Back", "coverPath": "rollback.jpg" }),
                ),
                plan_operation("videos", "create", 5, json!({ "title": "" })),
            ],
        );
        let rollback_result = apply_import_catalog_plan(&database, rollback_plan);
        assert_eq!(rollback_result.transaction_status, "rolledBack");
        let connection = database.connection();
        let connection = connection.lock().expect("database lock");
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM managed_media_items", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("final item count"),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("final intent count"),
            1
        );
        drop(connection);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_apply_coalesces_multiple_source_updates_to_final_state() {
        let mut connection = test_connection();
        let image = create_image(
            &connection,
            ImageInput {
                title: "Existing Image".to_string(),
                cover_path: Some("before.jpg".to_string()),
                ..empty_image_input()
            },
        )
        .expect("existing image");
        let mut first = plan_operation(
            "images",
            "update",
            2,
            json!({ "coverPath": "intermediate.jpg" }),
        );
        first.record_id = Some(image.id.clone());
        let mut second = plan_operation("images", "update", 3, json!({ "coverPath": "final.jpg" }));
        second.record_id = Some(image.id.clone());

        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("apply transaction");
        let counts = apply_import_operations(&transaction, &[first, second], "2607")
            .expect("coalesced apply");
        assert_eq!(counts, (0, 2, 0, 0));
        transaction.commit().expect("commit");

        assert_eq!(
            get_image(&connection, &image.id)
                .expect("image read")
                .expect("image exists")
                .cover_path,
            "final.jpg"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("intent count"),
            1
        );
        let desired_revision: i64 = connection
            .query_row(
                "SELECT desired_revision FROM managed_media_item_generations",
                [],
                |row| row.get(0),
            )
            .expect("desired revision");
        assert_eq!(desired_revision, 1);
    }

    #[test]
    fn import_apply_add_update_and_add_delete_use_only_final_owner_state() {
        let mut connection = test_connection();
        let create_key = "coalesced-category";
        let delete_key = "ephemeral-category";
        let create = plan_operation(
            "categories",
            "create",
            2,
            json!({
                "key": create_key,
                "name": "Coalesced Category",
                "thumbnailPath": "initial.jpg"
            }),
        );
        let mut update = plan_operation(
            "categories",
            "update",
            3,
            json!({ "thumbnailPath": "final.jpg" }),
        );
        update.record_id = Some(create_key.to_string());
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("coalesced create update");
        assert_eq!(
            apply_import_operations(&transaction, &[create, update], "2607")
                .expect("create then update"),
            (1, 1, 0, 0)
        );
        transaction.commit().expect("commit create update");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("intent count"),
            1
        );
        assert_eq!(
            get_managed_category(&connection, create_key)
                .expect("category read")
                .expect("category exists")
                .thumbnail_path,
            "final.jpg"
        );

        let create_then_delete = plan_operation(
            "categories",
            "create",
            4,
            json!({
                "key": delete_key,
                "name": "Ephemeral Category",
                "thumbnailPath": "ephemeral.jpg"
            }),
        );
        let mut delete =
            plan_operation("categories", "delete", 5, Value::Object(Default::default()));
        delete.record_id = Some(delete_key.to_string());
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("coalesced create delete");
        assert_eq!(
            apply_import_operations(&transaction, &[create_then_delete, delete], "2607")
                .expect("create then delete"),
            (1, 0, 0, 1)
        );
        transaction.commit().expect("commit create delete");
        assert!(get_managed_category(&connection, delete_key)
            .expect("category read")
            .is_none());
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("intent count"),
            1
        );
    }

    #[test]
    fn import_apply_reorder_is_inert_and_repeated_removal_retires_one_slot() {
        let mut connection = test_connection();
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("create image");
        let image = create_image(
            &transaction,
            ImageInput {
                title: "Repeated Image".to_string(),
                gallery_image_paths_json: Some(r#"["one.jpg","two.jpg"]"#.to_string()),
                ..empty_image_input()
            },
        )
        .expect("image");
        reconcile_catalog_lifecycle(&transaction, None, Some(owner_sources_from_image(&image)))
            .expect("image lifecycle");
        transaction.commit().expect("create commit");
        let initial_intents: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                [],
                |row| row.get(0),
            )
            .expect("initial intents");

        let mut reorder = plan_operation(
            "images",
            "update",
            2,
            json!({
                "galleryImagePathsJson": "[\"two.jpg\",\"one.jpg\"]",
                "notes": "metadata"
            }),
        );
        reorder.record_id = Some(image.id.clone());
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("reorder transaction");
        apply_import_operations(&transaction, &[reorder], "2607").expect("reorder apply");
        transaction.commit().expect("reorder commit");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("reorder intent count"),
            initial_intents
        );

        let mut remove = plan_operation(
            "images",
            "update",
            3,
            json!({ "galleryImagePathsJson": "[\"two.jpg\"]" }),
        );
        remove.record_id = Some(image.id.clone());
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("remove transaction");
        apply_import_operations(&transaction, &[remove], "2607").expect("remove apply");
        transaction.commit().expect("remove commit");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM managed_media_lifecycle_intents
                     WHERE lifecycle_action = 'retire'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("retirement count"),
            1
        );
    }

    #[test]
    fn import_lifecycle_persistence_failure_rolls_back_catalog_alias_and_counter() {
        let mut connection = test_connection();
        connection
            .execute_batch(
                "CREATE TEMP TRIGGER reject_catalog_lifecycle_item
                 BEFORE INSERT ON managed_media_items
                 BEGIN
                   SELECT RAISE(ABORT, 'induced lifecycle failure');
                 END;",
            )
            .expect("failure trigger");
        let create = plan_operation(
            "videos",
            "create",
            2,
            json!({ "title": "Rollback Video", "coverPath": "rollback.jpg" }),
        );
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("apply transaction");
        let error = apply_import_operations(&transaction, &[create], "2607")
            .expect_err("lifecycle insert must fail");
        assert!(error.contains("induced lifecycle failure"));
        drop(transaction);
        assert!(list_videos(&connection).expect("videos").is_empty());
        for table in [
            "managed_media_items",
            "managed_media_item_generations",
            "managed_media_lifecycle_intents",
            "managed_media_lifecycle_targets",
            "sakuravaRefAliases",
            "sakuravaRefCounters",
        ] {
            let row_count: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .expect("row count");
            assert_eq!(row_count, 0, "{table}");
        }
    }

    fn empty_image_input() -> ImageInput {
        ImageInput {
            issuance_yymm: Some("2607".to_string()),
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
            glossary_refs_json: None,
            rating_json: None,
            r_plus: None,
            notes: None,
            favorite: None,
        }
    }

    fn empty_performer_input() -> PerformerInput {
        PerformerInput {
            issuance_yymm: Some("2607".to_string()),
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
            glossary_refs_json: None,
            rating_json: None,
            r_plus: None,
            notes: None,
            favorite: None,
        }
    }
}
