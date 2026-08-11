use std::{
    cmp::Ordering,
    fs,
    path::{Component, Path},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    catalog_lifecycle::locator_hash,
    contract::{load_contract, target_for_role, FamilyId, RoleId, TierId},
    identity::{OwnerIdentifier, OwnerKind, SlotKind, SlotToken, SourceLocatorKind},
    path::ManagedMediaRoot,
};

const PRIMARY_VISUAL_TOKEN: &str = "primary_visual";
const MAX_DESCRIPTOR_REQUESTS: usize = 2_048;
const MAX_RENDER_DIMENSION: f64 = 16_384.0;
const MAX_DEVICE_PIXEL_RATIO: f64 = 8.0;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedMediaDescriptorRequest {
    pub request_id: String,
    pub owner_kind: String,
    pub owner_id: String,
    pub slot_kind: String,
    pub slot_token: Option<String>,
    pub source_path: Option<String>,
    pub role_id: String,
    pub intent: String,
    pub css_width: f64,
    pub css_height: f64,
    pub device_pixel_ratio: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMediaDescriptor {
    pub request_id: String,
    pub selected_source_class: String,
    pub asset_path: Option<String>,
    pub family: Option<String>,
    pub tier: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub media_kind: String,
    pub original_available: bool,
    pub managed_available: bool,
    pub fallback_reason: String,
    pub stale_last_valid: bool,
    pub placeholder: bool,
    pub revision: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RenderingIntent {
    OrdinaryRole,
    FullViewer,
}

#[derive(Debug, Clone)]
struct ValidatedRequest {
    request_id: String,
    owner_kind: OwnerKind,
    owner_id: String,
    slot_kind: SlotKind,
    slot_token: Option<String>,
    source_path: Option<String>,
    role: RoleId,
    intent: RenderingIntent,
    required_width: u32,
    required_height: u32,
}

#[derive(Debug, Clone)]
struct ManagedItem {
    item_id: String,
    lifecycle_state: String,
    locator_hash: String,
}

#[derive(Debug, Clone)]
struct VariantCandidate {
    variant_id: String,
    class: String,
    tier: Option<TierId>,
    family: FamilyId,
    relative_path: String,
    width: u32,
    height: u32,
}

pub fn resolve_descriptor_batch(
    connection: &Connection,
    root: &ManagedMediaRoot,
    requests: Vec<ManagedMediaDescriptorRequest>,
) -> Vec<ManagedMediaDescriptor> {
    if requests.len() > MAX_DESCRIPTOR_REQUESTS {
        return requests
            .into_iter()
            .map(|request| placeholder(&request.request_id, "request_batch_too_large"))
            .collect();
    }

    requests
        .into_iter()
        .map(|request| match validate_request(&request) {
            Ok(validated) => resolve_one(connection, root, validated),
            Err(reason) => placeholder(&request.request_id, reason),
        })
        .collect()
}

fn resolve_one(
    connection: &Connection,
    root: &ManagedMediaRoot,
    request: ValidatedRequest,
) -> ManagedMediaDescriptor {
    let owner_id =
        match resolve_technical_owner_id(connection, request.owner_kind, &request.owner_id) {
            Ok(Some(owner_id)) => owner_id,
            Ok(None) => return original_or_placeholder(&request, "owner_not_found"),
            Err(_) => return placeholder(&request.request_id, "descriptor_lookup_failed"),
        };
    let item = match load_item(connection, &request, &owner_id) {
        Ok(Some(item)) => item,
        Ok(None) => return original_or_placeholder(&request, "managed_descriptor_unavailable"),
        Err(_) => return placeholder(&request.request_id, "descriptor_lookup_failed"),
    };
    if item.lifecycle_state != "active" {
        return placeholder(&request.request_id, "owner_or_slot_retired");
    }

    let original_available = original_path_is_available(
        request.source_path.as_deref(),
        Some((
            source_locator_kind(request.slot_kind),
            item.locator_hash.as_str(),
        )),
    );
    let current = match load_current_variants(connection, &item.item_id, request.role) {
        Ok(variants) => variants,
        Err(_) => return placeholder(&request.request_id, "descriptor_lookup_failed"),
    };
    let last_valid = match load_last_valid_variants(connection, &item.item_id, request.role) {
        Ok(variants) => variants,
        Err(_) => return placeholder(&request.request_id, "descriptor_lookup_failed"),
    };

    if request.intent == RenderingIntent::FullViewer && original_available {
        return original_descriptor(&request, "full_viewer_original");
    }

    if request.intent == RenderingIntent::OrdinaryRole {
        if let Some(candidate) = choose_smallest_sufficient(&current, &request, false) {
            if let Some(descriptor) =
                managed_descriptor(&request, root, candidate, false, original_available)
            {
                return descriptor;
            }
        }
        if original_available {
            return original_descriptor(&request, "current_original");
        }
        if let Some(candidate) = choose_largest(&last_valid, false) {
            if let Some(descriptor) =
                managed_descriptor(&request, root, candidate, true, original_available)
            {
                return descriptor;
            }
        }
        if let Some(candidate) =
            choose_largest(&current, true).or_else(|| choose_largest(&last_valid, true))
        {
            if let Some(descriptor) =
                managed_descriptor(&request, root, candidate, false, original_available)
            {
                return descriptor;
            }
        }
    } else {
        if let Some(candidate) = choose_largest(&current, false) {
            if let Some(descriptor) =
                managed_descriptor(&request, root, candidate, false, original_available)
            {
                return descriptor;
            }
        }
        if let Some(candidate) = choose_largest(&last_valid, false) {
            if let Some(descriptor) =
                managed_descriptor(&request, root, candidate, true, original_available)
            {
                return descriptor;
            }
        }
        if let Some(candidate) =
            choose_largest(&current, true).or_else(|| choose_largest(&last_valid, true))
        {
            if let Some(descriptor) =
                managed_descriptor(&request, root, candidate, false, original_available)
            {
                return descriptor;
            }
        }
        if original_available {
            return original_descriptor(&request, "full_viewer_original_after_invalid_managed");
        }
    }

    placeholder(&request.request_id, "no_safe_media_source")
}

fn validate_request(
    request: &ManagedMediaDescriptorRequest,
) -> Result<ValidatedRequest, &'static str> {
    if !valid_request_id(&request.request_id) {
        return Err("invalid_request_id");
    }
    let owner_kind = parse_owner_kind(&request.owner_kind).ok_or("invalid_owner_kind")?;
    let owner_id =
        OwnerIdentifier::new(request.owner_id.clone()).map_err(|_| "invalid_owner_identity")?;
    let slot_kind = parse_slot_kind(&request.slot_kind).ok_or("invalid_slot_kind")?;
    let slot_token = request
        .slot_token
        .as_ref()
        .map(|value| SlotToken::new(value.clone()).map(|token| token.as_str().to_string()))
        .transpose()
        .map_err(|_| "invalid_slot_token")?;
    if slot_kind == SlotKind::PrimaryVisual && slot_token.as_deref() != Some(PRIMARY_VISUAL_TOKEN) {
        return Err("invalid_primary_slot_token");
    }
    if slot_kind != SlotKind::PrimaryVisual
        && request
            .source_path
            .as_deref()
            .is_none_or(|value| value.trim().is_empty())
    {
        return Err("missing_source_slot_identity");
    }
    let role = parse_role(&request.role_id).ok_or("invalid_role")?;
    if !role_allowed_for_slot(owner_kind, slot_kind, role) {
        return Err("role_slot_mismatch");
    }
    let intent = match request.intent.as_str() {
        "ordinary_role" => RenderingIntent::OrdinaryRole,
        "full_viewer" => RenderingIntent::FullViewer,
        _ => return Err("invalid_rendering_intent"),
    };
    if !valid_measurement(request.css_width, MAX_RENDER_DIMENSION)
        || !valid_measurement(request.css_height, MAX_RENDER_DIMENSION)
        || !valid_measurement(request.device_pixel_ratio, MAX_DEVICE_PIXEL_RATIO)
    {
        return Err("invalid_render_measurement");
    }
    let required_width = (request.css_width * request.device_pixel_ratio).ceil() as u32;
    let required_height = (request.css_height * request.device_pixel_ratio).ceil() as u32;
    Ok(ValidatedRequest {
        request_id: request.request_id.clone(),
        owner_kind,
        owner_id: owner_id.as_str().to_string(),
        slot_kind,
        slot_token,
        source_path: request
            .source_path
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        role,
        intent,
        required_width,
        required_height,
    })
}

fn valid_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b':' | b'.'))
}

fn valid_measurement(value: f64, maximum: f64) -> bool {
    value.is_finite() && value > 0.0 && value <= maximum
}

fn resolve_technical_owner_id(
    connection: &Connection,
    kind: OwnerKind,
    requested: &str,
) -> Result<Option<String>, rusqlite::Error> {
    let (table, technical_column) = match kind {
        OwnerKind::Video => ("videos", "id"),
        OwnerKind::Image => ("images", "id"),
        OwnerKind::Performer => ("performers", "id"),
        OwnerKind::Category => ("managedCategories", "key"),
        OwnerKind::Glossary => ("glossary_entries", "id"),
    };
    let sql = format!(
        "SELECT {technical_column} FROM {table} WHERE {technical_column} = ?1 OR sakuravaRef = ?1 LIMIT 1"
    );
    connection
        .query_row(&sql, [requested], |row| row.get(0))
        .optional()
}

fn load_item(
    connection: &Connection,
    request: &ValidatedRequest,
    technical_owner_id: &str,
) -> Result<Option<ManagedItem>, rusqlite::Error> {
    let source_hash = request.source_path.as_deref().and_then(|source_path| {
        locator_hash(source_locator_kind(request.slot_kind), source_path).ok()
    });
    if let Some(slot_token) = request.slot_token.as_deref() {
        return connection
            .query_row(
                "SELECT item_id, lifecycle_state, locator_hash
                 FROM managed_media_items
                 WHERE owner_kind = ?1 AND owner_id = ?2 AND slot_kind = ?3 AND slot_token = ?4",
                params![
                    request.owner_kind.as_str(),
                    technical_owner_id,
                    request.slot_kind.as_str(),
                    slot_token
                ],
                read_item,
            )
            .optional();
    }
    connection
        .query_row(
            "SELECT item_id, lifecycle_state, locator_hash
             FROM managed_media_items
             WHERE owner_kind = ?1 AND owner_id = ?2 AND slot_kind = ?3 AND locator_hash = ?4",
            params![
                request.owner_kind.as_str(),
                technical_owner_id,
                request.slot_kind.as_str(),
                source_hash.unwrap_or_default()
            ],
            read_item,
        )
        .optional()
}

fn read_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<ManagedItem> {
    Ok(ManagedItem {
        item_id: row.get(0)?,
        lifecycle_state: row.get(1)?,
        locator_hash: row.get(2)?,
    })
}

fn load_current_variants(
    connection: &Connection,
    item_id: &str,
    role: RoleId,
) -> Result<Vec<VariantCandidate>, rusqlite::Error> {
    load_variants(connection, item_id, role, true)
}

fn load_last_valid_variants(
    connection: &Connection,
    item_id: &str,
    role: RoleId,
) -> Result<Vec<VariantCandidate>, rusqlite::Error> {
    load_variants(connection, item_id, role, false)
}

fn load_variants(
    connection: &Connection,
    item_id: &str,
    role: RoleId,
    current_only: bool,
) -> Result<Vec<VariantCandidate>, rusqlite::Error> {
    let sql = if current_only {
        "SELECT DISTINCT variant.variant_id, variant.variant_class, variant.standard_tier,
                variant.family, variant.relative_path, variant.width, variant.height
         FROM managed_media_variants variant
         JOIN managed_media_lifecycle_targets target ON target.result_variant_id = variant.variant_id
         JOIN managed_media_item_generations generation ON generation.managed_item_id = variant.managed_item_id
         WHERE variant.managed_item_id = ?1 AND variant.role_id = ?2
           AND variant.publication_state = 'published' AND target.target_state = 'published'
           AND target.desired_revision = generation.current_revision"
    } else {
        "SELECT variant_id, variant_class, standard_tier, family, relative_path, width, height
         FROM managed_media_variants
         WHERE managed_item_id = ?1 AND role_id = ?2 AND publication_state = 'published'"
    };
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params![item_id, role.as_str()], |row| {
        let tier: Option<String> = row.get(2)?;
        Ok(VariantCandidate {
            variant_id: row.get(0)?,
            class: row.get(1)?,
            tier: tier.as_deref().and_then(parse_tier),
            family: parse_family(&row.get::<_, String>(3)?).unwrap_or(FamilyId::Landscape16_9),
            relative_path: row.get(4)?,
            width: row.get::<_, u32>(5)?,
            height: row.get::<_, u32>(6)?,
        })
    })?;
    rows.collect()
}

fn choose_smallest_sufficient<'a>(
    candidates: &'a [VariantCandidate],
    request: &ValidatedRequest,
    native_only: bool,
) -> Option<&'a VariantCandidate> {
    let contract = load_contract().ok()?;
    candidates
        .iter()
        .filter(|candidate| candidate.class == "standard" && !native_only)
        .filter(|candidate| {
            candidate.width >= request.required_width && candidate.height >= request.required_height
        })
        .filter(|candidate| {
            candidate.tier.is_some_and(|tier| {
                target_for_role(&contract, request.role, tier)
                    .map(|(family, width, height)| {
                        family == candidate.family
                            && candidate.width <= width
                            && candidate.height <= height
                    })
                    .unwrap_or(false)
            })
        })
        .min_by(compare_variant_area)
}

fn choose_largest<'a>(
    candidates: &'a [VariantCandidate],
    native_only: bool,
) -> Option<&'a VariantCandidate> {
    candidates
        .iter()
        .filter(|candidate| (candidate.class == "native_fallback") == native_only)
        .max_by(compare_variant_area)
}

fn compare_variant_area(left: &&VariantCandidate, right: &&VariantCandidate) -> Ordering {
    let left_area = u64::from(left.width) * u64::from(left.height);
    let right_area = u64::from(right.width) * u64::from(right.height);
    left_area
        .cmp(&right_area)
        .then_with(|| left.width.cmp(&right.width))
        .then_with(|| left.height.cmp(&right.height))
        .then_with(|| left.variant_id.cmp(&right.variant_id))
}

fn managed_descriptor(
    request: &ValidatedRequest,
    root: &ManagedMediaRoot,
    candidate: &VariantCandidate,
    stale_last_valid: bool,
    original_available: bool,
) -> Option<ManagedMediaDescriptor> {
    let path = root.resolve(Path::new(&candidate.relative_path)).ok()?;
    if !path.is_file() {
        return None;
    }
    Some(ManagedMediaDescriptor {
        request_id: request.request_id.clone(),
        selected_source_class: if candidate.class == "native_fallback" {
            "managed_native_fallback".to_string()
        } else {
            "managed_standard".to_string()
        },
        asset_path: Some(path.display().to_string()),
        family: Some(candidate.family.as_str().to_string()),
        tier: candidate.tier.map(|tier| tier.as_str().to_string()),
        width: Some(candidate.width),
        height: Some(candidate.height),
        media_kind: "image".to_string(),
        original_available,
        managed_available: true,
        fallback_reason: if stale_last_valid {
            "last_valid_managed".to_string()
        } else {
            "current_managed".to_string()
        },
        stale_last_valid,
        placeholder: false,
        revision: revision(&request.request_id, &candidate.variant_id, stale_last_valid),
    })
}

fn original_or_placeholder(
    request: &ValidatedRequest,
    reason: &'static str,
) -> ManagedMediaDescriptor {
    if original_path_is_available(request.source_path.as_deref(), None) {
        original_descriptor(request, reason)
    } else {
        placeholder(&request.request_id, reason)
    }
}

fn original_path_is_available(
    path: Option<&str>,
    expected_locator: Option<(SourceLocatorKind, &str)>,
) -> bool {
    let Some(raw_path) = path else {
        return false;
    };
    let path = Path::new(raw_path);
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
        || expected_locator.is_some_and(|(kind, expected)| {
            locator_hash(kind, raw_path).ok().as_deref() != Some(expected)
        })
    {
        return false;
    }

    let Ok(metadata) = fs::symlink_metadata(path) else {
        return false;
    };
    metadata.file_type().is_file()
        && !metadata.file_type().is_symlink()
        && fs::File::open(path).is_ok()
}

fn original_descriptor(request: &ValidatedRequest, reason: &'static str) -> ManagedMediaDescriptor {
    ManagedMediaDescriptor {
        request_id: request.request_id.clone(),
        selected_source_class: "original".to_string(),
        asset_path: request.source_path.clone(),
        family: None,
        tier: None,
        width: None,
        height: None,
        media_kind: "image".to_string(),
        original_available: true,
        managed_available: false,
        fallback_reason: reason.to_string(),
        stale_last_valid: false,
        placeholder: false,
        revision: revision(
            &request.request_id,
            request.source_path.as_deref().unwrap_or_default(),
            false,
        ),
    }
}

fn placeholder(request_id: &str, reason: impl Into<String>) -> ManagedMediaDescriptor {
    ManagedMediaDescriptor {
        request_id: request_id.to_string(),
        selected_source_class: "placeholder".to_string(),
        asset_path: None,
        family: None,
        tier: None,
        width: None,
        height: None,
        media_kind: "image".to_string(),
        original_available: false,
        managed_available: false,
        fallback_reason: reason.into(),
        stale_last_valid: false,
        placeholder: true,
        revision: revision(request_id, "placeholder", false),
    }
}

fn revision(request_id: &str, selected_identity: &str, stale: bool) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"managed-media-descriptor-v1\0");
    hasher.update(request_id.as_bytes());
    hasher.update([0]);
    hasher.update(selected_identity.as_bytes());
    hasher.update([stale as u8]);
    format!("{:x}", hasher.finalize())
}

fn source_locator_kind(slot_kind: SlotKind) -> SourceLocatorKind {
    match slot_kind {
        SlotKind::GalleryTile => SourceLocatorKind::ExternalDirectoryEntry,
        SlotKind::PrimaryVisual
        | SlotKind::CollectionCard
        | SlotKind::LiteCard
        | SlotKind::TableThumbnail
        | SlotKind::RelatedCard
        | SlotKind::MiniRow => SourceLocatorKind::ExternalFile,
    }
}

fn parse_owner_kind(value: &str) -> Option<OwnerKind> {
    match value {
        "video" => Some(OwnerKind::Video),
        "image" => Some(OwnerKind::Image),
        "performer" => Some(OwnerKind::Performer),
        "category" => Some(OwnerKind::Category),
        "glossary" => Some(OwnerKind::Glossary),
        _ => None,
    }
}

fn parse_slot_kind(value: &str) -> Option<SlotKind> {
    match value {
        "primary_visual" => Some(SlotKind::PrimaryVisual),
        "gallery_tile" => Some(SlotKind::GalleryTile),
        "mini_row" => Some(SlotKind::MiniRow),
        _ => None,
    }
}

fn parse_role(value: &str) -> Option<RoleId> {
    RoleId::ALL.into_iter().find(|role| role.as_str() == value)
}

fn parse_tier(value: &str) -> Option<TierId> {
    TierId::ALL.into_iter().find(|tier| tier.as_str() == value)
}

fn parse_family(value: &str) -> Option<FamilyId> {
    FamilyId::ALL
        .into_iter()
        .find(|family| family.as_str() == value)
}

fn role_allowed_for_slot(owner: OwnerKind, slot: SlotKind, role: RoleId) -> bool {
    use RoleId::*;
    matches!(
        (owner, slot, role),
        (
            OwnerKind::Video,
            SlotKind::PrimaryVisual,
            VideoCollectionFullCard
                | VideoDetailPrimary
                | VideoTable
                | VideoLiteCard
                | RelatedVideoActive
        ) | (
            OwnerKind::Image,
            SlotKind::PrimaryVisual,
            ImageCollectionFullCard
                | ImageDetailPrimary
                | ImageTable
                | ImageLiteCard
                | RelatedImageActive
        ) | (OwnerKind::Image, SlotKind::GalleryTile, ImageGalleryTile)
            | (
                OwnerKind::Performer,
                SlotKind::PrimaryVisual,
                PerformerCollectionFullCard
                    | PerformerDetailPrimary
                    | PerformerTable
                    | PerformerLiteCard
                    | RelatedPerformerActive
            )
            | (OwnerKind::Performer, SlotKind::MiniRow, PerformerMiniRow)
            | (
                OwnerKind::Category,
                SlotKind::PrimaryVisual,
                CategoryActiveCard | CategoryTable
            )
            | (OwnerKind::Glossary, SlotKind::PrimaryVisual, GlossaryTable)
    )
}
