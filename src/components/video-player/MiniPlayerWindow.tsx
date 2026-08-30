import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  SquareArrowOutUpRight,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "../../lib/LanguageContext";
import { isTauriRuntimeAvailable } from "../../runtime/tauriClient";
import {
  applyCurrentMiniPlayerGeometry,
  calculateMiniPlayerResize,
  closeCurrentAuxiliaryWindow,
  createCurrentMiniPlayerResizeSession,
  listenForMiniPlayerPayload,
  parseVideoResolution,
  readStoredMiniPlayerPayload,
  returnToVideoPlayerWindow,
  setCurrentPlayerAlwaysOnTop,
  startCurrentMiniPlayerDragging,
  type MiniPlayerResizeCorner,
  type MiniPlayerResizeSession,
  type MiniPlayerWindowGeometry,
  type MiniPlayerWindowPayload,
} from "../../runtime/videoPlayerWindows";
import { usePlayerControlsVisibility } from "./usePlayerControlsVisibility";

const fallbackPayload: MiniPlayerWindowPayload = {
  displayName: "Video",
  resolution: "N/A",
  durationLabel: "N/A",
  requestId: "mini-player-fallback",
};

export default function MiniPlayerWindow() {
  const [payload, setPayload] = useState(
    () => readStoredMiniPlayerPayload() ?? fallbackPayload,
  );

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    let unlisten: (() => void) | undefined;
    void setCurrentPlayerAlwaysOnTop(true);
    void listenForMiniPlayerPayload(setPayload).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });
    return () => unlisten?.();
  }, []);

  return <MiniPlayerContent payload={payload} />;
}

export function MiniPlayerContent({
  payload,
  playback,
  windowHost = "tauri",
}: {
  payload: MiniPlayerWindowPayload;
  playback?: {
    paused: boolean;
    positionSeconds: number;
    durationSeconds: number;
    volume: number;
    muted: boolean;
    onPlay: () => void;
    onPause: () => void;
    onSeek: (seconds: number) => void;
    onSeekRelative: (seconds: number) => void;
    onSetVolume: (volume: number) => void;
    onToggleMute: () => void;
    onReturn: () => void;
    onClose: () => void;
  };
  windowHost?: "tauri" | "composition";
}) {
  const t = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(3);
  const [volume, setVolume] = useState(72);
  const [lastAudibleVolume, setLastAudibleVolume] = useState(72);
  const effectivePlaying = playback ? !playback.paused : isPlaying;
  const effectivePosition = playback?.positionSeconds ?? progress;
  const effectiveDuration = playback?.durationSeconds ?? 100;
  const effectiveVolume = playback?.volume ?? volume;
  const effectiveMuted = playback ? playback.muted || playback.volume <= 0 : volume === 0;
  const dimensions = parseVideoResolution(payload.resolution);
  const resizeSessionRef = useRef<MiniPlayerResizeSession | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const pendingGeometryRef = useRef<MiniPlayerWindowGeometry | null>(null);
  const applyingGeometryRef = useRef(false);
  const [pointerInControls, setPointerInControls] = useState(false);
  const { visible: controlsVisible, reveal: revealControls } = usePlayerControlsVisibility({
    playing: effectivePlaying,
    held: !effectivePlaying || pointerInControls,
  });

  function handleSurfaceDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button,input,a")) return;
    if (playback) playback.onReturn(); else void returnToVideoPlayerWindow();
  }

  function toggleMute() {
    if (playback) {
      playback.onToggleMute();
      return;
    }
    if (volume === 0) {
      setVolume(lastAudibleVolume || 72);
    } else {
      setLastAudibleVolume(volume);
      setVolume(0);
    }
  }

  useEffect(() => {
    if (!playback) return;
    const activePlayback = playback;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (event.key === " ") {
        event.preventDefault();
        if (activePlayback.paused) activePlayback.onPlay(); else activePlayback.onPause();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playback]);

  function queueGeometry(geometry: MiniPlayerWindowGeometry) {
    pendingGeometryRef.current = geometry;
    if (applyingGeometryRef.current) return;
    applyingGeometryRef.current = true;
    void (async () => {
      while (pendingGeometryRef.current) {
        const nextGeometry = pendingGeometryRef.current;
        pendingGeometryRef.current = null;
        await applyCurrentMiniPlayerGeometry(nextGeometry);
      }
      applyingGeometryRef.current = false;
    })();
  }

  async function beginResize(
    event: PointerEvent<HTMLDivElement>,
    corner: MiniPlayerResizeCorner,
  ) {
    if (event.button !== 0 || !dimensions) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointerRef.current = event.pointerId;
    const session = await createCurrentMiniPlayerResizeSession(
      corner,
      dimensions,
      event.screenX,
      event.screenY,
    );
    if (activePointerRef.current === event.pointerId) {
      resizeSessionRef.current = session;
    }
  }

  function continueResize(event: PointerEvent<HTMLDivElement>) {
    if (
      activePointerRef.current !== event.pointerId ||
      !resizeSessionRef.current
    ) {
      return;
    }
    event.preventDefault();
    queueGeometry(
      calculateMiniPlayerResize(
        resizeSessionRef.current,
        event.screenX,
        event.screenY,
      ),
    );
  }

  function endResize(event: PointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    activePointerRef.current = null;
    resizeSessionRef.current = null;
  }

  return (
    <main
      aria-label={t("videoPlayer.mini.windowLabel")}
      className={`relative h-screen min-h-0 w-screen overflow-hidden text-slate-50 ${playback && windowHost === "composition" ? "bg-transparent" : "bg-slate-950"}`}
      data-auxiliary-window="mini-player"
      data-pip-aspect-ratio={
        dimensions ? `${dimensions.width}/${dimensions.height}` : "unknown"
      }
      data-responsive-tiers="wide compact minimum"
      data-theme-source="sakurava-appearance"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onKeyDown={revealControls}
    >
      <section
        aria-label={t("videoPlayer.mini.mockViewport")}
        className={`absolute inset-0 h-full w-full overflow-hidden object-contain ${playback && windowHost === "composition" ? "bg-transparent" : "bg-slate-950"}`}
        data-testid="pip-media-surface"
        onDoubleClick={handleSurfaceDoubleClick}
        style={
          dimensions
            ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` }
            : undefined
        }
      >
        {!playback && <div className="h-full w-full bg-[radial-gradient(circle_at_50%_42%,rgba(236,72,153,0.2),transparent_34%),linear-gradient(145deg,#111827,#0f172a_55%,#020617)]" />}
      </section>

      <div
        aria-hidden="true"
        data-testid="pip-drag-region"
        className="absolute left-3 right-24 top-0 z-10 h-9 cursor-move"
        onPointerDown={(event) => {
          if (event.button !== 0 || windowHost === "composition") return;
          event.preventDefault();
          void startCurrentMiniPlayerDragging();
        }}
      />

      <p className="pointer-events-none absolute left-3 top-3 z-20 hidden max-w-[calc(100%-7rem)] truncate text-[10px] font-medium text-slate-300/80 min-[460px]:block">
        {payload.displayName}
      </p>

      <div
        aria-hidden={!controlsVisible}
        inert={!controlsVisible}
        className={`absolute right-3 top-3 z-40 flex items-center gap-1 transition duration-200 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        data-overlay-layer="top-actions"
      >
        <OverlayButton
          label={t("videoPlayer.mini.return")}
          onClick={() => playback ? playback.onReturn() : void returnToVideoPlayerWindow()}
          icon={<SquareArrowOutUpRight size={15} />}
        />
        <OverlayButton
          label={t("common.close")}
          onClick={() => playback ? playback.onClose() : void closeCurrentAuxiliaryWindow()}
          icon={<X size={16} />}
        />
      </div>

      <div
        aria-hidden={!controlsVisible}
        inert={!controlsVisible}
        className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center gap-2 transition duration-200 ${controlsVisible ? "opacity-100" : "opacity-0"}`}
        data-overlay-layer="center-transport"
      >
        <OverlayButton
          label={t("videoPlayer.shortcuts.backward")}
          onClick={() => playback ? playback.onSeekRelative(-10) : setProgress((value) => Math.max(0, value - 5))}
          icon={<ArrowLeft size={17} />}
          className="max-[279px]:hidden"
        />
        <OverlayButton
          label={effectivePlaying ? t("videoPlayer.pause") : t("videoPlayer.play")}
          pressed={effectivePlaying}
          prominent
          onClick={() => playback ? (playback.paused ? playback.onPlay() : playback.onPause()) : setIsPlaying((value) => !value)}
          icon={
            effectivePlaying ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" />
            )
          }
        />
        <OverlayButton
          label={t("videoPlayer.shortcuts.forward")}
          onClick={() => playback ? playback.onSeekRelative(10) : setProgress((value) => Math.min(100, value + 5))}
          icon={<ArrowRight size={17} />}
          className="max-[279px]:hidden"
        />
      </div>

      <section
        aria-label={t("videoPlayer.mini.controls")}
        aria-hidden={!controlsVisible}
        inert={!controlsVisible}
        onPointerEnter={() => setPointerInControls(true)}
        onPointerLeave={() => setPointerInControls(false)}
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-2 pt-10 transition duration-200 ${controlsVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}
        data-overlay-layer="bottom-controls"
      >
        <input
          type="range"
          min="0"
          max={Math.max(1, effectiveDuration)}
          value={Math.min(effectivePosition, Math.max(1, effectiveDuration))}
          aria-label={t("videoPlayer.timeline")}
          aria-valuetext={`${progress}%`}
          onChange={(event) => playback ? playback.onSeek(Number(event.target.value)) : setProgress(Number(event.target.value))}
          className="block h-1.5 w-full cursor-pointer accent-sakura-500"
        />
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
          <span className="hidden min-w-0 truncate text-[10px] tabular-nums text-slate-300 min-[400px]:block">
            {formatMiniTime(effectivePosition)} / {formatMiniTime(effectiveDuration)}
          </span>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <OverlayButton
              label={
                effectiveMuted
                  ? t("videoPlayer.volume.unmute")
                  : t("videoPlayer.volume.mute")
              }
              pressed={effectiveMuted}
              onClick={toggleMute}
              icon={
                effectiveMuted ? <VolumeX size={16} /> : <Volume2 size={16} />
              }
            />
            <label className="hidden w-20 min-[460px]:block">
              <span className="sr-only">{t("videoPlayer.mini.volume")}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={effectiveVolume}
                aria-label={t("videoPlayer.mini.volume")}
                aria-valuetext={`${volume}%`}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (playback) {
                    playback.onSetVolume(next);
                    return;
                  }
                  if (next > 0) setLastAudibleVolume(next);
                }}
                className="block h-1.5 w-full cursor-pointer accent-sakura-500"
              />
            </label>
          </div>
        </div>
      </section>

      {dimensions && windowHost === "tauri"
        ? (["north-west", "north-east", "south-west", "south-east"] as const).map(
            (corner) => (
              <ResizeHandle
                key={corner}
                corner={corner}
                onPointerDown={(event) => void beginResize(event, corner)}
                onPointerMove={continueResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
              />
            ),
          )
        : null}
    </main>
  );
}

function formatMiniTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function ResizeHandle({
  corner,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  corner: MiniPlayerResizeCorner;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const placement = {
    "north-west": "left-0 top-0 cursor-nwse-resize",
    "north-east": "right-0 top-0 cursor-nesw-resize",
    "south-west": "bottom-0 left-0 cursor-nesw-resize",
    "south-east": "bottom-0 right-0 cursor-nwse-resize",
  }[corner];
  return (
    <div
      aria-hidden="true"
      data-resize-handle={corner}
      className={`absolute z-50 size-2.5 touch-none ${placement}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  );
}

function OverlayButton({
  label,
  icon,
  onClick = () => undefined,
  pressed,
  prominent,
  className = "",
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  prominent?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`pointer-events-auto inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/45 text-slate-100 shadow-sm backdrop-blur-sm transition hover:border-sakura-400/50 hover:bg-black/65 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 ${prominent ? "size-12 border-sakura-400/70 bg-sakura-500 text-white hover:bg-sakura-600" : "size-8"} ${className}`}
    >
      {icon}
    </button>
  );
}
