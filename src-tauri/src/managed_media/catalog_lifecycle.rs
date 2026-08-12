use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    fmt,
};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::{
    contract::{load_contract, RoleId},
    identity::{
        LifecycleIntentIdentity, LifecycleTargetIdentity, ManagedItemKey, OwnerIdentifier,
        OwnerKind, SlotKind, SlotToken, SourceLocatorKind, ValidatedSha256, VariantClass,
    },
    lifecycle::{
        add_target, initialize_item_generation, queue_intent_in_transaction, ItemRevision,
        LifecycleAction, NewLifecycleIntent, NewLifecycleTarget,
    },
};

const PRIMARY_VISUAL_TOKEN: &str = "primary_visual";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnerSources {
    pub owner_kind: OwnerKind,
    pub owner_id: String,
    pub primary_visual: String,
    pub gallery_image_paths_json: String,
    pub performer_thumbnail_paths_json: String,
}

pub trait OwnerSourceProvider {
    fn load_owner_sources(
        &mut self,
        owner_kind: OwnerKind,
        owner_id: &str,
    ) -> Result<Option<OwnerSources>, String>;
}

pub struct SqliteOwnerSourceProvider<'a> {
    connection: &'a Connection,
}

impl<'a> SqliteOwnerSourceProvider<'a> {
    pub const fn new(connection: &'a Connection) -> Self {
        Self { connection }
    }
}

impl OwnerSourceProvider for SqliteOwnerSourceProvider<'_> {
    fn load_owner_sources(
        &mut self,
        owner_kind: OwnerKind,
        owner_id: &str,
    ) -> Result<Option<OwnerSources>, String> {
        match owner_kind {
            OwnerKind::Video => self
                .connection
                .query_row(
                    "SELECT id, coverPath FROM videos WHERE id = ?1",
                    [owner_id],
                    |row| {
                        Ok(OwnerSources::video(
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                        ))
                    },
                )
                .optional()
                .map_err(database_error),
            OwnerKind::Image => self
                .connection
                .query_row(
                    "SELECT id, coverPath, galleryImagePathsJson FROM images WHERE id = ?1",
                    [owner_id],
                    |row| {
                        Ok(OwnerSources::image(
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(database_error),
            OwnerKind::Performer => self
                .connection
                .query_row(
                    "SELECT id, coverPath, performerThumbnailPathsJson
                     FROM performers WHERE id = ?1",
                    [owner_id],
                    |row| {
                        Ok(OwnerSources::performer(
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(database_error),
            OwnerKind::Category => self
                .connection
                .query_row(
                    "SELECT key, thumbnailPath FROM managedCategories WHERE key = ?1",
                    [owner_id],
                    |row| {
                        Ok(OwnerSources::category(
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                        ))
                    },
                )
                .optional()
                .map_err(database_error),
            OwnerKind::Glossary => self
                .connection
                .query_row(
                    "SELECT id, thumbnail_path FROM glossary_entries WHERE id = ?1",
                    [owner_id],
                    |row| {
                        Ok(OwnerSources::glossary(
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                        ))
                    },
                )
                .optional()
                .map_err(database_error),
        }
    }
}

impl<F> OwnerSourceProvider for F
where
    F: FnMut(OwnerKind, &str) -> Result<Option<OwnerSources>, String>,
{
    fn load_owner_sources(
        &mut self,
        owner_kind: OwnerKind,
        owner_id: &str,
    ) -> Result<Option<OwnerSources>, String> {
        self(owner_kind, owner_id)
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedSourceLocator {
    pub item_key: ManagedItemKey,
    pub locator_kind: SourceLocatorKind,
    pub locator: String,
    pub locator_hash: ValidatedSha256,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocatorResolutionError {
    ItemNotFound,
    OwnerNotFound,
    OwnerIdentityMismatch,
    SlotNotFound,
    AmbiguousSlot,
    UnsupportedStoredIdentity,
    LocatorHashMismatch,
    StaleRevision,
    ProviderFailure,
}

impl fmt::Display for LocatorResolutionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::ItemNotFound => "The managed-media item was not found.",
            Self::OwnerNotFound => "The authoritative catalog owner was not found.",
            Self::OwnerIdentityMismatch => {
                "The authoritative catalog owner identity is inconsistent."
            }
            Self::SlotNotFound => "The authoritative catalog source slot was not found.",
            Self::AmbiguousSlot => "The authoritative catalog source slot is ambiguous.",
            Self::UnsupportedStoredIdentity => {
                "The managed-media source identity is not supported."
            }
            Self::LocatorHashMismatch => {
                "The authoritative catalog source locator no longer matches the claimed work."
            }
            Self::StaleRevision => "The managed-media lifecycle revision is stale.",
            Self::ProviderFailure => "The authoritative catalog source could not be loaded.",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for LocatorResolutionError {}

pub fn resolve_claimed_source_locator(
    connection: &Connection,
    intent_id: &LifecycleIntentIdentity,
    item_id: &ValidatedSha256,
    revision: ItemRevision,
    provider: &mut (impl OwnerSourceProvider + ?Sized),
) -> Result<ResolvedSourceLocator, LocatorResolutionError> {
    let stored = connection
        .query_row(
            "SELECT item.owner_kind, item.owner_id, item.slot_kind, item.slot_token,
                    item.source_locator_kind, item.locator_hash,
                    intent.expected_locator_hash, intent.desired_revision
             FROM managed_media_items item
             JOIN managed_media_lifecycle_intents intent
               ON intent.managed_item_id = item.item_id
             WHERE item.item_id = ?1 AND intent.intent_id = ?2",
            params![item_id.as_str(), intent_id.as_str()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .optional()
        .map_err(|_| LocatorResolutionError::ProviderFailure)?
        .ok_or(LocatorResolutionError::ItemNotFound)?;

    if stored.7 <= 0 || stored.7 as u64 != revision.get() {
        return Err(LocatorResolutionError::StaleRevision);
    }
    if stored.5 != stored.6 {
        return Err(LocatorResolutionError::LocatorHashMismatch);
    }

    let owner_kind =
        parse_owner_kind(&stored.0).ok_or(LocatorResolutionError::UnsupportedStoredIdentity)?;
    let slot_kind =
        parse_slot_kind(&stored.2).ok_or(LocatorResolutionError::UnsupportedStoredIdentity)?;
    let locator_kind =
        parse_locator_kind(&stored.4).ok_or(LocatorResolutionError::UnsupportedStoredIdentity)?;
    let owner_id = OwnerIdentifier::new(stored.1.clone())
        .map_err(|_| LocatorResolutionError::UnsupportedStoredIdentity)?;
    let slot_token = SlotToken::new(stored.3.clone())
        .map_err(|_| LocatorResolutionError::UnsupportedStoredIdentity)?;
    let item_key = ManagedItemKey::new(owner_kind, owner_id, slot_kind, slot_token);
    let derived_item_id = hash_identity(&item_key.preimage())
        .map_err(|_| LocatorResolutionError::UnsupportedStoredIdentity)?;
    if derived_item_id != *item_id {
        return Err(LocatorResolutionError::OwnerIdentityMismatch);
    }

    let owner = provider
        .load_owner_sources(owner_kind, &stored.1)
        .map_err(|_| LocatorResolutionError::ProviderFailure)?
        .ok_or(LocatorResolutionError::OwnerNotFound)?;
    if owner.owner_kind != owner_kind || owner.owner_id != stored.1 {
        return Err(LocatorResolutionError::OwnerIdentityMismatch);
    }

    let locator = resolve_owner_slot(&owner, slot_kind, &stored.3, locator_kind, &stored.5)?;
    let current_hash =
        locator_hash(locator_kind, &locator).map_err(|_| LocatorResolutionError::SlotNotFound)?;
    if current_hash != stored.5 {
        return Err(LocatorResolutionError::LocatorHashMismatch);
    }

    Ok(ResolvedSourceLocator {
        item_key,
        locator_kind,
        locator,
        locator_hash: ValidatedSha256::new(stored.5)
            .map_err(|_| LocatorResolutionError::UnsupportedStoredIdentity)?,
    })
}

fn resolve_owner_slot(
    owner: &OwnerSources,
    slot_kind: SlotKind,
    slot_token: &str,
    locator_kind: SourceLocatorKind,
    expected_hash: &str,
) -> Result<String, LocatorResolutionError> {
    match (owner.owner_kind, slot_kind, locator_kind) {
        (
            _,
            SlotKind::PrimaryVisual,
            SourceLocatorKind::ExternalFile | SourceLocatorKind::ExternalUrl,
        ) => {
            if slot_token != PRIMARY_VISUAL_TOKEN {
                return Err(LocatorResolutionError::SlotNotFound);
            }
            let locator = owner.primary_visual.trim();
            if locator.is_empty() {
                return Err(LocatorResolutionError::SlotNotFound);
            }
            Ok(locator.to_string())
        }
        (OwnerKind::Image, SlotKind::GalleryTile, SourceLocatorKind::ExternalDirectoryEntry) => {
            resolve_repeated_locator(&owner.gallery_image_paths_json, locator_kind, expected_hash)
        }
        (OwnerKind::Performer, SlotKind::MiniRow, SourceLocatorKind::ExternalFile) => {
            resolve_repeated_locator(
                &owner.performer_thumbnail_paths_json,
                locator_kind,
                expected_hash,
            )
        }
        (_, _, SourceLocatorKind::ExternalUrl) => {
            Err(LocatorResolutionError::UnsupportedStoredIdentity)
        }
        _ => Err(LocatorResolutionError::SlotNotFound),
    }
}

fn resolve_repeated_locator(
    persisted_json: &str,
    locator_kind: SourceLocatorKind,
    expected_hash: &str,
) -> Result<String, LocatorResolutionError> {
    let entries = parse_persisted_string_array(persisted_json)
        .map_err(|_| LocatorResolutionError::SlotNotFound)?;
    let matching = entries
        .into_iter()
        .filter(|entry| locator_hash(locator_kind, entry).ok().as_deref() == Some(expected_hash))
        .collect::<Vec<_>>();
    match matching.as_slice() {
        [locator] => Ok(locator.clone()),
        [] => Err(LocatorResolutionError::SlotNotFound),
        _ => Err(LocatorResolutionError::AmbiguousSlot),
    }
}

fn parse_owner_kind(value: &str) -> Option<OwnerKind> {
    [
        OwnerKind::Video,
        OwnerKind::Image,
        OwnerKind::Performer,
        OwnerKind::Category,
        OwnerKind::Glossary,
    ]
    .into_iter()
    .find(|kind| kind.as_str() == value)
}

fn parse_slot_kind(value: &str) -> Option<SlotKind> {
    [
        SlotKind::PrimaryVisual,
        SlotKind::CollectionCard,
        SlotKind::LiteCard,
        SlotKind::TableThumbnail,
        SlotKind::GalleryTile,
        SlotKind::RelatedCard,
        SlotKind::MiniRow,
    ]
    .into_iter()
    .find(|kind| kind.as_str() == value)
}

fn parse_locator_kind(value: &str) -> Option<SourceLocatorKind> {
    [
        SourceLocatorKind::ExternalFile,
        SourceLocatorKind::ExternalDirectoryEntry,
        SourceLocatorKind::ExternalUrl,
    ]
    .into_iter()
    .find(|kind| kind.as_str() == value)
}

impl OwnerSources {
    pub fn video(owner_id: impl Into<String>, cover_path: impl Into<String>) -> Self {
        Self::new(OwnerKind::Video, owner_id, cover_path, "[]", "[]")
    }

    pub fn image(
        owner_id: impl Into<String>,
        cover_path: impl Into<String>,
        gallery_image_paths_json: impl Into<String>,
    ) -> Self {
        Self::new(
            OwnerKind::Image,
            owner_id,
            cover_path,
            gallery_image_paths_json,
            "[]",
        )
    }

    pub fn performer(
        owner_id: impl Into<String>,
        cover_path: impl Into<String>,
        performer_thumbnail_paths_json: impl Into<String>,
    ) -> Self {
        Self::new(
            OwnerKind::Performer,
            owner_id,
            cover_path,
            "[]",
            performer_thumbnail_paths_json,
        )
    }

    pub fn category(owner_id: impl Into<String>, thumbnail_path: impl Into<String>) -> Self {
        Self::new(OwnerKind::Category, owner_id, thumbnail_path, "[]", "[]")
    }

    pub fn glossary(owner_id: impl Into<String>, thumbnail_path: impl Into<String>) -> Self {
        Self::new(OwnerKind::Glossary, owner_id, thumbnail_path, "[]", "[]")
    }

    fn new(
        owner_kind: OwnerKind,
        owner_id: impl Into<String>,
        primary_visual: impl Into<String>,
        gallery_image_paths_json: impl Into<String>,
        performer_thumbnail_paths_json: impl Into<String>,
    ) -> Self {
        Self {
            owner_kind,
            owner_id: owner_id.into(),
            primary_visual: primary_visual.into(),
            gallery_image_paths_json: gallery_image_paths_json.into(),
            performer_thumbnail_paths_json: performer_thumbnail_paths_json.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExistingRepeatedSlot {
    pub slot_token: String,
    pub locator_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetainedRepeatedSlot {
    pub slot_token: String,
    pub locator_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AddedRepeatedSlot {
    pub slot_token: String,
    pub locator: String,
    pub locator_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepeatedSlotPlan {
    pub retained: Vec<RetainedRepeatedSlot>,
    pub added: Vec<AddedRepeatedSlot>,
    pub retired_tokens: Vec<String>,
}

pub fn plan_repeated_slots(
    locator_kind: SourceLocatorKind,
    previous_entries: &[String],
    final_entries: &[String],
    existing_slots: &[ExistingRepeatedSlot],
    token_generator: &mut impl FnMut() -> Result<String, String>,
) -> Result<RepeatedSlotPlan, String> {
    let previous = unique_locator_map(locator_kind, previous_entries)?;
    let final_values = unique_locator_map(locator_kind, final_entries)?;
    let existing = unique_existing_map(existing_slots)?;

    let mut retained = Vec::new();
    let mut added = Vec::new();
    let mut retired_tokens = Vec::new();
    let mut generated_tokens = HashSet::new();

    for locator_hash in previous.keys() {
        if final_values.contains_key(locator_hash) {
            if let Some(slot) = existing.get(locator_hash) {
                retained.push(RetainedRepeatedSlot {
                    slot_token: slot.slot_token.clone(),
                    locator_hash: locator_hash.clone(),
                });
            }
        } else if let Some(slot) = existing.get(locator_hash) {
            retired_tokens.push(slot.slot_token.clone());
        }
    }

    for (locator_hash, locator) in final_values {
        if previous.contains_key(&locator_hash) {
            continue;
        }
        let slot_token = if let Some(existing) = existing.get(&locator_hash) {
            existing.slot_token.clone()
        } else {
            let generated = token_generator()?;
            SlotToken::new(generated.clone())?;
            if !generated_tokens.insert(generated.clone())
                || existing_slots
                    .iter()
                    .any(|existing| existing.slot_token == generated)
            {
                return Err("Managed-media repeated-slot token is duplicated.".to_string());
            }
            generated
        };
        added.push(AddedRepeatedSlot {
            slot_token,
            locator,
            locator_hash,
        });
    }

    retained.sort_by(|left, right| left.slot_token.cmp(&right.slot_token));
    added.sort_by(|left, right| left.slot_token.cmp(&right.slot_token));
    retired_tokens.sort();
    Ok(RepeatedSlotPlan {
        retained,
        added,
        retired_tokens,
    })
}

pub fn reconcile_owner_mutation(
    connection: &Connection,
    previous: Option<&OwnerSources>,
    final_state: Option<&OwnerSources>,
    token_generator: &mut impl FnMut() -> Result<String, String>,
    now: &str,
) -> Result<(), String> {
    if connection.is_autocommit() {
        return Err(
            "Managed-media lifecycle reconciliation requires an active transaction.".to_string(),
        );
    }

    let identity = final_state.or(previous);
    let Some(identity) = identity else {
        return Ok(());
    };
    OwnerIdentifier::new(identity.owner_id.clone())?;
    if let (Some(previous), Some(final_state)) = (previous, final_state) {
        if previous.owner_kind != final_state.owner_kind
            || previous.owner_id != final_state.owner_id
        {
            return Err(
                "Managed-media catalog owner identity changed during mutation.".to_string(),
            );
        }
    }

    if final_state.is_none() {
        return retire_owner(connection, identity.owner_kind, &identity.owner_id, now);
    }

    let final_state = final_state.expect("checked");
    let previous_primary = previous
        .map(|state| state.primary_visual.as_str())
        .unwrap_or("");
    if previous_primary != final_state.primary_visual {
        reconcile_singleton(
            connection,
            final_state.owner_kind,
            &final_state.owner_id,
            previous_primary,
            &final_state.primary_visual,
            now,
        )?;
    }

    if final_state.owner_kind == OwnerKind::Image {
        let previous_json = previous
            .map(|state| state.gallery_image_paths_json.as_str())
            .unwrap_or("[]");
        if previous_json != final_state.gallery_image_paths_json {
            reconcile_repeated(
                connection,
                final_state.owner_kind,
                &final_state.owner_id,
                SlotKind::GalleryTile,
                SourceLocatorKind::ExternalDirectoryEntry,
                previous_json,
                &final_state.gallery_image_paths_json,
                token_generator,
                now,
            )?;
        }
    }

    if final_state.owner_kind == OwnerKind::Performer {
        let previous_json = previous
            .map(|state| state.performer_thumbnail_paths_json.as_str())
            .unwrap_or("[]");
        if previous_json != final_state.performer_thumbnail_paths_json {
            reconcile_repeated(
                connection,
                final_state.owner_kind,
                &final_state.owner_id,
                SlotKind::MiniRow,
                SourceLocatorKind::ExternalFile,
                previous_json,
                &final_state.performer_thumbnail_paths_json,
                token_generator,
                now,
            )?;
        }
    }
    Ok(())
}

fn reconcile_singleton(
    connection: &Connection,
    owner_kind: OwnerKind,
    owner_id: &str,
    previous_locator: &str,
    final_locator: &str,
    now: &str,
) -> Result<(), String> {
    let final_locator = final_locator.trim();
    if final_locator.is_empty() {
        if !previous_locator.trim().is_empty() {
            if let Some(item) = load_item_by_token(
                connection,
                owner_kind,
                owner_id,
                SlotKind::PrimaryVisual,
                PRIMARY_VISUAL_TOKEN,
            )? {
                queue_item_action(
                    connection,
                    &item.item_id,
                    &item.locator_hash,
                    LifecycleAction::Retire,
                    &[],
                    now,
                )?;
            }
        }
        return Ok(());
    }

    activate_slot(
        connection,
        owner_kind,
        owner_id,
        SlotKind::PrimaryVisual,
        PRIMARY_VISUAL_TOKEN,
        SourceLocatorKind::ExternalFile,
        final_locator,
        now,
    )
}

#[allow(clippy::too_many_arguments)]
fn reconcile_repeated(
    connection: &Connection,
    owner_kind: OwnerKind,
    owner_id: &str,
    slot_kind: SlotKind,
    locator_kind: SourceLocatorKind,
    previous_json: &str,
    final_json: &str,
    token_generator: &mut impl FnMut() -> Result<String, String>,
    now: &str,
) -> Result<(), String> {
    let previous_entries = parse_persisted_string_array(previous_json)?;
    let final_entries = parse_persisted_string_array(final_json)?;
    let existing_items = load_items(connection, owner_kind, owner_id, Some(slot_kind))?;
    let existing_slots = authoritative_existing_items(&existing_items)
        .into_iter()
        .map(|item| ExistingRepeatedSlot {
            slot_token: item.slot_token.clone(),
            locator_hash: item.locator_hash.clone(),
        })
        .collect::<Vec<_>>();
    let plan = plan_repeated_slots(
        locator_kind,
        &previous_entries,
        &final_entries,
        &existing_slots,
        token_generator,
    )?;

    for slot_token in plan.retired_tokens {
        let item = existing_items
            .iter()
            .find(|item| item.slot_token == slot_token)
            .ok_or_else(|| {
                "Managed-media repeated slot changed during reconciliation.".to_string()
            })?;
        queue_item_action(
            connection,
            &item.item_id,
            &item.locator_hash,
            LifecycleAction::Retire,
            &[],
            now,
        )?;
    }
    for added in plan.added {
        activate_slot(
            connection,
            owner_kind,
            owner_id,
            slot_kind,
            &added.slot_token,
            locator_kind,
            &added.locator,
            now,
        )?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn activate_slot(
    connection: &Connection,
    owner_kind: OwnerKind,
    owner_id: &str,
    slot_kind: SlotKind,
    slot_token: &str,
    locator_kind: SourceLocatorKind,
    locator: &str,
    now: &str,
) -> Result<(), String> {
    let owner_identifier = OwnerIdentifier::new(owner_id.to_string())?;
    let validated_slot_token = SlotToken::new(slot_token.to_string())?;
    let item_key = ManagedItemKey::new(
        owner_kind,
        owner_identifier,
        slot_kind,
        validated_slot_token,
    );
    let item_id = hash_identity(&item_key.preimage())?;
    let locator_hash = locator_hash(locator_kind, locator)?;

    let existing = load_item_by_id(connection, item_id.as_str())?;
    if let Some(existing) = existing {
        if existing.owner_kind != owner_kind.as_str()
            || existing.owner_id != owner_id
            || existing.slot_kind != slot_kind.as_str()
            || existing.slot_token != slot_token
        {
            return Err("Managed-media item identity is inconsistent.".to_string());
        }
        if existing.lifecycle_state == "invalid" {
            return Err("Managed-media item is invalid.".to_string());
        }
        connection
            .execute(
                "UPDATE managed_media_items
                 SET source_locator_kind = ?2, locator_hash = ?3,
                     source_availability_state = 'unknown', lifecycle_state = 'pending',
                     updated_at = ?4
                 WHERE item_id = ?1",
                params![
                    item_id.as_str(),
                    locator_kind.as_str(),
                    locator_hash.as_str(),
                    now
                ],
            )
            .map_err(database_error)?;
    } else {
        connection
            .execute(
                "INSERT INTO managed_media_items (
                   item_id, owner_kind, owner_id, slot_kind, slot_token,
                   source_locator_kind, locator_hash, current_source_fingerprint,
                   pending_source_fingerprint, source_availability_state,
                   lifecycle_state, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, 'unknown', 'pending', ?8, ?8)",
                params![
                    item_id.as_str(),
                    owner_kind.as_str(),
                    owner_id,
                    slot_kind.as_str(),
                    slot_token,
                    locator_kind.as_str(),
                    locator_hash.as_str(),
                    now
                ],
            )
            .map_err(database_error)?;
        initialize_item_generation(connection, &item_id, now).map_err(lifecycle_error)?;
    }

    let roles = roles_for_slot(owner_kind, slot_kind)?;
    queue_item_action(
        connection,
        item_id.as_str(),
        locator_hash.as_str(),
        LifecycleAction::Generate,
        &roles,
        now,
    )
}

fn queue_item_action(
    connection: &Connection,
    item_id: &str,
    locator_hash: &str,
    action: LifecycleAction,
    roles: &[RoleId],
    now: &str,
) -> Result<(), String> {
    if action == LifecycleAction::Retire && has_unfinished_retirement(connection, item_id)? {
        return Ok(());
    }
    let item_id = ValidatedSha256::new(item_id.to_string())?;
    let locator_hash = ValidatedSha256::new(locator_hash.to_string())?;
    let revision = next_revision(connection, item_id.as_str())?;
    let action_label = action.as_str();
    let intent_id = LifecycleIntentIdentity::new(format!(
        "intent_{}",
        hash_hex(&format!(
            "catalog-intent-v1|{}|{}|{}",
            item_id.as_str(),
            revision.get(),
            action_label
        ))
    ))?;
    let intent = NewLifecycleIntent {
        intent_id: intent_id.clone(),
        item_id: item_id.clone(),
        revision,
        action,
        expected_locator_hash: locator_hash,
    };
    queue_intent_in_transaction(connection, &intent, now).map_err(lifecycle_error)?;

    for (role, class) in target_plan(roles)? {
        let class_label = match class {
            VariantClass::Standard(tier) => format!("standard:{}", tier.as_str()),
            VariantClass::NativeFallback => "native_fallback".to_string(),
        };
        let target_id = LifecycleTargetIdentity::new(format!(
            "target_{}",
            hash_hex(&format!(
                "catalog-target-v1|{}|{}|{}",
                intent_id.as_str(),
                role.as_str(),
                class_label
            ))
        ))?;
        add_target(
            connection,
            &NewLifecycleTarget {
                target_id,
                intent_id: intent_id.clone(),
                item_id: item_id.clone(),
                revision,
                role,
                class,
            },
            now,
        )
        .map_err(lifecycle_error)?;
    }
    Ok(())
}

fn has_unfinished_retirement(connection: &Connection, item_id: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM managed_media_lifecycle_intents
               WHERE managed_item_id = ?1 AND lifecycle_action = 'retire'
                 AND lifecycle_state IN (
                   'queued', 'claimed', 'retry_wait', 'recovery_required'
                 )
             )",
            [item_id],
            |row| row.get(0),
        )
        .map_err(database_error)
}

fn target_plan(roles: &[RoleId]) -> Result<Vec<(RoleId, VariantClass)>, String> {
    let contract = load_contract()?;
    let mut planned = Vec::new();
    let mut unique = BTreeSet::new();
    for role_id in roles {
        let role = contract
            .roles
            .iter()
            .find(|role| role.id == *role_id)
            .ok_or_else(|| "Managed-media role is missing from the contract.".to_string())?;
        for tier in &role.tiers {
            if !unique.insert((role.id.as_str(), tier.as_str())) {
                return Err("Managed-media target plan is duplicated.".to_string());
            }
            planned.push((role.id, VariantClass::Standard(*tier)));
        }
        if !unique.insert((role.id.as_str(), "NATIVE_FALLBACK")) {
            return Err("Managed-media fallback target plan is duplicated.".to_string());
        }
        planned.push((role.id, VariantClass::NativeFallback));
    }
    Ok(planned)
}

fn roles_for_slot(owner_kind: OwnerKind, slot_kind: SlotKind) -> Result<Vec<RoleId>, String> {
    use RoleId::*;
    let roles = match (owner_kind, slot_kind) {
        (OwnerKind::Video, SlotKind::PrimaryVisual) => vec![
            VideoCollectionFullCard,
            VideoDetailPrimary,
            VideoTable,
            VideoLiteCard,
            RelatedVideoActive,
        ],
        (OwnerKind::Image, SlotKind::PrimaryVisual) => vec![
            ImageCollectionFullCard,
            ImageDetailPrimary,
            ImageTable,
            ImageLiteCard,
            RelatedImageActive,
        ],
        (OwnerKind::Image, SlotKind::GalleryTile) => vec![ImageGalleryTile],
        (OwnerKind::Performer, SlotKind::PrimaryVisual) => vec![
            PerformerCollectionFullCard,
            PerformerDetailPrimary,
            PerformerTable,
            PerformerLiteCard,
            RelatedPerformerActive,
        ],
        (OwnerKind::Performer, SlotKind::MiniRow) => vec![PerformerMiniRow],
        (OwnerKind::Category, SlotKind::PrimaryVisual) => {
            vec![CategoryActiveCard, CategoryTable]
        }
        (OwnerKind::Glossary, SlotKind::PrimaryVisual) => vec![GlossaryTable],
        _ => {
            return Err(
                "Catalog source slot has no approved managed-media role mapping.".to_string(),
            )
        }
    };
    Ok(roles)
}

fn retire_owner(
    connection: &Connection,
    owner_kind: OwnerKind,
    owner_id: &str,
    now: &str,
) -> Result<(), String> {
    for item in load_items(connection, owner_kind, owner_id, None)?
        .into_iter()
        .filter(|item| item.lifecycle_state != "retired")
    {
        queue_item_action(
            connection,
            &item.item_id,
            &item.locator_hash,
            LifecycleAction::Retire,
            &[],
            now,
        )?;
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct StoredItem {
    item_id: String,
    owner_kind: String,
    owner_id: String,
    slot_kind: String,
    slot_token: String,
    locator_hash: String,
    lifecycle_state: String,
    desired_revision: i64,
}

fn load_items(
    connection: &Connection,
    owner_kind: OwnerKind,
    owner_id: &str,
    slot_kind: Option<SlotKind>,
) -> Result<Vec<StoredItem>, String> {
    let mut query = String::from(
        "SELECT item.item_id, item.owner_kind, item.owner_id, item.slot_kind,
                item.slot_token, item.locator_hash, item.lifecycle_state,
                COALESCE(generation.desired_revision, 0)
         FROM managed_media_items item
         LEFT JOIN managed_media_item_generations generation
           ON generation.managed_item_id = item.item_id
         WHERE item.owner_kind = ?1 AND item.owner_id = ?2",
    );
    if slot_kind.is_some() {
        query.push_str(" AND item.slot_kind = ?3");
    }
    query.push_str(" ORDER BY slot_kind, slot_token");
    let mut statement = connection.prepare(&query).map_err(database_error)?;
    let rows = if let Some(slot_kind) = slot_kind {
        statement
            .query_map(
                params![owner_kind.as_str(), owner_id, slot_kind.as_str()],
                stored_item,
            )
            .map_err(database_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error)?
    } else {
        statement
            .query_map(params![owner_kind.as_str(), owner_id], stored_item)
            .map_err(database_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error)?
    };
    Ok(rows)
}

fn load_item_by_token(
    connection: &Connection,
    owner_kind: OwnerKind,
    owner_id: &str,
    slot_kind: SlotKind,
    slot_token: &str,
) -> Result<Option<StoredItem>, String> {
    connection
        .query_row(
            "SELECT item.item_id, item.owner_kind, item.owner_id, item.slot_kind,
                     item.slot_token, item.locator_hash, item.lifecycle_state,
                     COALESCE(generation.desired_revision, 0)
              FROM managed_media_items item
              LEFT JOIN managed_media_item_generations generation
                ON generation.managed_item_id = item.item_id
              WHERE item.owner_kind = ?1 AND item.owner_id = ?2
                AND item.slot_kind = ?3 AND item.slot_token = ?4",
            params![
                owner_kind.as_str(),
                owner_id,
                slot_kind.as_str(),
                slot_token
            ],
            stored_item,
        )
        .optional()
        .map_err(database_error)
}

fn load_item_by_id(connection: &Connection, item_id: &str) -> Result<Option<StoredItem>, String> {
    connection
        .query_row(
            "SELECT item.item_id, item.owner_kind, item.owner_id, item.slot_kind,
                    item.slot_token, item.locator_hash, item.lifecycle_state,
                    COALESCE(generation.desired_revision, 0)
             FROM managed_media_items item
             LEFT JOIN managed_media_item_generations generation
               ON generation.managed_item_id = item.item_id
             WHERE item.item_id = ?1",
            [item_id],
            stored_item,
        )
        .optional()
        .map_err(database_error)
}

fn stored_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredItem> {
    Ok(StoredItem {
        item_id: row.get(0)?,
        owner_kind: row.get(1)?,
        owner_id: row.get(2)?,
        slot_kind: row.get(3)?,
        slot_token: row.get(4)?,
        locator_hash: row.get(5)?,
        lifecycle_state: row.get(6)?,
        desired_revision: row.get(7)?,
    })
}

fn authoritative_existing_items(items: &[StoredItem]) -> Vec<&StoredItem> {
    let mut by_locator = BTreeMap::<&str, &StoredItem>::new();
    for item in items
        .iter()
        .filter(|item| item.lifecycle_state != "invalid")
    {
        by_locator
            .entry(item.locator_hash.as_str())
            .and_modify(|current| {
                if item_authority(item) > item_authority(current) {
                    *current = item;
                }
            })
            .or_insert(item);
    }
    by_locator.into_values().collect()
}

fn item_authority(item: &StoredItem) -> (u8, i64, std::cmp::Reverse<&str>) {
    let lifecycle_rank = match item.lifecycle_state.as_str() {
        "active" => 3,
        "pending" => 2,
        "retired" => 1,
        _ => 0,
    };
    (
        lifecycle_rank,
        item.desired_revision,
        std::cmp::Reverse(item.item_id.as_str()),
    )
}

fn parse_persisted_string_array(value: &str) -> Result<Vec<String>, String> {
    let Value::Array(values) = serde_json::from_str::<Value>(value)
        .map_err(|_| "Catalog source array is invalid.".to_string())?
    else {
        return Err("Catalog source array is invalid.".to_string());
    };
    values
        .into_iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| "Catalog source array is invalid.".to_string())
        })
        .collect()
}

fn unique_locator_map(
    locator_kind: SourceLocatorKind,
    entries: &[String],
) -> Result<BTreeMap<String, String>, String> {
    let mut values = BTreeMap::new();
    for entry in entries {
        let locator_hash = locator_hash(locator_kind, entry)?;
        if values.insert(locator_hash, entry.clone()).is_some() {
            return Err("Catalog source array contains ambiguous duplicate entries.".to_string());
        }
    }
    Ok(values)
}

fn unique_existing_map(
    existing_slots: &[ExistingRepeatedSlot],
) -> Result<HashMap<String, ExistingRepeatedSlot>, String> {
    let mut values = HashMap::new();
    for slot in existing_slots {
        SlotToken::new(slot.slot_token.clone())?;
        ValidatedSha256::new(slot.locator_hash.clone())?;
        if values
            .insert(slot.locator_hash.clone(), slot.clone())
            .is_some()
        {
            return Err("Managed-media repeated-slot identity is ambiguous.".to_string());
        }
    }
    Ok(values)
}

fn next_revision(connection: &Connection, item_id: &str) -> Result<ItemRevision, String> {
    let (current, desired): (i64, i64) = connection
        .query_row(
            "SELECT current_revision, desired_revision
             FROM managed_media_item_generations WHERE managed_item_id = ?1",
            [item_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(database_error)?;
    let next = current
        .max(desired)
        .checked_add(1)
        .ok_or_else(|| "Managed-media lifecycle revision is exhausted.".to_string())?;
    ItemRevision::new(next as u64).map_err(lifecycle_error)
}

pub(crate) fn locator_hash(kind: SourceLocatorKind, locator: &str) -> Result<String, String> {
    if locator.is_empty() {
        return Err("Managed-media source locator is empty.".to_string());
    }
    Ok(hash_hex(&format!(
        "catalog-locator-v1|{}|{}:{}",
        kind.as_str(),
        locator.len(),
        locator
    )))
}

fn hash_identity(value: &str) -> Result<ValidatedSha256, String> {
    ValidatedSha256::new(hash_hex(value))
}

fn hash_hex(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn lifecycle_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn database_error(error: rusqlite::Error) -> String {
    format!("Database operation failed: {error}")
}
