use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::database::{
    backup_runtime_database, restore_runtime_database, DatabaseBackupResult, DatabaseRestoreResult,
    RuntimeDatabase,
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
    pub publisher_label: String,
    pub cover_path: String,
    pub media_path: String,
    pub categories_json: String,
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
    pub publisher_label: Option<String>,
    pub cover_path: Option<String>,
    pub media_path: Option<String>,
    pub categories_json: Option<String>,
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
    pub publisher_label: Option<String>,
    pub cover_path: Option<String>,
    pub media_path: Option<String>,
    pub categories_json: Option<String>,
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
    pub categories_json: String,
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
    pub categories_json: Option<String>,
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
    pub categories_json: Option<String>,
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
    pub birth_date: String,
    pub cover_path: String,
    pub filmography_count: Option<i64>,
    pub pictorials_count: Option<i64>,
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
    pub birth_date: Option<String>,
    pub cover_path: Option<String>,
    pub filmography_count: Option<i64>,
    pub pictorials_count: Option<i64>,
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
    pub birth_date: Option<String>,
    pub cover_path: Option<String>,
    pub filmography_count: Option<i64>,
    pub pictorials_count: Option<i64>,
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
        publisher_label: default_text(input.publisher_label),
        cover_path: default_text(input.cover_path),
        media_path: default_text(input.media_path),
        categories_json: normalize_string_array_json(input.categories_json),
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
                durationMinutes, publisherLabel, coverPath, mediaPath, categoriesJson,
                ratingJson, notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                video.id,
                video.title,
                video.original_title,
                video.code,
                video.censorship,
                video.availability,
                video.release_date,
                video.duration_minutes,
                video.publisher_label,
                video.cover_path,
                video.media_path,
                video.categories_json,
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
    apply_text(&mut video.publisher_label, patch.publisher_label);
    apply_text(&mut video.cover_path, patch.cover_path);
    apply_text(&mut video.media_path, patch.media_path);
    if patch.categories_json.is_some() {
        video.categories_json = normalize_string_array_json(patch.categories_json);
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
                publisherLabel = ?9, coverPath = ?10, mediaPath = ?11,
                categoriesJson = ?12, ratingJson = ?13, notes = ?14,
                favorite = ?15, updatedAt = ?16
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
                video.publisher_label,
                video.cover_path,
                video.media_path,
                video.categories_json,
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
        categories_json: normalize_string_array_json(input.categories_json),
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
                publisherLabel, coverPath, folderPath, imageCount, categoriesJson,
                ratingJson, notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
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
                image.categories_json,
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
    if patch.categories_json.is_some() {
        image.categories_json = normalize_string_array_json(patch.categories_json);
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
                categoriesJson = ?12, ratingJson = ?13, notes = ?14,
                favorite = ?15, updatedAt = ?16
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
                image.categories_json,
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
        birth_date: default_text(input.birth_date),
        cover_path: default_text(input.cover_path),
        filmography_count: input.filmography_count,
        pictorials_count: input.pictorials_count,
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
                id, name, originalName, aliasesJson, status, birthDate, coverPath,
                filmographyCount, pictorialsCount, categoriesJson, ratingJson,
                notes, favorite, createdAt, updatedAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                performer.id,
                performer.name,
                performer.original_name,
                performer.aliases_json,
                performer.status,
                performer.birth_date,
                performer.cover_path,
                performer.filmography_count,
                performer.pictorials_count,
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
    apply_text(&mut performer.birth_date, patch.birth_date);
    apply_text(&mut performer.cover_path, patch.cover_path);
    if patch.filmography_count.is_some() {
        performer.filmography_count = patch.filmography_count;
    }
    if patch.pictorials_count.is_some() {
        performer.pictorials_count = patch.pictorials_count;
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
                birthDate = ?6, coverPath = ?7, filmographyCount = ?8,
                pictorialsCount = ?9, categoriesJson = ?10, ratingJson = ?11,
                notes = ?12, favorite = ?13, updatedAt = ?14
            WHERE id = ?1",
            params![
                performer.id,
                performer.name,
                performer.original_name,
                performer.aliases_json,
                performer.status,
                performer.birth_date,
                performer.cover_path,
                performer.filmography_count,
                performer.pictorials_count,
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
        publisher_label: row.get("publisherLabel")?,
        cover_path: row.get("coverPath")?,
        media_path: row.get("mediaPath")?,
        categories_json: row.get("categoriesJson")?,
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
        categories_json: row.get("categoriesJson")?,
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
        birth_date: row.get("birthDate")?,
        cover_path: row.get("coverPath")?,
        filmography_count: row.get("filmographyCount")?,
        pictorials_count: row.get("pictorialsCount")?,
        categories_json: row.get("categoriesJson")?,
        rating_json: row.get("ratingJson")?,
        notes: row.get("notes")?,
        favorite: int_to_bool(row.get("favorite")?),
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
    })
}

fn require_text(value: String, message: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(message.to_string());
    }
    Ok(trimmed.to_string())
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

fn normalize_object_json(value: Option<String>) -> String {
    let Some(value) = value else {
        return "{}".to_string();
    };
    match serde_json::from_str::<Value>(&value) {
        Ok(Value::Object(map)) => serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string()),
        _ => "{}".to_string(),
    }
}

fn current_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
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
                publisher_label: None,
                cover_path: None,
                media_path: None,
                categories_json: Some(r#"["Drama", "", 3, "Action"]"#.to_string()),
                rating_json: Some(r#"{"score":4,"source":"manual"}"#.to_string()),
                notes: None,
                favorite: None,
            },
        )
        .expect("create video");

        assert_eq!(created.title, "Video Title");
        assert_eq!(created.categories_json, r#"["Drama","Action"]"#);
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
                publisher_label: None,
                cover_path: None,
                media_path: None,
                categories_json: Some(r#"["Updated"]"#.to_string()),
                rating_json: Some("invalid".to_string()),
                notes: Some("note".to_string()),
                favorite: Some(true),
            },
        )
        .expect("update video")
        .expect("updated video");
        assert_eq!(updated.title, "Updated Video");
        assert_eq!(updated.categories_json, r#"["Updated"]"#);
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
                categories_json: Some(r#"["Portrait","Set"]"#.to_string()),
                rating_json: Some(r#"{"score":5}"#.to_string()),
                notes: None,
                favorite: None,
            },
        )
        .expect("create image");

        assert_eq!(created.categories_json, r#"["Portrait","Set"]"#);
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
                categories_json: Some("{}".to_string()),
                rating_json: Some(r#"{"quality":"high"}"#.to_string()),
                notes: None,
                favorite: Some(true),
            },
        )
        .expect("update image")
        .expect("updated image");
        assert_eq!(updated.image_count, Some(30));
        assert_eq!(updated.categories_json, "[]");
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
    fn performer_crud_uses_aliases_and_json_text_labels() {
        let connection = test_connection();
        let created = create_performer(
            &connection,
            PerformerInput {
                name: "Performer Name".to_string(),
                original_name: None,
                aliases_json: Some(r#"["Alias A","Alias B"]"#.to_string()),
                status: Some("active".to_string()),
                birth_date: None,
                cover_path: None,
                filmography_count: Some(3),
                pictorials_count: Some(2),
                categories_json: Some(r#"["Featured"]"#.to_string()),
                rating_json: Some(r#"{"score":3}"#.to_string()),
                notes: None,
                favorite: None,
            },
        )
        .expect("create performer");

        assert_eq!(created.aliases_json, r#"["Alias A","Alias B"]"#);
        assert_eq!(created.categories_json, r#"["Featured"]"#);
        assert_eq!(created.rating_json, r#"{"score":3}"#);
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
                birth_date: None,
                cover_path: None,
                filmography_count: None,
                pictorials_count: None,
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
        assert_eq!(updated.rating_json, "{}");
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

    fn empty_video_input() -> VideoInput {
        VideoInput {
            title: " ".to_string(),
            original_title: None,
            code: None,
            censorship: None,
            availability: None,
            release_date: None,
            duration_minutes: None,
            publisher_label: None,
            cover_path: None,
            media_path: None,
            categories_json: None,
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
            categories_json: None,
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
            birth_date: None,
            cover_path: None,
            filmography_count: None,
            pictorials_count: None,
            categories_json: None,
            rating_json: None,
            notes: None,
            favorite: None,
        }
    }
}
