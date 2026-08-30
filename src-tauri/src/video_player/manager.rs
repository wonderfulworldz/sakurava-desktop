use std::{
    ffi::c_void,
    io::{BufRead, BufReader, Write},
    os::windows::io::AsRawHandle,
    path::{Path, PathBuf},
    process::{ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    },
};

use super::ipc::{MainToHostKind, MainToHostMessage, OpenSourcePayload, PROTOCOL_VERSION};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPlayerOpenInput {
    pub source_identity: String,
    pub display_name: String,
    pub resolution: String,
    pub duration_label: String,
    #[serde(default)]
    pub intent: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TrustedOpenRequest {
    pub source_identity: String,
    pub canonical_path: PathBuf,
    pub display_name: String,
    pub resolution: String,
    pub intent: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPlayerOpenResult {
    pub mode: String,
    pub host_pid: u32,
    pub session_id: String,
    pub source_identity: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPlayerCommandError {
    pub code: String,
    pub message: String,
}

struct ActiveHost {
    source_identity: String,
    session_id: String,
    pid: u32,
    stdin: Arc<Mutex<ChildStdin>>,
}

struct KillOnCloseJob(HANDLE);

// The job handle is exclusively owned by this RAII wrapper and is moved, not
// shared, into the child-waiter thread so dropping it terminates descendants.
unsafe impl Send for KillOnCloseJob {}

impl KillOnCloseJob {
    fn assign(child: &std::process::Child) -> Result<Self, VideoPlayerCommandError> {
        let handle = unsafe { CreateJobObjectW(None, None) }.map_err(|cause| {
            error(
                "MEDIA_HOST_JOB_FAILED",
                &format!("Could not create Video Player process ownership: {cause}"),
            )
        })?;
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if let Err(cause) = configured {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Err(error(
                "MEDIA_HOST_JOB_FAILED",
                &format!("Could not configure Video Player process ownership: {cause}"),
            ));
        }
        let process = HANDLE(child.as_raw_handle() as *mut c_void);
        if let Err(cause) = unsafe { AssignProcessToJobObject(handle, process) } {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Err(error(
                "MEDIA_HOST_JOB_FAILED",
                &format!("Could not attach Video Player host ownership: {cause}"),
            ));
        }
        Ok(Self(handle))
    }
}

impl Drop for KillOnCloseJob {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

#[derive(Clone)]
pub struct PlaybackHostManager {
    active: Arc<Mutex<Option<ActiveHost>>>,
    resource_root: Arc<PathBuf>,
}

impl PlaybackHostManager {
    pub fn new(resource_root: PathBuf) -> Self {
        Self {
            active: Arc::new(Mutex::new(None)),
            resource_root: Arc::new(resource_root),
        }
    }

    pub fn open(
        &self,
        request: TrustedOpenRequest,
    ) -> Result<VideoPlayerOpenResult, VideoPlayerCommandError> {
        let mut active = self.active.lock().map_err(|_| {
            error(
                "HOST_STATE_UNAVAILABLE",
                "Video Player host state is unavailable",
            )
        })?;
        if let Some(host) = active.as_mut() {
            if request.intent == "focusExisting" {
                write_message(&host.stdin, MainToHostKind::FocusMain)?;
                return Ok(VideoPlayerOpenResult {
                    mode: "focused".into(),
                    host_pid: host.pid,
                    session_id: host.session_id.clone(),
                    source_identity: host.source_identity.clone(),
                });
            }
            if host.source_identity != request.source_identity {
                if request.intent == "replace" {
                    write_message(
                        &host.stdin,
                        MainToHostKind::ReplaceSource(OpenSourcePayload {
                            session_id: host.session_id.clone(),
                            source_identity: request.source_identity.clone(),
                            canonical_path: request.canonical_path.display().to_string(),
                            display_name: request.display_name,
                            resolution: request.resolution,
                        }),
                    )?;
                    host.source_identity = request.source_identity.clone();
                    return Ok(VideoPlayerOpenResult {
                        mode: "replaced".into(),
                        host_pid: host.pid,
                        session_id: host.session_id.clone(),
                        source_identity: request.source_identity,
                    });
                }
                return Err(error(
                    "ACTIVE_SESSION_DIFFERENT_SOURCE",
                    "Another built-in Video Player source is already active",
                ));
            }
            write_message(&host.stdin, MainToHostKind::FocusMain)?;
            return Ok(VideoPlayerOpenResult {
                mode: "focused".into(),
                host_pid: host.pid,
                session_id: host.session_id.clone(),
                source_identity: host.source_identity.clone(),
            });
        }

        let host_executable = resolve_media_host_executable(&self.resource_root)?;
        let engine_root = resolve_engine_root(&self.resource_root)?;
        let assets_root = resolve_player_assets_root(&self.resource_root)?;
        let webview_data_root = resolve_webview_data_root()?;
        let mut child = Command::new(&host_executable)
            .arg("--engine-root")
            .arg(&engine_root)
            .arg("--assets-root")
            .arg(&assets_root)
            .arg("--webview-data-root")
            .arg(&webview_data_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|cause| {
                error(
                    "MEDIA_HOST_SPAWN_FAILED",
                    &format!("Could not start Video Player host: {cause}"),
                )
            })?;
        let pid = child.id();
        let job = match KillOnCloseJob::assign(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or_else(|| {
            error(
                "MEDIA_HOST_PIPE_FAILED",
                "Video Player host input pipe is unavailable",
            )
        })?));
        let stdout = child.stdout.take().ok_or_else(|| {
            error(
                "MEDIA_HOST_PIPE_FAILED",
                "Video Player host output pipe is unavailable",
            )
        })?;
        let session_id = unique_id("session");

        write_message(
            &stdin,
            MainToHostKind::Handshake {
                parent_pid: std::process::id(),
            },
        )?;
        write_message(
            &stdin,
            MainToHostKind::OpenSource(OpenSourcePayload {
                session_id: session_id.clone(),
                source_identity: request.source_identity.clone(),
                canonical_path: request.canonical_path.display().to_string(),
                display_name: request.display_name,
                resolution: request.resolution,
            }),
        )?;

        *active = Some(ActiveHost {
            source_identity: request.source_identity.clone(),
            session_id: session_id.clone(),
            pid,
            stdin: stdin.clone(),
        });
        let shared = self.active.clone();
        thread::spawn(move || {
            let _job = job;
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(message) => eprintln!("[video-player-host:{pid}] {message}"),
                    Err(error) => {
                        eprintln!("[video-player-host:{pid}] IPC read failed: {error}");
                        break;
                    }
                }
            }
            let status = child.wait();
            eprintln!("[video-player-host:{pid}] exited: {status:?}");
            if let Ok(mut current) = shared.lock() {
                if current.as_ref().is_some_and(|host| host.pid == pid) {
                    *current = None;
                }
            }
        });
        Ok(VideoPlayerOpenResult {
            mode: "opened".into(),
            host_pid: pid,
            session_id,
            source_identity: request.source_identity,
        })
    }

    pub fn shutdown(&self) {
        if let Ok(mut active) = self.active.lock() {
            if let Some(host) = active.as_ref() {
                let _ = write_message(&host.stdin, MainToHostKind::Shutdown);
            }
            *active = None;
        }
    }
}

impl Default for PlaybackHostManager {
    fn default() -> Self {
        let resource_root = std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."));
        Self::new(resource_root)
    }
}

fn write_message(
    stdin: &Arc<Mutex<ChildStdin>>,
    kind: MainToHostKind,
) -> Result<(), VideoPlayerCommandError> {
    let message = MainToHostMessage {
        protocol_version: PROTOCOL_VERSION,
        request_id: unique_id("request"),
        kind,
    };
    let mut writer = stdin.lock().map_err(|_| {
        error(
            "MEDIA_HOST_PIPE_FAILED",
            "Video Player host input pipe is unavailable",
        )
    })?;
    serde_json::to_writer(&mut *writer, &message)
        .map_err(|cause| error("MEDIA_HOST_IPC_FAILED", &cause.to_string()))?;
    writer
        .write_all(b"\n")
        .and_then(|_| writer.flush())
        .map_err(|cause| error("MEDIA_HOST_IPC_FAILED", &cause.to_string()))
}

fn resolve_media_host_executable(resource_root: &Path) -> Result<PathBuf, VideoPlayerCommandError> {
    if !cfg!(debug_assertions) {
        return require_file(
            packaged_video_player_paths(resource_root).0,
            "MEDIA_HOST_NOT_INSTALLED",
        );
    }
    let current = std::env::current_exe()
        .map_err(|cause| error("MEDIA_HOST_PATH_FAILED", &cause.to_string()))?;
    let candidate = current
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("sakurava-media-host.exe");
    if candidate.is_file() {
        Ok(candidate)
    } else {
        Err(error(
            "MEDIA_HOST_NOT_INSTALLED",
            &format!(
                "Video Player host is unavailable at {}",
                candidate.display()
            ),
        ))
    }
}

fn resolve_engine_root(resource_root: &Path) -> Result<PathBuf, VideoPlayerCommandError> {
    if cfg!(debug_assertions) {
        if let Some(value) = std::env::var_os("SAKURAVA_MPV_ENGINE_ROOT") {
            return require_directory(PathBuf::from(value), "MPV_ENGINE_ROOT_INVALID");
        }
    }
    if cfg!(debug_assertions) {
        let current = std::env::current_exe()
            .map_err(|cause| error("MPV_ENGINE_ROOT_INVALID", &cause.to_string()))?;
        return require_directory(
            current
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(r"video-engine\mpv-0.41.0"),
            "MPV_ENGINE_ROOT_INVALID",
        );
    }
    require_directory(
        packaged_video_player_paths(resource_root).1,
        "MPV_ENGINE_ROOT_INVALID",
    )
}

fn resolve_player_assets_root(resource_root: &Path) -> Result<PathBuf, VideoPlayerCommandError> {
    if cfg!(debug_assertions) {
        if let Some(value) = std::env::var_os("SAKURAVA_VIDEO_PLAYER_ASSETS_ROOT") {
            return require_directory(PathBuf::from(value), "PLAYER_ASSETS_INVALID");
        }
    }
    if cfg!(debug_assertions) {
        let current = std::env::current_exe()
            .map_err(|cause| error("PLAYER_ASSETS_INVALID", &cause.to_string()))?;
        return require_directory(
            current
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join("video-player-ui"),
            "PLAYER_ASSETS_INVALID",
        );
    }
    require_directory(
        packaged_video_player_paths(resource_root).2,
        "PLAYER_ASSETS_INVALID",
    )
}

fn packaged_video_player_paths(resource_root: &Path) -> (PathBuf, PathBuf, PathBuf) {
    let root = resource_root.join("video-player");
    (
        resource_root.join("sakurava-media-host.exe"),
        root.join("mpv-0.41.0"),
        root.join("video-player-ui"),
    )
}

fn resolve_webview_data_root() -> Result<PathBuf, VideoPlayerCommandError> {
    let root = if cfg!(debug_assertions) {
        std::env::var_os("SAKURAVA_VIDEO_PLAYER_WEBVIEW_DATA_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("sakurava-video-player-webview2"))
    } else {
        std::env::temp_dir().join("sakurava-video-player-webview2")
    };
    std::fs::create_dir_all(&root)
        .map_err(|cause| error("PLAYER_WEBVIEW_DATA_INVALID", &cause.to_string()))?;
    Ok(root)
}

fn require_directory(path: PathBuf, code: &str) -> Result<PathBuf, VideoPlayerCommandError> {
    let canonical = path
        .canonicalize()
        .map_err(|cause| error(code, &cause.to_string()))?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(error(
            code,
            "Required Video Player directory is not a directory",
        ))
    }
}

fn require_file(path: PathBuf, code: &str) -> Result<PathBuf, VideoPlayerCommandError> {
    let canonical = path
        .canonicalize()
        .map_err(|cause| error(code, &cause.to_string()))?;
    if canonical.is_file() {
        Ok(canonical)
    } else {
        Err(error(
            code,
            "Required Video Player file is not a regular file",
        ))
    }
}

fn unique_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{prefix}-{}-{nanos}", std::process::id())
}

fn error(code: &str, message: &str) -> VideoPlayerCommandError {
    VideoPlayerCommandError {
        code: code.into(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn different_source_error_is_structured() {
        let value = error("ACTIVE_SESSION_DIFFERENT_SOURCE", "active");
        assert_eq!(value.code, "ACTIVE_SESSION_DIFFERENT_SOURCE");
        assert_eq!(
            serde_json::to_value(value).unwrap()["code"],
            "ACTIVE_SESSION_DIFFERENT_SOURCE"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn kill_on_close_job_terminates_its_exact_child() {
        use std::{
            process::Stdio,
            time::{Duration, Instant},
        };

        let mut child = std::process::Command::new(r"C:\Windows\System32\cmd.exe")
            .args(["/D", "/C", "ping.exe 127.0.0.1 -n 30 > NUL"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn isolated child");
        let terminated_pid = child.id();
        let job = KillOnCloseJob::assign(&child).expect("assign child to kill-on-close job");
        drop(job);

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if child.try_wait().expect("query child").is_some() {
                break;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("kill-on-close job left the child running");
            }
            std::thread::sleep(Duration::from_millis(25));
        }

        eprintln!("VIDEO_PLAYER_JOB_TERMINATED_PID={terminated_pid}");

        let mut fresh_child = std::process::Command::new(r"C:\Windows\System32\cmd.exe")
            .args(["/D", "/C", "exit 0"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn fresh isolated child after cleanup");
        let fresh_pid = fresh_child.id();
        let fresh_job =
            KillOnCloseJob::assign(&fresh_child).expect("assign fresh child after cleanup");
        let fresh_status = fresh_child.wait().expect("wait for fresh child");
        drop(fresh_job);
        assert!(fresh_status.success());
        eprintln!("VIDEO_PLAYER_JOB_FRESH_LAUNCH_PID={fresh_pid}");
    }

    #[test]
    fn packaged_paths_are_owned_by_the_tauri_resource_root() {
        let root = std::env::temp_dir().join(unique_id("packaged-player-paths"));
        let (host, engine, assets) = packaged_video_player_paths(&root);
        assert_eq!(host, root.join("sakurava-media-host.exe"));
        assert_eq!(engine, root.join(r"video-player\mpv-0.41.0"));
        assert_eq!(assets, root.join(r"video-player\video-player-ui"));
    }
}
