use super::contract::{ProfileVersion, RoleId, TierId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OwnerKind {
    Video,
    Image,
    Performer,
    Category,
    Glossary,
}

impl OwnerKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::Image => "image",
            Self::Performer => "performer",
            Self::Category => "category",
            Self::Glossary => "glossary",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SlotKind {
    PrimaryVisual,
    CollectionCard,
    LiteCard,
    TableThumbnail,
    GalleryTile,
    RelatedCard,
    MiniRow,
}

impl SlotKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PrimaryVisual => "primary_visual",
            Self::CollectionCard => "collection_card",
            Self::LiteCard => "lite_card",
            Self::TableThumbnail => "table_thumbnail",
            Self::GalleryTile => "gallery_tile",
            Self::RelatedCard => "related_card",
            Self::MiniRow => "mini_row",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SourceLocatorKind {
    ExternalFile,
    ExternalDirectoryEntry,
    ExternalUrl,
}

impl SourceLocatorKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExternalFile => "external_file",
            Self::ExternalDirectoryEntry => "external_directory_entry",
            Self::ExternalUrl => "external_url",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct OwnerIdentifier(String);

impl OwnerIdentifier {
    pub fn new(value: impl Into<String>) -> Result<Self, String> {
        Ok(Self(validate_identity_component(
            value.into(),
            "owner identifier",
            512,
        )?))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SlotToken(String);

impl SlotToken {
    pub fn new(value: impl Into<String>) -> Result<Self, String> {
        Ok(Self(validate_file_token(value.into(), "slot token", 128)?))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RoleIdentifier(RoleId);

impl RoleIdentifier {
    pub const fn new(role: RoleId) -> Self {
        Self(role)
    }

    pub const fn role(self) -> RoleId {
        self.0
    }

    pub const fn as_str(self) -> &'static str {
        self.0.as_str()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ValidatedSha256(String);

impl ValidatedSha256 {
    pub fn new(value: impl Into<String>) -> Result<Self, String> {
        let value = value.into();
        if value.len() != 64
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(
                "SHA-256 value must be exactly 64 normalized lowercase hexadecimal characters."
                    .to_string(),
            );
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SourceFingerprint(ValidatedSha256);

impl SourceFingerprint {
    pub const fn new(hash: ValidatedSha256) -> Self {
        Self(hash)
    }

    pub fn as_hash(&self) -> &ValidatedSha256 {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ManagedItemKey {
    owner_kind: OwnerKind,
    owner_id: OwnerIdentifier,
    slot_kind: SlotKind,
    slot_token: SlotToken,
}

impl ManagedItemKey {
    pub fn new(
        owner_kind: OwnerKind,
        owner_id: OwnerIdentifier,
        slot_kind: SlotKind,
        slot_token: SlotToken,
    ) -> Self {
        Self {
            owner_kind,
            owner_id,
            slot_kind,
            slot_token,
        }
    }

    pub fn preimage(&self) -> String {
        encode_preimage(&[
            ("version", "managed-item-key-v1"),
            ("owner_kind", self.owner_kind.as_str()),
            ("owner_id", self.owner_id.as_str()),
            ("slot_kind", self.slot_kind.as_str()),
            ("slot_token", self.slot_token.as_str()),
        ])
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VariantClass {
    Standard(TierId),
    NativeFallback,
}

impl VariantClass {
    fn label(self) -> &'static str {
        match self {
            Self::Standard(_) => "standard",
            Self::NativeFallback => "native_fallback",
        }
    }

    fn tier_label(self) -> &'static str {
        match self {
            Self::Standard(tier) => tier.as_str(),
            Self::NativeFallback => "none",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct VariantIdentity {
    item_key: ManagedItemKey,
    role: RoleIdentifier,
    source_fingerprint: SourceFingerprint,
    profile_version: ProfileVersion,
    class: VariantClass,
}

impl VariantIdentity {
    pub fn new(
        item_key: ManagedItemKey,
        role: RoleIdentifier,
        source_fingerprint: SourceFingerprint,
        profile_version: ProfileVersion,
        class: VariantClass,
    ) -> Self {
        Self {
            item_key,
            role,
            source_fingerprint,
            profile_version,
            class,
        }
    }

    pub fn preimage(&self) -> String {
        let item_preimage = self.item_key.preimage();
        encode_preimage(&[
            ("version", "managed-variant-key-v1"),
            ("item_preimage", &item_preimage),
            ("role", self.role.as_str()),
            (
                "source_fingerprint",
                self.source_fingerprint.as_hash().as_str(),
            ),
            ("profile_version", self.profile_version.as_str()),
            ("variant_class", self.class.label()),
            ("tier", self.class.tier_label()),
        ])
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct OperationIdentity(String);

impl OperationIdentity {
    pub fn new(value: impl Into<String>) -> Result<Self, String> {
        Ok(Self(validate_file_token(
            value.into(),
            "operation identifier",
            128,
        )?))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

pub fn source_locator_preimage(kind: SourceLocatorKind, locator_hash: &ValidatedSha256) -> String {
    encode_preimage(&[
        ("version", "source-locator-v1"),
        ("kind", kind.as_str()),
        ("locator_hash", locator_hash.as_str()),
    ])
}

fn validate_identity_component(
    value: String,
    label: &str,
    max_len: usize,
) -> Result<String, String> {
    if value.is_empty() || value.trim() != value || value.contains('\0') || value.len() > max_len {
        return Err(format!("{label} is empty or not normalized."));
    }
    Ok(value)
}

fn validate_file_token(value: String, label: &str, max_len: usize) -> Result<String, String> {
    if value.is_empty()
        || value.len() > max_len
        || value == "."
        || value == ".."
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        })
    {
        return Err(format!(
            "{label} must be a normalized lowercase safe token."
        ));
    }
    Ok(value)
}

fn encode_preimage(fields: &[(&str, &str)]) -> String {
    let mut output = String::new();
    for (name, value) in fields {
        output.push_str(&name.len().to_string());
        output.push(':');
        output.push_str(name);
        output.push('=');
        output.push_str(&value.len().to_string());
        output.push(':');
        output.push_str(value);
        output.push('|');
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hash(byte: char) -> ValidatedSha256 {
        ValidatedSha256::new(byte.to_string().repeat(64)).expect("hash")
    }

    fn item(slot: &str) -> ManagedItemKey {
        ManagedItemKey::new(
            OwnerKind::Video,
            OwnerIdentifier::new("video-record-1").expect("owner"),
            SlotKind::PrimaryVisual,
            SlotToken::new(slot).expect("slot"),
        )
    }

    #[test]
    fn accepts_only_normalized_lowercase_sha256_hex() {
        assert_eq!(hash('a').as_str().len(), 64);
        assert!(ValidatedSha256::new("A".repeat(64)).is_err());
        assert!(ValidatedSha256::new("g".repeat(64)).is_err());
        assert!(ValidatedSha256::new("a".repeat(63)).is_err());
    }

    #[test]
    fn preimages_are_deterministic_and_separate_owner_and_slot_fields() {
        let first = item("primary");
        let same = item("primary");
        let other_slot = item("secondary");
        assert_eq!(first.preimage(), same.preimage());
        assert_ne!(first.preimage(), other_slot.preimage());

        let other_owner = ManagedItemKey::new(
            OwnerKind::Image,
            OwnerIdentifier::new("video-record-1").expect("owner"),
            SlotKind::PrimaryVisual,
            SlotToken::new("primary").expect("slot"),
        );
        assert_ne!(first.preimage(), other_owner.preimage());
    }

    #[test]
    fn variant_preimage_includes_role_profile_source_and_class() {
        let fingerprint = SourceFingerprint::new(hash('b'));
        let medium = VariantIdentity::new(
            item("primary"),
            RoleIdentifier::new(RoleId::VideoDetailPrimary),
            fingerprint.clone(),
            ProfileVersion::V1,
            VariantClass::Standard(TierId::Medium),
        );
        let large = VariantIdentity::new(
            item("primary"),
            RoleIdentifier::new(RoleId::VideoDetailPrimary),
            fingerprint,
            ProfileVersion::V1,
            VariantClass::Standard(TierId::Large),
        );
        assert_eq!(medium.preimage(), medium.preimage());
        assert_ne!(medium.preimage(), large.preimage());
        assert!(medium.preimage().contains("video_detail_primary"));
        assert!(medium.preimage().contains("managed-media-profile-v1"));
    }

    #[test]
    fn rejects_empty_or_path_like_identity_tokens() {
        assert!(OwnerIdentifier::new("").is_err());
        assert!(OwnerIdentifier::new(" owner").is_err());
        assert!(SlotToken::new("").is_err());
        assert!(SlotToken::new("../slot").is_err());
        assert!(OperationIdentity::new("operation/one").is_err());
    }

    #[test]
    fn source_locator_identity_uses_kind_and_validated_hash_not_an_absolute_path() {
        let locator = source_locator_preimage(SourceLocatorKind::ExternalFile, &hash('c'));
        assert!(locator.contains("external_file"));
        assert!(!locator.contains(":\\"));
    }
}
