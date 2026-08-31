mod commands;
pub mod database;
pub mod managed_media;
pub(crate) mod output;
pub(crate) mod safe_filter;
pub mod video_player;

pub(crate) mod restore_coordinator;
#[cfg(test)]
mod safe_filter_tests;
#[allow(dead_code)]
pub(crate) mod skv_package;

#[cfg(test)]
mod skv_package_tests;

#[cfg(test)]
mod restore_coordinator_tests;

use tauri::Manager;

use managed_media::production::ProductionManagedMediaRuntime;
use video_player::manager::PlaybackHostManager;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let player_resource_root = app
                .path()
                .resource_dir()
                .map_err(|message| std::io::Error::other(message.to_string()))?;
            app.manage(PlaybackHostManager::new(player_resource_root));
            let database = database::prepare_tauri_database(app.handle())
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            println!(
                "Sakurava database initialized: {}",
                database.paths.database_file.display()
            );
            let _connection = database.connection();
            let managed_media_runtime =
                ProductionManagedMediaRuntime::start(&database).map_err(std::io::Error::other)?;
            app.manage(database);
            app.manage(managed_media_runtime);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::database_backup,
            commands::database_restore,
            commands::backup_package_create,
            commands::backup_package_list,
            commands::backup_package_preview,
            commands::backup_package_restore,
            commands::backup_package_restore_complete,
            commands::backup_package_restore_rollback,
            commands::backup_restore_recovery_status,
            commands::backup_restore_recovery_complete,
            commands::sakurava_ref_migration_get_status,
            commands::sakurava_ref_migration_apply,
            commands::backup_package_rotate_automatic,
            commands::backup_package_delete,
            commands::backup_package_export,
            commands::backup_package_import_selected,
            commands::backup_folder_open,
            commands::clear_app_cache,
            commands::export_csv_write,
            commands::export_file_write,
            commands::export_file_set_write,
            commands::import_csv_read,
            commands::import_catalog_file_read,
            commands::import_catalog_apply,
            commands::media_asset_allow_root,
            commands::managed_media_descriptor_resolve_batch,
            commands::managed_media_progress_get,
            commands::managed_media_statistics_get,
            commands::managed_media_removal_preview,
            commands::managed_media_removal_execute,
            commands::managed_media_regenerate_missing_or_outdated,
            commands::managed_media_automatic_actions_sync,
            commands::path_status_check,
            commands::media_metadata_probe,
            commands::open_media_path,
            commands::open_source_link,
            commands::detail_source_file_copy_as,
            commands::detail_source_folder_reveal,
            commands::gallery_folder_images_list,
            commands::video_create,
            commands::video_list,
            commands::video_list_visible,
            commands::video_get,
            commands::video_get_visible,
            commands::video_player_open,
            commands::global_output_validate_parent,
            commands::global_output_prepare_category,
            commands::global_output_default_file_path,
            commands::global_output_reveal_file,
            commands::video_contact_sheet_generate,
            commands::video_contact_sheet_save,
            commands::video_contact_sheet_cancel,
            commands::video_contact_sheet_cleanup,
            commands::video_update,
            commands::video_delete,
            commands::image_create,
            commands::image_list,
            commands::image_list_visible,
            commands::image_get,
            commands::image_get_visible,
            commands::image_update,
            commands::image_delete,
            commands::performer_create,
            commands::performer_list,
            commands::performer_list_visible,
            commands::performer_get,
            commands::performer_get_visible,
            commands::performer_update,
            commands::performer_delete,
            commands::credit_create,
            commands::credit_list,
            commands::credit_get,
            commands::credit_update,
            commands::credit_delete,
            commands::credit_list_by_work,
            commands::credit_list_by_performer,
            commands::managed_category_create,
            commands::managed_category_list,
            commands::managed_category_list_visible,
            commands::managed_category_get,
            commands::managed_category_update,
            commands::managed_category_delete,
            commands::glossary_create,
            commands::glossary_list,
            commands::glossary_list_visible,
            commands::glossary_update,
            commands::glossary_delete
        ])
        .build(tauri::generate_context!())
        .expect("error while building Sakurava");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
            if let Some(player_host) = app_handle.try_state::<PlaybackHostManager>() {
                player_host.shutdown();
            }
            if let Some(runtime) = app_handle.try_state::<ProductionManagedMediaRuntime>() {
                if let Err(error) = runtime.shutdown() {
                    eprintln!("Managed-media shutdown failed: {error}");
                }
            }
        }
    });
}
