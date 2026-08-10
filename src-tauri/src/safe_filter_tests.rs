use rusqlite::Connection;

use std::collections::HashSet;

use crate::{
    database::initialize_schema,
    safe_filter::{sanitize_string_array_json, visible_catalog_ids},
};

#[test]
fn visibility_uses_each_records_direct_r_plus_flag_only() {
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
    connection.execute(
        "INSERT INTO images (id, title, categoriesJson, glossaryRefsJson, rPlus, createdAt, updatedAt) VALUES ('image-visible', 'Visible image', '[]', '[]', 0, 'now', 'now'), ('image-direct', 'Direct image', '[]', '[]', 1, 'now', 'now')",
        [],
    ).expect("images");
    connection.execute(
        "INSERT INTO performers (id, name, categoriesJson, glossaryRefsJson, rPlus, createdAt, updatedAt) VALUES ('performer-visible', 'Visible performer', '[]', '[]', 0, 'now', 'now'), ('performer-direct', 'Direct performer', '[]', '[]', 1, 'now', 'now')",
        [],
    ).expect("performers");

    let visible = visible_catalog_ids(&connection).expect("classification");
    assert!(visible.videos.contains("visible"));
    assert!(!visible.videos.contains("direct"));
    assert!(visible.videos.contains("category"));
    assert!(visible.videos.contains("glossary"));
    assert!(visible.images.contains("image-visible"));
    assert!(!visible.images.contains("image-direct"));
    assert!(visible.performers.contains("performer-visible"));
    assert!(!visible.performers.contains("performer-direct"));
    assert!(!visible.categories.contains("cat-r"));
    assert!(!visible.glossary.contains("glo-r"));
}

#[test]
fn visible_relationship_arrays_remove_hidden_targets_without_mutating_source_data() {
    let visible_categories = HashSet::from(["general".to_string()]);
    let visible_glossary = HashSet::from(["glo-visible".to_string()]);
    let category_source = "[\"General\",\"Restricted\"]";
    let glossary_source = "[\"glo-visible\",\"glo-r\"]";

    assert_eq!(
        sanitize_string_array_json(category_source, &visible_categories, true),
        "[\"General\"]"
    );
    assert_eq!(
        sanitize_string_array_json(glossary_source, &visible_glossary, false),
        "[\"glo-visible\"]"
    );
    assert_eq!(category_source, "[\"General\",\"Restricted\"]");
    assert_eq!(glossary_source, "[\"glo-visible\",\"glo-r\"]");
}
