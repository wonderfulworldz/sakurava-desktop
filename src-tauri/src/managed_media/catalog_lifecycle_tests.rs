use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::Connection;

use super::{
    catalog_lifecycle::{
        plan_repeated_slots, reconcile_owner_mutation, resolve_claimed_source_locator,
        ExistingRepeatedSlot, LocatorResolutionError, OwnerSourceProvider, OwnerSources,
        SqliteOwnerSourceProvider,
    },
    identity::{LifecycleIntentIdentity, OwnerKind, SourceLocatorKind, ValidatedSha256},
    lifecycle::ItemRevision,
    schema,
};

const NOW: &str = "2026-07-29T00:00:00Z";

fn connection() -> Connection {
    let connection = Connection::open_in_memory().expect("database");
    schema::initialize_schema(&connection).expect("managed-media schema");
    connection
}

fn create_catalog_owner_tables(connection: &Connection) {
    connection
        .execute_batch(
            "CREATE TABLE videos (id TEXT PRIMARY KEY, coverPath TEXT NOT NULL);
             CREATE TABLE images (
               id TEXT PRIMARY KEY, coverPath TEXT NOT NULL,
               galleryImagePathsJson TEXT NOT NULL
             );
             CREATE TABLE performers (
               id TEXT PRIMARY KEY, coverPath TEXT NOT NULL,
               performerThumbnailPathsJson TEXT NOT NULL
             );
             CREATE TABLE managedCategories (
               key TEXT PRIMARY KEY, thumbnailPath TEXT NOT NULL
             );
             CREATE TABLE glossary_entries (
               id TEXT PRIMARY KEY, thumbnail_path TEXT NOT NULL
             );",
        )
        .expect("catalog owner tables");
}

#[test]
fn sqlite_owner_source_provider_loads_owned_sources_for_every_supported_owner_kind() {
    let connection = connection();
    create_catalog_owner_tables(&connection);
    connection
        .execute_batch(
            "INSERT INTO videos VALUES ('video-1', 'video.jpg');
             INSERT INTO images VALUES ('image-1', 'image.jpg', '[\"gallery-a.jpg\",\"gallery-b.jpg\"]');
             INSERT INTO performers VALUES ('performer-1', 'performer.jpg', '[\"mini-a.jpg\",\"mini-b.jpg\"]');
             INSERT INTO managedCategories VALUES ('category-1', 'category.jpg');
             INSERT INTO glossary_entries VALUES ('glossary-1', 'glossary.jpg');",
        )
        .expect("owners");
    let mut provider = SqliteOwnerSourceProvider::new(&connection);
    let cases = [
        (OwnerKind::Video, "video-1", "video.jpg"),
        (OwnerKind::Image, "image-1", "image.jpg"),
        (OwnerKind::Performer, "performer-1", "performer.jpg"),
        (OwnerKind::Category, "category-1", "category.jpg"),
        (OwnerKind::Glossary, "glossary-1", "glossary.jpg"),
    ];
    for (kind, owner_id, expected) in cases {
        let sources = provider
            .load_owner_sources(kind, owner_id)
            .expect("provider")
            .expect("owner");
        assert_eq!(sources.owner_kind, kind);
        assert_eq!(sources.owner_id, owner_id);
        assert_eq!(sources.primary_visual, expected);
    }
    assert!(provider
        .load_owner_sources(OwnerKind::Video, "missing")
        .expect("missing")
        .is_none());
}

#[test]
fn sqlite_owner_source_provider_preserves_repeated_slots_without_reading_media() {
    let connection = connection();
    create_catalog_owner_tables(&connection);
    connection
        .execute(
            "INSERT INTO images VALUES (?1, ?2, ?3)",
            (
                "image-1",
                "https://example.invalid/cover.jpg",
                r#"["a.jpg","a.jpg"]"#,
            ),
        )
        .expect("image");
    let mut provider = SqliteOwnerSourceProvider::new(&connection);
    let sources = provider
        .load_owner_sources(OwnerKind::Image, "image-1")
        .expect("provider")
        .expect("image");
    assert_eq!(sources.primary_visual, "https://example.invalid/cover.jpg");
    assert_eq!(sources.gallery_image_paths_json, r#"["a.jpg","a.jpg"]"#);
}

fn reconcile(
    connection: &mut Connection,
    previous: Option<&OwnerSources>,
    final_state: Option<&OwnerSources>,
    tokens: &[&str],
) -> Result<(), String> {
    let transaction = connection.transaction().expect("transaction");
    let mut tokens = tokens.iter();
    let mut token_generator = || {
        tokens
            .next()
            .map(|token| (*token).to_string())
            .ok_or_else(|| "test token exhausted".to_string())
    };
    reconcile_owner_mutation(
        &transaction,
        previous,
        final_state,
        &mut token_generator,
        NOW,
    )?;
    transaction.commit().expect("commit");
    Ok(())
}

fn count(connection: &Connection, table: &str) -> i64 {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .expect("count")
}

#[test]
fn repeated_slot_planner_preserves_tokens_across_reorder() {
    let previous = vec!["a.jpg".to_string(), "b.jpg".to_string()];
    let final_values = vec!["b.jpg".to_string(), "a.jpg".to_string()];
    let existing = vec![
        ExistingRepeatedSlot {
            slot_token: "slot-a".to_string(),
            locator_hash: locator_hash(SourceLocatorKind::ExternalDirectoryEntry, "a.jpg"),
        },
        ExistingRepeatedSlot {
            slot_token: "slot-b".to_string(),
            locator_hash: locator_hash(SourceLocatorKind::ExternalDirectoryEntry, "b.jpg"),
        },
    ];
    let mut called = false;
    let plan = plan_repeated_slots(
        SourceLocatorKind::ExternalDirectoryEntry,
        &previous,
        &final_values,
        &existing,
        &mut || {
            called = true;
            Ok("unused".to_string())
        },
    )
    .expect("plan");
    assert!(!called);
    assert_eq!(plan.retained.len(), 2);
    assert!(plan.added.is_empty());
    assert!(plan.retired_tokens.is_empty());
}

#[test]
fn repeated_slot_planner_adds_retires_and_replaces_with_injected_tokens() {
    let previous = vec!["a.jpg".to_string(), "b.jpg".to_string()];
    let final_values = vec!["b.jpg".to_string(), "c.jpg".to_string()];
    let existing = vec![
        ExistingRepeatedSlot {
            slot_token: "slot-a".to_string(),
            locator_hash: locator_hash(SourceLocatorKind::ExternalDirectoryEntry, "a.jpg"),
        },
        ExistingRepeatedSlot {
            slot_token: "slot-b".to_string(),
            locator_hash: locator_hash(SourceLocatorKind::ExternalDirectoryEntry, "b.jpg"),
        },
    ];
    let plan = plan_repeated_slots(
        SourceLocatorKind::ExternalDirectoryEntry,
        &previous,
        &final_values,
        &existing,
        &mut || Ok("slot-c".to_string()),
    )
    .expect("plan");
    assert_eq!(plan.retained[0].slot_token, "slot-b");
    assert_eq!(plan.added[0].slot_token, "slot-c");
    assert_eq!(plan.added[0].locator, "c.jpg");
    assert_eq!(plan.retired_tokens, vec!["slot-a"]);
}

#[test]
fn repeated_slot_planner_fails_closed_for_ambiguous_duplicates() {
    let duplicate = vec!["same.jpg".to_string(), "same.jpg".to_string()];
    assert!(plan_repeated_slots(
        SourceLocatorKind::ExternalFile,
        &duplicate,
        &[],
        &[],
        &mut || Ok("unused".to_string()),
    )
    .is_err());
    let existing = vec![
        ExistingRepeatedSlot {
            slot_token: "slot-a".to_string(),
            locator_hash: locator_hash(SourceLocatorKind::ExternalFile, "same.jpg"),
        },
        ExistingRepeatedSlot {
            slot_token: "slot-b".to_string(),
            locator_hash: locator_hash(SourceLocatorKind::ExternalFile, "same.jpg"),
        },
    ];
    assert!(plan_repeated_slots(
        SourceLocatorKind::ExternalFile,
        &["same.jpg".to_string()],
        &["same.jpg".to_string()],
        &existing,
        &mut || Ok("unused".to_string()),
    )
    .is_err());
}

#[test]
fn create_without_source_is_inert_and_source_create_queues_exact_targets() {
    let mut connection = connection();
    let empty = OwnerSources::video("video-empty", "");
    reconcile(&mut connection, None, Some(&empty), &[]).expect("empty create");
    assert_eq!(count(&connection, "managed_media_items"), 0);

    let sourced = OwnerSources::video("video-source", "C:\\covers\\video.jpg");
    reconcile(&mut connection, None, Some(&sourced), &[]).expect("source create");
    assert_eq!(count(&connection, "managed_media_items"), 1);
    assert_eq!(count(&connection, "managed_media_lifecycle_intents"), 1);
    assert_eq!(count(&connection, "managed_media_lifecycle_targets"), 15);
    let token: String = connection
        .query_row(
            "SELECT slot_token FROM managed_media_items WHERE owner_id = 'video-source'",
            [],
            |row| row.get(0),
        )
        .expect("slot token");
    assert_eq!(token, "primary_visual");
}

#[test]
fn metadata_and_same_source_updates_create_no_lifecycle_work() {
    let mut connection = connection();
    let before = OwnerSources::video("video-1", "cover.jpg");
    reconcile(&mut connection, None, Some(&before), &[]).expect("create");
    let intent_count = count(&connection, "managed_media_lifecycle_intents");
    reconcile(&mut connection, Some(&before), Some(&before), &[]).expect("unchanged");
    assert_eq!(
        count(&connection, "managed_media_lifecycle_intents"),
        intent_count
    );
}

#[test]
fn source_change_advances_once_and_supersedes_older_work() {
    let mut connection = connection();
    let before = OwnerSources::video("video-1", "cover-a.jpg");
    let after = OwnerSources::video("video-1", "cover-b.jpg");
    reconcile(&mut connection, None, Some(&before), &[]).expect("create");
    reconcile(&mut connection, Some(&before), Some(&after), &[]).expect("change");
    let revisions: (i64, i64) = connection
        .query_row(
            "SELECT current_revision, desired_revision
             FROM managed_media_item_generations",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("revisions");
    assert_eq!(revisions, (0, 2));
    let superseded: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM managed_media_lifecycle_intents
             WHERE lifecycle_state = 'superseded'",
            [],
            |row| row.get(0),
        )
        .expect("superseded");
    assert_eq!(superseded, 1);
}

#[test]
fn gallery_reorder_is_inert_and_removal_retires_only_removed_slot() {
    let mut connection = connection();
    let before = OwnerSources::image("image-1", "", r#"["a.jpg","b.jpg"]"#);
    reconcile(
        &mut connection,
        None,
        Some(&before),
        &["gallery-a", "gallery-b"],
    )
    .expect("create gallery");
    let a_hash = locator_hash(SourceLocatorKind::ExternalDirectoryEntry, "a.jpg");
    let removed_token: String = connection
        .query_row(
            "SELECT slot_token FROM managed_media_items WHERE locator_hash = ?1",
            [&a_hash],
            |row| row.get(0),
        )
        .expect("original a token");
    let initial_intents = count(&connection, "managed_media_lifecycle_intents");

    let reordered = OwnerSources::image("image-1", "", r#"["b.jpg","a.jpg"]"#);
    reconcile(&mut connection, Some(&before), Some(&reordered), &[]).expect("reorder");
    assert_eq!(
        count(&connection, "managed_media_lifecycle_intents"),
        initial_intents
    );

    let removed = OwnerSources::image("image-1", "", r#"["b.jpg"]"#);
    reconcile(&mut connection, Some(&reordered), Some(&removed), &[]).expect("remove");
    let retire_item: String = connection
        .query_row(
            "SELECT i.slot_token
             FROM managed_media_lifecycle_intents l
             JOIN managed_media_items i ON i.item_id = l.managed_item_id
             WHERE l.lifecycle_action = 'retire'",
            [],
            |row| row.get(0),
        )
        .expect("retired slot");
    assert_eq!(retire_item, removed_token);
}

#[test]
fn performer_mini_tokens_survive_reopen_and_addition_uses_new_token() {
    let base = std::env::temp_dir().join(format!(
        "sakurava-catalog-lifecycle-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    assert!(!base.exists());
    fs::create_dir_all(&base).expect("temporary root");
    let path = base.join("catalog-lifecycle.sqlite");
    {
        let mut connection = Connection::open(&path).expect("database");
        schema::initialize_schema(&connection).expect("schema");
        let before = OwnerSources::performer("performer-1", "", r#"["one.jpg","two.jpg"]"#);
        reconcile(
            &mut connection,
            None,
            Some(&before),
            &["mini-one", "mini-two"],
        )
        .expect("create");
    }
    let mut connection = Connection::open(&path).expect("reopen");
    let before = OwnerSources::performer("performer-1", "", r#"["one.jpg","two.jpg"]"#);
    let after = OwnerSources::performer("performer-1", "", r#"["two.jpg","one.jpg","three.jpg"]"#);
    reconcile(
        &mut connection,
        Some(&before),
        Some(&after),
        &["mini-three"],
    )
    .expect("update");
    let tokens: Vec<String> = {
        let mut statement = connection
            .prepare(
                "SELECT slot_token FROM managed_media_items
                 WHERE owner_id = 'performer-1' ORDER BY slot_token",
            )
            .expect("statement");
        statement
            .query_map([], |row| row.get(0))
            .expect("query")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("tokens")
    };
    assert_eq!(tokens, vec!["mini-one", "mini-three", "mini-two"]);
    drop(connection);
    fs::remove_dir_all(base).expect("temporary cleanup");
}

#[test]
fn all_supported_owner_slots_use_only_their_contract_roles() {
    let mut connection = connection();
    let owners = [
        OwnerSources::video("video-1", "video.jpg"),
        OwnerSources::image("image-1", "image.jpg", r#"["gallery.jpg"]"#),
        OwnerSources::performer("performer-1", "performer.jpg", r#"["mini.jpg"]"#),
        OwnerSources::category("category-1", "category.jpg"),
        OwnerSources::glossary("glossary-1", "glossary.jpg"),
    ];
    let tokens = ["gallery-one", "mini-one"];
    let mut token_index = 0usize;
    for owner in &owners {
        let transaction = connection.transaction().expect("transaction");
        let mut generator = || {
            let token = tokens
                .get(token_index)
                .ok_or_else(|| "test token exhausted".to_string())?;
            token_index += 1;
            Ok((*token).to_string())
        };
        reconcile_owner_mutation(&transaction, None, Some(owner), &mut generator, NOW)
            .expect("reconcile");
        transaction.commit().expect("commit");
    }
    let roles: Vec<String> = {
        let mut statement = connection
            .prepare(
                "SELECT DISTINCT role_id FROM managed_media_lifecycle_targets ORDER BY role_id",
            )
            .expect("statement");
        statement
            .query_map([], |row| row.get(0))
            .expect("query")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("roles")
    };
    assert_eq!(roles.len(), 20);
    assert!(!roles.iter().any(|role| role.contains("dormant")));
    let fallback_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM managed_media_lifecycle_targets
             WHERE variant_class = 'native_fallback' AND standard_tier IS NULL",
            [],
            |row| row.get(0),
        )
        .expect("fallback count");
    assert_eq!(fallback_count, 20);
}

#[test]
fn authoritative_resolution_covers_every_owner_and_approved_source_slot_without_mutation() {
    let mut connection = connection();
    let owners = vec![
        OwnerSources::video("video-1", "C:\\sources\\video.jpg"),
        OwnerSources::image(
            "image-1",
            "C:\\sources\\image.jpg",
            r#"["C:\\sources\\gallery-a.jpg"]"#,
        ),
        OwnerSources::performer(
            "performer-1",
            "C:\\sources\\performer.jpg",
            r#"["C:\\sources\\mini-a.jpg"]"#,
        ),
        OwnerSources::category("category-1", "C:\\sources\\category.jpg"),
        OwnerSources::glossary("glossary-1", "C:\\sources\\glossary.jpg"),
    ];
    let mut token_index = 0usize;
    for owner in &owners {
        let transaction = connection.transaction().expect("transaction");
        reconcile_owner_mutation(
            &transaction,
            None,
            Some(owner),
            &mut || {
                token_index += 1;
                Ok(format!("repeated-{token_index}"))
            },
            NOW,
        )
        .expect("reconcile");
        transaction.commit().expect("commit");
    }
    let item_count_before = count(&connection, "managed_media_items");
    let mut statement = connection
        .prepare(
            "SELECT intent.intent_id, intent.managed_item_id, intent.desired_revision,
                    item.owner_kind, item.owner_id, item.slot_kind
             FROM managed_media_lifecycle_intents intent
             JOIN managed_media_items item ON item.item_id = intent.managed_item_id
             ORDER BY item.owner_kind, item.owner_id, item.slot_kind",
        )
        .expect("statement");
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .expect("query")
        .collect::<rusqlite::Result<Vec<_>>>()
        .expect("rows");

    for (intent_id, item_id, revision, owner_kind, owner_id, slot_kind) in rows {
        let mut provider = |requested_kind: OwnerKind, requested_id: &str| {
            Ok(owners
                .iter()
                .find(|owner| owner.owner_kind == requested_kind && owner.owner_id == requested_id)
                .cloned())
        };
        let resolved = resolve_claimed_source_locator(
            &connection,
            &LifecycleIntentIdentity::new(intent_id).expect("intent"),
            &ValidatedSha256::new(item_id).expect("item"),
            ItemRevision::new(revision as u64).expect("revision"),
            &mut provider,
        )
        .expect("resolved source");
        assert!(!resolved.locator.is_empty());
        assert_eq!(resolved.item_key.preimage().contains(&owner_id), true);
        match slot_kind.as_str() {
            "gallery_tile" => {
                assert_eq!(
                    resolved.locator_kind,
                    SourceLocatorKind::ExternalDirectoryEntry
                )
            }
            _ => assert_eq!(resolved.locator_kind, SourceLocatorKind::ExternalFile),
        }
        assert!(matches!(
            owner_kind.as_str(),
            "video" | "image" | "performer" | "category" | "glossary"
        ));
    }
    drop(statement);
    assert_eq!(count(&connection, "managed_media_items"), item_count_before);
}

#[test]
fn authoritative_resolution_fails_closed_for_missing_stale_and_ambiguous_sources() {
    let mut connection = connection();
    let owner = OwnerSources::image(
        "image-1",
        "C:\\sources\\cover.jpg",
        r#"["C:\\sources\\gallery.jpg"]"#,
    );
    reconcile(&mut connection, None, Some(&owner), &["gallery-token"]).expect("reconcile");
    let (intent, item, revision): (String, String, i64) = connection
        .query_row(
            "SELECT intent.intent_id, intent.managed_item_id, intent.desired_revision
             FROM managed_media_lifecycle_intents intent
             JOIN managed_media_items item ON item.item_id = intent.managed_item_id
             WHERE item.slot_kind = 'gallery_tile'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("identity");
    let intent = LifecycleIntentIdentity::new(intent).expect("intent");
    let item = ValidatedSha256::new(item).expect("item");
    let revision = ItemRevision::new(revision as u64).expect("revision");

    let mut missing = |_kind: OwnerKind, _id: &str| Ok(None);
    assert!(matches!(
        resolve_claimed_source_locator(&connection, &intent, &item, revision, &mut missing),
        Err(LocatorResolutionError::OwnerNotFound)
    ));

    let stale = OwnerSources::image(
        "image-1",
        "C:\\sources\\cover.jpg",
        r#"["C:\\sources\\replacement.jpg"]"#,
    );
    let mut stale_provider = move |_kind: OwnerKind, _id: &str| Ok(Some(stale.clone()));
    assert!(matches!(
        resolve_claimed_source_locator(&connection, &intent, &item, revision, &mut stale_provider),
        Err(LocatorResolutionError::SlotNotFound)
    ));

    let ambiguous = OwnerSources::image(
        "image-1",
        "C:\\sources\\cover.jpg",
        r#"["C:\\sources\\gallery.jpg","C:\\sources\\gallery.jpg"]"#,
    );
    let mut ambiguous_provider = move |_kind: OwnerKind, _id: &str| Ok(Some(ambiguous.clone()));
    assert!(matches!(
        resolve_claimed_source_locator(
            &connection,
            &intent,
            &item,
            revision,
            &mut ambiguous_provider
        ),
        Err(LocatorResolutionError::AmbiguousSlot)
    ));
}

#[test]
fn source_removal_and_entity_deletion_queue_retirement_without_file_operations() {
    let mut connection = connection();
    let before = OwnerSources::image("image-1", "cover.jpg", r#"["gallery.jpg"]"#);
    reconcile(&mut connection, None, Some(&before), &["gallery-one"]).expect("create");
    let without_cover = OwnerSources::image("image-1", "", r#"["gallery.jpg"]"#);
    reconcile(&mut connection, Some(&before), Some(&without_cover), &[]).expect("remove cover");
    reconcile(&mut connection, Some(&without_cover), None, &[]).expect("delete owner");
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM managed_media_lifecycle_intents
                 WHERE lifecycle_action = 'retire'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("retire count"),
        2
    );
    assert_eq!(count(&connection, "managed_media_operations"), 0);
}

#[test]
fn lifecycle_failure_rolls_back_catalog_side_transaction() {
    let mut connection = connection();
    connection
        .execute("CREATE TABLE catalog_probe (value TEXT NOT NULL)", [])
        .expect("probe table");
    let transaction = connection.transaction().expect("transaction");
    transaction
        .execute("INSERT INTO catalog_probe (value) VALUES ('mutated')", [])
        .expect("catalog mutation");
    let final_state = OwnerSources::image("image-1", "", r#"["a.jpg","a.jpg"]"#);
    let error = reconcile_owner_mutation(
        &transaction,
        None,
        Some(&final_state),
        &mut || Ok("never".to_string()),
        NOW,
    )
    .expect_err("duplicate must fail");
    assert!(error.contains("duplicate"));
    drop(transaction);
    assert_eq!(count(&connection, "catalog_probe"), 0);
    assert_eq!(count(&connection, "managed_media_items"), 0);
}

fn locator_hash(kind: SourceLocatorKind, locator: &str) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "{:x}",
        Sha256::digest(
            format!(
                "catalog-locator-v1|{}|{}:{}",
                kind.as_str(),
                locator.len(),
                locator
            )
            .as_bytes()
        )
    )
}
