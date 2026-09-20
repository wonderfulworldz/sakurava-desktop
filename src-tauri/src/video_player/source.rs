use std::{
    fs::{self, File},
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
    if !is_supported_subtitle_extension(&canonical) {
        return Err("SUBTITLE_EXTENSION_INVALID");
    }
    File::open(&canonical).map_err(|_| "SUBTITLE_PATH_NOT_READABLE")?;
    Ok(canonical)
}

fn is_supported_subtitle_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| matches!(value.to_ascii_lowercase().as_str(), "srt" | "ass" | "ssa"))
}

pub fn discover_sidecar_subtitles(video_path: &Path) -> Result<Vec<PathBuf>, String> {
    let canonical_video = video_path
        .canonicalize()
        .map_err(|_| "SIDECAR_VIDEO_PATH_INVALID".to_string())?;
    let parent = canonical_video
        .parent()
        .ok_or_else(|| "SIDECAR_VIDEO_PARENT_INVALID".to_string())?;
    let video_stem = canonical_video
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "SIDECAR_VIDEO_NAME_INVALID".to_string())?
        .to_ascii_lowercase();
    let prefix = format!("{video_stem}.");
    let mut matches = Vec::new();
    for entry in
        fs::read_dir(parent).map_err(|error| format!("SIDECAR_DIRECTORY_READ_FAILED: {error}"))?
    {
        let entry = entry.map_err(|error| format!("SIDECAR_ENTRY_READ_FAILED: {error}"))?;
        let path = entry.path();
        if !is_supported_subtitle_extension(&path) {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if stem != video_stem && !stem.starts_with(&prefix) {
            continue;
        }
        if let Ok(canonical) = validate_external_subtitle_path(&path) {
            matches.push((stem != video_stem, canonical));
        }
    }
    matches.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    Ok(matches.into_iter().map(|(_, path)| path).collect())
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
    fn external_subtitles_require_canonical_readable_supported_files() {
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
        let ass = root.join("fixture.ass");
        fs::write(&subtitle, b"1\n00:00:00,000 --> 00:00:01,000\nSakurava\n").unwrap();
        fs::write(&wrong_extension, b"not an srt").unwrap();
        fs::write(&ass, b"[Script Info]\nTitle: Fixture\n").unwrap();

        assert_eq!(
            validate_external_subtitle_path(&ass).unwrap(),
            ass.canonicalize().unwrap()
        );
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

    #[test]
    fn sidecar_discovery_is_direct_bounded_and_exact_stem_based() {
        let root = std::env::temp_dir().join(format!(
            "sakurava-player-sidecar-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("nested")).unwrap();
        let video = root.join("movie.mkv");
        fs::write(&video, b"video").unwrap();
        for name in [
            "movie.srt",
            "movie.en.srt",
            "movie.id.ass",
            "movie.ja.ssa",
            "movie-other.srt",
            "different_movie.srt",
        ] {
            fs::write(root.join(name), b"subtitle").unwrap();
        }
        fs::write(root.join("nested").join("movie.srt"), b"nested").unwrap();

        let found = discover_sidecar_subtitles(&video).unwrap();
        let names = found
            .iter()
            .filter_map(|path| path.file_name()?.to_str())
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            vec!["movie.srt", "movie.en.srt", "movie.id.ass", "movie.ja.ssa"]
        );
        fs::remove_dir_all(root).unwrap();
    }
}
