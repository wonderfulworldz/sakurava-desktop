use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use rusqlite::{Connection, DatabaseName};
use serde::Serialize;
use tauri::Manager;

pub const APP_DATA_FOLDER_NAME: &str = "app.sakurava.desktop";
pub const DATABASE_FILE_NAME: &str = "sakurava.sqlite";

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
  publisherLabel TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  mediaPath TEXT NOT NULL DEFAULT '',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
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
  categoriesJson TEXT NOT NULL DEFAULT '[]',
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
  birthDate TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  filmographyCount INTEGER,
  pictorialsCount INTEGER,
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
"#;

const SCHEMA_SQL: [&str; 3] = [
    CREATE_VIDEOS_TABLE_SQL,
    CREATE_IMAGES_TABLE_SQL,
    CREATE_PERFORMERS_TABLE_SQL,
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

pub fn prepare_database_paths(app_data_dir: impl AsRef<Path>) -> io::Result<RuntimeDatabasePaths> {
    let paths = runtime_database_paths(app_data_dir);
    fs::create_dir_all(&paths.app_data_dir)?;
    Ok(paths)
}

pub fn initialize_schema(connection: &Connection) -> rusqlite::Result<()> {
    for statement in SCHEMA_SQL {
        connection.execute_batch(statement)?;
    }

    Ok(())
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

fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

        assert_eq!(table_names, vec!["images", "performers", "videos"]);

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
}
