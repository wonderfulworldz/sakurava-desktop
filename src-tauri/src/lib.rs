mod commands;
pub mod database;
pub mod managed_media;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let database = database::prepare_tauri_database(app.handle())
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            println!(
                "Sakurava database initialized: {}",
                database.paths.database_file.display()
            );
            let _connection = database.connection();
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::database_backup,
            commands::database_restore,
            commands::backup_package_create,
            commands::backup_package_list,
            commands::backup_package_preview,
            commands::backup_package_restore,
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
            commands::path_status_check,
            commands::media_metadata_probe,
            commands::open_media_path,
            commands::open_source_link,
            commands::detail_source_file_copy_as,
            commands::detail_source_folder_reveal,
            commands::gallery_folder_images_list,
            commands::video_create,
            commands::video_list,
            commands::video_get,
            commands::video_update,
            commands::video_delete,
            commands::image_create,
            commands::image_list,
            commands::image_get,
            commands::image_update,
            commands::image_delete,
            commands::performer_create,
            commands::performer_list,
            commands::performer_get,
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
            commands::managed_category_get,
            commands::managed_category_update,
            commands::managed_category_delete,
            commands::glossary_create,
            commands::glossary_list,
            commands::glossary_update,
            commands::glossary_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sakurava");
}
