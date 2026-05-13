mod commands;
mod database;

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
            commands::media_asset_allow_root,
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
            commands::performer_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sakurava");
}
