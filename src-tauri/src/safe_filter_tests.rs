use rusqlite::Connection;

use crate::{database::initialize_schema, safe_filter::visible_catalog_ids};

#[test]
fn effective_classification_is_direct_or_one_hop_category_or_glossary_only() {
    let connection = Connection::open_in_memory().expect("in-memory database");
    initialize_schema(&connection).expect("schema");
    connection.execute(
        "INSERT INTO managedCategories (key, name, rPlus, createdAt, updatedAt) VALUES ('cat-r', 'Restricted', 1, 'now', 'now')",
        [],
    ).expect("restricted category");
    connection.execute(
        "INSERT INTO glossary_entries (id, term, definition, rPlus, created_at, updated_at) VALUES ('glo-r', 'Restricted term', '', 1, 1, 1)",
        [],
    ).expect("restricted glossary");
    for (id, categories, glossary, direct) in [
        ("visible", "[]", "[]", 0),
        ("direct", "[]", "[]", 1),
        ("category", "[\"Restricted\"]", "[]", 0),
        ("glossary", "[]", "[\"glo-r\"]", 0),
    ] {
        connection.execute(
            "INSERT INTO videos (id, title, categoriesJson, glossaryRefsJson, rPlus, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5, 'now', 'now')",
            (id, id, categories, glossary, direct),
        ).expect("video");
    }

    let visible = visible_catalog_ids(&connection).expect("classification");
    assert!(visible.videos.contains("visible"));
    assert!(!visible.videos.contains("direct"));
    assert!(!visible.videos.contains("category"));
    assert!(!visible.videos.contains("glossary"));
}
