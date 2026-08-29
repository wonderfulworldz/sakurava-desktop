use std::{
    fs::File,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceValidationError {
    Empty,
    UrlNotAllowed,
    NotAbsolute,
    MissingOrInvalid,
    NotRegularFile,
    NotReadable,
}

impl SourceValidationError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Empty => "MEDIA_PATH_EMPTY",
            Self::UrlNotAllowed => "MEDIA_URL_NOT_ALLOWED",
            Self::NotAbsolute => "MEDIA_PATH_NOT_ABSOLUTE",
            Self::MissingOrInvalid => "MEDIA_PATH_INVALID",
            Self::NotRegularFile => "MEDIA_PATH_NOT_REGULAR_FILE",
            Self::NotReadable => "MEDIA_PATH_NOT_READABLE",
        }
    }
}

pub fn validate_catalog_media_path(raw_path: &str) -> Result<PathBuf, SourceValidationError> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err(SourceValidationError::Empty);
    }
    if trimmed.contains("://") {
        return Err(SourceValidationError::UrlNotAllowed);
    }
    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err(SourceValidationError::NotAbsolute);
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| SourceValidationError::MissingOrInvalid)?;
    let metadata = canonical
        .metadata()
        .map_err(|_| SourceValidationError::MissingOrInvalid)?;
    if !metadata.is_file() {
        return Err(SourceValidationError::NotRegularFile);
    }
    File::open(&canonical).map_err(|_| SourceValidationError::NotReadable)?;
    Ok(canonical)
}

pub fn validate_external_subtitle_path(raw_path: &Path) -> Result<PathBuf, &'static str> {
    if !raw_path.is_absolute() {
        return Err("SUBTITLE_PATH_NOT_ABSOLUTE");
    }
    let canonical = raw_path
        .canonicalize()
        .map_err(|_| "SUBTITLE_PATH_INVALID")?;
    let metadata = canonical.metadata().map_err(|_| "SUBTITLE_PATH_INVALID")?;
    if !metadata.is_file() {
        return Err("SUBTITLE_PATH_NOT_REGULAR_FILE");
    }
    if !canonical
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("srt"))
    {
        return Err("SUBTITLE_EXTENSION_INVALID");
    }
    File::open(&canonical).map_err(|_| "SUBTITLE_PATH_NOT_READABLE")?;
    Ok(canonical)
}

#[cfg(target_os = "windows")]
pub fn open_media_file_with_default_app(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

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

    let file_path = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let result = unsafe {
        ShellExecuteW(
            0,
            std::ptr::null(),
            file_path.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result <= 32 {
        Err("Media file could not be opened".into())
    } else {
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn open_media_file_with_default_app(_path: &Path) -> Result<(), String> {
    Err("Media file open is unavailable on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn validates_only_readable_absolute_regular_files() {
        let root = std::env::temp_dir().join(format!(
            "sakurava-player-source-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let fixture = root.join("fixture.bin");
        fs::write(&fixture, b"fixture").unwrap();
        assert_eq!(
            validate_catalog_media_path(fixture.to_str().unwrap()).unwrap(),
            fixture.canonicalize().unwrap()
        );
        assert_eq!(
            validate_catalog_media_path("https://example.invalid/video.mp4"),
            Err(SourceValidationError::UrlNotAllowed)
        );
        assert_eq!(
            validate_catalog_media_path("relative.mp4"),
            Err(SourceValidationError::NotAbsolute)
        );
        assert_eq!(
            validate_catalog_media_path(root.to_str().unwrap()),
            Err(SourceValidationError::NotRegularFile)
        );
        fs::remove_file(fixture).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn external_subtitles_require_canonical_readable_srt_files() {
        let root = std::env::temp_dir().join(format!(
            "sakurava-player-subtitle-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let subtitle = root.join("fixture.SRT");
        let wrong_extension = root.join("fixture.txt");
        fs::write(&subtitle, b"1\n00:00:00,000 --> 00:00:01,000\nSakurava\n").unwrap();
        fs::write(&wrong_extension, b"not an srt").unwrap();

        assert_eq!(
            validate_external_subtitle_path(&subtitle).unwrap(),
            subtitle.canonicalize().unwrap()
        );
        assert_eq!(
            validate_external_subtitle_path(&wrong_extension),
            Err("SUBTITLE_EXTENSION_INVALID")
        );
        assert_eq!(
            validate_external_subtitle_path(Path::new("relative.srt")),
            Err("SUBTITLE_PATH_NOT_ABSOLUTE")
        );

        fs::remove_dir_all(root).unwrap();
    }
}
