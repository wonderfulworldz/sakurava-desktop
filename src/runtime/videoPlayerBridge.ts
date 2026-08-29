import { useCallback, useEffect, useRef, useState } from "react";

export const VIDEO_PLAYER_PROTOCOL_VERSION = 3;

export type PlaybackStatus = "connecting" | "loading" | "ready" | "ended" | "error" | "closed";

export type PlaybackSnapshot = {
  protocolVersion: number;
  revision: number;
  sessionId: string;
  sourceIdentity: string;
  displayName: string;
  resolution: string;
  paused: boolean;
  positionSeconds: number;
  durationSeconds: number;
  speed: number;
  volume: number;
  muted: boolean;
  lastNonzeroVolume: number;
  loopASeconds: number | null;
  loopBSeconds: number | null;
  loopEnabled: boolean;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleId: number | null;
  presentation: "main" | "pip";
  fullscreen: boolean;
  status: PlaybackStatus;
  hwdecCurrent: string | null;
  error: { code: string; message: string } | null;
};

export type SubtitleTrack = {
  id: number;
  label: string;
  language: string | null;
  title: string | null;
  selected: boolean;
};

type HostEvent = { protocolVersion: number; kind: "snapshot"; snapshot: PlaybackSnapshot };
export type PlayerCommandKind =
  | "bridgeReady"
  | "requestSnapshot"
  | "play"
  | "pause"
  | "seekAbsolute"
  | "seekRelative"
  | "frameStep"
  | "frameBackStep"
  | "setSpeed"
  | "setVolume"
  | "setMuted"
  | "toggleMute"
  | "setLoopA"
  | "setLoopB"
  | "clearLoop"
  | "setSubtitleTrack"
  | "subtitleOff"
  | "toggleSubtitle"
  | "loadExternalSubtitle"
  | "openExternally"
  | "enterFullscreen"
  | "exitFullscreen"
  | "toggleFullscreen"
  | "enterPip"
  | "returnFromPip"
  | "close";
type WebViewBridge = {
  postMessage: (message: unknown) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: "message", listener: (event: MessageEvent<unknown>) => void) => void;
};

declare global {
  interface Window {
    chrome?: { webview?: WebViewBridge };
  }
}

export function parsePlaybackSnapshot(value: unknown): PlaybackSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<HostEvent> & { snapshot?: Partial<PlaybackSnapshot> };
  if (
    event.protocolVersion !== VIDEO_PLAYER_PROTOCOL_VERSION ||
    event.kind !== "snapshot" ||
    !event.snapshot ||
    event.snapshot.protocolVersion !== VIDEO_PLAYER_PROTOCOL_VERSION ||
    typeof event.snapshot.revision !== "number" ||
    typeof event.snapshot.sessionId !== "string" ||
    typeof event.snapshot.sourceIdentity !== "string" ||
    typeof event.snapshot.displayName !== "string" ||
    typeof event.snapshot.resolution !== "string" ||
    typeof event.snapshot.paused !== "boolean" ||
    typeof event.snapshot.positionSeconds !== "number" ||
    typeof event.snapshot.durationSeconds !== "number" ||
    typeof event.snapshot.speed !== "number" ||
    typeof event.snapshot.volume !== "number" ||
    typeof event.snapshot.muted !== "boolean" ||
    typeof event.snapshot.lastNonzeroVolume !== "number" ||
    typeof event.snapshot.loopEnabled !== "boolean" ||
    !Array.isArray(event.snapshot.subtitleTracks) ||
    (event.snapshot.activeSubtitleId !== null && typeof event.snapshot.activeSubtitleId !== "number") ||
    (event.snapshot.presentation !== "main" && event.snapshot.presentation !== "pip") ||
    typeof event.snapshot.fullscreen !== "boolean" ||
    typeof event.snapshot.status !== "string"
  ) return null;
  return event.snapshot as PlaybackSnapshot;
}

function createRequestId() {
  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `player-${Date.now().toString(36)}-${randomPart}`;
}

export function useVideoPlayerBridge() {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null);
  const lastRevision = useRef(-1);
  const bridge = typeof window === "undefined" ? undefined : window.chrome?.webview;

  const send = useCallback((kind: PlayerCommandKind, payload: Record<string, unknown> = {}) => {
    if (!bridge) return false;
    bridge.postMessage({ protocolVersion: VIDEO_PLAYER_PROTOCOL_VERSION, requestId: createRequestId(), sessionId: snapshot?.sessionId ?? null, kind, payload });
    return true;
  }, [bridge, snapshot?.sessionId]);

  useEffect(() => {
    if (!bridge) return;
    const handleMessage = (event: MessageEvent<unknown>) => {
      const next = parsePlaybackSnapshot(event.data);
      if (!next || next.revision <= lastRevision.current) return;
      lastRevision.current = next.revision;
      setSnapshot(next);
    };
    bridge.addEventListener("message", handleMessage);
    send("bridgeReady");
    send("requestSnapshot");
    return () => bridge.removeEventListener("message", handleMessage);
  }, [bridge, send]);

  return {
    available: Boolean(bridge),
    snapshot,
    play: () => send("play"),
    pause: () => send("pause"),
    seekAbsolute: (seconds: number) => send("seekAbsolute", { seconds }),
    seekRelative: (seconds: number) => send("seekRelative", { seconds }),
    frameStep: () => send("frameStep"),
    frameBackStep: () => send("frameBackStep"),
    setSpeed: (speed: number) => send("setSpeed", { speed }),
    setVolume: (volume: number) => send("setVolume", { volume }),
    setMuted: (muted: boolean) => send("setMuted", { muted }),
    toggleMute: () => send("toggleMute"),
    setLoopA: (seconds: number) => send("setLoopA", { seconds }),
    setLoopB: (seconds: number) => send("setLoopB", { seconds }),
    clearLoop: () => send("clearLoop"),
    setSubtitleTrack: (id: number) => send("setSubtitleTrack", { id }),
    subtitleOff: () => send("subtitleOff"),
    toggleSubtitle: () => send("toggleSubtitle"),
    loadExternalSubtitle: () => send("loadExternalSubtitle"),
    openExternally: () => send("openExternally"),
    enterFullscreen: () => send("enterFullscreen"),
    exitFullscreen: () => send("exitFullscreen"),
    toggleFullscreen: () => send("toggleFullscreen"),
    enterPip: () => send("enterPip"),
    returnFromPip: () => send("returnFromPip"),
    close: () => send("close"),
  };
}
