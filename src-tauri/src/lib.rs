mod database;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let paths = database::prepare_tauri_database_paths(app.handle())
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            println!(
                "Sakurava database path prepared: {}",
                paths.database_file.display()
            );
            app.manage(paths);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sakurava");
}
