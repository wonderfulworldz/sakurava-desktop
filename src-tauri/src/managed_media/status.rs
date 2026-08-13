use std::collections::HashSet;

use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMediaProgressStatus {
    pub ready: u64,
    pub total: u64,
    pub processing: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMediaStatistics {
    pub ready_count: u64,
    pub source_count: u64,
    pub pending_count: u64,
    pub published_storage_bytes: u64,
}

struct ProgressRow {
    owner_kind: String,
    owner_id: String,
    slot_kind: String,
    locator_hash: String,
    lifecycle_state: String,
    target_count: u64,
    unsettled_target_count: u64,
    processing: bool,
}

pub fn load_managed_media_progress_status(
    connection: &Connection,
) -> Result<ManagedMediaProgressStatus, rusqlite::Error> {
    let statistics = load_managed_media_statistics(connection)?;
    Ok(ManagedMediaProgressStatus {
        ready: statistics.ready_count,
        total: statistics.source_count,
        processing: statistics.pending_count > 0,
    })
}

pub fn load_managed_media_statistics(
    connection: &Connection,
) -> Result<ManagedMediaStatistics, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT item.owner_kind, item.owner_id, item.slot_kind, item.locator_hash,
                item.lifecycle_state,
                (
                  SELECT COUNT(*)
                  FROM managed_media_lifecycle_targets target
                  WHERE target.managed_item_id = item.item_id
                    AND target.desired_revision = CASE
                      WHEN item.lifecycle_state = 'active' THEN generation.current_revision
                      ELSE generation.desired_revision
                    END
                ) AS target_count,
                (
                  SELECT COUNT(*)
                  FROM managed_media_lifecycle_targets target
                  WHERE target.managed_item_id = item.item_id
                    AND target.desired_revision = CASE
                      WHEN item.lifecycle_state = 'active' THEN generation.current_revision
                      ELSE generation.desired_revision
                    END
                    AND target.target_state NOT IN ('published', 'skipped_ineligible')
                ) AS unsettled_target_count,
                EXISTS (
                  SELECT 1
                  FROM managed_media_lifecycle_intents intent
                  WHERE intent.managed_item_id = item.item_id
                    AND intent.desired_revision = generation.desired_revision
                    AND intent.superseded_by_intent_id IS NULL
                    AND intent.lifecycle_state IN ('queued', 'claimed', 'retry_wait')
                ) AS processing
         FROM managed_media_items item
         JOIN managed_media_item_generations generation
           ON generation.managed_item_id = item.item_id
         WHERE item.lifecycle_state IN ('active', 'pending')
         ORDER BY item.owner_kind, item.owner_id, item.slot_kind, item.locator_hash,
           CASE WHEN item.lifecycle_state = 'active' THEN 0 ELSE 1 END,
           generation.desired_revision DESC,
           item.item_id ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(ProgressRow {
            owner_kind: row.get(0)?,
            owner_id: row.get(1)?,
            slot_kind: row.get(2)?,
            locator_hash: row.get(3)?,
            lifecycle_state: row.get(4)?,
            target_count: row.get(5)?,
            unsettled_target_count: row.get(6)?,
            processing: row.get(7)?,
        })
    })?;

    let mut authoritative_sources = HashSet::new();
    let mut statistics = ManagedMediaStatistics {
        ready_count: 0,
        source_count: 0,
        pending_count: 0,
        published_storage_bytes: connection.query_row(
            "SELECT COALESCE(SUM(byte_length), 0)
             FROM managed_media_variants
             WHERE publication_state = 'published'",
            [],
            |row| row.get::<_, i64>(0),
        )? as u64,
    };
    for row in rows {
        let row = row?;
        let source_key = (
            row.owner_kind,
            row.owner_id,
            row.slot_kind,
            row.locator_hash,
        );
        if !authoritative_sources.insert(source_key) {
            continue;
        }
        statistics.source_count += 1;
        if row.lifecycle_state == "active"
            && row.target_count > 0
            && row.unsettled_target_count == 0
        {
            statistics.ready_count += 1;
        }
        if row.lifecycle_state == "pending" && row.processing {
            statistics.pending_count += 1;
        }
    }
    Ok(statistics)
}
