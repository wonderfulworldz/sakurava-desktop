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
export type SubtitleBasePosition = "source" | "bottom" | "middle" | "top";

export type VideoPlayerSubtitlePreferences = {
  fontFamily: string;
  fontFamilyOverride: boolean;
  fontSize: number;
  fontSizeOverride: boolean;
  textColor: string;
  textOpacity: number;
  textColorOverride: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundOverride: boolean;
  basePosition: SubtitleBasePosition;
  verticalAdjustment: number;
  edgeStyle: SubtitleEdgeStyle;
  edgeStyleOverride: boolean;
};

export type VideoPlayerSourcePreferences = {
  positionSeconds: number;
  loopEnabled: boolean;
  loopASeconds: number | null;
  loopBSeconds: number | null;
  subtitlesEnabled: boolean;
  subtitleTrackId: number | null;
};

export type VideoPlayerPreferences = {
  version: 3;
  subtitles: VideoPlayerSubtitlePreferences;
  shortcuts: Record<VideoPlayerShortcutAction, string>;
  playback: {
    speed: number;
    volume: number;
    muted: boolean;
  };
  sources: Record<string, VideoPlayerSourcePreferences>;
  contactSheet: {
    rows: number;
    columns: number;
    width: number;
    quality: number;
    format: "jpeg" | "png";
    timestamp: boolean;
    header: boolean;
    subtitles: boolean;
  };
};

export const VIDEO_PLAYER_PREFERENCES_STORAGE_KEY = "sakurava.videoPlayer.preferences.v1";

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
  fontFamilyOverride: false,
  fontSize: 42,
  fontSizeOverride: false,
  textColor: "#FFFFFF",
  textOpacity: 1,
  textColorOverride: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0,
  backgroundOverride: false,
  basePosition: "source",
  verticalAdjustment: 0,
  edgeStyle: "outline",
  edgeStyleOverride: false,
};

export const VIDEO_PLAYER_PREFERENCES_DEFAULTS: VideoPlayerPreferences = {
  version: 3,
  subtitles: VIDEO_PLAYER_SUBTITLE_DEFAULTS,
  shortcuts: VIDEO_PLAYER_SHORTCUT_DEFAULTS,
  playback: {
    speed: 1,
    volume: 72,
    muted: false,
  },
  sources: {},
  contactSheet: {
    rows: 4,
    columns: 8,
    width: 1600,
    quality: 90,
    format: "jpeg",
    timestamp: true,
    header: false,
    subtitles: false,
  },
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

function parseSourcePreferences(value: unknown): VideoPlayerSourcePreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const loopASeconds = typeof source.loopASeconds === "number" && Number.isFinite(source.loopASeconds) && source.loopASeconds >= 0
    ? source.loopASeconds
    : null;
  const loopBSeconds = typeof source.loopBSeconds === "number" && Number.isFinite(source.loopBSeconds) && source.loopBSeconds > 0
    ? source.loopBSeconds
    : null;
  const loopEnabled = source.loopEnabled === true
    && loopASeconds !== null
    && loopBSeconds !== null
    && loopBSeconds > loopASeconds;
  return {
    positionSeconds: finiteNumber(source.positionSeconds, 0, 0, Number.MAX_SAFE_INTEGER),
    loopEnabled,
    loopASeconds: loopEnabled ? loopASeconds : null,
    loopBSeconds: loopEnabled ? loopBSeconds : null,
    subtitlesEnabled: source.subtitlesEnabled === true,
    subtitleTrackId: typeof source.subtitleTrackId === "number"
      && Number.isInteger(source.subtitleTrackId)
      && source.subtitleTrackId >= 0
      ? source.subtitleTrackId
      : null,
  };
}

export function sourcePreferenceKey(sourceIdentity: string) {
  return sourceIdentity.trim().slice(0, 512);
}

export function getVideoPlayerSourcePreferences(
  preferences: VideoPlayerPreferences,
  sourceIdentity: string,
): VideoPlayerSourcePreferences {
  return preferences.sources[sourcePreferenceKey(sourceIdentity)] ?? parseSourcePreferences(null);
}

export function resumablePosition(positionSeconds: number, durationSeconds: number) {
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || positionSeconds < 5 || durationSeconds <= 0) return 0;
  const bounded = Math.min(positionSeconds, durationSeconds);
  return bounded / durationSeconds >= 0.95 || durationSeconds - bounded < 30 ? 0 : bounded;
}

export function parseVideoPlayerPreferences(value: unknown): VideoPlayerPreferences {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const subtitles = record.subtitles && typeof record.subtitles === "object"
    ? record.subtitles as Record<string, unknown>
    : {};
  const shortcuts = record.shortcuts && typeof record.shortcuts === "object"
    ? record.shortcuts as Record<string, unknown>
    : {};
  const playback = record.playback && typeof record.playback === "object"
    ? record.playback as Record<string, unknown>
    : {};
  const contactSheet = record.contactSheet && typeof record.contactSheet === "object"
    ? record.contactSheet as Record<string, unknown>
    : {};
  const storedBasePosition = String(subtitles.basePosition);
  const basePosition = record.version === 3
    && ["source", "bottom", "middle", "top"].includes(storedBasePosition)
    ? storedBasePosition as SubtitleBasePosition
    : storedBasePosition === "middle" || storedBasePosition === "top"
      ? storedBasePosition
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
  const rows = contactSheet.rows;
  const columns = contactSheet.columns;
  const validGrid = typeof rows === "number" && Number.isInteger(rows) && rows >= 1 && rows <= 8
    && typeof columns === "number" && Number.isInteger(columns) && columns >= 1 && columns <= 24
    && rows * columns <= 192;
  const rawSources = record.sources && typeof record.sources === "object"
    ? Object.entries(record.sources as Record<string, unknown>).slice(-128)
    : [];
  const sources = Object.fromEntries(
    rawSources
      .filter(([key]) => key.trim().length > 0 && key.length <= 512)
      .map(([key, value]) => [sourcePreferenceKey(key), parseSourcePreferences(value)]),
  );
  const parsedFontFamily = typeof subtitles.fontFamily === "string"
    && subtitles.fontFamily.trim().length > 0
    && subtitles.fontFamily.length <= 128
    ? subtitles.fontFamily.trim()
    : VIDEO_PLAYER_SUBTITLE_DEFAULTS.fontFamily;
  // Older stored values did not distinguish the Player fallback from an
  // intentional choice. Preserve a non-default family as an explicit user
  // selection while treating the historical fallback as source/default mode.
  const fontFamilyOverride = typeof subtitles.fontFamilyOverride === "boolean"
    ? subtitles.fontFamilyOverride
    : parsedFontFamily !== VIDEO_PLAYER_SUBTITLE_DEFAULTS.fontFamily;
  const fontSize = finiteNumber(subtitles.fontSize, VIDEO_PLAYER_SUBTITLE_DEFAULTS.fontSize, 12, 96);
  const textColor = hexColor(subtitles.textColor, VIDEO_PLAYER_SUBTITLE_DEFAULTS.textColor);
  const textOpacity = finiteNumber(subtitles.textOpacity, VIDEO_PLAYER_SUBTITLE_DEFAULTS.textOpacity, 0, 1);
  const backgroundColor = hexColor(subtitles.backgroundColor, VIDEO_PLAYER_SUBTITLE_DEFAULTS.backgroundColor);
  const backgroundOpacity = finiteNumber(subtitles.backgroundOpacity, VIDEO_PLAYER_SUBTITLE_DEFAULTS.backgroundOpacity, 0, 1);
  const fontSizeOverride = typeof subtitles.fontSizeOverride === "boolean"
    ? subtitles.fontSizeOverride
    : typeof subtitles.fontSize === "number"
      && Number.isFinite(subtitles.fontSize)
      && subtitles.fontSize >= 12
      && subtitles.fontSize <= 96
      && fontSize !== VIDEO_PLAYER_SUBTITLE_DEFAULTS.fontSize;
  const textColorOverride = typeof subtitles.textColorOverride === "boolean"
    ? subtitles.textColorOverride
    : textColor !== VIDEO_PLAYER_SUBTITLE_DEFAULTS.textColor
      || textOpacity !== VIDEO_PLAYER_SUBTITLE_DEFAULTS.textOpacity;
  const backgroundOverride = typeof subtitles.backgroundOverride === "boolean"
    ? subtitles.backgroundOverride
    : backgroundColor !== VIDEO_PLAYER_SUBTITLE_DEFAULTS.backgroundColor
      || backgroundOpacity !== VIDEO_PLAYER_SUBTITLE_DEFAULTS.backgroundOpacity;
  const edgeStyleOverride = typeof subtitles.edgeStyleOverride === "boolean"
    ? subtitles.edgeStyleOverride
    : edgeStyle !== VIDEO_PLAYER_SUBTITLE_DEFAULTS.edgeStyle;
  return {
    version: 3,
    subtitles: {
      fontFamily: parsedFontFamily,
      fontFamilyOverride,
      fontSize,
      fontSizeOverride,
      textColor,
      textOpacity,
      textColorOverride,
      backgroundColor,
      backgroundOpacity,
      backgroundOverride,
      basePosition,
      verticalAdjustment: finiteNumber(subtitles.verticalAdjustment, VIDEO_PLAYER_SUBTITLE_DEFAULTS.verticalAdjustment, -100, 100),
      edgeStyle,
      edgeStyleOverride,
    },
    shortcuts: nextShortcuts,
    playback: {
      speed: [0.25, 0.5, 1, 1.5, 2, 3].includes(Number(playback.speed))
        ? Number(playback.speed)
        : VIDEO_PLAYER_PREFERENCES_DEFAULTS.playback.speed,
      volume: finiteNumber(playback.volume, VIDEO_PLAYER_PREFERENCES_DEFAULTS.playback.volume, 0, 100),
      muted: typeof playback.muted === "boolean"
        ? playback.muted
        : VIDEO_PLAYER_PREFERENCES_DEFAULTS.playback.muted,
    },
    sources,
    contactSheet: {
      rows: validGrid ? rows : VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.rows,
      columns: validGrid ? columns : VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.columns,
      width: finiteNumber(contactSheet.width, VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.width, 640, 3840),
      quality: finiteNumber(contactSheet.quality, VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.quality, 1, 100),
      format: contactSheet.format === "png" || contactSheet.format === "jpeg"
        ? contactSheet.format
        : VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.format,
      timestamp: typeof contactSheet.timestamp === "boolean"
        ? contactSheet.timestamp
        : VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.timestamp,
      header: typeof contactSheet.header === "boolean"
        ? contactSheet.header
        : VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.header,
      subtitles: typeof contactSheet.subtitles === "boolean"
        ? contactSheet.subtitles
        : VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet.subtitles,
    },
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
