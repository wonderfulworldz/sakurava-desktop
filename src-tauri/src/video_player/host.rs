#![allow(clippy::missing_safety_doc)]

use std::{
    cell::RefCell,
    collections::VecDeque,
    ffi::{c_char, c_int, c_void, CString},
    fs,
    io::{self, BufRead, BufReader, Write},
    path::{Path, PathBuf},
    ptr,
    rc::{Rc, Weak},
    sync::{Arc, Mutex},
    thread,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use webview2_com::Microsoft::Web::WebView2::Win32::{
    CreateCoreWebView2EnvironmentWithOptions, ICoreWebView2, ICoreWebView2CompositionController,
    ICoreWebView2Controller, ICoreWebView2Controller2, ICoreWebView2Environment,
    ICoreWebView2Environment3, ICoreWebView2EnvironmentOptions, ICoreWebView2_3,
    COREWEBVIEW2_COLOR, COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW,
    COREWEBVIEW2_MOUSE_EVENT_KIND, COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_DOWN,
    COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_UP, COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_DOWN,
    COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_UP, COREWEBVIEW2_MOUSE_EVENT_KIND_MOVE,
    COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_DOWN, COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_UP,
    COREWEBVIEW2_MOUSE_EVENT_KIND_WHEEL, COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS,
    COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC,
};
use webview2_com::{
    CoTaskMemPWSTR, CoreWebView2EnvironmentOptions,
    CreateCoreWebView2CompositionControllerCompletedHandler,
    CreateCoreWebView2EnvironmentCompletedHandler, CursorChangedEventHandler,
    WebMessageReceivedEventHandler,
};
use windows::{
    core::{Interface, HRESULT, PCSTR, PCWSTR, PWSTR},
    Win32::{
        Foundation::{
            FreeLibrary, ERROR_CANCELLED, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM,
        },
        Graphics::{
            DirectComposition::{
                DCompositionCreateDevice, IDCompositionDevice, IDCompositionTarget,
                IDCompositionVisual,
            },
            Dxgi::{IDXGIDevice, IDXGISwapChain1},
            Gdi::{
                GetMonitorInfoW, GetStockObject, MonitorFromWindow, ScreenToClient, BLACK_BRUSH,
                MONITORINFO, MONITOR_DEFAULTTONEAREST,
            },
        },
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
            },
            LibraryLoader::{
                GetModuleFileNameW, GetModuleHandleW, GetProcAddress, LoadLibraryExW,
                LOAD_LIBRARY_SEARCH_DEFAULT_DIRS, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR,
            },
        },
        UI::{
            HiDpi::{SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2},
            Input::KeyboardAndMouse::{GetDoubleClickTime, SetFocus},
            Shell::{
                Common::COMDLG_FILTERSPEC, DragAcceptFiles, DragFinish, DragQueryFileW,
                FileOpenDialog, IFileOpenDialog, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM,
                FOS_NOCHANGEDIR, FOS_PATHMUSTEXIST, HDROP, SIGDN_FILESYSPATH,
            },
            WindowsAndMessaging::{
                AdjustWindowRectEx, CreateWindowExW, DefWindowProcW, DestroyWindow,
                DispatchMessageW, GetClientRect, GetMessageW, GetWindowLongPtrW, GetWindowRect,
                LoadCursorW, PostMessageW, PostQuitMessage, RegisterClassW, SetCursor,
                SetForegroundWindow, SetTimer, SetWindowLongPtrW, SetWindowPos, ShowWindow,
                TranslateMessage, CREATESTRUCTW, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT,
                GWLP_USERDATA, GWL_STYLE, HMENU, HTCAPTION, HTCLIENT, HWND_TOPMOST, IDC_ARROW,
                MINMAXINFO, MSG, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
                SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW, WINDOW_EX_STYLE, WINDOW_STYLE,
                WMSZ_BOTTOMLEFT, WMSZ_BOTTOMRIGHT, WMSZ_LEFT, WMSZ_RIGHT, WMSZ_TOP, WMSZ_TOPLEFT,
                WMSZ_TOPRIGHT, WM_APP, WM_CLOSE, WM_DESTROY, WM_DROPFILES, WM_GETMINMAXINFO,
                WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
                WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_NCCREATE, WM_NCHITTEST, WM_RBUTTONDOWN,
                WM_RBUTTONUP, WM_SETCURSOR, WM_SETFOCUS, WM_SIZE, WM_SIZING, WM_TIMER, WNDCLASSW,
                WS_CAPTION, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW,
                WS_POPUP, WS_SYSMENU, WS_THICKFRAME, WS_VISIBLE,
            },
        },
    },
};

use super::source::{
    discover_sidecar_subtitles, open_media_file_with_default_app, validate_external_subtitle_path,
};
use crate::output::{
    prepare_category, publish_unique_file, reveal_file, sanitize_file_component, OutputCategory,
};

use super::contact_sheet::{
    sample_schedule, ContactSheetExtractionProgress, ContactSheetExtractionRequest,
    ContactSheetExtractionResult,
};
use super::ipc::{
    HostToMainKind, HostToMainMessage, HostToPlayerMessage, IpcError, MainToHostKind,
    MainToHostMessage, OpenSourcePayload, PlaybackSnapshot, PlayerCommand, PlayerCommandKind,
    SubtitleTrack, PROTOCOL_VERSION,
};

const WM_HOST_IPC: u32 = WM_APP + 41;
const WM_HOST_ENTER_PIP: u32 = WM_APP + 42;
const WM_HOST_RETURN_MAIN: u32 = WM_APP + 43;
const WM_HOST_OPEN_SUBTITLE_APPEARANCE: u32 = WM_APP + 44;
const WM_HOST_OPEN_SHORTCUTS: u32 = WM_APP + 45;
const POLL_TIMER_ID: usize = 1;
const WEBVIEW2_ENVIRONMENT_OVERRIDE_VARIABLES: [&str; 5] = [
    "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER",
    "WEBVIEW2_USER_DATA_FOLDER",
    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
    "WEBVIEW2_CHANNEL_SEARCH_KIND",
    "WEBVIEW2_RELEASE_CHANNELS",
];
const MPV_FORMAT_FLAG: c_int = 3;
const MPV_FORMAT_INT64: c_int = 4;
const MPV_FORMAT_DOUBLE: c_int = 5;
const SAKURAVA_MPV_LIBRARY_NAME: &str = "libmpv-sakurava-2.dll";

type MpvCreate = unsafe extern "C" fn() -> *mut c_void;
type MpvInitialize = unsafe extern "C" fn(*mut c_void) -> c_int;
type MpvTerminateDestroy = unsafe extern "C" fn(*mut c_void);
type MpvSetOptionString = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvSetPropertyString =
    unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvGetProperty = unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type MpvGetPropertyString = unsafe extern "C" fn(*mut c_void, *const c_char) -> *mut c_char;
type MpvFree = unsafe extern "C" fn(*mut c_void);
type MpvCommand = unsafe extern "C" fn(*mut c_void, *const *const c_char) -> c_int;
type MpvWaitEvent = unsafe extern "C" fn(*mut c_void, f64) -> *const MpvEvent;
type MpvErrorString = unsafe extern "C" fn(c_int) -> *const c_char;

const MPV_EVENT_NONE: c_int = 0;
const MPV_EVENT_SHUTDOWN: c_int = 1;
const MPV_EVENT_END_FILE: c_int = 7;
const MPV_EVENT_FILE_LOADED: c_int = 8;
const MPV_EVENT_SEEK: c_int = 20;
const MPV_EVENT_PLAYBACK_RESTART: c_int = 21;
const MPV_EVENT_QUEUE_OVERFLOW: c_int = 24;
const MPV_END_FILE_REASON_EOF: c_int = 0;
const MPV_END_FILE_REASON_ERROR: c_int = 4;

#[repr(C)]
struct MpvEvent {
    event_id: c_int,
    error: c_int,
    reply_userdata: u64,
    data: *mut c_void,
}

#[repr(C)]
struct MpvEventEndFile {
    reason: c_int,
    error: c_int,
    playlist_entry_id: i64,
    playlist_insert_id: i64,
    playlist_insert_num_entries: c_int,
}

#[derive(Debug)]
enum EngineEvent {
    FileLoaded,
    PlaybackRestart,
    EndFile {
        reason: c_int,
        error: c_int,
        message: String,
    },
    Shutdown,
    QueueOverflow,
}

#[derive(Debug)]
struct HostArgs {
    engine_root: PathBuf,
    assets_root: PathBuf,
    webview_data_root: PathBuf,
}

struct MpvApi {
    module: windows::Win32::Foundation::HMODULE,
    context: *mut c_void,
    terminate_destroy: MpvTerminateDestroy,
    set_property_string: MpvSetPropertyString,
    get_property: MpvGetProperty,
    get_property_string: MpvGetPropertyString,
    free: MpvFree,
    command: MpvCommand,
    wait_event: MpvWaitEvent,
    error_string: MpvErrorString,
    loaded_module_path: PathBuf,
}

impl MpvApi {
    fn load(engine_root: &Path) -> Result<Self, String> {
        Self::load_with_profile(engine_root, false)
    }

    fn load_for_extraction(engine_root: &Path) -> Result<Self, String> {
        Self::load_with_profile(engine_root, true)
    }

    fn load_with_profile(engine_root: &Path, extraction: bool) -> Result<Self, String> {
        let requested = engine_root
            .join(SAKURAVA_MPV_LIBRARY_NAME)
            .canonicalize()
            .map_err(|error| format!("ENGINE_DLL_MISSING: {error}"))?;
        let module = unsafe {
            LoadLibraryExW(
                PCWSTR::from_raw(wide_null(&requested).as_ptr()),
                None,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            )
        }
        .map_err(|error| format!("ENGINE_DLL_LOAD_FAILED: {error}"))?;
        let mut loaded_buffer = vec![0u16; 32_768];
        let length = unsafe { GetModuleFileNameW(Some(module), &mut loaded_buffer) } as usize;
        if length == 0 {
            unsafe {
                let _ = FreeLibrary(module);
            }
            return Err("ENGINE_MODULE_PATH_FAILED".into());
        }
        let loaded_module_path = PathBuf::from(String::from_utf16_lossy(&loaded_buffer[..length]))
            .canonicalize()
            .map_err(|error| format!("ENGINE_MODULE_PATH_FAILED: {error}"))?;
        if loaded_module_path != requested {
            unsafe {
                let _ = FreeLibrary(module);
            }
            return Err("ENGINE_MODULE_PATH_MISMATCH".into());
        }
        eprintln!(
            "VIDEO_PLAYER_ENGINE_MODULE={}",
            loaded_module_path.display()
        );

        unsafe {
            let create: MpvCreate = load_symbol(module, b"mpv_create\0")?;
            let initialize: MpvInitialize = load_symbol(module, b"mpv_initialize\0")?;
            let terminate_destroy: MpvTerminateDestroy =
                load_symbol(module, b"mpv_terminate_destroy\0")?;
            let set_option_string: MpvSetOptionString =
                load_symbol(module, b"mpv_set_option_string\0")?;
            let set_property_string: MpvSetPropertyString =
                load_symbol(module, b"mpv_set_property_string\0")?;
            let get_property: MpvGetProperty = load_symbol(module, b"mpv_get_property\0")?;
            let get_property_string: MpvGetPropertyString =
                load_symbol(module, b"mpv_get_property_string\0")?;
            let free: MpvFree = load_symbol(module, b"mpv_free\0")?;
            let command: MpvCommand = load_symbol(module, b"mpv_command\0")?;
            let wait_event: MpvWaitEvent = load_symbol(module, b"mpv_wait_event\0")?;
            let error_string: MpvErrorString = load_symbol(module, b"mpv_error_string\0")?;
            let context = create();
            if context.is_null() {
                let _ = FreeLibrary(module);
                return Err("MPV_CONTEXT_CREATE_FAILED".into());
            }
            let playback_options = [
                ("config", "no"),
                ("load-scripts", "no"),
                ("input-default-bindings", "no"),
                ("input-builtin-bindings", "no"),
                ("input-vo-keyboard", "no"),
                ("autoload-files", "no"),
                ("access-references", "no"),
                ("terminal", "no"),
                ("idle", "yes"),
                ("keep-open", "yes"),
                ("volume", "72"),
                ("sid", "no"),
                ("vo", "gpu-next"),
                ("gpu-api", "d3d11"),
                ("gpu-context", "d3d11"),
                ("d3d11-output-mode", "composition"),
                ("d3d11-composition-size", "1180x760"),
                ("hwdec", "auto-safe"),
            ];
            let extraction_options = [
                ("config", "no"),
                ("load-scripts", "no"),
                ("input-default-bindings", "no"),
                ("input-builtin-bindings", "no"),
                ("input-vo-keyboard", "no"),
                ("autoload-files", "no"),
                ("access-references", "no"),
                ("terminal", "no"),
                ("idle", "yes"),
                ("keep-open", "yes"),
                ("pause", "yes"),
                ("audio", "no"),
                ("sid", "no"),
                ("vo", "gpu-next"),
                ("gpu-api", "d3d11"),
                ("gpu-context", "d3d11"),
                ("hwdec", "no"),
            ];
            let options: &[(&str, &str)] = if extraction {
                &extraction_options
            } else {
                &playback_options
            };
            for (name, value) in options {
                if call_set_string(set_option_string, context, name, value) < 0 {
                    terminate_destroy(context);
                    let _ = FreeLibrary(module);
                    return Err(format!("MPV_OPTION_REJECTED: {name}"));
                }
            }
            if initialize(context) < 0 {
                terminate_destroy(context);
                let _ = FreeLibrary(module);
                return Err("MPV_INITIALIZE_FAILED".into());
            }
            if extraction {
                eprintln!("CONTACT_SHEET_EXTRACTION_CONTEXT=STARTED");
            } else {
                eprintln!("VIDEO_PLAYER_LIBMPV_CONTEXT_COUNT=1");
            }
            Ok(Self {
                module,
                context,
                terminate_destroy,
                set_property_string,
                get_property,
                get_property_string,
                free,
                command,
                wait_event,
                error_string,
                loaded_module_path,
            })
        }
    }

    fn command(&self, arguments: &[&str]) -> Result<(), String> {
        let strings = arguments
            .iter()
            .map(|value| CString::new(*value).map_err(|_| "MPV_COMMAND_INVALID".to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        let mut pointers = strings
            .iter()
            .map(|value| value.as_ptr())
            .collect::<Vec<_>>();
        pointers.push(ptr::null());
        let result = unsafe { (self.command)(self.context, pointers.as_ptr()) };
        if result < 0 {
            Err(format!("MPV_COMMAND_FAILED: {result}"))
        } else {
            Ok(())
        }
    }

    fn set_property(&self, name: &str, value: &str) -> Result<(), String> {
        let result =
            unsafe { call_set_string(self.set_property_string, self.context, name, value) };
        if result < 0 {
            Err(format!("MPV_PROPERTY_FAILED: {name}:{result}"))
        } else {
            Ok(())
        }
    }

    fn get_double(&self, name: &str) -> Option<f64> {
        let mut value = 0f64;
        (unsafe {
            call_get(
                self.get_property,
                self.context,
                name,
                MPV_FORMAT_DOUBLE,
                &mut value,
            )
        } >= 0)
            .then_some(value)
    }

    fn get_flag(&self, name: &str) -> Option<bool> {
        let mut value = 0i32;
        (unsafe {
            call_get(
                self.get_property,
                self.context,
                name,
                MPV_FORMAT_FLAG,
                &mut value,
            )
        } >= 0)
            .then_some(value != 0)
    }

    fn get_int64(&self, name: &str) -> Option<i64> {
        let mut value = 0i64;
        (unsafe {
            call_get(
                self.get_property,
                self.context,
                name,
                MPV_FORMAT_INT64,
                &mut value,
            )
        } >= 0)
            .then_some(value)
    }

    fn get_string(&self, name: &str) -> Option<String> {
        let name = CString::new(name).ok()?;
        let raw = unsafe { (self.get_property_string)(self.context, name.as_ptr()) };
        if raw.is_null() {
            return None;
        }
        let value = unsafe { std::ffi::CStr::from_ptr(raw) }
            .to_string_lossy()
            .into_owned();
        unsafe { (self.free)(raw.cast()) };
        Some(value)
    }

    fn get_subtitle_rendered_geometry(&self) -> Option<SubtitleRenderedGeometry> {
        const PROPERTY: &str = "sakurava-sub-rendered-geometry";
        for _ in 0..2 {
            let change_id = self.get_int64(&format!("{PROPERTY}/change-id"))?;
            let geometry = SubtitleRenderedGeometry {
                x: self.get_int64(&format!("{PROPERTY}/x"))?,
                y: self.get_int64(&format!("{PROPERTY}/y"))?,
                width: self.get_int64(&format!("{PROPERTY}/w"))?,
                height: self.get_int64(&format!("{PROPERTY}/h"))?,
                output_width: self.get_int64(&format!("{PROPERTY}/output-w"))?,
                output_height: self.get_int64(&format!("{PROPERTY}/output-h"))?,
                change_id,
            };
            if self.get_int64(&format!("{PROPERTY}/change-id")) == Some(change_id)
                && geometry.is_valid()
            {
                return Some(geometry);
            }
        }
        None
    }

    fn drain_events(&self) -> Vec<EngineEvent> {
        let mut events = Vec::new();
        loop {
            let event = unsafe { (self.wait_event)(self.context, 0.0) };
            if event.is_null() {
                break;
            }
            let event = unsafe { &*event };
            match event.event_id {
                MPV_EVENT_NONE => break,
                MPV_EVENT_FILE_LOADED => events.push(EngineEvent::FileLoaded),
                MPV_EVENT_PLAYBACK_RESTART => events.push(EngineEvent::PlaybackRestart),
                MPV_EVENT_END_FILE if !event.data.is_null() => {
                    let end = unsafe { &*(event.data as *const MpvEventEndFile) };
                    let message = if end.error < 0 {
                        let raw = unsafe { (self.error_string)(end.error) };
                        if raw.is_null() {
                            format!("mpv error {}", end.error)
                        } else {
                            unsafe { std::ffi::CStr::from_ptr(raw) }
                                .to_string_lossy()
                                .into_owned()
                        }
                    } else {
                        "Playback ended".into()
                    };
                    events.push(EngineEvent::EndFile {
                        reason: end.reason,
                        error: end.error,
                        message,
                    });
                }
                MPV_EVENT_SHUTDOWN => events.push(EngineEvent::Shutdown),
                MPV_EVENT_QUEUE_OVERFLOW => events.push(EngineEvent::QueueOverflow),
                _ => {}
            }
        }
        events
    }

    fn wait_for_event(&self, expected: c_int, timeout: std::time::Duration) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            let event = unsafe { (self.wait_event)(self.context, 0.1) };
            if event.is_null() {
                continue;
            }
            let event = unsafe { &*event };
            if event.event_id == expected {
                return Ok(());
            }
            if event.event_id == MPV_EVENT_END_FILE && !event.data.is_null() {
                let end = unsafe { &*(event.data as *const MpvEventEndFile) };
                if end.error < 0 {
                    return Err(format!("CONTACT_SHEET_SOURCE_FAILED: {}", end.error));
                }
            }
            if event.event_id == MPV_EVENT_SHUTDOWN {
                return Err("CONTACT_SHEET_ENGINE_SHUTDOWN".into());
            }
        }
        Err("CONTACT_SHEET_ENGINE_TIMEOUT".into())
    }

    fn seek_and_wait_for_frame(
        &self,
        target_seconds: f64,
        timeout: std::time::Duration,
    ) -> Result<f64, String> {
        self.command(&["seek", &target_seconds.to_string(), "absolute+exact"])?;
        let deadline = Instant::now() + timeout;
        let mut saw_current_seek = false;
        let mut saw_current_restart = false;
        while Instant::now() < deadline {
            let event = unsafe { (self.wait_event)(self.context, 0.01) };
            if !event.is_null() {
                let event = unsafe { &*event };
                match event.event_id {
                    MPV_EVENT_SEEK => {
                        saw_current_seek = true;
                        saw_current_restart = false;
                    }
                    MPV_EVENT_PLAYBACK_RESTART if saw_current_seek => {
                        saw_current_restart = true;
                    }
                    MPV_EVENT_END_FILE if !event.data.is_null() => {
                        let end = unsafe { &*(event.data as *const MpvEventEndFile) };
                        if end.error < 0 {
                            return Err(format!("CONTACT_SHEET_SOURCE_FAILED: {}", end.error));
                        }
                    }
                    MPV_EVENT_SHUTDOWN => {
                        return Err("CONTACT_SHEET_ENGINE_SHUTDOWN".into());
                    }
                    _ => {}
                }
            }
            let seeking = self.get_flag("seeking");
            let position = self.get_double("time-pos");
            if seek_capture_ready(saw_current_seek, saw_current_restart, seeking, position) {
                return position.ok_or("CONTACT_SHEET_POSITION_INVALID".into());
            }
        }
        Err("CONTACT_SHEET_SEEK_TIMEOUT".into())
    }
}

fn seek_capture_ready(
    saw_current_seek: bool,
    saw_current_restart: bool,
    seeking: Option<bool>,
    position: Option<f64>,
) -> bool {
    saw_current_seek
        && saw_current_restart
        && seeking == Some(false)
        && position.is_some_and(|value| value.is_finite() && value >= 0.0)
}

impl Drop for MpvApi {
    fn drop(&mut self) {
        unsafe {
            (self.terminate_destroy)(self.context);
            let _ = FreeLibrary(self.module);
        }
        eprintln!(
            "VIDEO_PLAYER_ENGINE_RELEASED={}",
            self.loaded_module_path.display()
        );
    }
}

struct CompositionTree {
    device: IDCompositionDevice,
    _target: IDCompositionTarget,
    _root: IDCompositionVisual,
    video: IDCompositionVisual,
    overlay: IDCompositionVisual,
    swapchain: Option<IDXGISwapChain1>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PresentationTarget {
    Main,
    Pip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SubtitlePositionMode {
    Source,
    Bottom,
    Middle,
    Top,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SubtitleRenderedGeometry {
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    output_width: i64,
    output_height: i64,
    change_id: i64,
}

impl SubtitleRenderedGeometry {
    fn is_valid(self) -> bool {
        self.width > 0 && self.height > 0 && self.output_width > 0 && self.output_height > 0
    }

    fn center_y(self) -> f64 {
        self.y as f64 + self.height as f64 / 2.0
    }
}

impl SubtitlePositionMode {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "source" => Some(Self::Source),
            "bottom" => Some(Self::Bottom),
            "middle" => Some(Self::Middle),
            "top" => Some(Self::Top),
            _ => None,
        }
    }

    fn plain_vertical_alignment(self) -> &'static str {
        "bottom"
    }

    fn plain_horizontal_alignment(self) -> &'static str {
        "center"
    }

    fn ass_alignment(self) -> Option<u8> {
        match self {
            Self::Source => None,
            Self::Bottom | Self::Middle | Self::Top => Some(2),
        }
    }

    fn anchor_region(self) -> Option<SubtitleAnchorRegion> {
        match self {
            Self::Source => None,
            Self::Top => Some(SubtitleAnchorRegion {
                min: 0.0,
                neutral: 1.0 / 6.0,
                max: 1.0 / 3.0,
            }),
            Self::Middle => Some(SubtitleAnchorRegion {
                min: 1.0 / 3.0,
                neutral: 0.5,
                max: 2.0 / 3.0,
            }),
            Self::Bottom => Some(SubtitleAnchorRegion {
                min: 2.0 / 3.0,
                // Preserve the accepted sub-pos=100 Bottom baseline.
                neutral: 1.0,
                max: 1.0,
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SubtitleAnchorRegion {
    min: f64,
    neutral: f64,
    max: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UtilityWindowKind {
    SubtitleAppearance,
    Shortcuts,
}

const PLAYER_AUXILIARY_CLIENT_WIDTH: i32 = 1100;
const PLAYER_AUXILIARY_CLIENT_HEIGHT: i32 = 760;

impl UtilityWindowKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::SubtitleAppearance => "subtitle-appearance",
            Self::Shortcuts => "shortcuts",
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::SubtitleAppearance => "Sakurava Subtitle Appearance",
            Self::Shortcuts => "Sakurava Custom Shortcuts",
        }
    }

    fn client_size(self) -> (i32, i32) {
        (
            PLAYER_AUXILIARY_CLIENT_WIDTH,
            PLAYER_AUXILIARY_CLIENT_HEIGHT,
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WebViewTarget {
    Main,
    Pip,
    Utility(UtilityWindowKind),
}

impl WebViewTarget {
    fn as_str(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Pip => "pip",
            Self::Utility(kind) => kind.as_str(),
        }
    }

    fn presentation(self) -> Option<PresentationTarget> {
        match self {
            Self::Main => Some(PresentationTarget::Main),
            Self::Pip => Some(PresentationTarget::Pip),
            Self::Utility(_) => None,
        }
    }
}

impl PresentationTarget {
    fn as_str(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Pip => "pip",
        }
    }
}

struct WebViewHost {
    composition: ICoreWebView2CompositionController,
    controller: ICoreWebView2Controller,
    webview: ICoreWebView2,
}

struct PipPresentation {
    hwnd: HWND,
    tree: CompositionTree,
    webview: WebViewHost,
    aspect_ratio: f64,
}

struct UtilityPresentation {
    kind: UtilityWindowKind,
    hwnd: HWND,
    tree: CompositionTree,
    webview: WebViewHost,
}

struct HostUi {
    process_started_at: Instant,
    hwnd: HWND,
    mpv: MpvApi,
    tree: CompositionTree,
    webview: Option<WebViewHost>,
    webview_environment: ICoreWebView2Environment,
    assets_root: PathBuf,
    self_weak: Weak<RefCell<HostUi>>,
    pip: Option<PipPresentation>,
    utilities: Vec<UtilityPresentation>,
    active_presentation: PresentationTarget,
    fullscreen: bool,
    main_windowed_rect: Option<RECT>,
    main_windowed_style: Option<isize>,
    main_aspect_ratio_applied: Option<f64>,
    last_nonzero_volume: f64,
    previous_subtitle_id: Option<i64>,
    subtitle_position_mode: SubtitlePositionMode,
    subtitle_vertical_adjustment: f64,
    subtitle_ass_appearance_overrides: String,
    subtitle_dynamic_bottom_clearance_ratio: f64,
    subtitle_middle_geometry: Option<SubtitleRenderedGeometry>,
    source_load_count: u64,
    source_loaded: bool,
    source_failed: bool,
    source_opened_at: Option<Instant>,
    first_frame_recorded: bool,
    controls_ready_recorded: bool,
    pending_seek: Option<(String, Instant)>,
    last_command_error: Option<IpcError>,
    last_screenshot_path: Option<PathBuf>,
    pending_sidecar_subtitles: Vec<PathBuf>,
    active_external_subtitle_id: Option<i64>,
    active_external_subtitle_path: Option<PathBuf>,
    queue: Arc<Mutex<VecDeque<MainToHostMessage>>>,
    session: Option<OpenSourcePayload>,
    revision: u64,
    last_swapchain_address: i64,
    last_runtime_marker: Option<String>,
    closing: bool,
}

pub fn run() -> Result<(), String> {
    if let Some(request_path) = extraction_request_path() {
        return run_contact_sheet_extraction(&request_path);
    }
    clear_webview_environment_overrides();
    let process_started_at = Instant::now();
    let args = parse_args()?;
    require_directory(&args.engine_root, "ENGINE_ROOT_INVALID")?;
    require_directory(&args.assets_root, "ASSETS_ROOT_INVALID")?;
    std::fs::create_dir_all(&args.webview_data_root)
        .map_err(|error| format!("WEBVIEW_DATA_ROOT_INVALID: {error}"))?;
    unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) }
        .map_err(|error| format!("DPI_AWARENESS_FAILED: {error}"))?;
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) }
        .ok()
        .map_err(|error| format!("COM_INITIALIZE_FAILED: {error}"))?;
    let result = run_ui(args, process_started_at);
    unsafe {
        CoUninitialize();
    }
    result
}

fn clear_webview_environment_overrides() {
    for variable in WEBVIEW2_ENVIRONMENT_OVERRIDE_VARIABLES {
        std::env::remove_var(variable);
    }
}

fn extraction_request_path() -> Option<PathBuf> {
    let values = std::env::args_os().skip(1).collect::<Vec<_>>();
    values
        .windows(2)
        .find(|pair| pair[0] == "--contact-sheet-request")
        .map(|pair| PathBuf::from(&pair[1]))
}

fn run_contact_sheet_extraction(request_path: &Path) -> Result<(), String> {
    let request: ContactSheetExtractionRequest = serde_json::from_slice(
        &fs::read(request_path)
            .map_err(|error| format!("CONTACT_SHEET_REQUEST_READ_FAILED: {error}"))?,
    )
    .map_err(|error| format!("CONTACT_SHEET_REQUEST_INVALID: {error}"))?;
    let engine_root = request_path
        .parent()
        .and_then(|_| {
            let values = std::env::args_os().skip(1).collect::<Vec<_>>();
            values
                .windows(2)
                .find(|pair| pair[0] == "--engine-root")
                .map(|pair| PathBuf::from(&pair[1]))
        })
        .ok_or("ENGINE_ROOT_REQUIRED")?;
    require_directory(&engine_root, "ENGINE_ROOT_INVALID")?;
    let frame_directory = PathBuf::from(&request.frame_directory);
    fs::create_dir_all(&frame_directory)
        .map_err(|error| format!("CONTACT_SHEET_FRAME_DIRECTORY_FAILED: {error}"))?;
    let mpv = MpvApi::load_for_extraction(&engine_root)?;
    mpv.command(&["loadfile", &request.source_path, "replace"])
        .map_err(|error| format!("CONTACT_SHEET_MPV_PHASE=loadfile;COMMAND=loadfile;{error}"))?;
    mpv.wait_for_event(MPV_EVENT_FILE_LOADED, std::time::Duration::from_secs(15))?;
    if request.subtitles {
        if let Some(path) = request.subtitle_path.as_deref() {
            mpv.command(&["sub-add", path, "select"]).map_err(|error| {
                format!("CONTACT_SHEET_MPV_PHASE=subtitle;COMMAND=sub-add;{error}")
            })?;
        } else {
            let sid = request
                .subtitle_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "auto".into());
            mpv.set_property("sid", &sid).map_err(|error| {
                format!("CONTACT_SHEET_MPV_PHASE=subtitle;PROPERTY=sid;{error}")
            })?;
        }
        mpv.set_property("sub-visibility", "yes")?;
    }
    let duration = mpv
        .get_double("duration")
        .filter(|value| value.is_finite() && *value > 0.0)
        .ok_or("CONTACT_SHEET_DURATION_INVALID")?;
    let requested_samples = sample_schedule(
        duration,
        usize::from(request.rows) * usize::from(request.columns),
    )?;
    let progress_path = PathBuf::from(&request.progress_path);
    write_contact_sheet_progress(&progress_path, 0, requested_samples.len())?;
    let mut sample_seconds = Vec::with_capacity(requested_samples.len());
    let mut frame_paths = Vec::with_capacity(requested_samples.len());
    for (index, requested_seconds) in requested_samples.iter().enumerate() {
        let captured_seconds = mpv
            .seek_and_wait_for_frame(*requested_seconds, std::time::Duration::from_secs(10))
            .map_err(|error| {
                format!(
                    "CONTACT_SHEET_MPV_PHASE=seek;COMMAND=seek;SAMPLE_INDEX={index};SAMPLE_SECONDS={requested_seconds:.3};{error}"
                )
            })?;
        let frame = frame_directory.join(format!("frame-{index:03}.png"));
        let capture_mode = if request.subtitles {
            "subtitles"
        } else {
            "video"
        };
        mpv.command(&["screenshot-to-file", &frame.display().to_string(), capture_mode])
            .map_err(|error| {
                format!(
                    "CONTACT_SHEET_MPV_PHASE=capture;COMMAND=screenshot-to-file;MODE={capture_mode};SAMPLE_INDEX={index};SAMPLE_SECONDS={captured_seconds:.3};{error}"
                )
            })?;
        let bytes = fs::read(&frame)
            .map_err(|error| format!("CONTACT_SHEET_FRAME_READ_FAILED: {error}"))?;
        if bytes.len() < 32 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("CONTACT_SHEET_FRAME_INVALID".into());
        }
        sample_seconds.push(captured_seconds);
        frame_paths.push(frame.display().to_string());
        write_contact_sheet_progress(&progress_path, index + 1, requested_samples.len())?;
    }
    let result = ContactSheetExtractionResult {
        duration_seconds: duration,
        sample_seconds,
        frame_paths,
    };
    fs::write(
        &request.result_path,
        serde_json::to_vec(&result)
            .map_err(|error| format!("CONTACT_SHEET_RESULT_ENCODE_FAILED: {error}"))?,
    )
    .map_err(|error| format!("CONTACT_SHEET_RESULT_WRITE_FAILED: {error}"))?;
    eprintln!("CONTACT_SHEET_EXTRACTION_CONTEXT=COMPLETED");
    Ok(())
}

fn write_contact_sheet_progress(path: &Path, completed: usize, total: usize) -> Result<(), String> {
    fs::write(
        path,
        serde_json::to_vec(&ContactSheetExtractionProgress { completed, total })
            .map_err(|error| format!("CONTACT_SHEET_PROGRESS_ENCODE_FAILED: {error}"))?,
    )
    .map_err(|error| format!("CONTACT_SHEET_PROGRESS_WRITE_FAILED: {error}"))
}

fn run_ui(args: HostArgs, process_started_at: Instant) -> Result<(), String> {
    let hwnd = create_main_window()?;
    let tree = create_composition_tree(hwnd)?;
    let mpv = MpvApi::load(&args.engine_root)?;
    let webview_environment = create_webview_environment(&args.webview_data_root)?;
    let queue = Arc::new(Mutex::new(VecDeque::new()));
    let state = Rc::new(RefCell::new(HostUi {
        process_started_at,
        hwnd,
        mpv,
        tree,
        webview: None,
        webview_environment,
        assets_root: args.assets_root.clone(),
        self_weak: Weak::new(),
        pip: None,
        utilities: Vec::new(),
        active_presentation: PresentationTarget::Main,
        fullscreen: false,
        main_windowed_rect: None,
        main_windowed_style: None,
        main_aspect_ratio_applied: None,
        last_nonzero_volume: 72.0,
        previous_subtitle_id: None,
        subtitle_position_mode: SubtitlePositionMode::Source,
        subtitle_vertical_adjustment: 0.0,
        subtitle_ass_appearance_overrides: String::new(),
        subtitle_dynamic_bottom_clearance_ratio: 0.0,
        subtitle_middle_geometry: None,
        source_load_count: 0,
        source_loaded: false,
        source_failed: false,
        source_opened_at: None,
        first_frame_recorded: false,
        controls_ready_recorded: false,
        pending_seek: None,
        last_command_error: None,
        last_screenshot_path: None,
        pending_sidecar_subtitles: Vec::new(),
        active_external_subtitle_id: None,
        active_external_subtitle_path: None,
        queue: queue.clone(),
        session: None,
        revision: 0,
        last_swapchain_address: 0,
        last_runtime_marker: None,
        closing: false,
    }));
    state.borrow_mut().self_weak = Rc::downgrade(&state);
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Rc::as_ptr(&state) as isize);
    }
    let webview = create_webview(
        &state.borrow().webview_environment,
        hwnd,
        &args.assets_root,
        Rc::downgrade(&state),
        &state.borrow().tree.overlay,
        WebViewTarget::Main,
    )?;
    state.borrow_mut().webview = Some(webview);
    resize(&mut state.borrow_mut())?;
    unsafe {
        SetTimer(Some(hwnd), POLL_TIMER_ID, 100, None);
        DragAcceptFiles(hwnd, true);
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
        let _ = SetFocus(Some(hwnd));
    }
    emit_to_main(
        HostToMainKind::HostReady {
            host_pid: std::process::id(),
        },
        "host-ready",
    );
    eprintln!(
        "VIDEO_PLAYER_TIMING=HOST_READY_MS;VALUE={:.3}",
        state.borrow().process_started_at.elapsed().as_secs_f64() * 1000.0
    );
    start_ipc_reader(hwnd, queue);

    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.as_bool() {
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
    if let Some(session) = state.borrow().session.as_ref() {
        emit_to_main(
            HostToMainKind::SessionClosed {
                session_id: session.session_id.clone(),
            },
            "session-closed",
        );
    }
    if let Err(error) = shutdown_ui(&mut state.borrow_mut()) {
        eprintln!("VIDEO_PLAYER_CLEANUP_ERROR={error}");
    }
    emit_to_main(HostToMainKind::OrderlyShutdown, "orderly-shutdown");
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
    }
    unsafe {
        let _ = DestroyWindow(hwnd);
    }
    Ok(())
}

fn parse_args() -> Result<HostArgs, String> {
    let values = std::env::args_os().skip(1).collect::<Vec<_>>();
    let value_for = |flag: &str| {
        values
            .windows(2)
            .find(|pair| pair[0] == flag)
            .map(|pair| PathBuf::from(&pair[1]))
    };
    Ok(HostArgs {
        engine_root: value_for("--engine-root").ok_or("ENGINE_ROOT_REQUIRED")?,
        assets_root: value_for("--assets-root").ok_or("ASSETS_ROOT_REQUIRED")?,
        webview_data_root: value_for("--webview-data-root").ok_or("WEBVIEW_DATA_ROOT_REQUIRED")?,
    })
}

fn require_directory(path: &Path, code: &str) -> Result<(), String> {
    if path.is_dir() {
        Ok(())
    } else {
        Err(code.into())
    }
}

fn create_main_window() -> Result<HWND, String> {
    unsafe {
        let instance = GetModuleHandleW(None).map_err(|error| error.to_string())?;
        let class_name = wide_null_str("SakuravaVideoPlayerMediaHost");
        let class = player_window_class(HINSTANCE(instance.0), PCWSTR(class_name.as_ptr()))?;
        if RegisterClassW(&class) == 0 {
            return Err(format!(
                "WINDOW_CLASS_FAILED: {}",
                windows::core::Error::from_win32()
            ));
        }
        let utility_class_name = wide_null_str("SakuravaVideoPlayerUtilityHost");
        let utility_class =
            utility_window_class(HINSTANCE(instance.0), PCWSTR(utility_class_name.as_ptr()))?;
        if RegisterClassW(&utility_class) == 0 {
            return Err(format!(
                "UTILITY_WINDOW_CLASS_FAILED: {}",
                windows::core::Error::from_win32()
            ));
        }
        let title = wide_null_str("Sakurava Video Player");
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR(title.as_ptr()),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            1180,
            760,
            None,
            None::<HMENU>,
            Some(instance.into()),
            None,
        )
        .map_err(|error| format!("WINDOW_CREATE_FAILED: {error}"))
    }
}

fn utility_window_class(instance: HINSTANCE, class_name: PCWSTR) -> Result<WNDCLASSW, String> {
    let cursor = unsafe { LoadCursorW(None, IDC_ARROW) }
        .map_err(|error| format!("UTILITY_WINDOW_CURSOR_FAILED: {error}"))?;
    Ok(WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        hInstance: instance,
        hCursor: cursor,
        lpszClassName: class_name,
        // DirectComposition owns the client pixels. A class brush would fill the
        // transparent WebView surface and turn the utility material opaque.
        hbrBackground: windows::Win32::Graphics::Gdi::HBRUSH::default(),
        ..Default::default()
    })
}

fn player_window_class(instance: HINSTANCE, class_name: PCWSTR) -> Result<WNDCLASSW, String> {
    let cursor = unsafe { LoadCursorW(None, IDC_ARROW) }
        .map_err(|error| format!("WINDOW_CURSOR_FAILED: {error}"))?;
    Ok(WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        hInstance: instance,
        hCursor: cursor,
        lpszClassName: class_name,
        hbrBackground: windows::Win32::Graphics::Gdi::HBRUSH(
            unsafe { GetStockObject(BLACK_BRUSH) }.0,
        ),
        ..Default::default()
    })
}

fn create_composition_tree(hwnd: HWND) -> Result<CompositionTree, String> {
    unsafe {
        let device: IDCompositionDevice = DCompositionCreateDevice(None::<&IDXGIDevice>)
            .map_err(|error| format!("DCOMP_DEVICE_FAILED: {error}"))?;
        create_composition_tree_with_device(device, hwnd)
    }
}

unsafe fn create_composition_tree_with_device(
    device: IDCompositionDevice,
    hwnd: HWND,
) -> Result<CompositionTree, String> {
    let target = device
        .CreateTargetForHwnd(hwnd, true)
        .map_err(|error| format!("DCOMP_TARGET_FAILED: {error}"))?;
    let root = device.CreateVisual().map_err(|error| error.to_string())?;
    let video = device.CreateVisual().map_err(|error| error.to_string())?;
    let overlay = device.CreateVisual().map_err(|error| error.to_string())?;
    target.SetRoot(&root).map_err(|error| error.to_string())?;
    root.AddVisual(&video, true, None::<&IDCompositionVisual>)
        .map_err(|error| error.to_string())?;
    root.AddVisual(&overlay, true, Some(&video))
        .map_err(|error| error.to_string())?;
    device.Commit().map_err(|error| error.to_string())?;
    Ok(CompositionTree {
        device,
        _target: target,
        _root: root,
        video,
        overlay,
        swapchain: None,
    })
}

fn create_webview_environment(data_root: &Path) -> Result<ICoreWebView2Environment, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let data = wide_null(data_root);
    CreateCoreWebView2EnvironmentCompletedHandler::wait_for_async_operation(
        Box::new(move |handler| unsafe {
            let options: ICoreWebView2EnvironmentOptions =
                CoreWebView2EnvironmentOptions::default().into();
            CreateCoreWebView2EnvironmentWithOptions(
                PCWSTR::null(),
                PCWSTR(data.as_ptr()),
                Some(&options),
                &handler,
            )
            .map_err(webview2_com::Error::WindowsError)
        }),
        Box::new(move |result, environment| {
            result?;
            tx.send(environment.ok_or_else(|| windows::core::Error::from_win32()))
                .map_err(|_| windows::core::Error::from_win32())?;
            Ok(())
        }),
    )
    .map_err(|error| format!("WEBVIEW_ENVIRONMENT_BEGIN_FAILED: {error}"))?;
    webview2_com::wait_with_pump(rx)
        .map_err(|error| format!("WEBVIEW_ENVIRONMENT_FAILED: {error}"))?
        .map_err(|error| error.to_string())
}

fn create_webview(
    environment: &ICoreWebView2Environment,
    hwnd: HWND,
    assets_root: &Path,
    state: Weak<RefCell<HostUi>>,
    overlay: &IDCompositionVisual,
    target: WebViewTarget,
) -> Result<WebViewHost, String> {
    let environment3: ICoreWebView2Environment3 = environment
        .cast()
        .map_err(|error| format!("WEBVIEW_COMPOSITION_ENVIRONMENT_UNAVAILABLE: {error}"))?;
    let composition = {
        let (tx, rx) = std::sync::mpsc::channel();
        CreateCoreWebView2CompositionControllerCompletedHandler::wait_for_async_operation(
            Box::new(move |handler| unsafe {
                environment3
                    .CreateCoreWebView2CompositionController(hwnd, &handler)
                    .map_err(webview2_com::Error::WindowsError)
            }),
            Box::new(move |result, controller| {
                result?;
                tx.send(controller.ok_or_else(|| windows::core::Error::from_win32()))
                    .map_err(|_| windows::core::Error::from_win32())?;
                Ok(())
            }),
        )
        .map_err(|error| format!("WEBVIEW_CONTROLLER_BEGIN_FAILED: {error}"))?;
        webview2_com::wait_with_pump(rx)
            .map_err(|error| format!("WEBVIEW_CONTROLLER_FAILED: {error}"))?
            .map_err(|error| error.to_string())?
    };
    let controller: ICoreWebView2Controller =
        composition.cast().map_err(|error| error.to_string())?;
    let controller2: ICoreWebView2Controller2 =
        controller.cast().map_err(|error| error.to_string())?;
    unsafe {
        controller2
            .SetDefaultBackgroundColor(COREWEBVIEW2_COLOR {
                A: 0,
                R: 0,
                G: 0,
                B: 0,
            })
            .map_err(|error| error.to_string())?;
        let overlay_target: windows::core::IUnknown =
            overlay.cast().map_err(|error| error.to_string())?;
        composition
            .SetRootVisualTarget(&overlay_target)
            .map_err(|error| error.to_string())?;
        controller
            .SetIsVisible(true)
            .map_err(|error| error.to_string())?;
    }
    let webview = unsafe { controller.CoreWebView2() }.map_err(|error| error.to_string())?;
    if let Ok(settings) = unsafe { webview.Settings() } {
        unsafe {
            let _ = settings.SetAreDevToolsEnabled(cfg!(debug_assertions));
            let _ = settings.SetAreDefaultContextMenusEnabled(false);
        }
    }
    let weak = state.clone();
    unsafe {
        let mut cursor_token = 0;
        composition
            .add_CursorChanged(
                &CursorChangedEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(sender) = sender {
                        let _ = apply_webview_cursor(&sender);
                    }
                    Ok(())
                })),
                &mut cursor_token,
            )
            .map_err(|error| error.to_string())?;
        apply_webview_cursor(&composition)?;

        let mut token = 0;
        webview
            .add_WebMessageReceived(
                &WebMessageReceivedEventHandler::create(Box::new(move |_sender, args| {
                    if let (Some(args), Some(state)) = (args, weak.upgrade()) {
                        let mut raw = PWSTR::null();
                        if args.WebMessageAsJson(&mut raw).is_ok() {
                            let text = CoTaskMemPWSTR::from(raw).to_string();
                            if let Ok(command) = serde_json::from_str::<PlayerCommand>(&text) {
                                eprintln!("VIDEO_PLAYER_UI_COMMAND={:?}", command.kind);
                                let request_id = command.request_id.clone();
                                let command_kind = command.kind.clone();
                                let result = {
                                    let mut state = state.borrow_mut();
                                    handle_player_command(&mut state, command, target)
                                };
                                if let Err(error) = result {
                                    let mut state = state.borrow_mut();
                                    state.last_command_error =
                                        Some(ipc_error("PLAYER_COMMAND_REJECTED", error.clone()));
                                    let _ = post_snapshot(&mut state);
                                    if let (Some(webview), Some(session)) =
                                        (webview_for_target(&state, target), state.session.as_ref())
                                    {
                                        let code = error
                                            .split(':')
                                            .next()
                                            .unwrap_or("PLAYER_COMMAND_REJECTED")
                                            .trim()
                                            .to_string();
                                        let event = HostToPlayerMessage::CommandResult {
                                            protocol_version: PROTOCOL_VERSION,
                                            request_id,
                                            session_id: session.session_id.clone(),
                                            revision: state.revision,
                                            command_kind,
                                            status: "error".into(),
                                            code: Some(code),
                                            message: Some(error),
                                        };
                                        let _ = post_web_message(&webview.webview, &event);
                                    }
                                }
                            }
                        }
                    }
                    Ok(())
                })),
                &mut token,
            )
            .map_err(|error| error.to_string())?;
        let webview3: ICoreWebView2_3 = webview.cast().map_err(|error| error.to_string())?;
        // WebView2's virtual-host folder mapping does not load content from the
        // verbatim (\\?\) form returned by std::fs::canonicalize on Windows.
        // Keep canonical paths for validation and native DLL loading, but pass
        // the equivalent regular DOS/UNC form to WebView2.
        let webview_assets_root = webview_mapping_path(assets_root);
        let assets = wide_null(&webview_assets_root);
        webview3
            .SetVirtualHostNameToFolderMapping(
                PCWSTR(wide_null_str("sakurava-player.local").as_ptr()),
                PCWSTR(assets.as_ptr()),
                COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW,
            )
            .map_err(|error| error.to_string())?;
        let url = format!(
            "https://sakurava-player.local/video-player.html?presentation={}",
            target.as_str(),
        );
        webview
            .Navigate(PCWSTR(wide_null_str(&url).as_ptr()))
            .map_err(|error| error.to_string())?;
    }
    Ok(WebViewHost {
        composition,
        controller,
        webview,
    })
}

fn start_ipc_reader(hwnd: HWND, queue: Arc<Mutex<VecDeque<MainToHostMessage>>>) {
    let hwnd_value = hwnd.0 as usize;
    thread::spawn(move || {
        let hwnd = HWND(hwnd_value as *mut c_void);
        for line in BufReader::new(io::stdin()).lines() {
            let Ok(line) = line else { break };
            match serde_json::from_str::<MainToHostMessage>(&line) {
                Ok(message) => {
                    if let Ok(mut pending) = queue.lock() {
                        pending.push_back(message);
                    }
                    unsafe {
                        let _ = PostMessageW(Some(hwnd), WM_HOST_IPC, WPARAM(0), LPARAM(0));
                    }
                }
                Err(error) => emit_to_main(
                    HostToMainKind::FatalHostError {
                        error: ipc_error("IPC_MESSAGE_INVALID", error.to_string()),
                    },
                    "invalid-ipc",
                ),
            }
        }
        unsafe {
            let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    });
}

fn handle_main_message(state: &mut HostUi, message: MainToHostMessage) -> Result<(), String> {
    if message.protocol_version != PROTOCOL_VERSION {
        return Err("IPC_PROTOCOL_UNSUPPORTED".into());
    }
    match message.kind {
        MainToHostKind::Handshake { parent_pid } => {
            eprintln!("VIDEO_PLAYER_PARENT_PID={parent_pid}")
        }
        MainToHostKind::OpenSource(source) => {
            if state.session.is_some() {
                return Err("SESSION_ALREADY_OPEN".into());
            }
            state
                .mpv
                .command(&["loadfile", &source.canonical_path, "replace"])?;
            state.pending_sidecar_subtitles = discover_sidecar_subtitles(Path::new(
                &source.canonical_path,
            ))
            .unwrap_or_else(|error| {
                eprintln!("VIDEO_PLAYER_SIDECAR_DISCOVERY_ERROR={error}");
                Vec::new()
            });
            state.source_loaded = false;
            state.source_failed = false;
            state.source_opened_at = Some(Instant::now());
            state.first_frame_recorded = false;
            state.controls_ready_recorded = false;
            state.pending_seek = None;
            state.last_command_error = None;
            state.main_aspect_ratio_applied = None;
            state.source_load_count = state.source_load_count.saturating_add(1);
            eprintln!("VIDEO_PLAYER_SOURCE_LOAD_COUNT={}", state.source_load_count,);
            state.session = Some(source.clone());
            emit_to_main(
                HostToMainKind::SourceAccepted {
                    session_id: source.session_id.clone(),
                    source_identity: source.source_identity.clone(),
                },
                &message.request_id,
            );
            emit_to_main(
                HostToMainKind::SessionOpened {
                    session_id: source.session_id,
                },
                &message.request_id,
            );
        }
        MainToHostKind::ReplaceSource(source) => {
            if state.session.is_none() {
                return Err("SESSION_NOT_OPEN".into());
            }
            state
                .mpv
                .command(&["loadfile", &source.canonical_path, "replace"])?;
            state.pending_sidecar_subtitles = discover_sidecar_subtitles(Path::new(
                &source.canonical_path,
            ))
            .unwrap_or_else(|error| {
                eprintln!("VIDEO_PLAYER_SIDECAR_DISCOVERY_ERROR={error}");
                Vec::new()
            });
            state.source_loaded = false;
            state.source_failed = false;
            state.source_opened_at = Some(Instant::now());
            state.first_frame_recorded = false;
            state.controls_ready_recorded = false;
            state.pending_seek = None;
            state.last_command_error = None;
            state.main_aspect_ratio_applied = None;
            state.source_load_count = state.source_load_count.saturating_add(1);
            eprintln!("VIDEO_PLAYER_SOURCE_LOAD_COUNT={}", state.source_load_count);
            state.session = Some(source.clone());
            focus_active_presentation(state);
            emit_to_main(
                HostToMainKind::SourceAccepted {
                    session_id: source.session_id.clone(),
                    source_identity: source.source_identity.clone(),
                },
                &message.request_id,
            );
            emit_to_main(
                HostToMainKind::SessionOpened {
                    session_id: source.session_id,
                },
                &message.request_id,
            );
        }
        MainToHostKind::FocusMain => focus_active_presentation(state),
        MainToHostKind::CloseSession { .. } | MainToHostKind::Shutdown => unsafe {
            let _ = PostMessageW(Some(state.hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
        },
        MainToHostKind::HealthCheck => emit_to_main(
            HostToMainKind::Health {
                host_pid: std::process::id(),
            },
            &message.request_id,
        ),
    }
    Ok(())
}

fn handle_player_command(
    state: &mut HostUi,
    command: PlayerCommand,
    origin: WebViewTarget,
) -> Result<(), String> {
    if command.protocol_version != PROTOCOL_VERSION {
        return Err("PLAYER_PROTOCOL_UNSUPPORTED".into());
    }
    if let (Some(expected), Some(actual)) = (
        state
            .session
            .as_ref()
            .map(|value| value.session_id.as_str()),
        command.session_id.as_deref(),
    ) {
        if expected != actual {
            return Err("PLAYER_SESSION_STALE".into());
        }
    }
    let command_kind = command.kind.clone();
    let mut result_status = "success".to_string();
    let mut result_code = None;
    let mut result_message = None;
    let should_acknowledge = !matches!(
        command.kind,
        PlayerCommandKind::BridgeReady | PlayerCommandKind::RequestSnapshot
    );
    match command.kind {
        PlayerCommandKind::BridgeReady => {
            post_snapshot(state)?;
            if let Some(webview) = webview_for_target(state, origin) {
                unsafe {
                    webview
                        .controller
                        .MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC)
                        .map_err(|error| error.to_string())?;
                }
                eprintln!(
                    "VIDEO_PLAYER_WEBVIEW_FOCUS=BRIDGE_READY;TARGET={}",
                    origin.as_str()
                );
            }
        }
        PlayerCommandKind::RequestSnapshot => post_snapshot(state)?,
        PlayerCommandKind::Play => {
            state.mpv.set_property("pause", "no")?;
            post_snapshot(state)?;
        }
        PlayerCommandKind::Pause => {
            state.mpv.set_property("pause", "yes")?;
            post_snapshot(state)?;
        }
        PlayerCommandKind::SeekAbsolute => {
            let seconds = command
                .payload
                .get("seconds")
                .and_then(|value| value.as_f64())
                .ok_or("SEEK_VALUE_INVALID")?;
            if !seconds.is_finite() || seconds < 0.0 {
                return Err("SEEK_VALUE_INVALID".into());
            }
            state.pending_seek = Some(("ABSOLUTE_SEEK_MS".into(), Instant::now()));
            state
                .mpv
                .command(&["seek", &seconds.to_string(), "absolute+exact"])?;
        }
        PlayerCommandKind::SeekRelative => {
            let seconds = payload_number(&command, "seconds")?;
            if !matches!(
                seconds,
                -600.0 | -60.0 | -10.0 | -1.0 | 1.0 | 10.0 | 60.0 | 600.0
            ) {
                return Err("SEEK_RELATIVE_VALUE_NOT_ALLOWED".into());
            }
            state.pending_seek = Some(("RELATIVE_SEEK_MS".into(), Instant::now()));
            state
                .mpv
                .command(&["seek", &seconds.to_string(), "relative+exact"])?;
        }
        PlayerCommandKind::FrameStep => {
            state.pending_seek = Some(("FRAME_STEP_MS".into(), Instant::now()));
            state.mpv.command(&["frame-step"])?;
        }
        PlayerCommandKind::FrameBackStep => {
            state.pending_seek = Some(("FRAME_BACK_STEP_MS".into(), Instant::now()));
            state.mpv.command(&["frame-back-step"])?;
        }
        PlayerCommandKind::SetSpeed => {
            let speed = payload_number(&command, "speed")?;
            if !is_allowed_speed(speed) {
                return Err("PLAYBACK_SPEED_NOT_ALLOWED".into());
            }
            state.mpv.set_property("speed", &speed.to_string())?;
        }
        PlayerCommandKind::SetVolume => {
            let volume = payload_number(&command, "volume")?;
            if !volume.is_finite() || !(0.0..=100.0).contains(&volume) {
                return Err("VOLUME_VALUE_INVALID".into());
            }
            if volume > 0.0 {
                state.last_nonzero_volume = volume;
            }
            state.mpv.set_property("volume", &volume.to_string())?;
            if volume > 0.0 {
                state.mpv.set_property("mute", "no")?;
            }
        }
        PlayerCommandKind::SetMuted => {
            set_muted(state, payload_bool(&command, "muted")?)?;
        }
        PlayerCommandKind::ToggleMute => {
            let volume = state.mpv.get_double("volume").unwrap_or(0.0);
            let muted = state.mpv.get_flag("mute").unwrap_or(false);
            set_muted(state, !(muted || volume <= 0.0))?;
        }
        PlayerCommandKind::SetLoopA => {
            let seconds = validated_media_time(state, &command, "seconds")?;
            if state
                .mpv
                .get_double("ab-loop-b")
                .is_some_and(|loop_b| loop_b <= seconds)
            {
                return Err("LOOP_RANGE_INVALID".into());
            }
            state.mpv.set_property("ab-loop-a", &seconds.to_string())?;
        }
        PlayerCommandKind::SetLoopB => {
            let seconds = validated_media_time(state, &command, "seconds")?;
            let loop_a = state
                .mpv
                .get_double("ab-loop-a")
                .ok_or("LOOP_START_REQUIRED")?;
            if seconds <= loop_a {
                return Err("LOOP_RANGE_INVALID".into());
            }
            state.mpv.set_property("ab-loop-b", &seconds.to_string())?;
        }
        PlayerCommandKind::ClearLoop => {
            state.mpv.set_property("ab-loop-a", "no")?;
            state.mpv.set_property("ab-loop-b", "no")?;
        }
        PlayerCommandKind::SetSubtitleTrack => {
            let id = command
                .payload
                .get("id")
                .and_then(|value| value.as_i64())
                .ok_or("SUBTITLE_TRACK_INVALID")?;
            if !subtitle_tracks(&state.mpv)
                .iter()
                .any(|track| track.id == id)
            {
                return Err("SUBTITLE_TRACK_INVALID".into());
            }
            state.mpv.set_property("sid", &id.to_string())?;
            state.previous_subtitle_id = Some(id);
            if state.active_external_subtitle_id != Some(id) {
                state.active_external_subtitle_id = None;
                state.active_external_subtitle_path = None;
            }
        }
        PlayerCommandKind::SubtitleOff => {
            if let Some(id) = active_subtitle_id(&state.mpv) {
                state.previous_subtitle_id = Some(id);
            }
            state.mpv.set_property("sid", "no")?;
        }
        PlayerCommandKind::ToggleSubtitle => toggle_subtitle(state)?,
        PlayerCommandKind::LoadExternalSubtitle => {
            if let Some(path) = pick_external_subtitle(state.hwnd)? {
                let title = load_external_subtitle_path(state, &path, true)?;
                eprintln!("VIDEO_PLAYER_EXTERNAL_SUBTITLE=LOADED");
                result_code = Some("EXTERNAL_SUBTITLE_LOADED".into());
                result_message = Some(title);
            } else {
                eprintln!("VIDEO_PLAYER_EXTERNAL_SUBTITLE=CANCELLED");
                result_status = "cancelled".into();
                result_code = Some("EXTERNAL_SUBTITLE_CANCELLED".into());
            }
        }
        PlayerCommandKind::SetSubtitleAppearance => {
            apply_subtitle_appearance(state, &command)?;
        }
        PlayerCommandKind::SetSubtitleDelay => {
            let seconds = payload_number(&command, "seconds")?;
            if !(-10.0..=10.0).contains(&seconds) {
                return Err("SUBTITLE_DELAY_INVALID".into());
            }
            state.mpv.set_property("sub-delay", &seconds.to_string())?;
        }
        PlayerCommandKind::SetSubtitleInset => {
            let safe_area_bottom_ratio = payload_number(&command, "safeAreaBottomRatio")?;
            let overlap_css_pixels = payload_number(&command, "overlapCssPixels")?;
            let viewport_width_css_pixels = payload_number(&command, "viewportWidthCssPixels")?;
            let viewport_height_css_pixels = payload_number(&command, "viewportHeightCssPixels")?;
            let device_scale_factor = payload_number(&command, "deviceScaleFactor")?;
            if !(0.0..=1.0).contains(&safe_area_bottom_ratio) {
                return Err("SUBTITLE_INSET_INVALID".into());
            }
            if overlap_css_pixels < 0.0
                || viewport_width_css_pixels <= 0.0
                || viewport_height_css_pixels <= 0.0
                || device_scale_factor <= 0.0
            {
                return Err("SUBTITLE_GEOMETRY_INVALID".into());
            }
            if (state.subtitle_dynamic_bottom_clearance_ratio - safe_area_bottom_ratio).abs()
                > f64::EPSILON
            {
                state.subtitle_dynamic_bottom_clearance_ratio = safe_area_bottom_ratio;
                if matches!(
                    state.subtitle_position_mode,
                    SubtitlePositionMode::Source | SubtitlePositionMode::Bottom
                ) {
                    apply_subtitle_positioning(state)?;
                }
            }
        }
        PlayerCommandKind::CaptureScreenshot => {
            let saved = capture_screenshot(state, &command.request_id)?;
            state.last_screenshot_path = Some(saved.clone());
            result_code = Some("VIDEO_SCREENSHOT_SAVED".into());
            result_message = Some(saved.display().to_string());
        }
        PlayerCommandKind::OpenScreenshotFolder => {
            let saved = state
                .last_screenshot_path
                .as_ref()
                .ok_or("VIDEO_SCREENSHOT_NOT_AVAILABLE")?;
            reveal_file(&saved.display().to_string())?;
            result_code = Some("VIDEO_SCREENSHOT_FOLDER_OPENED".into());
            result_message = Some(saved.display().to_string());
        }
        PlayerCommandKind::OpenExternally => {
            let source = state.session.as_ref().ok_or("SESSION_NOT_OPEN")?;
            open_media_file_with_default_app(Path::new(&source.canonical_path))?;
            eprintln!("VIDEO_PLAYER_OPEN_EXTERNALLY=EXPLICIT");
        }
        PlayerCommandKind::OpenContactSheet => {
            let source = state.session.as_ref().ok_or("SESSION_NOT_OPEN")?;
            emit_to_main(
                HostToMainKind::ContactSheetRequested {
                    source_identity: source.source_identity.clone(),
                    display_name: source.display_name.clone(),
                    resolution: source.resolution.clone(),
                    duration_seconds: state.mpv.get_double("duration").unwrap_or(0.0).max(0.0),
                    subtitle_id: active_subtitle_id(&state.mpv),
                    subtitle_path: active_subtitle_id(&state.mpv)
                        .filter(|id| state.active_external_subtitle_id == Some(*id))
                        .and_then(|_| state.active_external_subtitle_path.as_ref())
                        .map(|path| path.display().to_string()),
                },
                &command.request_id,
            );
            result_code = Some("CONTACT_SHEET_REQUESTED".into());
        }
        PlayerCommandKind::OpenSubtitleAppearance => unsafe {
            let _ = PostMessageW(
                Some(state.hwnd),
                WM_HOST_OPEN_SUBTITLE_APPEARANCE,
                WPARAM(0),
                LPARAM(0),
            );
            result_code = Some("SUBTITLE_APPEARANCE_WINDOW_REQUESTED".into());
        },
        PlayerCommandKind::OpenShortcuts => unsafe {
            let _ = PostMessageW(
                Some(state.hwnd),
                WM_HOST_OPEN_SHORTCUTS,
                WPARAM(0),
                LPARAM(0),
            );
            result_code = Some("SHORTCUTS_WINDOW_REQUESTED".into());
        },
        PlayerCommandKind::EnterFullscreen => set_main_fullscreen(state, true)?,
        PlayerCommandKind::ExitFullscreen => set_main_fullscreen(state, false)?,
        PlayerCommandKind::ToggleFullscreen => set_main_fullscreen(state, !state.fullscreen)?,
        PlayerCommandKind::EnterPip => unsafe {
            let _ = PostMessageW(Some(state.hwnd), WM_HOST_ENTER_PIP, WPARAM(0), LPARAM(0));
        },
        PlayerCommandKind::ReturnFromPip => unsafe {
            let _ = PostMessageW(Some(state.hwnd), WM_HOST_RETURN_MAIN, WPARAM(0), LPARAM(0));
        },
        PlayerCommandKind::Close => unsafe {
            match origin {
                WebViewTarget::Pip => {
                    let _ =
                        PostMessageW(Some(state.hwnd), WM_HOST_RETURN_MAIN, WPARAM(0), LPARAM(0));
                }
                WebViewTarget::Main => {
                    let _ = PostMessageW(Some(state.hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
                }
                WebViewTarget::Utility(kind) => {
                    if let Some(utility) =
                        state.utilities.iter().find(|utility| utility.kind == kind)
                    {
                        let _ = PostMessageW(Some(utility.hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
                    }
                }
            }
        },
    }
    state.last_command_error = None;
    if should_acknowledge {
        post_snapshot(state)?;
    }
    if let (Some(webview), Some(session)) =
        (webview_for_target(state, origin), state.session.as_ref())
    {
        let event = HostToPlayerMessage::CommandResult {
            protocol_version: PROTOCOL_VERSION,
            request_id: command.request_id,
            session_id: session.session_id.clone(),
            revision: state.revision,
            command_kind,
            status: result_status,
            code: result_code,
            message: result_message,
        };
        post_web_message(&webview.webview, &event)?;
    }
    Ok(())
}

fn capture_screenshot(state: &mut HostUi, request_id: &str) -> Result<PathBuf, String> {
    let session = state.session.as_ref().ok_or("SESSION_NOT_OPEN")?;
    let parent = session
        .output_parent
        .as_deref()
        .ok_or("GLOBAL_OUTPUT_PARENT_NOT_CONFIGURED")?;
    let prepared = prepare_category(parent, OutputCategory::VideoScreenshot)?;
    let directory = PathBuf::from(prepared.directory_path);
    let request_token = sanitize_file_component(request_id, "request");
    let temporary = directory.join(format!(".sakurava-screenshot-{request_token}.png"));
    if temporary.exists() {
        return Err("VIDEO_SCREENSHOT_TEMP_COLLISION".into());
    }
    let temporary_text = temporary.display().to_string();
    let capture = state
        .mpv
        .command(&["screenshot-to-file", &temporary_text, "subtitles"]);
    if let Err(error) = capture {
        let _ = fs::remove_file(&temporary);
        return Err(format!("VIDEO_SCREENSHOT_CAPTURE_FAILED: {error}"));
    }
    let bytes =
        fs::read(&temporary).map_err(|error| format!("VIDEO_SCREENSHOT_READ_FAILED: {error}"))?;
    if bytes.len() < 32 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        let _ = fs::remove_file(&temporary);
        return Err("VIDEO_SCREENSHOT_INVALID_PNG".into());
    }
    let title = sanitize_file_component(&session.display_name, "Video");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "VIDEO_SCREENSHOT_CLOCK_INVALID")?
        .as_millis();
    let base_name = format!("Sakurava Screenshot - {title} - {timestamp}");
    let result = publish_unique_file(&temporary, &directory, &base_name, "png");
    let _ = fs::remove_file(&temporary);
    result.map_err(|error| format!("VIDEO_SCREENSHOT_SAVE_FAILED: {error}"))
}

fn apply_subtitle_appearance(state: &mut HostUi, command: &PlayerCommand) -> Result<(), String> {
    let font_family = command
        .payload
        .get("fontFamily")
        .and_then(|value| value.as_str())
        .ok_or("SUBTITLE_FONT_INVALID")?;
    if font_family.trim().is_empty() || font_family.len() > 128 {
        return Err("SUBTITLE_FONT_INVALID".into());
    }
    if font_family.contains(',') || font_family.contains('=') {
        return Err("SUBTITLE_FONT_INVALID".into());
    }
    let font_family_override = payload_bool(command, "fontFamilyOverride")?;
    let font_size_override = payload_bool(command, "fontSizeOverride")?;
    let font_size = payload_number(command, "fontSize")?;
    if !(12.0..=96.0).contains(&font_size) {
        return Err("SUBTITLE_FONT_SIZE_INVALID".into());
    }
    let text_color = subtitle_rgba(command, "textColor", "textOpacity")?;
    let text_color_override = payload_bool(command, "textColorOverride")?;
    let background_color = subtitle_rgba(command, "backgroundColor", "backgroundOpacity")?;
    let background_override = payload_bool(command, "backgroundOverride")?;
    let base_position = command
        .payload
        .get("basePosition")
        .and_then(|value| value.as_str())
        .ok_or("SUBTITLE_POSITION_INVALID")?;
    let vertical_adjustment = payload_number(command, "verticalAdjustment")?;
    if !(-100.0..=100.0).contains(&vertical_adjustment) {
        return Err("SUBTITLE_POSITION_INVALID".into());
    }
    let position_mode =
        SubtitlePositionMode::parse(base_position).ok_or("SUBTITLE_POSITION_INVALID")?;
    let edge_style = command
        .payload
        .get("edgeStyle")
        .and_then(|value| value.as_str())
        .ok_or("SUBTITLE_EDGE_STYLE_INVALID")?;
    let edge_style_override = payload_bool(command, "edgeStyleOverride")?;
    let (outline, shadow) = match edge_style {
        "outline" => ("2", "0"),
        "shadow" => ("0", "2"),
        "none" => ("0", "0"),
        _ => return Err("SUBTITLE_EDGE_STYLE_INVALID".into()),
    };
    state.mpv.set_property("sub-font", font_family.trim())?;
    // mpv defines subtitle sizes and margins as scaled pixels relative to a
    // 720px window. Keep plain text subtitles responsive to the presentation
    // viewport while leaving authored ASS styles under script ownership.
    state.mpv.set_property("sub-scale-by-window", "yes")?;
    state.mpv.set_property("sub-scale-with-window", "yes")?;
    let ass_appearance_overrides = subtitle_ass_style_overrides(
        font_family,
        font_family_override,
        font_size,
        font_size_override,
        &text_color,
        text_color_override,
        &background_color,
        background_override,
        edge_style,
        edge_style_override,
    )?;
    state
        .mpv
        .set_property("sub-font-size", &font_size.round().to_string())?;
    state.mpv.set_property("sub-color", &text_color)?;
    state
        .mpv
        .set_property("sub-back-color", &background_color)?;
    state
        .mpv
        .set_property("sub-border-style", subtitle_border_style(&background_color))?;
    state.mpv.set_property("sub-outline-size", outline)?;
    state.mpv.set_property("sub-shadow-offset", shadow)?;
    state.subtitle_position_mode = position_mode;
    state.subtitle_vertical_adjustment = vertical_adjustment;
    state.subtitle_ass_appearance_overrides = ass_appearance_overrides;
    apply_subtitle_positioning(state)?;
    Ok(())
}

fn apply_subtitle_positioning(state: &mut HostUi) -> Result<(), String> {
    let effective_position = subtitle_effective_position(
        state.subtitle_position_mode,
        state.subtitle_vertical_adjustment,
        state.subtitle_dynamic_bottom_clearance_ratio,
    )
    .ok_or("SUBTITLE_POSITION_INVALID")?;
    let ass_style_overrides = subtitle_ass_style_overrides_with_position(
        &state.subtitle_ass_appearance_overrides,
        state.subtitle_position_mode,
    );
    state
        .mpv
        .set_property("sub-ass-style-overrides", &ass_style_overrides)?;
    state.mpv.set_property(
        "sub-ass-override",
        subtitle_ass_override_mode(
            &ass_style_overrides,
            state.subtitle_position_mode,
            state.subtitle_dynamic_bottom_clearance_ratio,
        ),
    )?;
    state.mpv.set_property(
        "sub-align-x",
        state.subtitle_position_mode.plain_horizontal_alignment(),
    )?;
    state.mpv.set_property(
        "sub-align-y",
        state.subtitle_position_mode.plain_vertical_alignment(),
    )?;
    state
        .mpv
        .set_property("sub-pos", &format!("{effective_position:.3}"))?;
    state.subtitle_middle_geometry = None;
    Ok(())
}

fn reconcile_middle_subtitle_geometry(state: &mut HostUi) -> Result<(), String> {
    if state.subtitle_position_mode != SubtitlePositionMode::Middle {
        state.subtitle_middle_geometry = None;
        return Ok(());
    }
    let Some(geometry) = state.mpv.get_subtitle_rendered_geometry() else {
        return Ok(());
    };
    if state.subtitle_middle_geometry == Some(geometry) {
        return Ok(());
    }
    let target_anchor = subtitle_effective_position(
        SubtitlePositionMode::Middle,
        state.subtitle_vertical_adjustment,
        state.subtitle_dynamic_bottom_clearance_ratio,
    )
    .ok_or("SUBTITLE_POSITION_INVALID")?
        / 100.0;
    let current_position = state
        .mpv
        .get_double("sub-pos")
        .ok_or("SUBTITLE_POSITION_UNAVAILABLE")?;
    let corrected_position =
        subtitle_middle_corrected_position(current_position, target_anchor, geometry)
            .ok_or("SUBTITLE_RENDERED_GEOMETRY_INVALID")?;
    if (corrected_position - current_position).abs() > 0.001 {
        state
            .mpv
            .set_property("sub-pos", &format!("{corrected_position:.3}"))?;
        eprintln!(
            "VIDEO_PLAYER_SUBTITLE_MIDDLE_GEOMETRY=APPLIED;CHANGE_ID={};BOUNDS={},{},{},{};OUTPUT={}x{};TARGET_CENTER={:.3};SUB_POS={:.3}",
            geometry.change_id,
            geometry.x,
            geometry.y,
            geometry.width,
            geometry.height,
            geometry.output_width,
            geometry.output_height,
            target_anchor * geometry.output_height as f64,
            corrected_position,
        );
    }
    state.subtitle_middle_geometry = Some(geometry);
    Ok(())
}

fn subtitle_middle_corrected_position(
    current_position: f64,
    target_anchor: f64,
    geometry: SubtitleRenderedGeometry,
) -> Option<f64> {
    if !current_position.is_finite()
        || !target_anchor.is_finite()
        || !(0.0..=1.0).contains(&target_anchor)
        || !geometry.is_valid()
    {
        return None;
    }
    let target_center = target_anchor * geometry.output_height as f64;
    let center_error = target_center - geometry.center_y();
    if center_error.abs() <= 0.5 {
        return Some(current_position);
    }
    Some(
        (current_position + center_error * 100.0 / geometry.output_height as f64).clamp(0.0, 100.0),
    )
}

fn subtitle_effective_position(
    position_mode: SubtitlePositionMode,
    vertical_adjustment: f64,
    dynamic_bottom_clearance_ratio: f64,
) -> Option<f64> {
    if !vertical_adjustment.is_finite()
        || !(-100.0..=100.0).contains(&vertical_adjustment)
        || !dynamic_bottom_clearance_ratio.is_finite()
        || !(0.0..=1.0).contains(&dynamic_bottom_clearance_ratio)
    {
        return None;
    }
    if position_mode == SubtitlePositionMode::Source {
        return Some((1.0 - dynamic_bottom_clearance_ratio) * 100.0);
    }

    let region = position_mode.anchor_region()?;
    let adjustment_ratio = vertical_adjustment.abs() / 100.0;
    // Preserve the existing operator-facing direction: positive adjustment
    // moves the anchor upward, while negative adjustment moves it downward.
    let requested_anchor = if vertical_adjustment >= 0.0 {
        region.neutral - (region.neutral - region.min) * adjustment_ratio
    } else {
        region.neutral + (region.max - region.neutral) * adjustment_ratio
    };
    let effective_max = if position_mode == SubtitlePositionMode::Bottom {
        region.max.min(1.0 - dynamic_bottom_clearance_ratio)
    } else {
        region.max
    };
    if effective_max < region.min {
        return None;
    }

    Some(requested_anchor.clamp(region.min, effective_max) * 100.0)
}

fn subtitle_ass_style_overrides_with_position(
    appearance_overrides: &str,
    position_mode: SubtitlePositionMode,
) -> String {
    let mut overrides = appearance_overrides
        .split(',')
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if let Some(alignment) = position_mode.ass_alignment() {
        overrides.push(format!("Alignment={alignment}"));
    }
    overrides.join(",")
}

fn subtitle_ass_style_overrides(
    font_family: &str,
    font_family_override: bool,
    font_size: f64,
    font_size_override: bool,
    text_color: &str,
    text_color_override: bool,
    background_color: &str,
    background_override: bool,
    edge_style: &str,
    edge_style_override: bool,
) -> Result<String, String> {
    let mut overrides = Vec::new();
    if font_family_override {
        overrides.push(format!("FontName={}", font_family.trim()));
    }
    if font_size_override {
        overrides.push(format!("FontSize={}", font_size.round()));
    }
    if text_color_override {
        overrides.push(format!("PrimaryColour={}", subtitle_ass_color(text_color)?));
    }
    if background_override {
        overrides.push(format!(
            "BackColour={}",
            subtitle_ass_color(background_color)?
        ));
        overrides.push(format!(
            "BorderStyle={}",
            if background_color.starts_with("#00") {
                1
            } else {
                4
            }
        ));
    }
    if edge_style_override {
        let (outline, shadow) = match edge_style {
            "outline" => (2, 0),
            "shadow" => (0, 2),
            "none" => (0, 0),
            _ => return Err("SUBTITLE_EDGE_STYLE_INVALID".into()),
        };
        if !background_override {
            overrides.push("BorderStyle=1".into());
        }
        overrides.push(format!("Outline={outline}"));
        overrides.push(format!("Shadow={shadow}"));
    }
    Ok(overrides.join(","))
}

fn subtitle_ass_color(color: &str) -> Result<String, String> {
    if color.len() != 9
        || !color.starts_with('#')
        || !color[1..].chars().all(|value| value.is_ascii_hexdigit())
    {
        return Err("SUBTITLE_COLOR_INVALID".into());
    }
    let opacity =
        u8::from_str_radix(&color[1..3], 16).map_err(|_| "SUBTITLE_COLOR_INVALID".to_string())?;
    Ok(format!(
        "&H{:02X}{}{}{}",
        255 - opacity,
        &color[7..9],
        &color[5..7],
        &color[3..5],
    ))
}

fn subtitle_ass_override_mode(
    style_overrides: &str,
    position_mode: SubtitlePositionMode,
    dynamic_bottom_clearance_ratio: f64,
) -> &'static str {
    let source_dynamic_clearance =
        position_mode == SubtitlePositionMode::Source && dynamic_bottom_clearance_ratio > 0.0;
    let explicit_position = position_mode != SubtitlePositionMode::Source;
    if style_overrides.is_empty() && !source_dynamic_clearance && !explicit_position {
        "no"
    } else {
        "yes"
    }
}

fn subtitle_border_style(background_color: &str) -> &'static str {
    if background_color.starts_with("#00") {
        "outline-and-shadow"
    } else {
        "background-box"
    }
}

fn subtitle_rgba(
    command: &PlayerCommand,
    color_key: &str,
    opacity_key: &str,
) -> Result<String, String> {
    let color = command
        .payload
        .get(color_key)
        .and_then(|value| value.as_str())
        .ok_or("SUBTITLE_COLOR_INVALID")?;
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].chars().all(|value| value.is_ascii_hexdigit())
    {
        return Err("SUBTITLE_COLOR_INVALID".into());
    }
    let opacity = payload_number(command, opacity_key)?;
    if !(0.0..=1.0).contains(&opacity) {
        return Err("SUBTITLE_OPACITY_INVALID".into());
    }
    Ok(format!(
        "#{:02X}{}",
        (opacity * 255.0).round() as u8,
        &color[1..].to_ascii_uppercase()
    ))
}

fn payload_number(command: &PlayerCommand, key: &str) -> Result<f64, String> {
    command
        .payload
        .get(key)
        .and_then(|value| value.as_f64())
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("{}_VALUE_INVALID", key.to_uppercase()))
}

fn payload_bool(command: &PlayerCommand, key: &str) -> Result<bool, String> {
    command
        .payload
        .get(key)
        .and_then(|value| value.as_bool())
        .ok_or_else(|| format!("{}_VALUE_INVALID", key.to_uppercase()))
}

fn validated_media_time(state: &HostUi, command: &PlayerCommand, key: &str) -> Result<f64, String> {
    let seconds = payload_number(command, key)?;
    let duration = state.mpv.get_double("duration").unwrap_or(0.0);
    if seconds < 0.0 || (duration > 0.0 && seconds > duration) {
        Err("MEDIA_TIME_INVALID".into())
    } else {
        Ok(seconds)
    }
}

fn is_allowed_speed(speed: f64) -> bool {
    [0.25, 0.5, 1.0, 1.5, 2.0, 3.0]
        .iter()
        .any(|allowed| (speed - allowed).abs() < f64::EPSILON)
}

fn set_muted(state: &mut HostUi, muted: bool) -> Result<(), String> {
    let volume = state.mpv.get_double("volume").unwrap_or(0.0);
    if muted {
        if volume > 0.0 {
            state.last_nonzero_volume = volume;
        }
        state.mpv.set_property("mute", "yes")
    } else {
        if volume <= 0.0 {
            state
                .mpv
                .set_property("volume", &state.last_nonzero_volume.max(1.0).to_string())?;
        }
        state.mpv.set_property("mute", "no")
    }
}

fn toggle_subtitle(state: &mut HostUi) -> Result<(), String> {
    if let Some(id) = active_subtitle_id(&state.mpv) {
        state.previous_subtitle_id = Some(id);
        return state.mpv.set_property("sid", "no");
    }
    let tracks = subtitle_tracks(&state.mpv);
    let id = state
        .previous_subtitle_id
        .filter(|id| tracks.iter().any(|track| track.id == *id))
        .or_else(|| tracks.first().map(|track| track.id));
    if let Some(id) = id {
        state.previous_subtitle_id = Some(id);
        state.mpv.set_property("sid", &id.to_string())
    } else {
        Ok(())
    }
}

fn active_subtitle_id(mpv: &MpvApi) -> Option<i64> {
    mpv.get_string("sid")?.parse().ok()
}

fn subtitle_tracks(mpv: &MpvApi) -> Vec<SubtitleTrack> {
    let count = mpv.get_int64("track-list/count").unwrap_or(0).max(0);
    (0..count)
        .filter_map(|index| {
            let prefix = format!("track-list/{index}");
            if mpv.get_string(&format!("{prefix}/type")).as_deref() != Some("sub") {
                return None;
            }
            let id = mpv.get_int64(&format!("{prefix}/id"))?;
            let language = mpv.get_string(&format!("{prefix}/lang"));
            let title = mpv.get_string(&format!("{prefix}/title"));
            let label = title
                .clone()
                .or_else(|| language.clone())
                .or_else(|| {
                    mpv.get_string(&format!("{prefix}/external-filename"))
                        .and_then(|value| {
                            Path::new(&value)
                                .file_name()
                                .and_then(|name| name.to_str())
                                .map(str::to_string)
                        })
                })
                .unwrap_or_else(|| format!("Embedded Track {}", index + 1));
            Some(SubtitleTrack {
                id,
                label,
                language,
                title,
                selected: mpv.get_flag(&format!("{prefix}/selected")).unwrap_or(false),
            })
        })
        .collect()
}

fn webview_for_presentation(
    state: &HostUi,
    presentation: PresentationTarget,
) -> Option<&WebViewHost> {
    match presentation {
        PresentationTarget::Main => state.webview.as_ref(),
        PresentationTarget::Pip => state.pip.as_ref().map(|pip| &pip.webview),
    }
}

fn webview_for_target(state: &HostUi, target: WebViewTarget) -> Option<&WebViewHost> {
    match target {
        WebViewTarget::Main => state.webview.as_ref(),
        WebViewTarget::Pip => state.pip.as_ref().map(|pip| &pip.webview),
        WebViewTarget::Utility(kind) => state
            .utilities
            .iter()
            .find(|utility| utility.kind == kind)
            .map(|utility| &utility.webview),
    }
}

fn poll_engine(state: &mut HostUi) -> Result<(), String> {
    if state.session.is_none() {
        return Ok(());
    }
    for event in state.mpv.drain_events() {
        match event {
            EngineEvent::FileLoaded => {
                state.source_loaded = true;
                state.source_failed = false;
                state.last_command_error = None;
                if let Err(error) = load_pending_sidecar_subtitles(state) {
                    eprintln!("VIDEO_PLAYER_SIDECAR_SUBTITLE_ERROR={error}");
                }
                eprintln!("VIDEO_PLAYER_ENGINE_EVENT=FILE_LOADED");
                if let Some(started) = state.source_opened_at {
                    eprintln!(
                        "VIDEO_PLAYER_TIMING=SOURCE_OPEN_TO_FILE_LOADED_MS;VALUE={:.3}",
                        started.elapsed().as_secs_f64() * 1000.0
                    );
                }
            }
            EngineEvent::PlaybackRestart => {
                if let Some((name, started)) = state.pending_seek.take() {
                    eprintln!(
                        "VIDEO_PLAYER_TIMING={name};VALUE={:.3}",
                        started.elapsed().as_secs_f64() * 1000.0
                    );
                }
            }
            EngineEvent::EndFile {
                reason,
                error,
                message,
            } => {
                eprintln!(
                    "VIDEO_PLAYER_ENGINE_EVENT=END_FILE;REASON={reason};ERROR={error};MESSAGE={message}"
                );
                if reason == MPV_END_FILE_REASON_ERROR {
                    state.source_failed = true;
                    state.last_command_error = Some(ipc_error("PLAYBACK_ENGINE_ERROR", message));
                } else if reason == MPV_END_FILE_REASON_EOF {
                    state.source_failed = false;
                }
            }
            EngineEvent::Shutdown => {
                state.source_failed = true;
                state.last_command_error = Some(ipc_error(
                    "PLAYBACK_ENGINE_SHUTDOWN",
                    "The playback engine shut down",
                ));
            }
            EngineEvent::QueueOverflow => {
                state.last_command_error = Some(ipc_error(
                    "PLAYBACK_EVENT_QUEUE_OVERFLOW",
                    "Playback events could not be processed in time",
                ));
            }
        }
    }
    if let Some(address) = state
        .mpv
        .get_int64("display-swapchain")
        .filter(|value| *value != 0)
    {
        if address != state.last_swapchain_address {
            let raw = address as usize as *mut c_void;
            let borrowed = unsafe { IDXGISwapChain1::from_raw_borrowed(&raw) }
                .ok_or("DISPLAY_SWAPCHAIN_INVALID")?;
            let owned = borrowed.clone();
            state.tree.swapchain = Some(owned);
            state.last_swapchain_address = address;
            attach_swapchain_to_active(state)?;
            eprintln!(
                "VIDEO_PLAYER_DISPLAY_SWAPCHAIN=ATTACHED;ADDRESS=0x{:X};PRESENTATION={}",
                address,
                state.active_presentation.as_str(),
            );
            if !state.first_frame_recorded {
                if let Some(started) = state.source_opened_at {
                    eprintln!(
                        "VIDEO_PLAYER_TIMING=SOURCE_OPEN_TO_FIRST_FRAME_MS;VALUE={:.3}",
                        started.elapsed().as_secs_f64() * 1000.0
                    );
                }
                state.first_frame_recorded = true;
            }
        }
    }
    reconcile_main_aspect_ratio(state)?;
    reconcile_pip_aspect_ratio(state)?;
    reconcile_middle_subtitle_geometry(state)?;
    post_snapshot(state)
}

fn reconcile_main_aspect_ratio(state: &mut HostUi) -> Result<(), String> {
    if state.fullscreen || state.active_presentation != PresentationTarget::Main {
        return Ok(());
    }
    let Some(ratio) = current_aspect_ratio(state) else {
        return Ok(());
    };
    if state
        .main_aspect_ratio_applied
        .is_some_and(|current| (current - ratio).abs() < 0.0001)
    {
        return Ok(());
    }
    let mut client = RECT::default();
    unsafe {
        GetClientRect(state.hwnd, &mut client).map_err(|error| error.to_string())?;
    }
    let width = (client.right - client.left).max(1);
    let height = (width as f64 / ratio).round().max(1.0) as i32;
    let outer = outer_size_for_main_client(width, height)?;
    unsafe {
        SetWindowPos(
            state.hwnd,
            None,
            0,
            0,
            outer.0,
            outer.1,
            SWP_NOMOVE | SWP_NOACTIVATE,
        )
        .map_err(|error| error.to_string())?;
    }
    resize_presentation(state, state.hwnd)?;
    state.main_aspect_ratio_applied = Some(ratio);
    eprintln!("VIDEO_PLAYER_MAIN_ASPECT_RATIO={ratio:.6}");
    Ok(())
}

fn reconcile_pip_aspect_ratio(state: &mut HostUi) -> Result<(), String> {
    let Some(ratio) = current_aspect_ratio(state) else {
        return Ok(());
    };
    let Some(pip) = state.pip.as_mut() else {
        return Ok(());
    };
    if (pip.aspect_ratio - ratio).abs() < 0.0001 {
        return Ok(());
    }
    pip.aspect_ratio = ratio;
    let mut client = RECT::default();
    unsafe {
        GetClientRect(pip.hwnd, &mut client).map_err(|error| error.to_string())?;
    }
    let width = (client.right - client.left).max(1);
    let height = (width as f64 / ratio).round().max(1.0) as i32;
    let outer = outer_size_for_client(width, height)?;
    unsafe {
        SetWindowPos(
            pip.hwnd,
            None,
            0,
            0,
            outer.0,
            outer.1,
            SWP_NOMOVE | SWP_NOACTIVATE,
        )
        .map_err(|error| error.to_string())?;
    }
    eprintln!("VIDEO_PLAYER_PIP_ASPECT_RATIO={ratio:.6}");
    Ok(())
}

fn post_snapshot(state: &mut HostUi) -> Result<(), String> {
    let Some(session) = state.session.as_ref() else {
        return Ok(());
    };
    state.revision = state.revision.saturating_add(1);
    let eof = state.mpv.get_flag("eof-reached").unwrap_or(false);
    let duration = state.mpv.get_double("duration").unwrap_or(0.0).max(0.0);
    let status = if state.source_failed {
        "error"
    } else if eof {
        "ended"
    } else if duration > 0.0 {
        "ready"
    } else {
        "loading"
    };
    if status == "ready" && !state.controls_ready_recorded {
        if let Some(started) = state.source_opened_at {
            eprintln!(
                "VIDEO_PLAYER_TIMING=SOURCE_OPEN_TO_CONTROLS_READY_MS;VALUE={:.3}",
                started.elapsed().as_secs_f64() * 1000.0
            );
        }
        state.controls_ready_recorded = true;
    }
    let volume = state
        .mpv
        .get_double("volume")
        .unwrap_or(0.0)
        .clamp(0.0, 100.0);
    if volume > 0.0 {
        state.last_nonzero_volume = volume;
    }
    let loop_a_seconds = state.mpv.get_double("ab-loop-a");
    let loop_b_seconds = state.mpv.get_double("ab-loop-b");
    let subtitle_tracks = subtitle_tracks(&state.mpv);
    let active_subtitle_id = active_subtitle_id(&state.mpv);
    let snapshot = PlaybackSnapshot {
        protocol_version: PROTOCOL_VERSION,
        revision: state.revision,
        session_id: session.session_id.clone(),
        source_identity: session.source_identity.clone(),
        display_name: session.display_name.clone(),
        resolution: session.resolution.clone(),
        paused: state.mpv.get_flag("pause").unwrap_or(true),
        position_seconds: state.mpv.get_double("time-pos").unwrap_or(0.0).max(0.0),
        duration_seconds: duration,
        speed: state.mpv.get_double("speed").unwrap_or(1.0),
        volume,
        muted: state.mpv.get_flag("mute").unwrap_or(false),
        last_nonzero_volume: state.last_nonzero_volume,
        loop_a_seconds,
        loop_b_seconds,
        loop_enabled: matches!((loop_a_seconds, loop_b_seconds), (Some(a), Some(b)) if b > a),
        subtitle_tracks,
        active_subtitle_id,
        subtitle_delay_seconds: state.mpv.get_double("sub-delay").unwrap_or(0.0),
        presentation: state.active_presentation.as_str().into(),
        fullscreen: state.fullscreen,
        double_click_interval_ms: unsafe { GetDoubleClickTime() },
        status: status.into(),
        hwdec_current: state
            .mpv
            .get_string("hwdec-current")
            .filter(|value| !value.is_empty() && value != "no"),
        error: state.last_command_error.clone(),
    };
    let runtime_marker = format!(
        "{}|{}|{}|{}|{:.2}|{:.2}|{}|{:?}|{:?}|{:?}|{}|{}|{}",
        snapshot.paused,
        snapshot.position_seconds.floor() as u64 / 5,
        snapshot.status,
        snapshot.hwdec_current.as_deref().unwrap_or("none"),
        snapshot.speed,
        snapshot.volume,
        snapshot.muted,
        snapshot.loop_a_seconds,
        snapshot.loop_b_seconds,
        snapshot.active_subtitle_id,
        snapshot.subtitle_tracks.len(),
        snapshot.presentation,
        snapshot.fullscreen,
    );
    if state.last_runtime_marker.as_ref() != Some(&runtime_marker) {
        eprintln!(
            "VIDEO_PLAYER_ENGINE_STATE=paused:{};position:{:.3};duration:{:.3};status:{};hwdec:{};speed:{:.2};volume:{:.2};muted:{};last_nonzero_volume:{:.2};loop_a:{:?};loop_b:{:?};loop_enabled:{};subtitle_tracks:{};active_subtitle:{:?};presentation:{};fullscreen:{};source_load_count:{}",
            snapshot.paused,
            snapshot.position_seconds,
            snapshot.duration_seconds,
            snapshot.status,
            snapshot.hwdec_current.as_deref().unwrap_or("none"),
            snapshot.speed,
            snapshot.volume,
            snapshot.muted,
            snapshot.last_nonzero_volume,
            snapshot.loop_a_seconds,
            snapshot.loop_b_seconds,
            snapshot.loop_enabled,
            snapshot.subtitle_tracks.len(),
            snapshot.active_subtitle_id,
            snapshot.presentation,
            snapshot.fullscreen,
            state.source_load_count,
        );
        state.last_runtime_marker = Some(runtime_marker);
    }
    let message = HostToPlayerMessage::Snapshot {
        protocol_version: PROTOCOL_VERSION,
        snapshot,
    };
    if let Some(webview) = state.webview.as_ref() {
        post_web_message(&webview.webview, &message)?;
    }
    if let Some(pip) = state.pip.as_ref() {
        post_web_message(&pip.webview.webview, &message)?;
    }
    for utility in &state.utilities {
        post_web_message(&utility.webview.webview, &message)?;
    }
    Ok(())
}

fn pick_external_subtitle(owner: HWND) -> Result<Option<PathBuf>, String> {
    unsafe {
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("SUBTITLE_DIALOG_CREATE_FAILED: {error}"))?;
        let name = wide_null_str("Subtitle Files");
        let pattern = wide_null_str("*.srt;*.ass;*.ssa");
        dialog
            .SetFileTypes(&[COMDLG_FILTERSPEC {
                pszName: PCWSTR(name.as_ptr()),
                pszSpec: PCWSTR(pattern.as_ptr()),
            }])
            .map_err(|error| format!("SUBTITLE_DIALOG_FILTER_FAILED: {error}"))?;
        let options = dialog
            .GetOptions()
            .map_err(|error| format!("SUBTITLE_DIALOG_OPTIONS_FAILED: {error}"))?;
        dialog
            .SetOptions(
                options
                    | FOS_FORCEFILESYSTEM
                    | FOS_FILEMUSTEXIST
                    | FOS_PATHMUSTEXIST
                    | FOS_NOCHANGEDIR,
            )
            .map_err(|error| format!("SUBTITLE_DIALOG_OPTIONS_FAILED: {error}"))?;
        dialog
            .SetTitle(PCWSTR(wide_null_str("Load Subtitle / CC").as_ptr()))
            .map_err(|error| format!("SUBTITLE_DIALOG_TITLE_FAILED: {error}"))?;
        if let Err(error) = dialog.Show(Some(owner)) {
            if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) {
                return Ok(None);
            }
            return Err(format!("SUBTITLE_DIALOG_FAILED: {error}"));
        }
        let item = dialog
            .GetResult()
            .map_err(|error| format!("SUBTITLE_DIALOG_RESULT_FAILED: {error}"))?;
        let raw = item
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|error| format!("SUBTITLE_DIALOG_PATH_FAILED: {error}"))?;
        let value = raw
            .to_string()
            .map_err(|error| format!("SUBTITLE_DIALOG_PATH_FAILED: {error}"));
        CoTaskMemFree(Some(raw.0.cast()));
        value.map(|value| Some(PathBuf::from(value)))
    }
}

fn load_external_subtitle_path(
    state: &mut HostUi,
    path: &Path,
    select: bool,
) -> Result<String, String> {
    let canonical = validate_external_subtitle_path(path).map_err(str::to_string)?;
    let title = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("External Subtitle")
        .to_string();
    state.mpv.command(&[
        "sub-add",
        &canonical.display().to_string(),
        if select { "select" } else { "auto" },
        &title,
    ])?;
    if select {
        state.mpv.set_property("sub-visibility", "yes")?;
        state.active_external_subtitle_id = active_subtitle_id(&state.mpv);
        state.active_external_subtitle_path = Some(canonical);
    }
    Ok(title)
}

fn load_pending_sidecar_subtitles(state: &mut HostUi) -> Result<(), String> {
    let pending = std::mem::take(&mut state.pending_sidecar_subtitles);
    for (index, path) in pending.iter().enumerate() {
        let title = load_external_subtitle_path(state, path, index == 0)?;
        eprintln!("VIDEO_PLAYER_SIDECAR_SUBTITLE=LOADED;FILE={title}");
    }
    Ok(())
}

unsafe fn dropped_paths(wparam: WPARAM) -> Result<Vec<PathBuf>, String> {
    let drop = HDROP(wparam.0 as *mut c_void);
    let count = DragQueryFileW(drop, u32::MAX, None);
    let mut paths = Vec::with_capacity(count as usize);
    for index in 0..count {
        let length = DragQueryFileW(drop, index, None);
        let mut buffer = vec![0u16; length as usize + 1];
        let written = DragQueryFileW(drop, index, Some(&mut buffer));
        if written == 0 {
            DragFinish(drop);
            return Err("SUBTITLE_DROP_PATH_INVALID".into());
        }
        paths.push(PathBuf::from(String::from_utf16_lossy(
            &buffer[..written as usize],
        )));
    }
    DragFinish(drop);
    Ok(paths)
}

fn post_subtitle_drop_result(state: &mut HostUi, result: Result<String, String>) {
    let Some(session_id) = state
        .session
        .as_ref()
        .map(|session| session.session_id.clone())
    else {
        return;
    };
    let (status, code, message) = match result {
        Ok(title) => (
            "success".to_string(),
            "EXTERNAL_SUBTITLE_LOADED".to_string(),
            title,
        ),
        Err(error) => {
            let code = error
                .split(':')
                .next()
                .unwrap_or("SUBTITLE_DROP_FAILED")
                .trim()
                .to_string();
            ("error".to_string(), code, error)
        }
    };
    state.revision = state.revision.saturating_add(1);
    let event = HostToPlayerMessage::CommandResult {
        protocol_version: PROTOCOL_VERSION,
        request_id: format!("subtitle-drop-{}", state.revision),
        session_id,
        revision: state.revision,
        command_kind: PlayerCommandKind::LoadExternalSubtitle,
        status,
        code: Some(code),
        message: Some(message),
    };
    if let Some(webview) = webview_for_presentation(state, state.active_presentation) {
        let _ = post_web_message(&webview.webview, &event);
    }
}

fn attach_swapchain_to_active(state: &mut HostUi) -> Result<(), String> {
    let Some(swapchain) = state.tree.swapchain.as_ref() else {
        return Ok(());
    };
    unsafe {
        state
            .tree
            .video
            .SetContent(None::<&windows::core::IUnknown>)
            .map_err(|error| error.to_string())?;
        if let Some(pip) = state.pip.as_ref() {
            pip.tree
                .video
                .SetContent(None::<&windows::core::IUnknown>)
                .map_err(|error| error.to_string())?;
        }
        match state.active_presentation {
            PresentationTarget::Main => state
                .tree
                .video
                .SetContent(swapchain)
                .map_err(|error| error.to_string())?,
            PresentationTarget::Pip => state
                .pip
                .as_ref()
                .ok_or("PIP_PRESENTATION_MISSING")?
                .tree
                .video
                .SetContent(swapchain)
                .map_err(|error| error.to_string())?,
        }
        state
            .tree
            .device
            .Commit()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn post_web_message(webview: &ICoreWebView2, message: &HostToPlayerMessage) -> Result<(), String> {
    let json = serde_json::to_string(message).map_err(|error| error.to_string())?;
    unsafe {
        webview
            .PostWebMessageAsJson(PCWSTR(wide_null_str(&json).as_ptr()))
            .map_err(|error| error.to_string())
    }
}

fn resize(state: &mut HostUi) -> Result<(), String> {
    resize_presentation(state, state.hwnd)
}

fn resize_presentation(state: &mut HostUi, hwnd: HWND) -> Result<(), String> {
    let mut rect = RECT::default();
    unsafe {
        GetClientRect(hwnd, &mut rect).map_err(|error| error.to_string())?;
    }
    let width = (rect.right - rect.left).max(1);
    let height = (rect.bottom - rect.top).max(1);
    let target = if hwnd == state.hwnd {
        Some(WebViewTarget::Main)
    } else if state.pip.as_ref().is_some_and(|pip| pip.hwnd == hwnd) {
        Some(WebViewTarget::Pip)
    } else {
        state
            .utilities
            .iter()
            .find(|utility| utility.hwnd == hwnd)
            .map(|utility| WebViewTarget::Utility(utility.kind))
    };
    let Some(target) = target else { return Ok(()) };
    eprintln!(
        "VIDEO_PLAYER_RESIZE={width}x{height};TARGET={}",
        target.as_str()
    );
    if target.presentation() == Some(state.active_presentation) {
        state
            .mpv
            .set_property("d3d11-composition-size", &format!("{width}x{height}"))?;
    }
    if let Some(webview) = webview_for_target(state, target) {
        unsafe {
            webview
                .controller
                .SetBounds(RECT {
                    left: 0,
                    top: 0,
                    right: width,
                    bottom: height,
                })
                .map_err(|error| error.to_string())?;
            state
                .tree
                .device
                .Commit()
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn focus_active_presentation(state: &HostUi) {
    let hwnd = match state.active_presentation {
        PresentationTarget::Main => state.hwnd,
        PresentationTarget::Pip => state.pip.as_ref().map(|pip| pip.hwnd).unwrap_or(state.hwnd),
    };
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
        let _ = SetFocus(Some(hwnd));
    }
}

fn set_main_fullscreen(state: &mut HostUi, fullscreen: bool) -> Result<(), String> {
    if state.fullscreen == fullscreen {
        return Ok(());
    }
    if state.active_presentation == PresentationTarget::Pip {
        return Err("FULLSCREEN_UNAVAILABLE_IN_PIP".into());
    }
    unsafe {
        if fullscreen {
            let mut rect = RECT::default();
            GetWindowRect(state.hwnd, &mut rect).map_err(|error| error.to_string())?;
            state.main_windowed_rect = Some(rect);
            let style = GetWindowLongPtrW(state.hwnd, GWL_STYLE);
            state.main_windowed_style = Some(style);
            let monitor = MonitorFromWindow(state.hwnd, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return Err(format!(
                    "MONITOR_INFO_FAILED: {}",
                    windows::core::Error::from_win32()
                ));
            }
            SetWindowLongPtrW(state.hwnd, GWL_STYLE, (WS_POPUP | WS_VISIBLE).0 as isize);
            SetWindowPos(
                state.hwnd,
                None,
                info.rcMonitor.left,
                info.rcMonitor.top,
                info.rcMonitor.right - info.rcMonitor.left,
                info.rcMonitor.bottom - info.rcMonitor.top,
                SWP_FRAMECHANGED | SWP_NOOWNERZORDER,
            )
            .map_err(|error| error.to_string())?;
        } else {
            let rect = state
                .main_windowed_rect
                .ok_or("FULLSCREEN_RESTORE_BOUNDS_MISSING")?;
            let style = state
                .main_windowed_style
                .ok_or("FULLSCREEN_RESTORE_STYLE_MISSING")?;
            SetWindowLongPtrW(state.hwnd, GWL_STYLE, style);
            SetWindowPos(
                state.hwnd,
                None,
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
                SWP_FRAMECHANGED | SWP_NOOWNERZORDER,
            )
            .map_err(|error| error.to_string())?;
            state.main_windowed_rect = None;
            state.main_windowed_style = None;
        }
    }
    resize(state)?;
    state.fullscreen = fullscreen;
    eprintln!(
        "VIDEO_PLAYER_FULLSCREEN={}",
        if fullscreen { "ON" } else { "OFF" }
    );
    Ok(())
}

fn enter_pip_from_cell(cell: &RefCell<HostUi>) -> Result<(), String> {
    {
        let state = cell.borrow();
        if let Some(pip) = state.pip.as_ref() {
            unsafe {
                let _ = ShowWindow(pip.hwnd, SW_SHOW);
                let _ = SetForegroundWindow(pip.hwnd);
                let _ = SetFocus(Some(pip.hwnd));
            }
            eprintln!("VIDEO_PLAYER_PIP=FOCUSED_EXISTING");
            return Ok(());
        }
    }

    let transition_started = Instant::now();
    let (main_hwnd, ratio, device, environment, assets_root, weak) = {
        let state = cell.borrow();
        (
            state.hwnd,
            current_aspect_ratio(&state).ok_or("PIP_ASPECT_RATIO_UNAVAILABLE")?,
            state.tree.device.clone(),
            state.webview_environment.clone(),
            state.assets_root.clone(),
            state.self_weak.clone(),
        )
    };
    let hwnd = create_pip_window(main_hwnd, ratio)?;
    unsafe { DragAcceptFiles(hwnd, true) };
    let tree = unsafe { create_composition_tree_with_device(device, hwnd)? };
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, cell as *const RefCell<HostUi> as isize);
    }
    let webview = match create_webview(
        &environment,
        hwnd,
        &assets_root,
        weak,
        &tree.overlay,
        WebViewTarget::Pip,
    ) {
        Ok(webview) => webview,
        Err(error) => {
            unsafe {
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                let _ = DestroyWindow(hwnd);
            }
            return Err(error);
        }
    };

    {
        let mut state = cell.borrow_mut();
        state.pip = Some(PipPresentation {
            hwnd,
            tree,
            webview,
            aspect_ratio: ratio,
        });
        state.active_presentation = PresentationTarget::Pip;
        attach_swapchain_to_active(&mut state)?;
        resize_presentation(&mut state, hwnd)?;
        unsafe {
            let _ = ShowWindow(state.hwnd, SW_HIDE);
            SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            )
            .map_err(|error| error.to_string())?;
            let _ = SetForegroundWindow(hwnd);
            let _ = SetFocus(Some(hwnd));
        }
        eprintln!(
            "VIDEO_PLAYER_PIP=OPENED;SESSION_COUNT=1;CONTEXT_COUNT=1;SOURCE_LOAD_COUNT={};SWAPCHAIN=0x{:X}",
            state.source_load_count,
            state.last_swapchain_address,
        );
        eprintln!(
            "VIDEO_PLAYER_TIMING=MAIN_TO_PIP_MS;VALUE={:.3}",
            transition_started.elapsed().as_secs_f64() * 1000.0
        );
        post_snapshot(&mut state)?;
    }
    Ok(())
}

fn return_from_pip(cell: &RefCell<HostUi>) -> Result<(), String> {
    let mut state = cell.borrow_mut();
    if state.pip.is_none() {
        focus_active_presentation(&state);
        return Ok(());
    }
    let transition_started = Instant::now();
    state.active_presentation = PresentationTarget::Main;
    attach_swapchain_to_active(&mut state)?;
    let main_hwnd = state.hwnd;
    resize_presentation(&mut state, main_hwnd)?;
    let pip = state.pip.take().ok_or("PIP_PRESENTATION_MISSING")?;
    close_webview(&pip.webview)?;
    unsafe {
        pip.tree
            .video
            .SetContent(None::<&windows::core::IUnknown>)
            .map_err(|error| error.to_string())?;
        state
            .tree
            .device
            .Commit()
            .map_err(|error| error.to_string())?;
        SetWindowLongPtrW(pip.hwnd, GWLP_USERDATA, 0);
        let _ = DestroyWindow(pip.hwnd);
        let _ = ShowWindow(state.hwnd, SW_SHOW);
        let _ = SetForegroundWindow(state.hwnd);
        let _ = SetFocus(Some(state.hwnd));
    }
    eprintln!(
        "VIDEO_PLAYER_PIP=RETURNED_MAIN;SESSION_COUNT=1;CONTEXT_COUNT=1;SOURCE_LOAD_COUNT={};SWAPCHAIN=0x{:X}",
        state.source_load_count,
        state.last_swapchain_address,
    );
    eprintln!(
        "VIDEO_PLAYER_TIMING=PIP_TO_MAIN_MS;VALUE={:.3}",
        transition_started.elapsed().as_secs_f64() * 1000.0
    );
    post_snapshot(&mut state)
}

fn open_utility_window_from_cell(
    cell: &RefCell<HostUi>,
    kind: UtilityWindowKind,
) -> Result<(), String> {
    {
        let state = cell.borrow();
        if let Some(utility) = state.utilities.iter().find(|utility| utility.kind == kind) {
            unsafe {
                let _ = ShowWindow(utility.hwnd, SW_SHOW);
                let _ = SetForegroundWindow(utility.hwnd);
                let _ = SetFocus(Some(utility.hwnd));
            }
            eprintln!(
                "VIDEO_PLAYER_UTILITY=FOCUSED_EXISTING;KIND={}",
                kind.as_str()
            );
            return Ok(());
        }
    }

    let (main_hwnd, device, environment, assets_root, weak) = {
        let state = cell.borrow();
        (
            state.hwnd,
            state.tree.device.clone(),
            state.webview_environment.clone(),
            state.assets_root.clone(),
            state.self_weak.clone(),
        )
    };
    let hwnd = create_utility_window(main_hwnd, kind)?;
    let tree = unsafe { create_composition_tree_with_device(device, hwnd)? };
    // Make native chrome responsive immediately. The WebView is attached to
    // the already-created client as soon as its CompositionController is
    // ready, avoiding an unnecessary invisible controller-creation interval.
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
    }
    let webview = match create_webview(
        &environment,
        hwnd,
        &assets_root,
        weak,
        &tree.overlay,
        WebViewTarget::Utility(kind),
    ) {
        Ok(webview) => webview,
        Err(error) => {
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
            return Err(error);
        }
    };
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, cell as *const RefCell<HostUi> as isize);
    }

    {
        let mut state = cell.borrow_mut();
        state.utilities.push(UtilityPresentation {
            kind,
            hwnd,
            tree,
            webview,
        });
        resize_presentation(&mut state, hwnd)?;
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOW);
            let _ = SetForegroundWindow(hwnd);
            let _ = SetFocus(Some(hwnd));
        }
    }
    eprintln!(
        "VIDEO_PLAYER_UTILITY=OPENED;KIND={};SESSION_COUNT=1;CONTEXT_COUNT=1",
        kind.as_str()
    );
    Ok(())
}

fn close_utility_window(state: &mut HostUi, hwnd: HWND) -> Result<bool, String> {
    let Some(index) = state
        .utilities
        .iter()
        .position(|utility| utility.hwnd == hwnd)
    else {
        return Ok(false);
    };
    let utility = state.utilities.remove(index);
    close_webview(&utility.webview)?;
    unsafe {
        utility
            .tree
            .video
            .SetContent(None::<&windows::core::IUnknown>)
            .map_err(|error| error.to_string())?;
        utility
            .tree
            .device
            .Commit()
            .map_err(|error| error.to_string())?;
        SetWindowLongPtrW(utility.hwnd, GWLP_USERDATA, 0);
        let _ = DestroyWindow(utility.hwnd);
    }
    eprintln!("VIDEO_PLAYER_UTILITY=CLOSED;KIND={}", utility.kind.as_str());
    Ok(true)
}

fn close_webview(webview: &WebViewHost) -> Result<(), String> {
    unsafe {
        webview
            .composition
            .SetRootVisualTarget(None::<&windows::core::IUnknown>)
            .map_err(|error| error.to_string())?;
        webview
            .controller
            .Close()
            .map_err(|error| error.to_string())
    }
}

fn current_aspect_ratio(state: &HostUi) -> Option<f64> {
    if let Some(ratio) = state
        .mpv
        .get_double("video-params/aspect")
        .filter(|value| value.is_finite() && *value > 0.0)
    {
        return Some(ratio);
    }
    let display_width = state.mpv.get_int64("video-params/dw").unwrap_or(0);
    let display_height = state.mpv.get_int64("video-params/dh").unwrap_or(0);
    if display_width > 0 && display_height > 0 {
        return Some(display_width as f64 / display_height as f64);
    }
    let width = state.mpv.get_int64("video-params/w").unwrap_or(0);
    let height = state.mpv.get_int64("video-params/h").unwrap_or(0);
    if width > 0 && height > 0 {
        return Some(width as f64 / height as f64);
    }
    parse_resolution_ratio(state.session.as_ref()?.resolution.as_str())
}

fn parse_resolution_ratio(value: &str) -> Option<f64> {
    let normalized = value.replace(['×', 'X'], "x");
    let mut parts = normalized.split('x').map(str::trim);
    let width = parts.next()?.parse::<u32>().ok()?;
    let height = parts.next()?.parse::<u32>().ok()?;
    if parts.next().is_some() || width == 0 || height == 0 {
        None
    } else {
        Some(width as f64 / height as f64)
    }
}

fn create_pip_window(main_hwnd: HWND, ratio: f64) -> Result<HWND, String> {
    unsafe {
        let monitor = MonitorFromWindow(main_hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return Err(format!(
                "PIP_MONITOR_INFO_FAILED: {}",
                windows::core::Error::from_win32()
            ));
        }
        let work_width = (info.rcWork.right - info.rcWork.left).max(1);
        let work_height = (info.rcWork.bottom - info.rcWork.top).max(1);
        let margin = 16;
        let (mut client_width, mut client_height) = if ratio >= 1.0 {
            (520, (520.0 / ratio).round() as i32)
        } else {
            ((520.0 * ratio).round() as i32, 520)
        };
        let scale = (work_width.saturating_sub(margin * 2) as f64 / client_width.max(1) as f64)
            .min(work_height.saturating_sub(margin * 2) as f64 / client_height.max(1) as f64)
            .min(1.0);
        client_width = (client_width as f64 * scale).round().max(1.0) as i32;
        client_height = (client_height as f64 * scale).round().max(1.0) as i32;
        let outer = outer_size_for_client(client_width, client_height)?;
        let x = info.rcWork.right - outer.0 - margin;
        let y = info.rcWork.bottom - outer.1 - margin;
        let instance = GetModuleHandleW(None).map_err(|error| error.to_string())?;
        let class_name = wide_null_str("SakuravaVideoPlayerMediaHost");
        let title = wide_null_str("Sakurava Picture in Picture");
        CreateWindowExW(
            WS_EX_TOPMOST,
            PCWSTR(class_name.as_ptr()),
            PCWSTR(title.as_ptr()),
            WS_POPUP | WS_THICKFRAME,
            x,
            y,
            outer.0,
            outer.1,
            None,
            None::<HMENU>,
            Some(instance.into()),
            None,
        )
        .map_err(|error| format!("PIP_WINDOW_CREATE_FAILED: {error}"))
    }
}

fn create_utility_window(main_hwnd: HWND, kind: UtilityWindowKind) -> Result<HWND, String> {
    unsafe {
        let monitor = MonitorFromWindow(main_hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return Err(format!(
                "UTILITY_MONITOR_INFO_FAILED: {}",
                windows::core::Error::from_win32()
            ));
        }
        let (requested_width, requested_height) = kind.client_size();
        let work_width = (info.rcWork.right - info.rcWork.left).max(1);
        let work_height = (info.rcWork.bottom - info.rcWork.top).max(1);
        let client_width = requested_width.min(work_width.saturating_sub(32)).max(360);
        let client_height = requested_height
            .min(work_height.saturating_sub(32))
            .max(320);
        let outer = outer_size_for_utility_client(client_width, client_height)?;
        let mut main_rect = RECT::default();
        GetWindowRect(main_hwnd, &mut main_rect).map_err(|error| error.to_string())?;
        let margin = 16;
        let (x, y) = centered_utility_position(&main_rect, &info.rcWork, outer, margin);
        let instance = GetModuleHandleW(None).map_err(|error| error.to_string())?;
        let class_name = wide_null_str("SakuravaVideoPlayerUtilityHost");
        let title = wide_null_str(kind.title());
        CreateWindowExW(
            utility_window_ex_style(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR(title.as_ptr()),
            utility_window_style(),
            x,
            y,
            outer.0,
            outer.1,
            Some(main_hwnd),
            None::<HMENU>,
            Some(instance.into()),
            None,
        )
        .map_err(|error| format!("UTILITY_WINDOW_CREATE_FAILED: {error}"))
    }
}

fn utility_window_style() -> WINDOW_STYLE {
    WS_CAPTION | WS_SYSMENU | WS_THICKFRAME
}

fn utility_window_ex_style() -> WINDOW_EX_STYLE {
    WS_EX_NOREDIRECTIONBITMAP
}

fn centered_utility_position(
    main: &RECT,
    work: &RECT,
    outer: (i32, i32),
    margin: i32,
) -> (i32, i32) {
    let x = (main.left + (main.right - main.left - outer.0) / 2)
        .min(work.right - outer.0 - margin)
        .max(work.left + margin);
    let y = (main.top + (main.bottom - main.top - outer.1) / 2)
        .min(work.bottom - outer.1 - margin)
        .max(work.top + margin);
    (x, y)
}

fn outer_size_for_client(width: i32, height: i32) -> Result<(i32, i32), String> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
    };
    unsafe {
        AdjustWindowRectEx(&mut rect, WS_POPUP | WS_THICKFRAME, false, WS_EX_TOPMOST)
            .map_err(|error| error.to_string())?;
    }
    Ok((rect.right - rect.left, rect.bottom - rect.top))
}

fn outer_size_for_main_client(width: i32, height: i32) -> Result<(i32, i32), String> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
    };
    unsafe {
        AdjustWindowRectEx(
            &mut rect,
            WS_OVERLAPPEDWINDOW,
            false,
            WINDOW_EX_STYLE::default(),
        )
        .map_err(|error| error.to_string())?;
    }
    Ok((rect.right - rect.left, rect.bottom - rect.top))
}

fn outer_size_for_utility_client(width: i32, height: i32) -> Result<(i32, i32), String> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
    };
    unsafe {
        AdjustWindowRectEx(
            &mut rect,
            utility_window_style(),
            false,
            utility_window_ex_style(),
        )
        .map_err(|error| error.to_string())?;
    }
    Ok((rect.right - rect.left, rect.bottom - rect.top))
}

fn constrain_pip_sizing(state: &HostUi, edge: usize, rect: &mut RECT) {
    let Some(pip) = state.pip.as_ref() else {
        return;
    };
    let ratio = pip.aspect_ratio;
    let frame = outer_size_for_client(320, (320.0 / ratio).round() as i32)
        .unwrap_or((320, (320.0 / ratio).round() as i32));
    let frame_width = frame.0 - 320;
    let frame_height = frame.1 - (320.0 / ratio).round() as i32;
    constrain_sizing_to_ratio(edge, rect, ratio, frame_width, frame_height);
}

fn constrain_sizing_to_ratio(
    edge: usize,
    rect: &mut RECT,
    ratio: f64,
    frame_width: i32,
    frame_height: i32,
) {
    let outer_width = rect.right - rect.left;
    let outer_height = rect.bottom - rect.top;
    let width_driven = [
        WMSZ_LEFT,
        WMSZ_RIGHT,
        WMSZ_TOPLEFT,
        WMSZ_TOPRIGHT,
        WMSZ_BOTTOMLEFT,
        WMSZ_BOTTOMRIGHT,
    ]
    .contains(&(edge as u32));
    if width_driven {
        let desired = (((outer_width - frame_width).max(1) as f64 / ratio).round() as i32
            + frame_height)
            .max(1);
        if [WMSZ_TOP, WMSZ_TOPLEFT, WMSZ_TOPRIGHT].contains(&(edge as u32)) {
            rect.top = rect.bottom - desired;
        } else {
            rect.bottom = rect.top + desired;
        }
    } else {
        let desired = (((outer_height - frame_height).max(1) as f64 * ratio).round() as i32
            + frame_width)
            .max(1);
        rect.right = rect.left + desired;
    }
}

fn shutdown_ui(state: &mut HostUi) -> Result<(), String> {
    while let Some(utility) = state.utilities.pop() {
        close_webview(&utility.webview)?;
        unsafe {
            utility
                .tree
                .video
                .SetContent(None::<&windows::core::IUnknown>)
                .map_err(|error| error.to_string())?;
            SetWindowLongPtrW(utility.hwnd, GWLP_USERDATA, 0);
            let _ = DestroyWindow(utility.hwnd);
        }
    }
    if let Some(pip) = state.pip.take() {
        close_webview(&pip.webview)?;
        unsafe {
            pip.tree
                .video
                .SetContent(None::<&windows::core::IUnknown>)
                .map_err(|error| error.to_string())?;
            SetWindowLongPtrW(pip.hwnd, GWLP_USERDATA, 0);
            let _ = DestroyWindow(pip.hwnd);
        }
    }
    if let Some(webview) = state.webview.take() {
        close_webview(&webview)?;
    }
    unsafe {
        state
            .tree
            .video
            .SetContent(None::<&windows::core::IUnknown>)
            .map_err(|error| error.to_string())?;
        state
            .tree
            .device
            .Commit()
            .map_err(|error| error.to_string())?;
    }
    state.tree.swapchain = None;
    state.last_swapchain_address = 0;
    state.mpv.command(&["stop"])?;
    eprintln!("VIDEO_PLAYER_CLEANUP=COMPOSITION_DETACHED;PLAYBACK_STOPPED");
    Ok(())
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_NCCREATE {
        let _create = lparam.0 as *const CREATESTRUCTW;
    }
    let raw = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const RefCell<HostUi>;
    if !raw.is_null() && message == WM_HOST_ENTER_PIP {
        let cell = &*raw;
        if let Err(error) = enter_pip_from_cell(cell) {
            eprintln!("VIDEO_PLAYER_PIP_ERROR={error}");
            if let Ok(mut state) = cell.try_borrow_mut() {
                state.last_command_error = Some(ipc_error("PIP_OPEN_FAILED", error));
                let _ = post_snapshot(&mut state);
            }
        }
        return LRESULT(0);
    }
    if !raw.is_null() && message == WM_HOST_RETURN_MAIN {
        let cell = &*raw;
        if let Err(error) = return_from_pip(cell) {
            eprintln!("VIDEO_PLAYER_PIP_RETURN_ERROR={error}");
            if let Ok(mut state) = cell.try_borrow_mut() {
                state.last_command_error = Some(ipc_error("PIP_RETURN_FAILED", error));
                let _ = post_snapshot(&mut state);
            }
        }
        return LRESULT(0);
    }
    if !raw.is_null()
        && matches!(
            message,
            WM_HOST_OPEN_SUBTITLE_APPEARANCE | WM_HOST_OPEN_SHORTCUTS
        )
    {
        let cell = &*raw;
        let kind = if message == WM_HOST_OPEN_SUBTITLE_APPEARANCE {
            UtilityWindowKind::SubtitleAppearance
        } else {
            UtilityWindowKind::Shortcuts
        };
        if let Err(error) = open_utility_window_from_cell(cell, kind) {
            eprintln!(
                "VIDEO_PLAYER_UTILITY_ERROR={};KIND={}",
                error,
                kind.as_str()
            );
            if let Ok(mut state) = cell.try_borrow_mut() {
                state.last_command_error = Some(ipc_error("UTILITY_WINDOW_OPEN_FAILED", error));
                let _ = post_snapshot(&mut state);
            }
        }
        return LRESULT(0);
    }
    if !raw.is_null() {
        let cell = &*raw;
        if let Ok(mut state) = cell.try_borrow_mut() {
            match message {
                WM_HOST_IPC => {
                    loop {
                        let next = state
                            .queue
                            .lock()
                            .ok()
                            .and_then(|mut queue| queue.pop_front());
                        let Some(next) = next else { break };
                        if let Err(error) = handle_main_message(&mut state, next) {
                            emit_to_main(
                                HostToMainKind::FatalHostError {
                                    error: ipc_error("HOST_MESSAGE_FAILED", error),
                                },
                                "host-message-failed",
                            );
                        }
                    }
                    return LRESULT(0);
                }
                WM_TIMER if wparam.0 == POLL_TIMER_ID => {
                    if let Err(error) = poll_engine(&mut state) {
                        eprintln!("VIDEO_PLAYER_POLL_ERROR={error}");
                    }
                    return LRESULT(0);
                }
                WM_SIZE => {
                    if let Err(error) = resize_presentation(&mut state, hwnd) {
                        eprintln!("VIDEO_PLAYER_RESIZE_ERROR={error}");
                    }
                    return LRESULT(0);
                }
                WM_CLOSE => {
                    if state.utilities.iter().any(|utility| utility.hwnd == hwnd) {
                        let _ = close_utility_window(&mut state, hwnd);
                        return LRESULT(0);
                    }
                    if state.pip.as_ref().is_some_and(|pip| pip.hwnd == hwnd) {
                        let _ = PostMessageW(
                            Some(state.hwnd),
                            WM_HOST_RETURN_MAIN,
                            WPARAM(0),
                            LPARAM(0),
                        );
                        return LRESULT(0);
                    }
                    if !state.closing {
                        state.closing = true;
                        PostQuitMessage(0);
                    }
                    return LRESULT(0);
                }
                WM_DESTROY => {
                    if hwnd == state.hwnd {
                        PostQuitMessage(0);
                    }
                    return LRESULT(0);
                }
                WM_SETCURSOR if should_apply_webview_cursor(low_word(lparam.0) as u32) => {
                    if let Some(webview) = webview_for_hwnd(&state, hwnd) {
                        if apply_webview_cursor(&webview.composition).is_ok() {
                            return LRESULT(1);
                        }
                    }
                }
                WM_SETFOCUS => {
                    if let Some(webview) = webview_for_hwnd(&state, hwnd) {
                        let _ = webview
                            .controller
                            .MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                    }
                }
                WM_DROPFILES => {
                    let result = match dropped_paths(wparam) {
                        Ok(paths) if paths.len() == 1 => {
                            load_external_subtitle_path(&mut state, &paths[0], true)
                        }
                        Ok(_) => Err("SUBTITLE_DROP_REQUIRES_ONE_FILE".into()),
                        Err(error) => Err(error),
                    };
                    post_subtitle_drop_result(&mut state, result);
                    let _ = post_snapshot(&mut state);
                    return LRESULT(0);
                }
                WM_LBUTTONDOWN | WM_LBUTTONUP | WM_MBUTTONDOWN | WM_MBUTTONUP | WM_RBUTTONDOWN
                | WM_RBUTTONUP | WM_MOUSEMOVE | WM_MOUSEWHEEL => {
                    if let Some(webview) = webview_for_hwnd(&state, hwnd) {
                        if matches!(message, WM_LBUTTONDOWN | WM_LBUTTONUP) {
                            eprintln!(
                                "VIDEO_PLAYER_POINTER={}:{},{}",
                                if message == WM_LBUTTONDOWN {
                                    "DOWN"
                                } else {
                                    "UP"
                                },
                                low_word(lparam.0),
                                high_word(lparam.0),
                            );
                        }
                        if matches!(message, WM_LBUTTONDOWN | WM_MBUTTONDOWN | WM_RBUTTONDOWN) {
                            let _ = SetFocus(Some(hwnd));
                            let _ = webview
                                .controller
                                .MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                        }
                        let mut point = if message == WM_MOUSEWHEEL {
                            POINT {
                                x: low_word(lparam.0),
                                y: high_word(lparam.0),
                            }
                        } else {
                            POINT {
                                x: low_word(lparam.0),
                                y: high_word(lparam.0),
                            }
                        };
                        if message == WM_MOUSEWHEEL {
                            let _ = ScreenToClient(hwnd, &mut point);
                        }
                        let kind = mouse_kind(message);
                        let data = if message == WM_MOUSEWHEEL {
                            ((wparam.0 >> 16) & 0xffff) as u32
                        } else {
                            0
                        };
                        let keys =
                            COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS((wparam.0 & 0xffff) as i32);
                        let _ = webview.composition.SendMouseInput(kind, keys, data, point);
                        return LRESULT(0);
                    }
                }
                WM_KEYDOWN => {
                    return DefWindowProcW(hwnd, message, wparam, lparam);
                }
                WM_NCHITTEST if state.pip.as_ref().is_some_and(|pip| pip.hwnd == hwnd) => {
                    let default = DefWindowProcW(hwnd, message, wparam, lparam);
                    if default != LRESULT(HTCLIENT as isize) {
                        return default;
                    }
                    let mut point = POINT {
                        x: low_word(lparam.0),
                        y: high_word(lparam.0),
                    };
                    let _ = ScreenToClient(hwnd, &mut point);
                    let mut client = RECT::default();
                    let _ = GetClientRect(hwnd, &mut client);
                    if point.y >= 0 && point.y < 38 && point.x < client.right - 96 {
                        return LRESULT(HTCAPTION as isize);
                    }
                    return default;
                }
                WM_SIZING if state.pip.as_ref().is_some_and(|pip| pip.hwnd == hwnd) => {
                    let rect = &mut *(lparam.0 as *mut RECT);
                    constrain_pip_sizing(&state, wparam.0, rect);
                    return LRESULT(1);
                }
                WM_GETMINMAXINFO if hwnd == state.hwnd => {
                    let info = &mut *(lparam.0 as *mut MINMAXINFO);
                    if let Ok((width, height)) = outer_size_for_main_client(560, 360) {
                        info.ptMinTrackSize.x = width;
                        info.ptMinTrackSize.y = height;
                    }
                    return LRESULT(0);
                }
                WM_GETMINMAXINFO if state.utilities.iter().any(|utility| utility.hwnd == hwnd) => {
                    let info = &mut *(lparam.0 as *mut MINMAXINFO);
                    if let Ok((width, height)) = outer_size_for_utility_client(360, 320) {
                        info.ptMinTrackSize.x = width;
                        info.ptMinTrackSize.y = height;
                    }
                    return LRESULT(0);
                }
                WM_GETMINMAXINFO if state.pip.as_ref().is_some_and(|pip| pip.hwnd == hwnd) => {
                    let info = &mut *(lparam.0 as *mut MINMAXINFO);
                    let ratio = state
                        .pip
                        .as_ref()
                        .map(|pip| pip.aspect_ratio)
                        .unwrap_or(16.0 / 9.0);
                    let (client_width, client_height) = if ratio >= 1.0 {
                        ((220.0 * ratio).round() as i32, 220)
                    } else {
                        (220, (220.0 / ratio).round() as i32)
                    };
                    if let Ok((width, height)) = outer_size_for_client(client_width, client_height)
                    {
                        info.ptMinTrackSize.x = width;
                        info.ptMinTrackSize.y = height;
                    }
                    return LRESULT(0);
                }
                _ => {}
            }
        }
    }
    DefWindowProcW(hwnd, message, wparam, lparam)
}

fn webview_for_hwnd(state: &HostUi, hwnd: HWND) -> Option<&WebViewHost> {
    if hwnd == state.hwnd {
        state.webview.as_ref()
    } else {
        state
            .pip
            .as_ref()
            .filter(|pip| pip.hwnd == hwnd)
            .map(|pip| &pip.webview)
            .or_else(|| {
                state
                    .utilities
                    .iter()
                    .find(|utility| utility.hwnd == hwnd)
                    .map(|utility| &utility.webview)
            })
    }
}

fn apply_webview_cursor(composition: &ICoreWebView2CompositionController) -> Result<(), String> {
    let mut cursor = windows::Win32::UI::WindowsAndMessaging::HCURSOR::default();
    unsafe {
        composition
            .Cursor(&mut cursor)
            .map_err(|error| error.to_string())?;
        SetCursor(Some(cursor));
    }
    Ok(())
}

fn should_apply_webview_cursor(hit_test: u32) -> bool {
    hit_test == HTCLIENT
}

fn mouse_kind(message: u32) -> COREWEBVIEW2_MOUSE_EVENT_KIND {
    match message {
        WM_LBUTTONDOWN => COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_DOWN,
        WM_LBUTTONUP => COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_UP,
        WM_MBUTTONDOWN => COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_DOWN,
        WM_MBUTTONUP => COREWEBVIEW2_MOUSE_EVENT_KIND_MIDDLE_BUTTON_UP,
        WM_RBUTTONDOWN => COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_DOWN,
        WM_RBUTTONUP => COREWEBVIEW2_MOUSE_EVENT_KIND_RIGHT_BUTTON_UP,
        WM_MOUSEWHEEL => COREWEBVIEW2_MOUSE_EVENT_KIND_WHEEL,
        _ => COREWEBVIEW2_MOUSE_EVENT_KIND_MOVE,
    }
}

fn emit_to_main(kind: HostToMainKind, request_id: &str) {
    let message = HostToMainMessage {
        protocol_version: PROTOCOL_VERSION,
        request_id: request_id.into(),
        kind,
    };
    if let Ok(json) = serde_json::to_string(&message) {
        println!("{json}");
        let _ = io::stdout().flush();
    }
}

fn ipc_error(code: &str, message: impl Into<String>) -> IpcError {
    IpcError {
        code: code.into(),
        message: message.into(),
    }
}

fn low_word(value: isize) -> i32 {
    (value as u32 & 0xffff) as i16 as i32
}
fn high_word(value: isize) -> i32 {
    ((value as u32 >> 16) & 0xffff) as i16 as i32
}
fn wide_null(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    path.as_os_str().encode_wide().chain(Some(0)).collect()
}

fn webview_mapping_path(path: &Path) -> PathBuf {
    let value = path.as_os_str().to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{unc}"))
    } else if let Some(regular) = value.strip_prefix(r"\\?\") {
        PathBuf::from(regular)
    } else {
        path.to_path_buf()
    }
}

fn wide_null_str(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

unsafe fn load_symbol<T: Copy>(
    module: windows::Win32::Foundation::HMODULE,
    name: &'static [u8],
) -> Result<T, String> {
    let symbol = GetProcAddress(module, PCSTR(name.as_ptr())).ok_or_else(|| {
        format!(
            "ENGINE_EXPORT_MISSING: {}",
            String::from_utf8_lossy(&name[..name.len() - 1])
        )
    })?;
    Ok(std::mem::transmute_copy(&symbol))
}

unsafe fn call_set_string(
    function: MpvSetOptionString,
    context: *mut c_void,
    name: &str,
    value: &str,
) -> c_int {
    let name = CString::new(name).unwrap();
    let value = CString::new(value).unwrap();
    function(context, name.as_ptr(), value.as_ptr())
}

unsafe fn call_get<T>(
    function: MpvGetProperty,
    context: *mut c_void,
    name: &str,
    format: c_int,
    value: &mut T,
) -> c_int {
    let name = CString::new(name).unwrap();
    function(context, name.as_ptr(), format, (value as *mut T).cast())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_speed_allowlist_is_exact() {
        for speed in [0.25, 0.5, 1.0, 1.5, 2.0, 3.0] {
            assert!(is_allowed_speed(speed));
        }
        for speed in [0.0, 0.75, 1.25, 4.0] {
            assert!(!is_allowed_speed(speed));
        }
    }

    #[test]
    fn parses_only_positive_explicit_video_resolutions() {
        assert_eq!(parse_resolution_ratio("1920 × 1080"), Some(16.0 / 9.0));
        assert_eq!(parse_resolution_ratio("1080x1920"), Some(1080.0 / 1920.0));
        assert_eq!(parse_resolution_ratio("0x1080"), None);
        assert_eq!(parse_resolution_ratio("unknown"), None);
    }

    #[test]
    fn subtitle_position_modes_use_semantic_renderer_anchors() {
        assert_eq!(
            SubtitlePositionMode::parse("source"),
            Some(SubtitlePositionMode::Source)
        );
        assert_eq!(
            SubtitlePositionMode::parse("bottom"),
            Some(SubtitlePositionMode::Bottom)
        );
        assert_eq!(
            SubtitlePositionMode::parse("middle"),
            Some(SubtitlePositionMode::Middle)
        );
        assert_eq!(
            SubtitlePositionMode::parse("top"),
            Some(SubtitlePositionMode::Top)
        );
        assert_eq!(SubtitlePositionMode::parse("side"), None);
        assert_eq!(SubtitlePositionMode::Source.ass_alignment(), None);
        assert_eq!(SubtitlePositionMode::Bottom.ass_alignment(), Some(2));
        assert_eq!(SubtitlePositionMode::Middle.ass_alignment(), Some(2));
        assert_eq!(SubtitlePositionMode::Top.ass_alignment(), Some(2));
        for mode in [
            SubtitlePositionMode::Source,
            SubtitlePositionMode::Bottom,
            SubtitlePositionMode::Middle,
            SubtitlePositionMode::Top,
        ] {
            assert_eq!(mode.plain_horizontal_alignment(), "center");
            assert_eq!(mode.plain_vertical_alignment(), "bottom");
        }
    }

    #[test]
    fn subtitle_safe_area_and_adjustment_follow_the_semantic_position_contract() {
        fn assert_position(mode: SubtitlePositionMode, adjustment: f64, inset: f64, expected: f64) {
            let actual = subtitle_effective_position(mode, adjustment, inset).unwrap();
            assert!(
                (actual - expected).abs() < 0.001,
                "expected {expected}, got {actual}"
            );
        }

        assert_position(SubtitlePositionMode::Source, 40.0, 0.0, 100.0);
        assert_position(SubtitlePositionMode::Source, 40.0, 0.2, 80.0);

        assert_position(SubtitlePositionMode::Bottom, 0.0, 0.0, 100.0);
        assert_position(SubtitlePositionMode::Bottom, 20.0, 0.0, 93.333_333);
        assert_position(SubtitlePositionMode::Bottom, 100.0, 0.0, 66.666_667);
        assert_position(SubtitlePositionMode::Bottom, -100.0, 0.0, 100.0);
        assert_position(SubtitlePositionMode::Bottom, 0.0, 0.2, 80.0);
        assert_position(SubtitlePositionMode::Bottom, 20.0, 0.2, 80.0);
        assert_position(SubtitlePositionMode::Bottom, 100.0, 0.2, 66.666_667);

        assert_position(SubtitlePositionMode::Middle, 0.0, 0.0, 50.0);
        assert_position(SubtitlePositionMode::Middle, 0.0, 0.2, 50.0);
        assert_position(SubtitlePositionMode::Middle, 100.0, 0.2, 33.333_333);
        assert_position(SubtitlePositionMode::Middle, -100.0, 0.2, 66.666_667);

        assert_position(SubtitlePositionMode::Top, 0.0, 0.2, 16.666_667);
        assert_position(SubtitlePositionMode::Top, 100.0, 0.2, 0.0);
        assert_position(SubtitlePositionMode::Top, -100.0, 0.2, 33.333_333);

        assert_eq!(
            subtitle_effective_position(SubtitlePositionMode::Bottom, 0.0, 1.0),
            None
        );
        assert_eq!(
            subtitle_effective_position(SubtitlePositionMode::Bottom, 0.0, 1.1),
            None
        );
        assert_eq!(
            subtitle_effective_position(SubtitlePositionMode::Bottom, f64::NAN, 0.0),
            None
        );
    }

    #[test]
    fn middle_position_uses_rendered_center_for_different_subtitle_heights() {
        let one_line = SubtitleRenderedGeometry {
            x: 220,
            y: 410,
            width: 520,
            height: 40,
            output_width: 960,
            output_height: 540,
            change_id: 10,
        };
        let multi_line = SubtitleRenderedGeometry {
            y: 330,
            height: 120,
            change_id: 11,
            ..one_line
        };

        let one_line_position = subtitle_middle_corrected_position(50.0, 0.5, one_line).unwrap();
        let multi_line_position =
            subtitle_middle_corrected_position(50.0, 0.5, multi_line).unwrap();

        assert!((one_line_position - 20.370_370).abs() < 0.001);
        assert!((multi_line_position - 27.777_778).abs() < 0.001);
        assert_ne!(one_line_position, multi_line_position);
    }

    #[test]
    fn middle_adjustment_preserves_upward_positive_and_downward_negative_direction() {
        let geometry = SubtitleRenderedGeometry {
            x: 220,
            y: 250,
            width: 520,
            height: 40,
            output_width: 960,
            output_height: 540,
            change_id: 12,
        };
        let upward_target =
            subtitle_effective_position(SubtitlePositionMode::Middle, 100.0, 0.0).unwrap() / 100.0;
        let downward_target =
            subtitle_effective_position(SubtitlePositionMode::Middle, -100.0, 0.0).unwrap() / 100.0;

        let upward = subtitle_middle_corrected_position(50.0, upward_target, geometry).unwrap();
        let downward = subtitle_middle_corrected_position(50.0, downward_target, geometry).unwrap();

        assert!(upward < 50.0);
        assert!(downward > 50.0);
    }

    #[test]
    fn subtitle_positioning_composes_with_explicit_ass_style_overrides() {
        let appearance = subtitle_ass_style_overrides(
            "Georgia",
            true,
            42.0,
            true,
            "#FF102030",
            true,
            "#80405060",
            true,
            "shadow",
            true,
        )
        .unwrap();
        assert_eq!(
            subtitle_ass_style_overrides_with_position(&appearance, SubtitlePositionMode::Source),
            appearance,
        );
        assert_eq!(
            subtitle_ass_style_overrides_with_position(&appearance, SubtitlePositionMode::Bottom),
            format!("{appearance},Alignment=2"),
        );
        assert_eq!(
            subtitle_ass_style_overrides_with_position(&appearance, SubtitlePositionMode::Middle),
            format!("{appearance},Alignment=2"),
        );
        assert_eq!(
            subtitle_ass_style_overrides_with_position(&appearance, SubtitlePositionMode::Top),
            format!("{appearance},Alignment=2"),
        );
        assert_eq!(
            subtitle_ass_override_mode("", SubtitlePositionMode::Source, 0.0),
            "no"
        );
        assert_eq!(
            subtitle_ass_override_mode("", SubtitlePositionMode::Source, 0.2),
            "yes"
        );
        assert_eq!(
            subtitle_ass_override_mode("", SubtitlePositionMode::Bottom, 0.0),
            "yes"
        );
        assert_eq!(
            subtitle_ass_override_mode("", SubtitlePositionMode::Middle, 0.0),
            "yes"
        );
        assert_eq!(
            subtitle_ass_override_mode("", SubtitlePositionMode::Top, 0.0),
            "yes"
        );
    }

    #[test]
    fn sizing_constraint_preserves_video_client_ratio() {
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 1000,
            bottom: 700,
        };
        constrain_sizing_to_ratio(WMSZ_RIGHT as usize, &mut rect, 16.0 / 9.0, 16, 39);
        let client_width = rect.right - rect.left - 16;
        let client_height = rect.bottom - rect.top - 39;
        assert!((client_width as f64 / client_height as f64 - 16.0 / 9.0).abs() < 0.01);
    }

    #[test]
    fn webview_cursor_does_not_mask_native_resize_affordances() {
        use windows::Win32::UI::WindowsAndMessaging::{HTBOTTOMRIGHT, HTLEFT, HTTOP};

        assert!(should_apply_webview_cursor(HTCLIENT));
        assert!(!should_apply_webview_cursor(HTLEFT));
        assert!(!should_apply_webview_cursor(HTTOP));
        assert!(!should_apply_webview_cursor(HTBOTTOMRIGHT));
    }

    #[test]
    fn utility_window_is_centered_on_main_and_clamped_to_work_area() {
        let main = RECT {
            left: 200,
            top: 100,
            right: 1200,
            bottom: 900,
        };
        let work = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1040,
        };
        assert_eq!(
            centered_utility_position(&main, &work, (400, 300), 16),
            (500, 350)
        );

        let edge_main = RECT {
            left: 1700,
            top: 900,
            right: 1900,
            bottom: 1030,
        };
        assert_eq!(
            centered_utility_position(&edge_main, &work, (400, 300), 16),
            (1504, 724)
        );
    }

    #[test]
    fn utility_window_has_close_only_native_chrome_and_composition_transparency() {
        use windows::Win32::UI::WindowsAndMessaging::{WS_MAXIMIZEBOX, WS_MINIMIZEBOX};

        let style = utility_window_style();
        assert_ne!(style.0 & WS_CAPTION.0, 0);
        assert_ne!(style.0 & WS_SYSMENU.0, 0);
        assert_ne!(style.0 & WS_THICKFRAME.0, 0);
        assert_eq!(style.0 & WS_MINIMIZEBOX.0, 0);
        assert_eq!(style.0 & WS_MAXIMIZEBOX.0, 0);
        assert_ne!(utility_window_ex_style().0 & WS_EX_NOREDIRECTIONBITMAP.0, 0);
    }

    #[test]
    fn contact_sheet_capture_requires_current_seek_restart_and_completed_seek() {
        assert!(!seek_capture_ready(false, true, Some(false), Some(6.0)));
        assert!(!seek_capture_ready(true, false, Some(false), Some(6.0)));
        assert!(!seek_capture_ready(true, true, Some(true), Some(6.0)));
        assert!(!seek_capture_ready(true, true, Some(false), None));
        assert!(!seek_capture_ready(true, true, Some(false), Some(f64::NAN)));
        assert!(seek_capture_ready(true, true, Some(false), Some(6.0)));
    }

    #[test]
    fn webview_mapping_uses_regular_windows_paths() {
        assert_eq!(
            webview_mapping_path(Path::new(r"\\?\D:\sakurava-desktop\video-player-ui")),
            PathBuf::from(r"D:\sakurava-desktop\video-player-ui")
        );
        assert_eq!(
            webview_mapping_path(Path::new(r"\\?\UNC\server\share\video-player-ui")),
            PathBuf::from(r"\\server\share\video-player-ui")
        );
        assert_eq!(
            webview_mapping_path(Path::new(r"D:\sakurava-desktop\video-player-ui")),
            PathBuf::from(r"D:\sakurava-desktop\video-player-ui")
        );
    }

    #[test]
    fn player_window_class_owns_the_arrow_cursor() {
        let class = player_window_class(HINSTANCE::default(), PCWSTR::null()).unwrap();
        assert!(!class.hCursor.0.is_null());
    }

    #[test]
    fn stage_two_command_protocol_serializes_without_raw_engine_endpoints() {
        let allowed = [
            PlayerCommandKind::SeekRelative,
            PlayerCommandKind::FrameStep,
            PlayerCommandKind::FrameBackStep,
            PlayerCommandKind::SetSpeed,
            PlayerCommandKind::SetVolume,
            PlayerCommandKind::ToggleMute,
            PlayerCommandKind::SetLoopA,
            PlayerCommandKind::SetLoopB,
            PlayerCommandKind::ClearLoop,
            PlayerCommandKind::SetSubtitleTrack,
            PlayerCommandKind::SubtitleOff,
            PlayerCommandKind::ToggleSubtitle,
            PlayerCommandKind::LoadExternalSubtitle,
            PlayerCommandKind::SetSubtitleAppearance,
            PlayerCommandKind::SetSubtitleDelay,
            PlayerCommandKind::SetSubtitleInset,
            PlayerCommandKind::OpenExternally,
            PlayerCommandKind::OpenSubtitleAppearance,
            PlayerCommandKind::OpenShortcuts,
            PlayerCommandKind::ToggleFullscreen,
            PlayerCommandKind::EnterPip,
            PlayerCommandKind::ReturnFromPip,
        ];
        let json = serde_json::to_string(&allowed).unwrap();
        assert!(json.contains("frameStep"));
        assert!(json.contains("enterPip"));
        assert!(json.contains("openSubtitleAppearance"));
        assert!(json.contains("openShortcuts"));
        assert!(!json.contains("raw"));
        assert!(!json.contains("shell"));
    }

    #[test]
    fn subtitle_rgba_mapping_validates_color_and_opacity() {
        let command = PlayerCommand {
            protocol_version: PROTOCOL_VERSION,
            request_id: "style-1".into(),
            session_id: Some("session-1".into()),
            kind: PlayerCommandKind::SetSubtitleAppearance,
            payload: serde_json::json!({ "textColor": "#Aa00Ff", "textOpacity": 0.5 }),
        };
        assert_eq!(
            subtitle_rgba(&command, "textColor", "textOpacity").unwrap(),
            "#80AA00FF"
        );
        let invalid = PlayerCommand {
            payload: serde_json::json!({ "textColor": "red", "textOpacity": 2 }),
            ..command
        };
        assert_eq!(
            subtitle_rgba(&invalid, "textColor", "textOpacity").unwrap_err(),
            "SUBTITLE_COLOR_INVALID"
        );
    }

    #[test]
    fn auxiliary_utilities_share_the_contact_sheet_landscape_geometry() {
        assert_eq!(
            UtilityWindowKind::SubtitleAppearance.client_size(),
            (1100, 760)
        );
        assert_eq!(UtilityWindowKind::Shortcuts.client_size(), (1100, 760));
    }

    #[test]
    fn subtitle_style_keeps_authored_ass_until_explicit_selective_overrides_and_reset() {
        assert_eq!(
            subtitle_ass_style_overrides(
                "sans-serif",
                false,
                42.0,
                false,
                "#FFFFFFFF",
                false,
                "#00000000",
                false,
                "outline",
                false,
            )
            .unwrap(),
            ""
        );
        assert_eq!(
            subtitle_ass_style_overrides(
                "Georgia",
                true,
                56.0,
                true,
                "#80AA00FF",
                true,
                "#BF112233",
                true,
                "shadow",
                true,
            )
            .unwrap(),
            "FontName=Georgia,FontSize=56,PrimaryColour=&H7FFF00AA,BackColour=&H40332211,BorderStyle=4,Outline=0,Shadow=2"
        );
        assert_eq!(subtitle_ass_color("#80AA00FF").unwrap(), "&H7FFF00AA");
        assert_eq!(
            subtitle_ass_override_mode("", SubtitlePositionMode::Source, 0.0),
            "no"
        );
        assert_eq!(
            subtitle_ass_override_mode("FontName=Georgia", SubtitlePositionMode::Source, 0.0),
            "yes"
        );
        assert_eq!(subtitle_border_style("#00000000"), "outline-and-shadow");
        assert_eq!(subtitle_border_style("#BF112233"), "background-box");
    }
}
