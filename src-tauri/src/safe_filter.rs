use std::collections::HashSet;

use rusqlite::Connection;
use serde_json::Value;

#[derive(Debug, Clone, Default)]
pub struct VisibleCatalogIds {
    pub videos: HashSet<String>,
    pub images: HashSet<String>,
    pub performers: HashSet<String>,
    pub categories: HashSet<String>,
    pub glossary: HashSet<String>,
}

#[derive(Debug)]
struct CatalogClassificationRow {
    id: String,
    direct_r_plus: bool,
    categories_json: String,
    glossary_refs_json: String,
}

/// Loads the complete catalog classification projection with a bounded number
/// of set-based reads. Callers retain complete-data access by not using this
/// projection; user-visible command responses opt in explicitly.
pub fn visible_catalog_ids(connection: &Connection) -> Result<VisibleCatalogIds, String> {
    let r_plus_categories = string_set(
        connection,
        "SELECT name FROM managedCategories WHERE rPlus = 1",
    )?;
    let r_plus_glossary = string_set(
        connection,
        "SELECT id FROM glossary_entries WHERE rPlus = 1",
    )?;
    let videos = visible_ids(
        catalog_rows(connection, "videos")?,
        &r_plus_categories,
        &r_plus_glossary,
    );
    let images = visible_ids(
        catalog_rows(connection, "images")?,
        &r_plus_categories,
        &r_plus_glossary,
    );
    let performers = visible_ids(
        catalog_rows(connection, "performers")?,
        &r_plus_categories,
        &r_plus_glossary,
    );

    Ok(VisibleCatalogIds {
        videos,
        images,
        performers,
        categories: string_set(
            connection,
            "SELECT key FROM managedCategories WHERE rPlus = 0",
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
            format!("SELECT id, rPlus, categoriesJson, glossaryRefsJson FROM {table}")
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
                categories_json: row.get(2)?,
                glossary_refs_json: row.get(3)?,
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

fn visible_ids(
    rows: Vec<CatalogClassificationRow>,
    r_plus_categories: &HashSet<String>,
    r_plus_glossary: &HashSet<String>,
) -> HashSet<String> {
    rows.into_iter()
        .filter(|row| !is_effective_r_plus(row, r_plus_categories, r_plus_glossary))
        .map(|row| row.id)
        .collect()
}

fn is_effective_r_plus(
    row: &CatalogClassificationRow,
    r_plus_categories: &HashSet<String>,
    r_plus_glossary: &HashSet<String>,
) -> bool {
    row.direct_r_plus
        || string_array(&row.categories_json)
            .iter()
            .any(|value| r_plus_categories.contains(value))
        || string_array(&row.glossary_refs_json)
            .iter()
            .any(|value| r_plus_glossary.contains(value))
}

fn string_array(raw: &str) -> Vec<String> {
    match serde_json::from_str::<Value>(raw) {
        Ok(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(ToString::to_string)
            .collect(),
        _ => Vec::new(),
    }
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
