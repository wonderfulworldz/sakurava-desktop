use std::collections::{HashMap, HashSet};

use serde::Deserialize;

pub const CONTRACT_JSON: &str = include_str!("../../../src/shared/managed-media-contract.v1.json");
pub const CONTRACT_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
pub enum FamilyId {
    #[serde(rename = "LANDSCAPE_16_9")]
    Landscape16_9,
    #[serde(rename = "STANDARD_4_3")]
    Standard4_3,
    #[serde(rename = "SQUARE_1_1")]
    Square1_1,
    #[serde(rename = "PORTRAIT_4_5")]
    Portrait4_5,
}

impl FamilyId {
    pub const ALL: [Self; 4] = [
        Self::Landscape16_9,
        Self::Standard4_3,
        Self::Square1_1,
        Self::Portrait4_5,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Landscape16_9 => "LANDSCAPE_16_9",
            Self::Standard4_3 => "STANDARD_4_3",
            Self::Square1_1 => "SQUARE_1_1",
            Self::Portrait4_5 => "PORTRAIT_4_5",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TierId {
    Thumbnail,
    Medium,
    Large,
}

impl TierId {
    pub const ALL: [Self; 3] = [Self::Thumbnail, Self::Medium, Self::Large];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Thumbnail => "THUMBNAIL",
            Self::Medium => "MEDIUM",
            Self::Large => "LARGE",
        }
    }

    pub const fn file_stem(self) -> &'static str {
        match self {
            Self::Thumbnail => "thumbnail",
            Self::Medium => "medium",
            Self::Large => "large",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
pub enum ProfileVersion {
    #[serde(rename = "managed-media-profile-v1")]
    V1,
}

impl ProfileVersion {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::V1 => "managed-media-profile-v1",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoleId {
    VideoCollectionFullCard,
    ImageCollectionFullCard,
    VideoDetailPrimary,
    ImageDetailPrimary,
    VideoTable,
    ImageTable,
    VideoLiteCard,
    ImageLiteCard,
    PerformerLiteCard,
    RelatedVideoActive,
    RelatedImageActive,
    RelatedPerformerActive,
    PerformerCollectionFullCard,
    ImageGalleryTile,
    CategoryActiveCard,
    CategoryTable,
    GlossaryTable,
    PerformerDetailPrimary,
    PerformerMiniRow,
    PerformerTable,
}

impl RoleId {
    pub const ALL: [Self; 20] = [
        Self::VideoCollectionFullCard,
        Self::ImageCollectionFullCard,
        Self::VideoDetailPrimary,
        Self::ImageDetailPrimary,
        Self::VideoTable,
        Self::ImageTable,
        Self::VideoLiteCard,
        Self::ImageLiteCard,
        Self::PerformerLiteCard,
        Self::RelatedVideoActive,
        Self::RelatedImageActive,
        Self::RelatedPerformerActive,
        Self::PerformerCollectionFullCard,
        Self::ImageGalleryTile,
        Self::CategoryActiveCard,
        Self::CategoryTable,
        Self::GlossaryTable,
        Self::PerformerDetailPrimary,
        Self::PerformerMiniRow,
        Self::PerformerTable,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::VideoCollectionFullCard => "video_collection_full_card",
            Self::ImageCollectionFullCard => "image_collection_full_card",
            Self::VideoDetailPrimary => "video_detail_primary",
            Self::ImageDetailPrimary => "image_detail_primary",
            Self::VideoTable => "video_table",
            Self::ImageTable => "image_table",
            Self::VideoLiteCard => "video_lite_card",
            Self::ImageLiteCard => "image_lite_card",
            Self::PerformerLiteCard => "performer_lite_card",
            Self::RelatedVideoActive => "related_video_active",
            Self::RelatedImageActive => "related_image_active",
            Self::RelatedPerformerActive => "related_performer_active",
            Self::PerformerCollectionFullCard => "performer_collection_full_card",
            Self::ImageGalleryTile => "image_gallery_tile",
            Self::CategoryActiveCard => "category_active_card",
            Self::CategoryTable => "category_table",
            Self::GlossaryTable => "glossary_table",
            Self::PerformerDetailPrimary => "performer_detail_primary",
            Self::PerformerMiniRow => "performer_mini_row",
            Self::PerformerTable => "performer_table",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FitPolicyId {
    CenterCover,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ManagedMediaContract {
    pub contract_version: u32,
    pub profile_version: ProfileVersion,
    pub tiers: Vec<Tier>,
    pub families: Vec<Family>,
    pub fit_policies: Vec<FitPolicy>,
    pub roles: Vec<Role>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Tier {
    pub id: TierId,
    pub max_width: u32,
    pub max_height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ratio {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub tier: TierId,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Family {
    pub id: FamilyId,
    pub ratio: Ratio,
    pub targets: Vec<Target>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FitPolicy {
    pub id: FitPolicyId,
    pub object_fit: String,
    pub object_position: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Role {
    pub id: RoleId,
    pub family: FamilyId,
    pub tiers: Vec<TierId>,
    pub fit_policy: FitPolicyId,
}

pub fn load_contract() -> Result<ManagedMediaContract, String> {
    parse_and_validate_contract(CONTRACT_JSON)
}

pub fn target_for_role(
    contract: &ManagedMediaContract,
    role_id: RoleId,
    tier_id: TierId,
) -> Result<(FamilyId, u32, u32), String> {
    let role = contract
        .roles
        .iter()
        .find(|role| role.id == role_id)
        .ok_or_else(|| "Managed-media role is missing from the contract.".to_string())?;
    if !role.tiers.contains(&tier_id) {
        return Err(format!(
            "{} does not provide {}.",
            role_id.as_str(),
            tier_id.as_str()
        ));
    }
    let family = contract
        .families
        .iter()
        .find(|family| family.id == role.family)
        .ok_or_else(|| "Managed-media family is missing from the contract.".to_string())?;
    let target = family
        .targets
        .iter()
        .find(|target| target.tier == tier_id)
        .ok_or_else(|| "Managed-media target is missing from the contract.".to_string())?;
    Ok((family.id, target.width, target.height))
}

pub fn thumbnail_target_for_role(
    contract: &ManagedMediaContract,
    role_id: RoleId,
) -> Result<(FamilyId, u32, u32), String> {
    target_for_role(contract, role_id, TierId::Thumbnail)
}

pub fn parse_and_validate_contract(json: &str) -> Result<ManagedMediaContract, String> {
    let contract: ManagedMediaContract = serde_json::from_str(json)
        .map_err(|error| format!("Invalid managed-media JSON: {error}"))?;
    validate_contract(&contract)?;
    Ok(contract)
}

pub fn validate_contract(contract: &ManagedMediaContract) -> Result<(), String> {
    if contract.contract_version != CONTRACT_VERSION {
        return Err("Unknown managed-media contract version.".to_string());
    }
    if contract.profile_version != ProfileVersion::V1 {
        return Err("Unknown managed-media profile version.".to_string());
    }

    let tier_bounds = expected_tier_bounds();
    require_unique_exact(
        contract.tiers.iter().map(|tier| tier.id),
        TierId::ALL,
        "tier",
    )?;
    for tier in &contract.tiers {
        let expected = tier_bounds
            .get(&tier.id)
            .ok_or_else(|| "Unknown managed-media tier.".to_string())?;
        if tier.max_width == 0
            || tier.max_height == 0
            || (tier.max_width, tier.max_height) != *expected
        {
            return Err(format!(
                "{} bounding box is not approved.",
                tier.id.as_str()
            ));
        }
    }

    require_unique_exact(
        contract.families.iter().map(|family| family.id),
        FamilyId::ALL,
        "family",
    )?;
    for family in &contract.families {
        let (ratio, expected_targets) = expected_family(family.id);
        if family.ratio.width == 0
            || family.ratio.height == 0
            || (family.ratio.width, family.ratio.height) != ratio
        {
            return Err(format!("{} ratio is not canonical.", family.id.as_str()));
        }
        let target_ids = family.targets.iter().map(|target| target.tier);
        require_unique_exact_slice(
            target_ids,
            &expected_targets
                .iter()
                .map(|(tier, _, _)| *tier)
                .collect::<Vec<_>>(),
            "family target",
        )?;
        for target in &family.targets {
            let (_, expected_width, expected_height) = expected_targets
                .iter()
                .find(|(tier, _, _)| *tier == target.tier)
                .ok_or_else(|| {
                    format!(
                        "{} cannot contain {}.",
                        family.id.as_str(),
                        target.tier.as_str()
                    )
                })?;
            if target.width == 0
                || target.height == 0
                || target.width != *expected_width
                || target.height != *expected_height
            {
                return Err(format!(
                    "{} {} dimensions are not approved.",
                    family.id.as_str(),
                    target.tier.as_str()
                ));
            }
            if u64::from(target.width) * u64::from(family.ratio.height)
                != u64::from(target.height) * u64::from(family.ratio.width)
            {
                return Err(format!(
                    "{} {} does not match its canonical ratio.",
                    family.id.as_str(),
                    target.tier.as_str()
                ));
            }
            let bounds = tier_bounds
                .get(&target.tier)
                .ok_or_else(|| "Missing managed-media tier bounds.".to_string())?;
            if target.width > bounds.0 || target.height > bounds.1 {
                return Err(format!(
                    "{} {} exceeds its bounding box.",
                    family.id.as_str(),
                    target.tier.as_str()
                ));
            }
        }
    }

    if contract.fit_policies.len() != 1 {
        return Err("Exactly one managed-media fit policy is required.".to_string());
    }
    let fit = &contract.fit_policies[0];
    if fit.id != FitPolicyId::CenterCover
        || fit.object_fit != "cover"
        || fit.object_position != "center"
    {
        return Err("CENTER_COVER must use centered object-fit cover.".to_string());
    }

    require_unique_exact(
        contract.roles.iter().map(|role| role.id),
        RoleId::ALL,
        "role",
    )?;
    for role in &contract.roles {
        let (expected_family_id, expected_tiers) = expected_role(role.id);
        if role.family != expected_family_id
            || role.fit_policy != FitPolicyId::CenterCover
            || role.tiers != expected_tiers
        {
            return Err(format!("{} mapping is not approved.", role.id.as_str()));
        }
        let (_, family_targets) = expected_family(expected_family_id);
        if role.tiers.iter().any(|tier| {
            !family_targets
                .iter()
                .any(|(available, _, _)| available == tier)
        }) {
            return Err(format!(
                "{} uses a tier unavailable to {}.",
                role.id.as_str(),
                role.family.as_str()
            ));
        }
    }

    Ok(())
}

fn require_unique_exact<T, const N: usize>(
    actual: impl Iterator<Item = T>,
    expected: [T; N],
    label: &str,
) -> Result<(), String>
where
    T: Copy + Eq + std::hash::Hash,
{
    require_unique_exact_slice(actual, &expected, label)
}

fn require_unique_exact_slice<T>(
    actual: impl Iterator<Item = T>,
    expected: &[T],
    label: &str,
) -> Result<(), String>
where
    T: Copy + Eq + std::hash::Hash,
{
    let values = actual.collect::<Vec<_>>();
    let unique = values.iter().copied().collect::<HashSet<_>>();
    if unique.len() != values.len() {
        return Err(format!("Managed-media {label} contains a duplicate."));
    }
    let expected = expected.iter().copied().collect::<HashSet<_>>();
    if unique != expected {
        return Err(format!("Managed-media {label} set is incomplete."));
    }
    Ok(())
}

fn expected_tier_bounds() -> HashMap<TierId, (u32, u32)> {
    HashMap::from([
        (TierId::Thumbnail, (320, 320)),
        (TierId::Medium, (1280, 1280)),
        (TierId::Large, (1920, 1920)),
    ])
}

fn expected_family(id: FamilyId) -> ((u32, u32), Vec<(TierId, u32, u32)>) {
    match id {
        FamilyId::Landscape16_9 => (
            (16, 9),
            vec![
                (TierId::Thumbnail, 320, 180),
                (TierId::Medium, 1280, 720),
                (TierId::Large, 1920, 1080),
            ],
        ),
        FamilyId::Standard4_3 => (
            (4, 3),
            vec![(TierId::Thumbnail, 320, 240), (TierId::Medium, 1280, 960)],
        ),
        FamilyId::Square1_1 => (
            (1, 1),
            vec![(TierId::Thumbnail, 320, 320), (TierId::Medium, 1280, 1280)],
        ),
        FamilyId::Portrait4_5 => (
            (4, 5),
            vec![
                (TierId::Thumbnail, 256, 320),
                (TierId::Medium, 1024, 1280),
                (TierId::Large, 1536, 1920),
            ],
        ),
    }
}

fn expected_role(id: RoleId) -> (FamilyId, Vec<TierId>) {
    use FamilyId::{Landscape16_9, Portrait4_5, Square1_1, Standard4_3};
    use RoleId::*;
    use TierId::{Large, Medium, Thumbnail};

    match id {
        VideoCollectionFullCard | ImageCollectionFullCard => {
            (Landscape16_9, vec![Thumbnail, Medium])
        }
        VideoDetailPrimary | ImageDetailPrimary => (Landscape16_9, vec![Thumbnail, Medium, Large]),
        VideoTable | ImageTable => (Landscape16_9, vec![Thumbnail]),
        VideoLiteCard
        | ImageLiteCard
        | PerformerLiteCard
        | RelatedVideoActive
        | RelatedImageActive
        | RelatedPerformerActive => (Standard4_3, vec![Thumbnail, Medium]),
        PerformerCollectionFullCard | ImageGalleryTile | CategoryActiveCard => {
            (Square1_1, vec![Thumbnail, Medium])
        }
        CategoryTable | GlossaryTable => (Square1_1, vec![Thumbnail]),
        PerformerDetailPrimary => (Portrait4_5, vec![Thumbnail, Medium, Large]),
        PerformerMiniRow | PerformerTable => (Portrait4_5, vec![Thumbnail]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_and_validates_the_shared_contract() {
        let contract = load_contract().expect("shared contract");
        assert_eq!(contract.families.len(), 4);
        assert_eq!(contract.tiers.len(), 3);
        assert_eq!(contract.roles.len(), 20);
        assert_eq!(
            contract.profile_version.as_str(),
            "managed-media-profile-v1"
        );
    }

    #[test]
    fn rejects_unknown_fields_and_superseded_names() {
        let mut value: serde_json::Value = serde_json::from_str(CONTRACT_JSON).expect("json");
        value["unexpected"] = json!(true);
        assert!(parse_and_validate_contract(&value.to_string())
            .expect_err("unknown field")
            .contains("unknown field"));

        let mut value: serde_json::Value = serde_json::from_str(CONTRACT_JSON).expect("json");
        value["families"][0]["id"] = json!("WIDE_16_9");
        assert!(parse_and_validate_contract(&value.to_string())
            .expect_err("superseded family")
            .contains("unknown variant"));
    }

    #[test]
    fn rejects_invalid_dimensions_duplicates_and_prohibited_large_targets() {
        let mut value: serde_json::Value = serde_json::from_str(CONTRACT_JSON).expect("json");
        value["families"][0]["targets"][0]["height"] = json!(181);
        assert!(parse_and_validate_contract(&value.to_string())
            .expect_err("invalid dimensions")
            .contains("dimensions are not approved"));

        let mut value: serde_json::Value = serde_json::from_str(CONTRACT_JSON).expect("json");
        value["roles"][1]["id"] = value["roles"][0]["id"].clone();
        assert!(parse_and_validate_contract(&value.to_string())
            .expect_err("duplicate role")
            .contains("duplicate"));

        let mut value: serde_json::Value = serde_json::from_str(CONTRACT_JSON).expect("json");
        value["families"][1]["targets"]
            .as_array_mut()
            .expect("targets")
            .push(json!({"tier":"LARGE","width":1920,"height":1440}));
        assert!(parse_and_validate_contract(&value.to_string())
            .expect_err("standard large")
            .contains("target set is incomplete"));
    }

    #[test]
    fn native_fallback_is_not_a_standard_tier() {
        let mut value: serde_json::Value = serde_json::from_str(CONTRACT_JSON).expect("json");
        value["tiers"][0]["id"] = json!("NATIVE_FALLBACK");
        assert!(parse_and_validate_contract(&value.to_string())
            .expect_err("native fallback tier")
            .contains("unknown variant"));
    }

    #[test]
    fn resolves_role_targets_from_the_shared_contract() {
        let contract = load_contract().expect("shared contract");
        assert_eq!(
            target_for_role(&contract, RoleId::VideoDetailPrimary, TierId::Large)
                .expect("landscape large"),
            (FamilyId::Landscape16_9, 1920, 1080)
        );
        assert!(target_for_role(&contract, RoleId::ImageGalleryTile, TierId::Large).is_err());
    }
}
