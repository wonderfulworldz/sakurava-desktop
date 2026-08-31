use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum OutputCategory {
    BackupExport,
    Export,
    VideoScreenshot,
    ContactSheet,
}

impl OutputCategory {
    pub fn child_name(self) -> &'static str {
        match self {
            Self::BackupExport => "Backups",
            Self::Export => "Exports",
            Self::VideoScreenshot => "Video Screenshots",
            Self::ContactSheet => "Contact Sheets",
        }
    }
}

const OUTPUT_CATEGORIES: [OutputCategory; 4] = [
    OutputCategory::BackupExport,
    OutputCategory::Export,
    OutputCategory::VideoScreenshot,
    OutputCategory::ContactSheet,
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalOutputPaths {
    pub parent_path: String,
    pub child_paths: BTreeMap<OutputCategory, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedOutputDirectory {
    pub category: OutputCategory,
    pub directory_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealOutputResult {
    pub file_path: String,
    pub folder_path: String,
    pub opened: bool,
}

pub fn validate_parent_and_children(parent_path: &str) -> Result<GlobalOutputPaths, String> {
    let parent = validate_parent(parent_path)?;
    let mut child_paths = BTreeMap::new();
    for category in OUTPUT_CATEGORIES {
        let child = ensure_child(&parent, category)?;
        child_paths.insert(category, display_path(&child));
    }
    Ok(GlobalOutputPaths {
        parent_path: display_path(&parent),
        child_paths,
    })
}

pub fn prepare_category(
    parent_path: &str,
    category: OutputCategory,
) -> Result<PreparedOutputDirectory, String> {
    let parent = validate_parent(parent_path)?;
    let child = ensure_child(&parent, category)?;
    Ok(PreparedOutputDirectory {
        category,
        directory_path: display_path(&child),
    })
}

pub fn default_file_path(
    parent_path: &str,
    category: OutputCategory,
    file_name: &str,
) -> Result<String, String> {
    let leaf = validated_file_name(file_name)?;
    let prepared = prepare_category(parent_path, category)?;
    Ok(display_path(
        &PathBuf::from(prepared.directory_path).join(leaf),
    ))
}

pub fn reveal_file(file_path: &str) -> Result<RevealOutputResult, String> {
    let file = PathBuf::from(file_path.trim());
    let metadata = fs::metadata(&file).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => "OUTPUT_FILE_NOT_FOUND".to_string(),
        std::io::ErrorKind::PermissionDenied => "OUTPUT_FILE_INACCESSIBLE".to_string(),
        _ => format!("OUTPUT_FILE_CHECK_FAILED: {error}"),
    })?;
    if !metadata.is_file() {
        return Err("OUTPUT_FILE_NOT_REGULAR".into());
    }
    let file = file
        .canonicalize()
        .map_err(|error| format!("OUTPUT_FILE_CHECK_FAILED: {error}"))?;
    let folder = file
        .parent()
        .ok_or_else(|| "OUTPUT_FOLDER_UNAVAILABLE".to_string())?
        .to_path_buf();
    reveal_file_in_explorer(&file)?;
    Ok(RevealOutputResult {
        file_path: display_path(&file),
        folder_path: display_path(&folder),
        opened: true,
    })
}

pub fn sanitize_file_component(value: &str, fallback: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim_matches([' ', '.'])
        .trim()
        .chars()
        .take(80)
        .collect::<String>();
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized
    }
}

pub fn publish_unique_file(
    temporary_path: &Path,
    directory: &Path,
    base_name: &str,
    extension: &str,
) -> Result<PathBuf, String> {
    let extension = extension.trim_start_matches('.');
    if extension.is_empty()
        || extension
            .chars()
            .any(|value| !value.is_ascii_alphanumeric())
    {
        return Err("OUTPUT_FILE_EXTENSION_INVALID".into());
    }
    for suffix in 0..10_000u32 {
        let file_name = if suffix == 0 {
            format!("{base_name}.{extension}")
        } else {
            format!("{base_name} ({suffix}).{extension}")
        };
        let destination = directory.join(file_name);
        let mut source = fs::File::open(temporary_path)
            .map_err(|error| format!("OUTPUT_TEMP_FILE_READ_FAILED: {error}"))?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination)
        {
            Ok(mut output) => {
                if let Err(error) = io::copy(&mut source, &mut output) {
                    drop(output);
                    let _ = fs::remove_file(&destination);
                    return Err(format!("OUTPUT_FILE_WRITE_FAILED: {error}"));
                }
                output
                    .sync_all()
                    .map_err(|error| format!("OUTPUT_FILE_SYNC_FAILED: {error}"))?;
                return Ok(destination);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("OUTPUT_FILE_CREATE_FAILED: {error}")),
        }
    }
    Err("OUTPUT_FILE_COLLISION_LIMIT_REACHED".into())
}

fn validate_parent(parent_path: &str) -> Result<PathBuf, String> {
    let trimmed = parent_path.trim();
    if trimmed.is_empty() {
        return Err("GLOBAL_OUTPUT_PARENT_NOT_CONFIGURED".into());
    }
    let parent = PathBuf::from(trimmed);
    if !parent.is_absolute() {
        return Err("GLOBAL_OUTPUT_PARENT_NOT_ABSOLUTE".into());
    }
    let metadata = fs::metadata(&parent).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => "GLOBAL_OUTPUT_PARENT_NOT_FOUND".to_string(),
        std::io::ErrorKind::PermissionDenied => "GLOBAL_OUTPUT_PARENT_INACCESSIBLE".to_string(),
        _ => format!("GLOBAL_OUTPUT_PARENT_CHECK_FAILED: {error}"),
    })?;
    if !metadata.is_dir() {
        return Err("GLOBAL_OUTPUT_PARENT_NOT_DIRECTORY".into());
    }
    parent
        .canonicalize()
        .map_err(|error| format!("GLOBAL_OUTPUT_PARENT_CHECK_FAILED: {error}"))
}

fn ensure_child(parent: &Path, category: OutputCategory) -> Result<PathBuf, String> {
    let child = parent.join(category.child_name());
    fs::create_dir_all(&child).map_err(|error| match error.kind() {
        std::io::ErrorKind::PermissionDenied => "GLOBAL_OUTPUT_CHILD_INACCESSIBLE".to_string(),
        _ => format!("GLOBAL_OUTPUT_CHILD_CREATE_FAILED: {error}"),
    })?;
    let canonical = child
        .canonicalize()
        .map_err(|error| format!("GLOBAL_OUTPUT_CHILD_CHECK_FAILED: {error}"))?;
    if !canonical.starts_with(parent) {
        return Err("GLOBAL_OUTPUT_CHILD_ESCAPED_PARENT".into());
    }
    Ok(canonical)
}

fn validated_file_name(file_name: &str) -> Result<&str, String> {
    let trimmed = file_name.trim();
    let path = Path::new(trimmed);
    if trimmed.is_empty()
        || path.is_absolute()
        || path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err("OUTPUT_FILE_NAME_INVALID".into());
    }
    Ok(trimmed)
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(target_os = "windows")]
fn reveal_file_in_explorer(path: &Path) -> Result<(), String> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt};
    const SW_SHOWNORMAL: i32 = 1;
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }
    let wide = |value: &OsStr| {
        value
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>()
    };
    let explorer = wide(OsStr::new("explorer.exe"));
    let parameters = wide(OsStr::new(&format!("/select,\"{}\"", path.display())));
    let result = unsafe {
        ShellExecuteW(
            0,
            std::ptr::null(),
            explorer.as_ptr(),
            parameters.as_ptr(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result <= 32 {
        Err("OUTPUT_FOLDER_OPEN_FAILED".into())
    } else {
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn reveal_file_in_explorer(_path: &Path) -> Result<(), String> {
    Err("OUTPUT_FOLDER_OPEN_UNAVAILABLE".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sakurava-output-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn creates_only_the_four_stable_output_children() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let result = validate_parent_and_children(root.to_str().unwrap()).unwrap();
        assert_eq!(result.child_paths.len(), 4);
        assert!(result.child_paths[&OutputCategory::BackupExport].ends_with("Backups"));
        assert!(result.child_paths[&OutputCategory::Export].ends_with("Exports"));
        assert!(result.child_paths[&OutputCategory::VideoScreenshot].ends_with("Video Screenshots"));
        assert!(result.child_paths[&OutputCategory::ContactSheet].ends_with("Contact Sheets"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_traversal_file_names_and_sanitizes_windows_characters() {
        assert!(validated_file_name("..\\escape.png").is_err());
        assert_eq!(sanitize_file_component("A:B/C*D", "Video"), "A_B_C_D");
    }

    #[test]
    fn publishes_repeated_files_without_overwrite() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let temporary = root.join("temporary.png");
        fs::write(&temporary, b"png-one").unwrap();
        let first = publish_unique_file(&temporary, &root, "Screenshot", "png").unwrap();
        let second = publish_unique_file(&temporary, &root, "Screenshot", "png").unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(first).unwrap(), b"png-one");
        assert_eq!(fs::read(second).unwrap(), b"png-one");
        fs::remove_dir_all(root).unwrap();
    }
}
