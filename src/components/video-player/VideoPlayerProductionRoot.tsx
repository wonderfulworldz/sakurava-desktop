import VideoPlayerPrototype, { type VideoPlayerPlaybackAdapter } from "./VideoPlayerPrototype";
import { MiniPlayerContent } from "./MiniPlayerWindow";
import { useVideoPlayerBridge } from "../../runtime/videoPlayerBridge";

export default function VideoPlayerProductionRoot() {
  const bridge = useVideoPlayerBridge();
  const snapshot = bridge.snapshot;
  const presentation = typeof window === "undefined"
    ? "main"
    : new URLSearchParams(window.location.search).get("presentation") === "pip"
      ? "pip"
      : "main";
  const playback: VideoPlayerPlaybackAdapter = snapshot ? {
    durationSeconds: snapshot.durationSeconds,
    error: snapshot.error?.message ?? null,
    paused: snapshot.paused,
    positionSeconds: snapshot.positionSeconds,
    speed: snapshot.speed,
    volume: snapshot.volume,
    muted: snapshot.muted,
    lastNonzeroVolume: snapshot.lastNonzeroVolume,
    loopASeconds: snapshot.loopASeconds,
    loopBSeconds: snapshot.loopBSeconds,
    loopEnabled: snapshot.loopEnabled,
    subtitleTracks: snapshot.subtitleTracks.map(({ id, label }) => ({ id, label })),
    activeSubtitleId: snapshot.activeSubtitleId,
    presentation: snapshot.presentation,
    fullscreen: snapshot.fullscreen,
    status: snapshot.status,
    sessionId: snapshot.sessionId,
    onPause: bridge.pause,
    onPlay: bridge.play,
    onSeek: bridge.seekAbsolute,
    onStep: (direction: "backward" | "forward", step: "1F" | "1S" | "10S" | "1M" | "10M") => {
      if (step === "1F") {
        if (direction === "forward") bridge.frameStep(); else bridge.frameBackStep();
        return;
      }
      const seconds = step === "1S" ? 1 : step === "10S" ? 10 : step === "1M" ? 60 : 600;
      bridge.seekRelative(direction === "forward" ? seconds : -seconds);
    },
    onSetSpeed: bridge.setSpeed,
    onSetVolume: bridge.setVolume,
    onToggleMute: bridge.toggleMute,
    onSetLoopA: bridge.setLoopA,
    onSetLoopB: bridge.setLoopB,
    onClearLoop: bridge.clearLoop,
    onSetSubtitleTrack: bridge.setSubtitleTrack,
    onSubtitleOff: bridge.subtitleOff,
    onToggleSubtitle: bridge.toggleSubtitle,
    onLoadExternalSubtitle: bridge.loadExternalSubtitle,
    commandResult: bridge.commandResult,
    onClearCommandResult: bridge.clearCommandResult,
    onSetSubtitleAppearance: bridge.setSubtitleAppearance,
    onSetSubtitleDelay: bridge.setSubtitleDelay,
    onSetSubtitleInset: bridge.setSubtitleInset,
    doubleClickIntervalMs: snapshot.doubleClickIntervalMs,
    onOpenExternally: bridge.openExternally,
    onToggleFullscreen: bridge.toggleFullscreen,
    onEnterPip: bridge.enterPip,
  } : {
    durationSeconds: 0,
    error: bridge.available ? null : "Player bridge unavailable",
    paused: true,
    positionSeconds: 0,
    speed: 1,
    volume: 72,
    muted: false,
    lastNonzeroVolume: 72,
    loopASeconds: null,
    loopBSeconds: null,
    loopEnabled: false,
    subtitleTracks: [],
    activeSubtitleId: null,
    presentation,
    fullscreen: false,
    status: bridge.available ? "connecting" as const : "error" as const,
    onPause: bridge.pause,
    onPlay: bridge.play,
    onSeek: bridge.seekAbsolute,
    onStep: () => undefined,
    onSetSpeed: bridge.setSpeed,
    onSetVolume: bridge.setVolume,
    onToggleMute: bridge.toggleMute,
    onSetLoopA: bridge.setLoopA,
    onSetLoopB: bridge.setLoopB,
    onClearLoop: bridge.clearLoop,
    onSetSubtitleTrack: bridge.setSubtitleTrack,
    onSubtitleOff: bridge.subtitleOff,
    onToggleSubtitle: bridge.toggleSubtitle,
    onLoadExternalSubtitle: bridge.loadExternalSubtitle,
    commandResult: bridge.commandResult,
    onClearCommandResult: bridge.clearCommandResult,
    onSetSubtitleAppearance: bridge.setSubtitleAppearance,
    onSetSubtitleDelay: bridge.setSubtitleDelay,
    onSetSubtitleInset: bridge.setSubtitleInset,
    doubleClickIntervalMs: 500,
    onOpenExternally: bridge.openExternally,
    onToggleFullscreen: bridge.toggleFullscreen,
    onEnterPip: bridge.enterPip,
  };

  if (presentation === "pip") {
    return <MiniPlayerContent
      payload={{
        displayName: snapshot?.displayName ?? "Sakurava Video Player",
        resolution: snapshot?.resolution || "—",
        durationLabel: formatDuration(snapshot?.durationSeconds ?? 0),
        requestId: snapshot?.sessionId ?? "composition-pip",
      }}
      playback={{
        paused: playback.paused,
        positionSeconds: playback.positionSeconds,
        durationSeconds: playback.durationSeconds,
        volume: playback.volume,
        muted: playback.muted,
        onPlay: playback.onPlay,
        onPause: playback.onPause,
        onSeek: playback.onSeek,
        onSeekRelative: bridge.seekRelative,
        onSetVolume: playback.onSetVolume,
        onToggleMute: playback.onToggleMute,
        onReturn: bridge.returnFromPip,
        onClose: bridge.close,
      }}
      windowHost="composition"
    />;
  }

  return <VideoPlayerPrototype displayName={snapshot?.displayName ?? "Sakurava Video Player"} resolution={snapshot?.resolution || "—"} durationLabel={formatDuration(snapshot?.durationSeconds ?? 0)} playback={playback} windowHost="composition" />;
}

function formatDuration(seconds: number) {
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} min` : "Loading…";
}
