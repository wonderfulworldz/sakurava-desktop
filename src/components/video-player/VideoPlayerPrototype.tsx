import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SquareArrowOutUpRight,
  Subtitles,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../lib/LanguageContext";
import {
  loadVideoPlayerPreferences,
  parseVideoPlayerPreferences,
  saveVideoPlayerPreferences,
  VIDEO_PLAYER_SHORTCUT_DEFAULTS,
  type VideoPlayerPreferences,
  type VideoPlayerShortcutAction,
  type VideoPlayerSubtitlePreferences,
} from "../../lib/videoPlayerPreferences";
import {
  openMiniPlayerWindow,
  setCurrentPlayerFullscreen,
} from "../../runtime/videoPlayerWindows";
import SubtitleSettingsDialog from "./SubtitleSettingsDialog";
import { usePlayerControlsVisibility } from "./usePlayerControlsVisibility";

export type StepMode = "1F" | "1S" | "10S" | "1M" | "10M";
type ShortcutAction = VideoPlayerShortcutAction;

type SettingsView = "root" | "playback-speed" | "subtitle";

export type VideoPlayerPlaybackAdapter = {
  durationSeconds: number;
  error: string | null;
  paused: boolean;
  positionSeconds: number;
  speed: number;
  volume: number;
  muted: boolean;
  lastNonzeroVolume: number;
  loopASeconds: number | null;
  loopBSeconds: number | null;
  loopEnabled: boolean;
  subtitleTracks: Array<{ id: number; label: string }>;
  activeSubtitleId: number | null;
  presentation: "main" | "pip";
  fullscreen: boolean;
  status: "connecting" | "loading" | "ready" | "ended" | "error" | "closed";
  onPause: () => void;
  onPlay: () => void;
  onSeek: (seconds: number) => void;
  onStep: (direction: "backward" | "forward", step: StepMode) => void;
  onSetSpeed: (speed: number) => void;
  onSetVolume: (volume: number) => void;
  onToggleMute: () => void;
  onSetLoopA: (seconds: number) => void;
  onSetLoopB: (seconds: number) => void;
  onClearLoop: () => void;
  onSetSubtitleTrack: (id: number) => void;
  onSubtitleOff: () => void;
  onToggleSubtitle: () => void;
  onLoadExternalSubtitle: () => void;
  commandResult?: { commandKind: string; status: "success" | "cancelled" | "error"; message: string | null } | null;
  onClearCommandResult?: () => void;
  onSetSubtitleAppearance?: (appearance: VideoPlayerSubtitlePreferences) => void;
  onSetSubtitleDelay?: (seconds: number) => void;
  onSetSubtitleInset?: (pixels: number) => void;
  doubleClickIntervalMs?: number;
  sessionId?: string;
  onOpenExternally: () => void;
  onToggleFullscreen: () => void;
  onEnterPip: () => void;
};

export { VIDEO_PLAYER_SHORTCUT_DEFAULTS };

const STEP_MODES: Array<{ label: StepMode; descriptionKey: string }> = [
  { label: "1F", descriptionKey: "videoPlayer.step.oneFrame" },
  { label: "1S", descriptionKey: "videoPlayer.step.oneSecond" },
  { label: "10S", descriptionKey: "videoPlayer.step.tenSeconds" },
  { label: "1M", descriptionKey: "videoPlayer.step.oneMinute" },
  { label: "10M", descriptionKey: "videoPlayer.step.tenMinutes" },
];

const SHORTCUT_ACTIONS: Array<{
  key: ShortcutAction;
  labelKey: string;
  descriptionKey: string;
}> = [
  { key: "playPause", labelKey: "videoPlayer.shortcuts.playPause", descriptionKey: "videoPlayer.shortcuts.playPauseDescription" },
  { key: "backward", labelKey: "videoPlayer.shortcuts.backward", descriptionKey: "videoPlayer.shortcuts.backwardDescription" },
  { key: "forward", labelKey: "videoPlayer.shortcuts.forward", descriptionKey: "videoPlayer.shortcuts.forwardDescription" },
  { key: "changeStep", labelKey: "videoPlayer.shortcuts.changeStep", descriptionKey: "videoPlayer.shortcuts.changeStepDescription" },
  { key: "mute", labelKey: "videoPlayer.shortcuts.mute", descriptionKey: "videoPlayer.shortcuts.muteDescription" },
  { key: "subtitle", labelKey: "videoPlayer.shortcuts.subtitle", descriptionKey: "videoPlayer.shortcuts.subtitleDescription" },
  { key: "loop", labelKey: "videoPlayer.shortcuts.loop", descriptionKey: "videoPlayer.shortcuts.loopDescription" },
  { key: "fullscreen", labelKey: "videoPlayer.shortcuts.fullscreen", descriptionKey: "videoPlayer.shortcuts.fullscreenDescription" },
];

export default function VideoPlayerPrototype({
  displayName,
  resolution,
  durationLabel,
  playback,
  windowHost = "tauri",
}: {
  displayName: string;
  resolution: string;
  durationLabel: string;
  playback?: VideoPlayerPlaybackAdapter;
  windowHost?: "tauri" | "composition";
}) {
  const t = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(83);
  const [volume, setVolume] = useState(72);
  const [lastAudibleVolume, setLastAudibleVolume] = useState(72);
  const [volumeExpanded, setVolumeExpanded] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [loopOpen, setLoopOpen] = useState(false);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [invalidLoopEndDraft, setInvalidLoopEndDraft] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>("root");
  const [speed, setSpeed] = useState("1x");
  const [subtitle, setSubtitle] = useState("off");
  const [captureFeedback, setCaptureFeedback] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [preferences, setPreferences] = useState<VideoPlayerPreferences>(() => loadVideoPlayerPreferences());
  const [shortcutBindings, setShortcutBindings] = useState(preferences.shortcuts);
  const [subtitlePreferencesOpen, setSubtitlePreferencesOpen] = useState(false);
  const [subtitleDelay, setSubtitleDelay] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pointerInControls, setPointerInControls] = useState(false);
  const [controlsFocused, setControlsFocused] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLElement | null>(null);
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppearanceRef = useRef<string | null>(null);
  const lastInsetRef = useRef(-1);
  const sendInsetRef = useRef(playback?.onSetSubtitleInset);
  sendInsetRef.current = playback?.onSetSubtitleInset;

  const step = STEP_MODES[stepIndex];
  const effectivePlaying = playback ? !playback.paused : isPlaying;
  const effectivePosition = playback?.positionSeconds ?? position;
  const effectiveDuration = playback?.durationSeconds ?? 7425;
  const effectiveVolume = playback?.volume ?? volume;
  const effectiveMuted = playback ? playback.muted || playback.volume <= 0 : volume === 0;
  const effectiveSpeed = playback ? `${playback.speed}x` : speed;
  const effectiveLoopStart = playback?.loopASeconds ?? loopStart;
  const effectiveLoopEnd = invalidLoopEndDraft ?? playback?.loopBSeconds ?? loopEnd;
  const loopInvalid = effectiveLoopStart !== null && effectiveLoopEnd !== null && effectiveLoopEnd <= effectiveLoopStart;
  const loopEnabled = playback?.loopEnabled ?? loopOpen;
  const effectiveFullscreen = playback?.fullscreen ?? fullscreen;
  const controlsHeld = !effectivePlaying || pointerInControls || controlsFocused || seeking || volumeExpanded || settingsOpen || shortcutOpen || subtitlePreferencesOpen || loopOpen;
  const { visible: controlsVisible, reveal: revealControls } = usePlayerControlsVisibility({ playing: effectivePlaying, held: controlsHeld });
  const loopStatus = !loopEnabled
    ? t("videoPlayer.loop.off")
    : loopInvalid
      ? t("videoPlayer.loop.invalid")
      : loopStart === null || loopEnd === null
        ? t("videoPlayer.loop.incomplete")
        : t("videoPlayer.loop.active");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (shortcutOpen) {
          setShortcutOpen(false);
        } else if (settingsOpen) {
          if (settingsView !== "root") {
            setSettingsView("root");
          } else {
            setSettingsOpen(false);
            settingsButtonRef.current?.focus();
          }
        } else if (effectiveFullscreen) {
          setFullscreen(false);
          if (playback) playback.onToggleFullscreen(); else void setCurrentPlayerFullscreen(false);
        }
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        settingsOpen ||
        shortcutOpen ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) return;

      const pressedKey = getKeyboardBinding(event);
      if (!pressedKey) return;
      const matchingAction = Object.entries(shortcutBindings).find(
        ([, key]) => normalizeBindingForComparison(key) === normalizeBindingForComparison(pressedKey),
      )?.[0] as ShortcutAction | undefined;
      if (!matchingAction) return;

      event.preventDefault();
      if (matchingAction === "playPause") {
        if (playback) {
          if (playback.paused) playback.onPlay(); else playback.onPause();
        } else {
          setIsPlaying((value) => !value);
        }
      }
      if (matchingAction === "backward") performStep("backward");
      if (matchingAction === "forward") performStep("forward");
      if (matchingAction === "changeStep") setStepIndex((value) => (value + 1) % STEP_MODES.length);
      if (matchingAction === "mute") toggleMute();
      if (matchingAction === "subtitle") playback ? playback.onToggleSubtitle() : setSubtitle((value) => value === "off" ? "embedded" : "off");
      if (matchingAction === "loop") {
        if (playback) {
          if (playback.loopASeconds === null) {
            playback.onSetLoopA(effectivePosition);
            setLoopOpen(true);
          } else if (playback.loopBSeconds === null && effectivePosition > playback.loopASeconds) {
            playback.onSetLoopB(effectivePosition);
            setLoopOpen(true);
          } else {
            playback.onClearLoop();
            setLoopOpen(false);
          }
        } else {
          setLoopOpen((value) => !value);
        }
      }
      if (matchingAction === "fullscreen") void toggleFullscreen();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [effectiveFullscreen, settingsOpen, settingsView, shortcutBindings, shortcutOpen, volume, lastAudibleVolume, playback, step.label]);

  useEffect(() => {
    if (!settingsOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node) &&
        !settingsButtonRef.current?.contains(event.target as Node)
      ) {
        setSettingsOpen(false);
        setSettingsView("root");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (!playback?.commandResult) return;
    if (playback.commandResult.commandKind === "loadExternalSubtitle") {
      setFeedback(
        playback.commandResult.status === "success"
          ? t("videoPlayer.subtitleFeedback.loaded")
          : playback.commandResult.status === "cancelled"
            ? t("videoPlayer.subtitleFeedback.cancelled")
            : t("videoPlayer.subtitleFeedback.failed"),
      );
    } else if (
      playback.commandResult.status === "error" &&
      ["setSubtitleAppearance", "setSubtitleDelay", "setSubtitleInset"].includes(playback.commandResult.commandKind)
    ) {
      setFeedback(playback.commandResult.message || t("videoPlayer.subtitleFeedback.failed"));
    }
    playback.onClearCommandResult?.();
  }, [playback?.commandResult]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const key = `${playback?.sessionId ?? "mock"}:${JSON.stringify(preferences.subtitles)}`;
    if (!playback?.onSetSubtitleAppearance || lastAppearanceRef.current === key) return;
    lastAppearanceRef.current = key;
    playback.onSetSubtitleAppearance(preferences.subtitles);
  }, [playback?.sessionId, playback?.onSetSubtitleAppearance, preferences.subtitles]);

  useLayoutEffect(() => {
    if (!playback || !controlsRef.current) return;
    const controls = controlsRef.current;
    const publish = () => {
      const next = Math.round(controlsVisible && preferences.subtitles.basePosition === "bottom" ? controls.getBoundingClientRect().height + 12 : 0);
      if (next !== lastInsetRef.current) {
        lastInsetRef.current = next;
        sendInsetRef.current?.(next);
      }
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(controls);
    window.addEventListener("resize", publish);
    return () => { observer?.disconnect(); window.removeEventListener("resize", publish); };
  }, [controlsVisible, Boolean(playback), preferences.subtitles.basePosition, preferences.subtitles.verticalAdjustment]);

  useEffect(() => () => {
    if (singleClickTimerRef.current !== null) clearTimeout(singleClickTimerRef.current);
  }, []);

  function persistPreferences(next: VideoPlayerPreferences) {
    const normalized = parseVideoPlayerPreferences(next);
    setPreferences(normalized);
    if (!saveVideoPlayerPreferences(normalized)) setFeedback(t("videoPlayer.preferences.saveFailed"));
  }

  function handleVideoSurfaceClick(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button,input,select,a,[role=menu],[role=dialog]") || event.detail > 1) return;
    if (singleClickTimerRef.current !== null) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = setTimeout(() => {
      if (playback) playback.paused ? playback.onPlay() : playback.onPause(); else setIsPlaying((value) => !value);
      singleClickTimerRef.current = null;
    }, playback?.doubleClickIntervalMs ?? 500);
  }

  function handleVideoSurfaceDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button,input,select,a,[role=menu],[role=dialog]")) return;
    event.preventDefault();
    if (singleClickTimerRef.current !== null) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = null;
    void toggleFullscreen();
  }

  function toggleMute() {
    setVolumeExpanded(true);
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

  async function toggleFullscreen() {
    if (playback) {
      playback.onToggleFullscreen();
      return;
    }
    const next = !effectiveFullscreen;
    setFullscreen(next);
    if (windowHost === "tauri") await setCurrentPlayerFullscreen(next);
  }

  function performStep(direction: "backward" | "forward") {
    if (playback) {
      playback.onStep(direction, step.label);
      return;
    }
    const seconds = step.label === "1F" ? 1 / 30 : step.label === "1S" ? 1 : step.label === "10S" ? 10 : step.label === "1M" ? 60 : 600;
    setPosition((value) => Math.max(0, Math.min(7425, value + (direction === "forward" ? seconds : -seconds))));
  }

  return (
    <main
      aria-label={t("videoPlayer.windowLabel")}
      className={`relative flex min-h-0 flex-col overflow-hidden text-slate-950 dark:text-slate-50 ${windowHost === "composition" ? "h-full bg-transparent" : "h-screen bg-slate-50 dark:bg-slate-950"}`}
      data-auxiliary-window="video-player"
      data-responsive-tiers="normal compact minimum"
      data-theme-source="sakurava-appearance"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onKeyDown={revealControls}
    >
      <section onClick={handleVideoSurfaceClick} onDoubleClick={handleVideoSurfaceDoubleClick} className={`relative flex min-h-[160px] flex-1 items-center justify-center overflow-hidden ${playback ? "bg-transparent" : "bg-[radial-gradient(circle_at_50%_25%,rgba(236,72,153,0.20),transparent_37%),linear-gradient(135deg,#111827,#0f172a_58%,#020617)]"}`}>
        <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-md bg-black/45 px-2.5 py-1.5 text-white backdrop-blur-sm">
          <p className="truncate text-xs font-semibold">{displayName}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-300">
            {resolution} · {durationLabel}{playback ? "" : ` · ${t("videoPlayer.prototypeOnly")}`}
          </p>
        </div>
        {!playback && <div className="flex flex-col items-center gap-3 px-6 text-center text-slate-300">
          <Play size={40} fill="currentColor" aria-hidden="true" />
          <p className="text-sm text-slate-400">
            {t("videoPlayer.mockViewportDescription")}
          </p>
        </div>}
        {playback?.status === "error" && <p role="alert" className="rounded-lg bg-black/65 px-4 py-3 text-sm text-white">{playback.error ?? "Playback failed"}</p>}
      </section>

      <section
        ref={controlsRef}
        aria-label={t("videoPlayer.controls")}
        aria-hidden={!controlsVisible}
        inert={!controlsVisible}
        onPointerEnter={() => setPointerInControls(true)}
        onPointerLeave={() => setPointerInControls(false)}
        onFocusCapture={() => setControlsFocused(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setControlsFocused(false); }}
        className={`absolute inset-x-0 bottom-0 z-40 shrink-0 border-t border-slate-200 bg-white px-2.5 py-2.5 transition duration-200 dark:border-slate-700 dark:bg-slate-900 sm:px-4 ${controlsVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}
      >
        <div data-testid="timeline-row" className="flex min-w-0 items-center gap-3">
          <label className="sr-only" htmlFor="video-player-timeline">
            {t("videoPlayer.timeline")}
          </label>
          <input
            id="video-player-timeline"
            type="range"
            min="0"
            max={Math.max(1, effectiveDuration)}
            value={Math.min(effectivePosition, Math.max(1, effectiveDuration))}
            onChange={(event) => playback ? playback.onSeek(Number(event.target.value)) : setPosition(Number(event.target.value))}
            onPointerDown={() => setSeeking(true)}
            onPointerUp={() => setSeeking(false)}
            onPointerCancel={() => setSeeking(false)}
            className="h-1.5 min-w-12 flex-1 cursor-pointer accent-sakura-500"
          />
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-600 dark:text-slate-300 max-[480px]:text-[10px]">
            {formatTime(effectivePosition)} / {formatTime(effectiveDuration)}
          </span>
          <VolumeControl
            ref={volumeRef}
            expanded={volumeExpanded}
            volume={effectiveVolume}
            onExpand={() => setVolumeExpanded(true)}
            onCollapse={() => setVolumeExpanded(false)}
            muted={effectiveMuted}
            onToggleMute={toggleMute}
            onVolumeChange={(next) => {
              if (playback) {
                playback.onSetVolume(next);
                return;
              }
              setVolume(next);
              if (next > 0) setLastAudibleVolume(next);
            }}
          />
        </div>

        <div data-testid="transport-row" className="mt-2.5 flex h-9 min-w-0 items-center justify-between gap-2 overflow-hidden">
          <div className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
            <ControlButton
              label={t("videoPlayer.backward", { step: step.label })}
              onClick={() => performStep("backward")}
              icon={<ArrowLeft size={17} />}
              className="max-[430px]:hidden"
            />
            <ControlButton
              label={effectivePlaying ? t("videoPlayer.pause") : t("videoPlayer.play")}
              pressed={effectivePlaying}
              onClick={() => playback ? (playback.paused ? playback.onPlay() : playback.onPause()) : setIsPlaying((value) => !value)}
              prominent
              icon={effectivePlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            />
            <ControlButton
              label={t("videoPlayer.forward", { step: step.label })}
              onClick={() => performStep("forward")}
              icon={<ArrowRight size={17} />}
              className="max-[430px]:hidden"
            />
            <button
              type="button"
              aria-label={t("videoPlayer.step.aria", { step: t(step.descriptionKey) })}
              title={t("videoPlayer.step.aria", { step: t(step.descriptionKey) })}
              onClick={() => setStepIndex((value) => (value + 1) % STEP_MODES.length)}
              className="inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 max-[680px]:hidden"
            >
              {step.label}
            </button>
            <div className="flex min-w-0 items-center gap-1.5 max-[680px]:hidden">
              <button
                type="button"
                aria-expanded={loopOpen}
                aria-pressed={loopEnabled}
                data-loop-status={loopEnabled ? "on" : "off"}
                aria-label={loopEnabled ? t("videoPlayer.loop.on") : t("videoPlayer.loop.off")}
                title={t("videoPlayer.loop.toggle")}
                onClick={() => setLoopOpen((value) => !value)}
                className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-2.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 ${loopOpen ? "border-sakura-400 bg-sakura-50 text-sakura-700 dark:bg-sakura-950/40 dark:text-sakura-200" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"}`}
              >
                <span>{t("videoPlayer.loop.label")}</span>
                <span aria-hidden="true" className={`size-2.5 rounded-full border-2 ${loopEnabled ? "border-sakura-500 bg-sakura-500 ring-2 ring-sakura-200 dark:ring-sakura-800" : "border-slate-500 bg-transparent dark:border-slate-400"}`} />
                <span className="sr-only">{loopStatus}</span>
              </button>
              {loopOpen && (
                <div data-testid="loop-inline-editor" className="flex h-9 min-w-0 items-center gap-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-1 py-0 dark:border-slate-700 dark:bg-slate-800">
                  <LoopMarker label={t("videoPlayer.loop.start")} value={effectiveLoopStart} onClick={() => { setInvalidLoopEndDraft(null); if (playback) playback.onSetLoopA(effectivePosition); else setLoopStart(effectivePosition); }} />
                  <span className="text-slate-400" aria-hidden="true">—</span>
                  <LoopMarker label={t("videoPlayer.loop.end")} value={effectiveLoopEnd} onClick={() => { if (playback && effectiveLoopStart !== null && effectivePosition <= effectiveLoopStart) { setInvalidLoopEndDraft(effectivePosition); } else { setInvalidLoopEndDraft(null); if (playback) playback.onSetLoopB(effectivePosition); else setLoopEnd(effectivePosition); } }} />
                  <ControlButton label={t("videoPlayer.loop.clear")} onClick={() => { setInvalidLoopEndDraft(null); if (playback) playback.onClearLoop(); else { setLoopStart(null); setLoopEnd(null); } }} icon={<RotateCcw size={14} />} compact />
                </div>
              )}
            </div>
          </div>

          <div data-testid="right-action-group" className="flex shrink-0 items-center gap-1.5">
            <ControlButton
              label={t("videoPlayer.capture")}
              onClick={() => setCaptureFeedback(true)}
              icon={captureFeedback ? <Check size={16} /> : <Camera size={16} />}
              pressed={captureFeedback}
              className="max-[500px]:hidden"
            />
            <div className="relative">
              <button
                ref={settingsButtonRef}
                type="button"
                aria-label={t("videoPlayer.settings")}
                aria-expanded={settingsOpen}
                onClick={() => {
                  if (settingsOpen) {
                    setSettingsOpen(false);
                  } else {
                    setSettingsView("root");
                    setSettingsOpen(true);
                  }
                }}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <Settings size={16} aria-hidden="true" />
              </button>
              {settingsOpen && (
                <PlayerSettingsMenu
                  settingsRef={settingsRef}
                  triggerRef={settingsButtonRef}
                  view={settingsView}
                  speed={effectiveSpeed}
                  subtitle={playback ? playback.activeSubtitleId === null ? "off" : `track:${playback.activeSubtitleId}` : subtitle}
                  subtitleTracks={playback?.subtitleTracks}
                  onViewChange={setSettingsView}
                  onSpeedChange={(next) => playback ? playback.onSetSpeed(Number.parseFloat(next)) : setSpeed(next)}
                  onSubtitleChange={(next) => {
                    if (!playback) { setSubtitle(next); return; }
                    if (next === "off") playback.onSubtitleOff();
                    else if (next.startsWith("track:")) playback.onSetSubtitleTrack(Number(next.slice(6)));
                  }}
                  onLoadExternalSubtitle={playback?.onLoadExternalSubtitle}
                  onOpenExternally={playback?.onOpenExternally}
                  onOpenShortcuts={() => {
                    setShortcutOpen(true);
                    setSettingsOpen(false);
                    setSettingsView("root");
                  }}
                  onOpenSubtitleAppearance={() => {
                    setSubtitlePreferencesOpen(true);
                    setSettingsOpen(false);
                    setSettingsView("root");
                  }}
                />
              )}
            </div>
            <ControlButton
              label={t("videoPlayer.mini.enter")}
              onClick={() => { if (playback) playback.onEnterPip(); else if (windowHost === "tauri") void openMiniPlayerWindow({ displayName, resolution, durationLabel }); }}
              icon={<SquareArrowOutUpRight size={16} />}
            />
            <ControlButton
              label={effectiveFullscreen ? t("videoPlayer.exitFullscreen") : t("videoPlayer.fullscreen")}
              pressed={effectiveFullscreen}
              onClick={() => void toggleFullscreen()}
              icon={effectiveFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              className="max-[500px]:hidden"
            />
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {captureFeedback ? t("videoPlayer.captureReady") : loopStatus}
        </p>
      </section>

      {feedback && <div role="status" className="pointer-events-none absolute bottom-28 left-1/2 z-[65] -translate-x-1/2 rounded-lg bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-lg">{feedback}</div>}

      {shortcutOpen && (
        <ShortcutDialog
          shortcuts={shortcutBindings}
          onCancel={() => setShortcutOpen(false)}
          onSave={(nextShortcuts) => {
            setShortcutBindings(nextShortcuts);
            persistPreferences({ ...preferences, shortcuts: nextShortcuts });
            setShortcutOpen(false);
          }}
        />
      )}
      {subtitlePreferencesOpen && <SubtitleSettingsDialog
        value={preferences.subtitles}
        delay={subtitleDelay}
        onChange={(subtitles) => persistPreferences({ ...preferences, subtitles })}
        onDelayChange={(seconds) => { setSubtitleDelay(seconds); playback?.onSetSubtitleDelay?.(seconds); }}
        onClose={() => setSubtitlePreferencesOpen(false)}
      />}
    </main>
  );
}

function ControlButton({ label, icon, onClick, pressed, compact, prominent, className = "" }: { label: string; icon: ReactNode; onClick: () => void; pressed?: boolean; compact?: boolean; prominent?: boolean; className?: string }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick} className={`inline-flex shrink-0 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 ${compact ? "size-7" : "size-9"} ${prominent ? "border border-sakura-500 bg-sakura-500 text-white hover:bg-sakura-600" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"} ${pressed && !prominent ? "border-sakura-400 bg-sakura-50 text-sakura-700 dark:bg-sakura-950/40 dark:text-sakura-200" : ""} ${className}`}>{icon}</button>;
}

function LoopMarker({ label, value, onClick }: { label: string; value: number | null; onClick: () => void }) {
  return <button type="button" aria-label={`${label} ${value === null ? "unset" : formatTime(value)}`} onClick={onClick} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-slate-700 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:text-slate-100 dark:hover:bg-slate-700"><span className="text-slate-500 dark:text-slate-400 max-[920px]:sr-only">{label}</span><span className="font-mono tabular-nums">{value === null ? "—" : formatTime(value)}</span></button>;
}

const VolumeControl = ({ expanded, volume, muted, onExpand, onCollapse, onToggleMute, onVolumeChange, ref }: { expanded: boolean; volume: number; muted: boolean; onExpand: () => void; onCollapse: () => void; onToggleMute: () => void; onVolumeChange: (value: number) => void; ref: RefObject<HTMLDivElement | null> }) => {
  const t = useTranslation();
  const icon = muted || volume === 0 ? <VolumeX size={16} /> : volume < 45 ? <Volume1 size={16} /> : <Volume2 size={16} />;
  function handleBlur(event: FocusEvent<HTMLDivElement>) { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCollapse(); }
  function handleMouseLeave(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    if (!ref.current?.contains(document.activeElement)) onCollapse();
  }
  return <div ref={ref} data-testid="volume-control" className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800" onMouseEnter={onExpand} onMouseLeave={handleMouseLeave} onFocusCapture={onExpand} onBlurCapture={handleBlur}><button type="button" aria-label={muted || volume === 0 ? t("videoPlayer.volume.unmute") : t("videoPlayer.volume.mute")} aria-pressed={muted || volume === 0} onClick={() => { onExpand(); onToggleMute(); }} className="inline-flex size-8 shrink-0 items-center justify-center text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sakura-400 dark:text-slate-100">{icon}</button>{expanded && <div data-testid="volume-interaction-bridge" className="absolute bottom-full right-0 z-20 flex w-10 flex-col pb-2"><div data-testid="volume-vertical-slider" className="flex h-36 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"><label className="sr-only" htmlFor="video-player-volume">{t("videoPlayer.volume")}</label><input id="video-player-volume" type="range" min="0" max="100" value={volume} aria-valuetext={`${Math.round(volume)}%`} onPointerDown={onExpand} onChange={(event) => onVolumeChange(Number(event.target.value))} style={{ writingMode: "vertical-lr", direction: "rtl" }} className="h-28 w-5 cursor-pointer accent-sakura-500" /></div></div>}</div>;
};

function PlayerSettingsMenu({ settingsRef, triggerRef, view, speed, subtitle, subtitleTracks, onViewChange, onSpeedChange, onSubtitleChange, onLoadExternalSubtitle, onOpenExternally, onOpenShortcuts, onOpenSubtitleAppearance }: { settingsRef: RefObject<HTMLDivElement | null>; triggerRef: RefObject<HTMLButtonElement | null>; view: SettingsView; speed: string; subtitle: string; subtitleTracks?: Array<{ id: number; label: string }>; onViewChange: (view: SettingsView) => void; onSpeedChange: (value: string) => void; onSubtitleChange: (value: string) => void; onLoadExternalSubtitle?: () => void; onOpenExternally?: () => void; onOpenShortcuts: () => void; onOpenSubtitleAppearance: () => void }) {
  const t = useTranslation();
  const [position, setPosition] = useState({ left: 8, bottom: 64, width: 288, maxHeight: 320 });
  const playbackSpeedRef = useRef<HTMLButtonElement | null>(null);
  const subtitleRef = useRef<HTMLButtonElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusViewRef = useRef<Exclude<SettingsView, "root"> | null>(null);

  function openChild(next: Exclude<SettingsView, "root">) {
    returnFocusViewRef.current = next;
    onViewChange(next);
  }

  function returnToRoot() {
    onViewChange("root");
  }

  useLayoutEffect(() => {
    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const width = Math.max(240, Math.min(288, window.innerWidth - margin * 2));
      const left = Math.min(
        Math.max(margin, rect.right - width),
        Math.max(margin, window.innerWidth - width - margin),
      );
      setPosition({
        left,
        bottom: Math.max(margin, window.innerHeight - rect.top + margin),
        width,
        maxHeight: Math.max(160, rect.top - margin * 2),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (view !== "root") {
      backRef.current?.focus();
      return;
    }
    const returnTarget = returnFocusViewRef.current === "subtitle"
      ? subtitleRef.current
      : playbackSpeedRef.current;
    returnFocusViewRef.current = null;
    returnTarget?.focus();
  }, [view]);

  const childTitle = view === "playback-speed"
    ? t("videoPlayer.settings.speed")
    : t("videoPlayer.settings.subtitleCC");

  return createPortal(
    <div
      ref={settingsRef}
      role="menu"
      data-player-overlay="settings"
      data-settings-view={view}
      style={position}
      className="fixed z-[70] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {view === "root" ? (
        <>
          <SettingsMenuEntry buttonRef={playbackSpeedRef} label={t("videoPlayer.settings.speed")} onClick={() => openChild("playback-speed")} />
          <SettingsMenuEntry buttonRef={subtitleRef} label={t("videoPlayer.settings.subtitleCC")} onClick={() => openChild("subtitle")} />
          <SettingsMenuEntry label={t("videoPlayer.settings.subtitleAppearance")} popup="dialog" onClick={onOpenSubtitleAppearance} />
          <SettingsMenuEntry label={t("videoPlayer.settings.shortcuts")} popup="dialog" onClick={onOpenShortcuts} />
          <button type="button" role="menuitem" disabled aria-disabled="true" className="flex w-full cursor-not-allowed items-center justify-between rounded-md px-2 py-2 text-left text-xs text-slate-400"><span>{t("videoPlayer.settings.sheetThumbnail")}</span><ChevronRight size={15} aria-hidden="true" /></button>
          <div className="mt-1 border-t border-slate-200 pt-1 dark:border-slate-700"><button type="button" role="menuitem" disabled={!onOpenExternally} aria-disabled={!onOpenExternally} onClick={onOpenExternally} className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs ${onOpenExternally ? "font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:text-slate-100 dark:hover:bg-slate-800" : "cursor-not-allowed text-slate-400"}`}><span>{t("videoPlayer.settings.openExternally")}</span><ExternalLink size={13} aria-hidden="true" /></button></div>
        </>
      ) : (
        <>
          <button ref={backRef} type="button" role="menuitem" aria-label={`${t("common.back")}: ${childTitle}`} onClick={returnToRoot} className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:text-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={15} aria-hidden="true" /><span>{childTitle}</span></button>
          <div className="border-t border-slate-200 pt-1 dark:border-slate-700">
            {view === "playback-speed"
              ? ["0.25x", "0.5x", "1x", "1.5x", "2x", "3x"].map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={speed === option} onClick={() => onSpeedChange(option)} className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-medium ${speed === option ? "bg-sakura-50 text-sakura-700 dark:bg-sakura-950/40 dark:text-sakura-200" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}><span>{option}</span>{speed === option && <Check size={13} aria-hidden="true" />}</button>)
              : [
                  { value: "off", label: t("videoPlayer.settings.subtitleOff"), disabled: false },
                  ...(subtitleTracks === undefined
                    ? [{ value: "embedded", label: t("videoPlayer.settings.embeddedTrack"), disabled: false }]
                    : subtitleTracks.map((track) => ({ value: `track:${track.id}`, label: track.label, disabled: false }))),
                  { value: "srt", label: t("videoPlayer.settings.loadSrt"), disabled: !onLoadExternalSubtitle },
                ].map(({ value, label, disabled }) => <button key={value} type="button" role="menuitemradio" aria-checked={subtitle === value} disabled={disabled} aria-disabled={disabled} onClick={() => value === "srt" ? onLoadExternalSubtitle?.() : onSubtitleChange(value)} className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-medium ${disabled ? "cursor-not-allowed text-slate-400" : subtitle === value ? "bg-sakura-50 text-sakura-700 dark:bg-sakura-950/40 dark:text-sakura-200" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}><span className="flex items-center gap-2"><Subtitles size={13} aria-hidden="true" />{label}</span>{subtitle === value && <Check size={13} aria-hidden="true" />}</button>)}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

function SettingsMenuEntry({ buttonRef, label, popup = "menu", onClick }: { buttonRef?: RefObject<HTMLButtonElement | null>; label: string; popup?: "menu" | "dialog"; onClick: () => void }) { return <button ref={buttonRef} type="button" role="menuitem" aria-haspopup={popup} onClick={onClick} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:text-slate-100 dark:hover:bg-slate-800"><span>{label}</span><ChevronRight size={15} aria-hidden="true" /></button>; }

function ShortcutDialog({ shortcuts: initialShortcuts, onCancel, onSave }: { shortcuts: Record<ShortcutAction, string>; onCancel: () => void; onSave: (shortcuts: Record<ShortcutAction, string>) => void }) {
  const t = useTranslation();
  const [shortcuts, setShortcuts] = useState(initialShortcuts);
  const [listeningAction, setListeningAction] = useState<ShortcutAction | null>(null);
  const normalizedValues = Object.values(shortcuts).map(normalizeBindingForComparison);
  const duplicateValues = normalizedValues.filter((value, index, values) => value && values.indexOf(value) !== index);
  const hasConflict = duplicateValues.length > 0;

  function updateBinding(action: ShortcutAction, binding: string) {
    setShortcuts((current) => ({ ...current, [action]: binding }));
    setListeningAction(null);
  }

  function handleKeyCapture(action: ShortcutAction, event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (listeningAction !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setListeningAction(null);
      return;
    }
    if (event.repeat) return;
    if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && (event.key === "Backspace" || event.key === "Delete")) {
      updateBinding(action, "");
      return;
    }
    const binding = getKeyboardBinding(event);
    if (binding) updateBinding(action, binding);
  }

  function handleMouseCapture(action: ShortcutAction, event: ReactMouseEvent<HTMLButtonElement>) {
    if (listeningAction !== action || event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    updateBinding(action, getModifiedBinding(event, "MouseMiddle"));
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="shortcut-title" className="max-h-full w-full max-w-3xl overflow-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="shortcut-title" className="text-lg font-semibold">{t("videoPlayer.shortcuts.title")}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("videoPlayer.shortcuts.description")}</p>
            <p id="shortcut-capture-help" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("videoPlayer.shortcuts.captureHint")}</p>
          </div>
          <ControlButton label={t("common.close")} onClick={onCancel} icon={<X size={16} />} />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <tr><th className="pb-2">{t("videoPlayer.shortcuts.function")}</th><th className="pb-2">{t("videoPlayer.shortcuts.descriptionColumn")}</th><th className="pb-2">{t("videoPlayer.shortcuts.shortcut")}</th></tr>
            </thead>
            <tbody>
              {SHORTCUT_ACTIONS.map((action) => {
                const conflict = duplicateValues.includes(normalizeBindingForComparison(shortcuts[action.key]));
                const listening = listeningAction === action.key;
                const displayBinding = shortcuts[action.key] || t("videoPlayer.shortcuts.unbound");
                return (
                  <tr key={action.key} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2.5 font-medium">{t(action.labelKey)}</td>
                    <td className="py-2.5 text-xs text-slate-500 dark:text-slate-400">{t(action.descriptionKey)}</td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        data-testid={`shortcut-capture-${action.key}`}
                        aria-label={`${t(action.labelKey)}: ${listening ? t("videoPlayer.shortcuts.listening") : displayBinding}`}
                        aria-pressed={listening}
                        aria-describedby="shortcut-capture-help"
                        title={t("videoPlayer.shortcuts.captureHint")}
                        onClick={() => setListeningAction(action.key)}
                        onKeyDown={(event) => handleKeyCapture(action.key, event)}
                        onMouseDown={(event) => handleMouseCapture(action.key, event)}
                        onAuxClick={(event) => {
                          if (event.button === 1) {
                            event.preventDefault();
                            event.stopPropagation();
                          }
                        }}
                        className={`inline-flex h-8 min-w-28 items-center justify-center rounded-md border px-2 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-sakura-400 ${listening ? "border-sakura-400 bg-sakura-50 text-sakura-700 dark:bg-sakura-950/40 dark:text-sakura-200" : "bg-white text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"} ${conflict ? "border-amber-400" : "border-slate-200 dark:border-slate-700"}`}
                      >
                        <span aria-live="polite">{listening ? t("videoPlayer.shortcuts.listening") : displayBinding}</span>
                      </button>
                      {conflict && <p className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">{t("videoPlayer.shortcuts.conflict")}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => { setShortcuts(VIDEO_PLAYER_SHORTCUT_DEFAULTS); setListeningAction(null); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"><RotateCcw size={15} />{t("videoPlayer.shortcuts.reset")}</button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">{t("common.cancel")}</button>
            <button type="button" disabled={hasConflict} onClick={() => onSave(shortcuts)} className="h-9 rounded-lg bg-sakura-500 px-3 text-sm font-semibold text-white hover:bg-sakura-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700">{t("common.save")}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

type BindingModifierEvent = {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

function getModifiedBinding(event: BindingModifierEvent, baseKey: string) {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  if (event.metaKey) parts.push("Win");
  parts.push(baseKey);
  return parts.join("+");
}

function getKeyboardBinding(event: BindingModifierEvent & { key: string }) {
  if (["Control", "Shift", "Alt", "Meta", "OS"].includes(event.key)) return null;
  const baseKey = event.key === " "
    ? "Space"
    : /^[a-z]$/i.test(event.key)
      ? event.key.toUpperCase()
      : event.key;
  return getModifiedBinding(event, baseKey);
}

function normalizeBindingForComparison(binding: string) {
  return binding.trim().toLowerCase();
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
