mod database;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
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
        .run(tauri::generate_context!())
        .expect("error while running Sakurava");
}
