use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use super::{
    contract::RoleId,
    identity::{OperationIdentity, ValidatedSha256, VariantClass},
};

pub const MANAGED_MEDIA_DIRECTORY: &str = "managed-media";
pub const MANAGED_MEDIA_LAYOUT_VERSION: &str = "v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedOutputExtension(String);

impl ValidatedOutputExtension {
    pub fn from_approved_allowlist(
        value: impl Into<String>,
        approved_allowlist: &[&str],
    ) -> Result<Self, String> {
        let value = value.into();
        if approved_allowlist.is_empty()
            || !approved_allowlist.iter().any(|approved| *approved == value)
        {
            return Err("Output extension is not in the supplied approved allowlist.".to_string());
        }
        validate_path_token(&value, "output extension")?;
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedMediaRoot {
    app_data_dir: PathBuf,
    root: PathBuf,
}

impl ManagedMediaRoot {
    pub fn from_app_data_dir(app_data_dir: impl AsRef<Path>) -> Result<Self, String> {
        let app_data_dir = app_data_dir.as_ref();
        if !app_data_dir.is_absolute() {
            return Err("Managed-media AppData root must be absolute.".to_string());
        }
        reject_non_normal_components(app_data_dir, true)?;
        reject_existing_reparse_ancestors(app_data_dir)?;
        let root = app_data_dir
            .join(MANAGED_MEDIA_DIRECTORY)
            .join(MANAGED_MEDIA_LAYOUT_VERSION);
        Ok(Self {
            app_data_dir: app_data_dir.to_path_buf(),
            root,
        })
    }

    pub fn app_data_dir(&self) -> &Path {
        &self.app_data_dir
    }

    pub fn as_path(&self) -> &Path {
        &self.root
    }

    pub fn resolve(&self, relative: impl AsRef<Path>) -> Result<PathBuf, String> {
        let relative = relative.as_ref();
        reject_non_normal_components(relative, false)?;
        if relative.as_os_str().is_empty() {
            return Err("Managed-media relative path cannot be empty.".to_string());
        }
        reject_existing_reparse_ancestors(&self.root)?;
        let resolved = self.root.join(relative);
        if !resolved.starts_with(&self.root) {
            return Err("Managed-media path escaped its protected root.".to_string());
        }
        reject_existing_reparse_ancestors(&resolved)?;
        Ok(resolved)
    }

    pub fn item_variant_path(
        &self,
        item_hash: &ValidatedSha256,
        source_generation_hash: &ValidatedSha256,
        role: RoleId,
        class: VariantClass,
        extension: &ValidatedOutputExtension,
    ) -> Result<PathBuf, String> {
        let prefix = &item_hash.as_str()[..2];
        let file_stem = match class {
            VariantClass::Standard(tier) => tier.file_stem(),
            VariantClass::NativeFallback => "native-fallback",
        };
        let relative = PathBuf::from("items")
            .join(prefix)
            .join(item_hash.as_str())
            .join(source_generation_hash.as_str())
            .join(role.as_str())
            .join(format!("{file_stem}.{}", extension.as_str()));
        self.resolve(relative)
    }

    pub fn staging_path(
        &self,
        operation: &OperationIdentity,
        variant_id: &ValidatedSha256,
    ) -> Result<PathBuf, String> {
        self.resolve(
            PathBuf::from(".staging")
                .join(operation.as_str())
                .join(format!("{}.tmp", variant_id.as_str())),
        )
    }

    pub fn quarantine_path(
        &self,
        bounded_bucket: &str,
        operation_or_item_id: &str,
    ) -> Result<PathBuf, String> {
        validate_path_token(bounded_bucket, "quarantine bucket")?;
        validate_path_token(operation_or_item_id, "quarantine identity")?;
        self.resolve(
            PathBuf::from(".quarantine")
                .join(bounded_bucket)
                .join(operation_or_item_id),
        )
    }
}

fn validate_path_token(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || value == "."
        || value == ".."
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        })
    {
        return Err(format!("{label} is not a normalized safe path token."));
    }
    Ok(())
}

fn reject_non_normal_components(path: &Path, absolute_allowed: bool) -> Result<(), String> {
    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            Component::Prefix(_) | Component::RootDir if absolute_allowed => {}
            Component::CurDir => {
                return Err(
                    "Managed-media paths cannot contain current-directory components.".to_string(),
                )
            }
            Component::ParentDir => {
                return Err("Managed-media paths cannot contain parent traversal.".to_string())
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err("Managed-media relative paths cannot be absolute.".to_string())
            }
        }
    }
    Ok(())
}

fn reject_existing_reparse_ancestors(path: &Path) -> Result<(), String> {
    let mut ancestors = path.ancestors().collect::<Vec<_>>();
    ancestors.reverse();
    for current in ancestors {
        if current.as_os_str().is_empty() {
            continue;
        }
        let metadata = match fs::symlink_metadata(&current) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Unable to inspect managed-media path ancestor {}: {error}",
                    current.display()
                ))
            }
        };
        if metadata.file_type().is_symlink() || is_windows_reparse_point(&metadata) {
            return Err(format!(
                "Managed-media path ancestor is a symlink or reparse point: {}",
                current.display()
            ));
        }
    }
    Ok(())
}

#[cfg(windows)]
fn is_windows_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_windows_reparse_point(_metadata: &fs::Metadata) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::managed_media::contract::TierId;

    fn hash(character: char) -> ValidatedSha256 {
        ValidatedSha256::new(character.to_string().repeat(64)).expect("hash")
    }

    fn unique_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sakurava-managed-media-path-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    #[test]
    fn resolves_canonical_root_and_fixed_variant_layout() {
        let app_data = unique_root("layout");
        fs::create_dir_all(&app_data).expect("app data");
        let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");
        let extension = ValidatedOutputExtension::from_approved_allowlist("future", &["future"])
            .expect("extension");
        let path = root
            .item_variant_path(
                &hash('a'),
                &hash('b'),
                RoleId::VideoDetailPrimary,
                VariantClass::Standard(TierId::Medium),
                &extension,
            )
            .expect("variant path");
        assert!(path.starts_with(root.as_path()));
        assert!(path.ends_with(Path::new(
            "items/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/video_detail_primary/medium.future"
        )));
        assert!(!path.exists());
        fs::remove_dir_all(app_data).expect("cleanup");
    }

    #[test]
    fn builds_native_staging_and_quarantine_paths_without_creating_them() {
        let app_data = unique_root("bounded");
        fs::create_dir_all(&app_data).expect("app data");
        let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");
        let extension = ValidatedOutputExtension::from_approved_allowlist("future", &["future"])
            .expect("extension");
        assert!(root
            .item_variant_path(
                &hash('c'),
                &hash('d'),
                RoleId::PerformerTable,
                VariantClass::NativeFallback,
                &extension,
            )
            .expect("native")
            .ends_with("native-fallback.future"));
        assert!(root
            .staging_path(
                &OperationIdentity::new("operation-1").expect("operation"),
                &hash('e')
            )
            .expect("staging")
            .ends_with(format!("{}.tmp", "e".repeat(64))));
        assert!(root
            .quarantine_path("2026-07", "operation-1")
            .expect("quarantine")
            .ends_with(Path::new(".quarantine/2026-07/operation-1")));
        fs::remove_dir_all(app_data).expect("cleanup");
    }

    #[test]
    fn rejects_absolute_relative_paths_traversal_and_unapproved_extensions() {
        let app_data = unique_root("reject");
        fs::create_dir_all(&app_data).expect("app data");
        let root = ManagedMediaRoot::from_app_data_dir(&app_data).expect("root");
        assert!(root.resolve(Path::new("../escape")).is_err());
        assert!(root.resolve(&app_data).is_err());
        assert!(ValidatedOutputExtension::from_approved_allowlist("jpg", &["future"]).is_err());
        assert!(
            ValidatedOutputExtension::from_approved_allowlist("../future", &["../future"]).is_err()
        );
        fs::remove_dir_all(app_data).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_existing_symlink_ancestors() {
        use std::os::unix::fs::symlink;

        let base = unique_root("symlink");
        let outside = unique_root("outside");
        fs::create_dir_all(&base).expect("base");
        fs::create_dir_all(&outside).expect("outside");
        symlink(&outside, base.join("linked")).expect("symlink");
        assert!(ManagedMediaRoot::from_app_data_dir(base.join("linked")).is_err());
        fs::remove_dir_all(base).expect("cleanup base");
        fs::remove_dir_all(outside).expect("cleanup outside");
    }

    #[cfg(windows)]
    #[test]
    fn rejects_existing_reparse_ancestors_when_creation_is_available() {
        use std::os::windows::fs::symlink_dir;

        let base = unique_root("reparse");
        let outside = unique_root("outside");
        fs::create_dir_all(&base).expect("base");
        fs::create_dir_all(&outside).expect("outside");
        match symlink_dir(&outside, base.join("linked")) {
            Ok(()) => {
                assert!(ManagedMediaRoot::from_app_data_dir(base.join("linked")).is_err());
                fs::remove_dir_all(base).expect("cleanup base");
            }
            Err(error)
                if error.kind() == std::io::ErrorKind::PermissionDenied
                    || error.raw_os_error() == Some(1314) =>
            {
                eprintln!("reparse-point creation not permitted; rejection test not measurable");
                fs::remove_dir_all(base).expect("cleanup base");
            }
            Err(error) => panic!("unexpected reparse-point setup failure: {error}"),
        }
        fs::remove_dir_all(outside).expect("cleanup outside");
    }

    #[cfg(windows)]
    #[test]
    fn accepts_canonical_extended_drive_app_data_roots() {
        use std::path::Prefix;

        let app_data = unique_root("extended-drive");
        fs::create_dir_all(&app_data).expect("app data");
        let canonical = app_data.canonicalize().expect("canonical app data");
        assert!(matches!(
            canonical.components().next(),
            Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::VerbatimDisk(_))
        ));

        let root = ManagedMediaRoot::from_app_data_dir(&canonical).expect("managed root");
        assert_eq!(root.app_data_dir(), canonical.as_path());
        assert_eq!(
            root.as_path(),
            canonical.join(MANAGED_MEDIA_DIRECTORY).join(MANAGED_MEDIA_LAYOUT_VERSION)
        );

        fs::remove_dir_all(app_data).expect("cleanup app data");
    }
}
