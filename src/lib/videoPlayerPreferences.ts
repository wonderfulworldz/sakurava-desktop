export type VideoPlayerShortcutAction =
  | "playPause"
  | "backward"
  | "forward"
  | "changeStep"
  | "mute"
  | "subtitle"
  | "loop"
  | "fullscreen";

export type SubtitleEdgeStyle = "outline" | "shadow" | "none";
export type SubtitleBasePosition = "bottom" | "middle" | "top";

export type VideoPlayerSubtitlePreferences = {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  textOpacity: number;
  backgroundColor: string;
  backgroundOpacity: number;
  basePosition: SubtitleBasePosition;
  verticalAdjustment: number;
  edgeStyle: SubtitleEdgeStyle;
};

export type VideoPlayerPreferences = {
  version: 1;
  subtitles: VideoPlayerSubtitlePreferences;
  shortcuts: Record<VideoPlayerShortcutAction, string>;
};

export const VIDEO_PLAYER_PREFERENCES_STORAGE_KEY =
  "sakurava.videoPlayer.preferences.v1";

export const VIDEO_PLAYER_SHORTCUT_DEFAULTS: Record<VideoPlayerShortcutAction, string> = {
  playPause: "Space",
  backward: "ArrowLeft",
  forward: "ArrowRight",
  changeStep: "S",
  mute: "M",
  subtitle: "C",
  loop: "L",
  fullscreen: "F",
};

export const VIDEO_PLAYER_SUBTITLE_DEFAULTS: VideoPlayerSubtitlePreferences = {
  fontFamily: "sans-serif",
  fontSize: 42,
  textColor: "#FFFFFF",
  textOpacity: 1,
  backgroundColor: "#000000",
  backgroundOpacity: 0,
  basePosition: "bottom",
  verticalAdjustment: 0,
  edgeStyle: "outline",
};

export const VIDEO_PLAYER_PREFERENCES_DEFAULTS: VideoPlayerPreferences = {
  version: 1,
  subtitles: VIDEO_PLAYER_SUBTITLE_DEFAULTS,
  shortcuts: VIDEO_PLAYER_SHORTCUT_DEFAULTS,
};

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function hexColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback;
}

function shortcut(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 64
    ? value.trim()
    : fallback;
}

export function parseVideoPlayerPreferences(value: unknown): VideoPlayerPreferences {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const subtitles = record.subtitles && typeof record.subtitles === "object"
    ? record.subtitles as Record<string, unknown>
    : {};
  const shortcuts = record.shortcuts && typeof record.shortcuts === "object"
    ? record.shortcuts as Record<string, unknown>
    : {};
  const basePosition = ["bottom", "middle", "top"].includes(String(subtitles.basePosition))
    ? subtitles.basePosition as SubtitleBasePosition
    : VIDEO_PLAYER_SUBTITLE_DEFAULTS.basePosition;
  const edgeStyle = ["outline", "shadow", "none"].includes(String(subtitles.edgeStyle))
    ? subtitles.edgeStyle as SubtitleEdgeStyle
    : VIDEO_PLAYER_SUBTITLE_DEFAULTS.edgeStyle;
  const nextShortcuts = Object.fromEntries(
    Object.entries(VIDEO_PLAYER_SHORTCUT_DEFAULTS).map(([key, fallback]) => [
      key,
      shortcut(shortcuts[key], fallback),
    ]),
  ) as Record<VideoPlayerShortcutAction, string>;
  return {
    version: 1,
    subtitles: {
      fontFamily: typeof subtitles.fontFamily === "string" && subtitles.fontFamily.trim().length > 0 && subtitles.fontFamily.length <= 128
        ? subtitles.fontFamily.trim()
        : VIDEO_PLAYER_SUBTITLE_DEFAULTS.fontFamily,
      fontSize: finiteNumber(subtitles.fontSize, VIDEO_PLAYER_SUBTITLE_DEFAULTS.fontSize, 12, 96),
      textColor: hexColor(subtitles.textColor, VIDEO_PLAYER_SUBTITLE_DEFAULTS.textColor),
      textOpacity: finiteNumber(subtitles.textOpacity, VIDEO_PLAYER_SUBTITLE_DEFAULTS.textOpacity, 0, 1),
      backgroundColor: hexColor(subtitles.backgroundColor, VIDEO_PLAYER_SUBTITLE_DEFAULTS.backgroundColor),
      backgroundOpacity: finiteNumber(subtitles.backgroundOpacity, VIDEO_PLAYER_SUBTITLE_DEFAULTS.backgroundOpacity, 0, 1),
      basePosition,
      verticalAdjustment: finiteNumber(subtitles.verticalAdjustment, VIDEO_PLAYER_SUBTITLE_DEFAULTS.verticalAdjustment, -100, 100),
      edgeStyle,
    },
    shortcuts: nextShortcuts,
  };
}

export function loadVideoPlayerPreferences(storage: Pick<Storage, "getItem"> = window.localStorage) {
  try {
    const raw = storage.getItem(VIDEO_PLAYER_PREFERENCES_STORAGE_KEY);
    return raw ? parseVideoPlayerPreferences(JSON.parse(raw)) : parseVideoPlayerPreferences(null);
  } catch {
    return parseVideoPlayerPreferences(null);
  }
}

export function saveVideoPlayerPreferences(
  preferences: VideoPlayerPreferences,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  try {
    storage.setItem(
      VIDEO_PLAYER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(parseVideoPlayerPreferences(preferences)),
    );
    return true;
  } catch {
    return false;
  }
}
