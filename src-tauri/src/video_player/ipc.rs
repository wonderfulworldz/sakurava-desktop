use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 4;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenSourcePayload {
    pub session_id: String,
    pub source_identity: String,
    pub canonical_path: String,
    pub display_name: String,
    pub resolution: String,
    #[serde(default)]
    pub output_parent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    content = "payload",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum MainToHostKind {
    Handshake { parent_pid: u32 },
    OpenSource(OpenSourcePayload),
    ReplaceSource(OpenSourcePayload),
    FocusMain,
    CloseSession { session_id: String },
    HealthCheck,
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MainToHostMessage {
    pub protocol_version: u32,
    pub request_id: String,
    pub kind: MainToHostKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    content = "payload",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HostToMainKind {
    HostReady {
        host_pid: u32,
    },
    SourceAccepted {
        session_id: String,
        source_identity: String,
    },
    SourceRejected {
        source_identity: String,
        error: IpcError,
    },
    SessionOpened {
        session_id: String,
    },
    SessionClosed {
        session_id: String,
    },
    Health {
        host_pid: u32,
    },
    FatalHostError {
        error: IpcError,
    },
    OrderlyShutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HostToMainMessage {
    pub protocol_version: u32,
    pub request_id: String,
    pub kind: HostToMainKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerCommand {
    pub protocol_version: u32,
    pub request_id: String,
    pub session_id: Option<String>,
    pub kind: PlayerCommandKind,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PlayerCommandKind {
    BridgeReady,
    RequestSnapshot,
    Play,
    Pause,
    SeekAbsolute,
    SeekRelative,
    FrameStep,
    FrameBackStep,
    SetSpeed,
    SetVolume,
    SetMuted,
    ToggleMute,
    SetLoopA,
    SetLoopB,
    ClearLoop,
    SetSubtitleTrack,
    SubtitleOff,
    ToggleSubtitle,
    LoadExternalSubtitle,
    SetSubtitleAppearance,
    SetSubtitleDelay,
    SetSubtitleInset,
    CaptureScreenshot,
    OpenScreenshotFolder,
    OpenExternally,
    EnterFullscreen,
    ExitFullscreen,
    ToggleFullscreen,
    EnterPip,
    ReturnFromPip,
    Close,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub id: i64,
    pub label: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    pub protocol_version: u32,
    pub revision: u64,
    pub session_id: String,
    pub source_identity: String,
    pub display_name: String,
    pub resolution: String,
    pub paused: bool,
    pub position_seconds: f64,
    pub duration_seconds: f64,
    pub speed: f64,
    pub volume: f64,
    pub muted: bool,
    pub last_nonzero_volume: f64,
    pub loop_a_seconds: Option<f64>,
    pub loop_b_seconds: Option<f64>,
    pub loop_enabled: bool,
    pub subtitle_tracks: Vec<SubtitleTrack>,
    pub active_subtitle_id: Option<i64>,
    pub presentation: String,
    pub fullscreen: bool,
    pub double_click_interval_ms: u32,
    pub status: String,
    pub hwdec_current: Option<String>,
    pub error: Option<IpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HostToPlayerMessage {
    Snapshot {
        protocol_version: u32,
        snapshot: PlaybackSnapshot,
    },
    CommandResult {
        protocol_version: u32,
        request_id: String,
        session_id: String,
        revision: u64,
        command_kind: PlayerCommandKind,
        status: String,
        code: Option<String>,
        message: Option<String>,
    },
    FatalError {
        protocol_version: u32,
        error: IpcError,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipc_round_trip_preserves_protocol_and_identity() {
        let message = MainToHostMessage {
            protocol_version: PROTOCOL_VERSION,
            request_id: "request-1".into(),
            kind: MainToHostKind::OpenSource(OpenSourcePayload {
                session_id: "session-1".into(),
                source_identity: "V-2608-0001".into(),
                canonical_path: r"D:\fixtures\video.mp4".into(),
                display_name: "Fixture".into(),
                resolution: "1920 × 1080".into(),
                output_parent: None,
            }),
        };
        let encoded = serde_json::to_string(&message).unwrap();
        let decoded: MainToHostMessage = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded, message);
    }

    #[test]
    fn rejects_unknown_protocol_shape() {
        let decoded = serde_json::from_str::<MainToHostMessage>(
            r#"{"protocolVersion":2,"requestId":"x","kind":"unknown"}"#,
        );
        assert!(decoded.is_err());
    }

    #[test]
    fn replacement_reuses_the_same_typed_host_protocol() {
        let payload = OpenSourcePayload {
            session_id: "session-1".into(),
            source_identity: "V-2608-0002".into(),
            canonical_path: r"D:\fixtures\replacement.mp4".into(),
            display_name: "Replacement".into(),
            resolution: "1280 × 720".into(),
            output_parent: None,
        };
        let message = MainToHostMessage {
            protocol_version: PROTOCOL_VERSION,
            request_id: "replace-1".into(),
            kind: MainToHostKind::ReplaceSource(payload.clone()),
        };
        let decoded: MainToHostMessage =
            serde_json::from_str(&serde_json::to_string(&message).unwrap()).unwrap();
        assert_eq!(decoded, message);
        assert!(matches!(decoded.kind, MainToHostKind::ReplaceSource(value) if value == payload));
    }

    #[test]
    fn player_snapshot_protocol_is_camel_case_for_the_webview_bridge() {
        let message = HostToPlayerMessage::Snapshot {
            protocol_version: PROTOCOL_VERSION,
            snapshot: PlaybackSnapshot {
                protocol_version: PROTOCOL_VERSION,
                revision: 1,
                session_id: "session-1".into(),
                source_identity: "V-2608-0001".into(),
                display_name: "Fixture".into(),
                resolution: "1280 × 720".into(),
                paused: true,
                position_seconds: 0.0,
                duration_seconds: 12.0,
                speed: 1.0,
                volume: 72.0,
                muted: false,
                last_nonzero_volume: 72.0,
                loop_a_seconds: None,
                loop_b_seconds: None,
                loop_enabled: false,
                subtitle_tracks: vec![SubtitleTrack {
                    id: 1,
                    label: "English".into(),
                    language: Some("eng".into()),
                    title: None,
                    selected: true,
                }],
                active_subtitle_id: Some(1),
                presentation: "main".into(),
                fullscreen: false,
                double_click_interval_ms: 500,
                status: "ready".into(),
                hwdec_current: Some("d3d11va".into()),
                error: None,
            },
        };
        let encoded = serde_json::to_value(message).unwrap();
        assert_eq!(encoded["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(encoded["snapshot"]["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(encoded["snapshot"]["hwdecCurrent"], "d3d11va");
        assert_eq!(encoded["snapshot"]["activeSubtitleId"], 1);
        assert_eq!(encoded["snapshot"]["presentation"], "main");
        assert!(encoded.get("protocol_version").is_none());
    }
}
