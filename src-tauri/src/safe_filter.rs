use std::collections::HashSet;

use rusqlite::Connection;
use serde_json::Value;

#[derive(Debug, Clone, Default)]
pub struct VisibleCatalogIds {
    pub videos: HashSet<String>,
    pub images: HashSet<String>,
    pub performers: HashSet<String>,
    pub categories: HashSet<String>,
    pub category_names: HashSet<String>,
    pub glossary: HashSet<String>,
}

#[derive(Debug)]
struct CatalogClassificationRow {
    id: String,
    direct_r_plus: bool,
}

/// Loads the complete catalog classification projection with a bounded number
/// of set-based reads. Callers retain complete-data access by not using this
/// projection; user-visible command responses opt in explicitly.
pub fn visible_catalog_ids(connection: &Connection) -> Result<VisibleCatalogIds, String> {
    let videos = visible_ids(catalog_rows(connection, "videos")?);
    let images = visible_ids(catalog_rows(connection, "images")?);
    let performers = visible_ids(catalog_rows(connection, "performers")?);

    Ok(VisibleCatalogIds {
        videos,
        images,
        performers,
        categories: string_set(
            connection,
            "SELECT key FROM managedCategories WHERE rPlus = 0",
        )?,
        category_names: normalized_string_set(
            connection,
            "SELECT name FROM managedCategories WHERE rPlus = 0",
        )?,
        glossary: string_set(
            connection,
            "SELECT id FROM glossary_entries WHERE rPlus = 0",
        )?,
    })
}

fn catalog_rows(
    connection: &Connection,
    table: &str,
) -> Result<Vec<CatalogClassificationRow>, String> {
    let sql = match table {
        "videos" | "images" | "performers" => {
            format!("SELECT id, rPlus FROM {table}")
        }
        _ => return Err("Unsupported Safe Filter catalog table.".to_string()),
    };
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(CatalogClassificationRow {
                id: row.get(0)?,
                direct_r_plus: row.get::<_, i64>(1)? != 0,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

fn string_set(connection: &Connection, sql: &str) -> Result<HashSet<String>, String> {
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<HashSet<_>>>()
        .map_err(|error| error.to_string())
}

fn normalized_string_set(connection: &Connection, sql: &str) -> Result<HashSet<String>, String> {
    Ok(string_set(connection, sql)?
        .into_iter()
        .map(|value| normalized_label(&value))
        .collect())
}

fn visible_ids(rows: Vec<CatalogClassificationRow>) -> HashSet<String> {
    rows.into_iter()
        .filter(|row| !row.direct_r_plus)
        .map(|row| row.id)
        .collect()
}

/// Related-record snapshots are a presentation concern. Retain only links to
/// visible targets and fail closed on malformed relationship payloads.
pub fn sanitize_related_json(raw: &str, id_field: &str, visible_ids: &HashSet<String>) -> String {
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return "[]".to_string();
    };
    let retained = values
        .into_iter()
        .filter(|value| {
            value
                .get(id_field)
                .and_then(Value::as_str)
                .is_some_and(|id| visible_ids.contains(id))
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&retained).unwrap_or_else(|_| "[]".to_string())
}

/// String-array relationships retain only visible targets. Category labels
/// are matched case-insensitively; technical identifiers remain exact.
pub fn sanitize_string_array_json(
    raw: &str,
    visible_values: &HashSet<String>,
    normalize_labels: bool,
) -> String {
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return "[]".to_string();
    };
    let retained = values
        .into_iter()
        .filter(|value| {
            value.as_str().is_some_and(|item| {
                let key = if normalize_labels {
                    normalized_label(item)
                } else {
                    item.to_string()
                };
                visible_values.contains(&key)
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&retained).unwrap_or_else(|_| "[]".to_string())
}

fn normalized_label(value: &str) -> String {
    value.trim().to_lowercase()
}
