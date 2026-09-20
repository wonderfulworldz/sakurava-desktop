import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/LanguageContext";
import * as videoPlayerWindows from "../../runtime/videoPlayerWindows";
import VideoPlayerPrototype, {
  ShortcutDialog,
  VIDEO_PLAYER_SHORTCUT_DEFAULTS,
  type VideoPlayerPlaybackAdapter,
} from "./VideoPlayerPrototype";
import SubtitleSettingsDialog from "./SubtitleSettingsDialog";
import { VIDEO_PLAYER_SUBTITLE_DEFAULTS } from "../../lib/videoPlayerPreferences";

const SHORTCUT_TEST_IDS = [
  "shortcut-capture-playPause",
  "shortcut-capture-backward",
  "shortcut-capture-forward",
  "shortcut-capture-changeStep",
  "shortcut-capture-mute",
  "shortcut-capture-subtitle",
  "shortcut-capture-loop",
  "shortcut-capture-fullscreen",
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderPlayer() {
  return render(
    <LanguageProvider>
      <VideoPlayerPrototype
        displayName="Prototype Video"
        resolution="1920 × 1080"
        durationLabel="84 min"
      />
    </LanguageProvider>,
  );
}

function renderShortcutDialog(
  onSave = vi.fn(),
  onCancel = vi.fn(),
) {
  return {
    onSave,
    onCancel,
    view: render(
      <LanguageProvider>
        <ShortcutDialog
          shortcuts={VIDEO_PLAYER_SHORTCUT_DEFAULTS}
          onSave={onSave}
          onCancel={onCancel}
        />
      </LanguageProvider>,
    ),
  };
}

function productionPlayback(overrides: Partial<VideoPlayerPlaybackAdapter> = {}): VideoPlayerPlaybackAdapter {
  return {
    durationSeconds: 120,
    error: null,
    paused: true,
    positionSeconds: 12,
    speed: 1,
    volume: 72,
    muted: false,
    lastNonzeroVolume: 72,
    loopASeconds: null,
    loopBSeconds: null,
    loopEnabled: false,
    subtitleTracks: [{ id: 4, label: "Embedded Track 1" }],
    activeSubtitleId: null,
    presentation: "main" as const,
    fullscreen: false,
    status: "ready" as const,
    sourceIdentity: "video:fixture",
    onPause: vi.fn(),
    onPlay: vi.fn(),
    onSeek: vi.fn(),
    onStep: vi.fn(),
    onSetSpeed: vi.fn(),
    onSetVolume: vi.fn(),
    onToggleMute: vi.fn(),
    onSetLoopA: vi.fn(),
    onSetLoopB: vi.fn(),
    onClearLoop: vi.fn(),
    onSetSubtitleTrack: vi.fn(),
    onSubtitleOff: vi.fn(),
    onToggleSubtitle: vi.fn(),
    onLoadExternalSubtitle: vi.fn(),
    onOpenExternally: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onEnterPip: vi.fn(),
    ...overrides,
  };
}

describe("VideoPlayerPrototype", () => {
  it("keeps screenshot capture repeatable and reveals only a proven saved result", () => {
    vi.useFakeTimers();
    const capture = vi.fn();
    const openFolder = vi.fn();
    const initial = productionPlayback({
      onCaptureScreenshot: capture,
      onOpenScreenshotFolder: openFolder,
      sessionId: "session-screenshot",
    });
    const view = render(
      <LanguageProvider>
        <VideoPlayerPrototype displayName="Screenshot Fixture" resolution="640 × 360" durationLabel="2 min" playback={initial} />
      </LanguageProvider>,
    );

    const captureButton = screen.getByLabelText("Capture screenshot");
    fireEvent.click(captureButton);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Capturing screenshot…")).toBeDisabled();

    const completed = productionPlayback({
      ...initial,
      commandResult: {
        commandKind: "captureScreenshot",
        status: "success",
        message: "D:\\Output\\Screenshot.png",
      },
    });
    view.rerender(
      <LanguageProvider>
        <VideoPlayerPrototype displayName="Screenshot Fixture" resolution="640 × 360" durationLabel="2 min" playback={completed} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Screenshot saved");
    fireEvent.click(screen.getByRole("button", { name: "Open containing folder" }));
    expect(openFolder).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(3500));
    fireEvent.click(screen.getByLabelText("Capture screenshot"));
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("shows bounded command-specific subtitle failure feedback", () => {
    vi.useFakeTimers();
    const playback = productionPlayback({
      commandResult: {
        commandKind: "loadExternalSubtitle",
        status: "error",
        message: "MPV_COMMAND_FAILED:-12",
      },
    });
    render(<LanguageProvider><VideoPlayerPrototype displayName="Feedback Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} /></LanguageProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("External subtitle could not be loaded.");
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("arbitrates surface single and double click without firing the single action first", () => {
    vi.useFakeTimers();
    const playback = productionPlayback({ doubleClickIntervalMs: 400 });
    render(<LanguageProvider><VideoPlayerPrototype displayName="Gesture Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} /></LanguageProvider>);
    const surface = screen.getByText("Gesture Fixture").closest("section")!;
    fireEvent.click(surface, { detail: 1 });
    expect(playback.onPlay).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(playback.onPlay).toHaveBeenCalledTimes(1);
    vi.mocked(playback.onPlay).mockClear();
    fireEvent.click(surface, { detail: 1 });
    fireEvent.doubleClick(surface, { detail: 2 });
    act(() => vi.advanceTimersByTime(400));
    expect(playback.onPlay).not.toHaveBeenCalled();
    expect(playback.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("makes idle controls non-interactive after 1.5 seconds and keeps them hidden for keyboard play", () => {
    vi.useFakeTimers();
    const playback = productionPlayback({ paused: true });
    render(<LanguageProvider><VideoPlayerPrototype displayName="Idle Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} /></LanguageProvider>);
    const controls = screen.getByLabelText("Video player controls");
    act(() => vi.advanceTimersByTime(1500));
    expect(controls).toHaveAttribute("aria-hidden", "true");
    expect(controls).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: " " });
    expect(playback.onPlay).toHaveBeenCalledTimes(1);
    expect(controls).toHaveAttribute("aria-hidden", "true");
  });

  it("publishes one source-agnostic control clearance across hide, reveal, and reflow", () => {
    vi.useFakeTimers();
    const onSetSubtitleInset = vi.fn();
    let storedPreferences = JSON.stringify({ version: 3, subtitles: { basePosition: "source" } });
    const preferenceStorage = {
      getItem: () => storedPreferences,
      setItem: vi.fn(),
    };
    const rect = {
      x: 0,
      y: 672,
      top: 672,
      left: 0,
      right: 1162,
      bottom: 800,
      width: 1162,
      height: 128,
      toJSON: () => ({}),
    };
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    const playback = productionPlayback({ onSetSubtitleInset });
    const view = render(
      <LanguageProvider>
        <VideoPlayerPrototype
          displayName="Subtitle Inset Fixture"
          resolution="640 × 360"
          durationLabel="2 min"
          playback={playback}
          preferenceStorage={preferenceStorage}
        />
      </LanguageProvider>,
    );

    expect(onSetSubtitleInset).toHaveBeenLastCalledWith({
      safeAreaBottomRatio: 112 / 768,
      overlapCssPixels: 96,
      viewportWidthCssPixels: 1024,
      viewportHeightCssPixels: 768,
      deviceScaleFactor: 1,
    });
    act(() => vi.advanceTimersByTime(1500));
    expect(onSetSubtitleInset).toHaveBeenLastCalledWith({
      safeAreaBottomRatio: 0,
      overlapCssPixels: 0,
      viewportWidthCssPixels: 1024,
      viewportHeightCssPixels: 768,
      deviceScaleFactor: 1,
    });
    fireEvent.pointerMove(screen.getByLabelText("Sakurava Video Player"));
    expect(onSetSubtitleInset).toHaveBeenLastCalledWith(expect.objectContaining({
      safeAreaBottomRatio: 112 / 768,
      overlapCssPixels: 96,
    }));
    rectSpy.mockReturnValue({
      ...rect,
      y: 620,
      top: 620,
      height: 180,
    });
    fireEvent(window, new Event("resize"));
    expect(onSetSubtitleInset).toHaveBeenLastCalledWith(expect.objectContaining({
      safeAreaBottomRatio: 164 / 768,
      overlapCssPixels: 148,
    }));
    const latestInsetCall = onSetSubtitleInset.mock.calls[onSetSubtitleInset.mock.calls.length - 1];
    expect(latestInsetCall?.[0]).not.toHaveProperty("sourceType");
    const callsBeforeFullscreen = onSetSubtitleInset.mock.calls.length;
    view.rerender(
      <LanguageProvider>
        <VideoPlayerPrototype
          displayName="Subtitle Inset Fixture"
          resolution="640 × 360"
          durationLabel="2 min"
          playback={{ ...playback, fullscreen: true }}
        />
      </LanguageProvider>,
    );
    expect(onSetSubtitleInset.mock.calls.length).toBe(callsBeforeFullscreen + 1);
    expect(onSetSubtitleInset).toHaveBeenLastCalledWith(expect.objectContaining({
      safeAreaBottomRatio: 164 / 768,
      overlapCssPixels: 148,
    }));
    storedPreferences = JSON.stringify({ version: 3, subtitles: { basePosition: "middle", verticalAdjustment: 40 } });
    view.rerender(
      <LanguageProvider>
        <VideoPlayerPrototype
          key="middle"
          displayName="Subtitle Inset Fixture"
          resolution="640 × 360"
          durationLabel="2 min"
          playback={{ ...playback, fullscreen: true }}
          preferenceStorage={preferenceStorage}
        />
      </LanguageProvider>,
    );
    expect(onSetSubtitleInset).toHaveBeenLastCalledWith(expect.objectContaining({ safeAreaBottomRatio: 0 }));
    storedPreferences = JSON.stringify({ version: 3, subtitles: { basePosition: "top", verticalAdjustment: 40 } });
    view.rerender(
      <LanguageProvider>
        <VideoPlayerPrototype
          key="top"
          displayName="Subtitle Inset Fixture"
          resolution="640 × 360"
          durationLabel="2 min"
          playback={{ ...playback, fullscreen: true }}
          preferenceStorage={preferenceStorage}
        />
      </LanguageProvider>,
    );
    expect(onSetSubtitleInset).toHaveBeenLastCalledWith(expect.objectContaining({ safeAreaBottomRatio: 0 }));
    storedPreferences = JSON.stringify({ version: 3, subtitles: { basePosition: "bottom", verticalAdjustment: 40 } });
    view.rerender(
      <LanguageProvider>
        <VideoPlayerPrototype
          key="bottom"
          displayName="Subtitle Inset Fixture"
          resolution="640 × 360"
          durationLabel="2 min"
          playback={{ ...playback, fullscreen: true }}
          preferenceStorage={preferenceStorage}
        />
      </LanguageProvider>,
    );
    expect(onSetSubtitleInset).toHaveBeenLastCalledWith(expect.objectContaining({ safeAreaBottomRatio: 164 / 768 }));
    rectSpy.mockRestore();
  });

  it("restores remembered playback, loop, and subtitle settings for a new session", () => {
    const preferenceStorage = {
      getItem: () => JSON.stringify({
      version: 2,
      playback: {
        speed: 1.5,
        volume: 44,
        muted: true,
      },
      sources: { "video:remembered": {
        loopEnabled: true,
        loopASeconds: 10,
        loopBSeconds: 30,
        subtitlesEnabled: true,
        subtitleTrackId: 4,
        positionSeconds: 50,
      } },
      }),
      setItem: vi.fn(),
    };
    const playback = productionPlayback({
      sessionId: "remembered-session",
      sourceIdentity: "video:remembered",
      onSetMuted: vi.fn(),
    });
    const view = render(<LanguageProvider><VideoPlayerPrototype displayName="Remembered Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} preferenceStorage={preferenceStorage} /></LanguageProvider>);
    expect(playback.onSetSpeed).toHaveBeenCalledWith(1.5);
    const rerender = (overrides: Partial<VideoPlayerPlaybackAdapter>) => view.rerender(
      <LanguageProvider><VideoPlayerPrototype displayName="Remembered Fixture" resolution="640 × 360" durationLabel="2 min" playback={{ ...playback, ...overrides }} preferenceStorage={preferenceStorage} /></LanguageProvider>,
    );
    rerender({ speed: 1.5 });
    expect(playback.onSetVolume).toHaveBeenCalledWith(44);
    rerender({ speed: 1.5, volume: 44 });
    expect(playback.onSetMuted).toHaveBeenCalledWith(true);
    rerender({ speed: 1.5, volume: 44, muted: true });
    expect(playback.onSetLoopA).toHaveBeenCalledWith(10);
    rerender({ speed: 1.5, volume: 44, muted: true, loopASeconds: 10 });
    expect(playback.onSetLoopB).toHaveBeenCalledWith(30);
    rerender({ speed: 1.5, volume: 44, muted: true, loopASeconds: 10, loopBSeconds: 30, loopEnabled: true });
    expect(playback.onSetSubtitleTrack).toHaveBeenCalledWith(4);
    rerender({ speed: 1.5, volume: 44, muted: true, loopASeconds: 10, loopBSeconds: 30, loopEnabled: true, activeSubtitleId: 4 });
    expect(playback.onSeek).toHaveBeenCalledWith(50);
  });

  it("remembers engine-confirmed loop and subtitle changes without persisting pause state", () => {
    vi.useFakeTimers();
    let storedValue: string | null = null;
    const preferenceStorage = {
      getItem: () => storedValue,
      setItem: (_key: string, value: string) => { storedValue = value; },
    };
    const initial = productionPlayback({ sessionId: "observe-session", sourceIdentity: "video:observed", positionSeconds: 12 });
    const view = render(<LanguageProvider><VideoPlayerPrototype displayName="Observed Fixture" resolution="640 × 360" durationLabel="2 min" playback={initial} preferenceStorage={preferenceStorage} /></LanguageProvider>);
    view.rerender(<LanguageProvider><VideoPlayerPrototype
      displayName="Observed Fixture"
      resolution="640 × 360"
      durationLabel="2 min"
      preferenceStorage={preferenceStorage}
      playback={productionPlayback({
        ...initial,
        paused: false,
        loopASeconds: 8,
        loopBSeconds: 28,
        loopEnabled: true,
        activeSubtitleId: 4,
      })}
    /></LanguageProvider>);
    act(() => vi.advanceTimersByTime(1000));
    const stored = JSON.parse(String(storedValue));
    expect(stored.sources["video:observed"]).toMatchObject({
      loopEnabled: true,
      loopASeconds: 8,
      loopBSeconds: 28,
      subtitlesEnabled: true,
      subtitleTrackId: 4,
      positionSeconds: 12,
    });
    expect(stored.playback).not.toHaveProperty("paused");
  });

  it("cycles mock playback and the exact compact seek steps", () => {
    renderPlayer();
    fireEvent.click(screen.getByLabelText("Play"));
    expect(screen.getByLabelText("Pause")).toHaveAttribute("aria-pressed", "true");

    ["one frame", "one second", "ten seconds", "one minute", "ten minutes"].forEach(
      (name) => {
        fireEvent.click(
          screen.getByLabelText(
            `Seek step: ${name}. Activate to choose the next step.`,
          ),
        );
      },
    );
    expect(
      screen.getByLabelText(
        "Seek step: one frame. Activate to choose the next step.",
      ),
    ).toBeInTheDocument();
  });

  it("uses visible Looping text and a stable inline A-B editor", () => {
    renderPlayer();
    const loop = screen.getByRole("button", { name: "Loop Off" });
    expect(loop).toHaveAttribute("aria-pressed", "false");
    expect(loop).toHaveAttribute("data-loop-status", "off");
    expect(loop).toHaveTextContent("Looping");
    fireEvent.click(loop);
    const activeLoop = screen.getByRole("button", { name: "Loop On" });
    expect(activeLoop).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(activeLoop).toHaveAttribute("data-loop-status", "on");
    const editor = screen.getByTestId("loop-inline-editor");
    expect(screen.getByTestId("transport-row")).toHaveClass("flex-wrap");
    expect(screen.getByTestId("transport-row")).not.toHaveClass("overflow-hidden");
    expect(editor).toHaveClass("h-9", "overflow-hidden");
    expect(editor).not.toHaveClass("overflow-x-auto");
    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    fireEvent.click(screen.getByRole("button", { name: /End/ }));
    expect(
      screen.getAllByText("Loop end must be after loop start"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Clear loop markers"));
    expect(screen.getByRole("button", { name: /Start/ })).toHaveTextContent("—");
  });

  it("keeps Volume open across its shared hover bridge and while focused", () => {
    renderPlayer();
    const timelineRow = screen.getByTestId("timeline-row");
    const transportRow = screen.getByTestId("transport-row");
    const volumeControl = screen.getByTestId("volume-control");
    expect(timelineRow).toContainElement(volumeControl);
    expect(transportRow).not.toContainElement(volumeControl);
    expect(screen.queryByTestId("volume-vertical-slider")).not.toBeInTheDocument();

    fireEvent.mouseEnter(volumeControl);
    const bridge = screen.getByTestId("volume-interaction-bridge");
    const slider = screen.getByTestId("volume-vertical-slider");
    expect(volumeControl).toContainElement(bridge);
    expect(volumeControl).toContainElement(slider);
    expect(bridge).toHaveClass("absolute", "bottom-full", "pb-2");
    fireEvent.mouseLeave(volumeControl, { relatedTarget: bridge });
    expect(screen.getByTestId("volume-vertical-slider")).toBeInTheDocument();
    const range = screen.getByLabelText("Mock volume");
    range.focus();
    fireEvent.mouseLeave(volumeControl, { relatedTarget: document.body });
    expect(screen.getByTestId("volume-vertical-slider")).toBeInTheDocument();
    expect(screen.getByLabelText("Mock volume")).toHaveAttribute(
      "aria-valuetext",
      "72%",
    );
    const mute = screen.getByRole("button", { name: "Mute" });
    fireEvent.click(mute);
    expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(screen.getByLabelText("Mock volume")).toHaveValue("72");
  });

  it("uses one unclipped Settings panel and dismisses its complete hierarchy with Escape", () => {
    renderPlayer();
    const trigger = screen.getByLabelText("Player settings");
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("data-player-overlay", "settings");
    expect(screen.getByTestId("transport-row")).not.toContainElement(menu);
    expect(document.body).toContainElement(menu);

    [
      "Playback Speed",
      "Subtitle / CC",
      "Shortcuts",
      "Sheet / Thumbnail",
      "Open Externally",
    ].forEach((label) => {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeInTheDocument();
    });
    expect(within(menu).queryByRole("menuitem", { name: "Subtitle appearance" })).not.toBeInTheDocument();
    const speedEntry = within(menu).getByRole("menuitem", { name: "Playback Speed" });
    fireEvent.click(speedEntry);
    expect(menu).toHaveAttribute("data-settings-view", "playback-speed");
    expect(within(menu).queryByRole("menuitem", { name: "Subtitle / CC" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Shortcuts" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Back: Playback Speed" })).toHaveFocus();
    ["0.25x", "0.5x", "1x", "1.5x", "2x", "3x"].forEach((speed) => {
      expect(within(menu).getByRole("menuitemradio", { name: speed })).toBeInTheDocument();
    });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "1.5x" }));
    expect(within(menu).getByRole("menuitemradio", { name: "1.5x" })).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const subtitleMenu = screen.getByRole("menu");
    fireEvent.click(within(subtitleMenu).getByRole("menuitem", { name: "Subtitle / CC" }));
    expect(subtitleMenu).toHaveAttribute("data-settings-view", "subtitle");
    expect(within(subtitleMenu).queryByRole("menuitem", { name: "Playback Speed" })).not.toBeInTheDocument();
    expect(within(subtitleMenu).getByRole("menuitem", { name: "Back: Subtitle / CC" })).toHaveFocus();
    ["Off", "Embedded Track 1", "Load Subtitle File…"].forEach((subtitle) => {
      expect(within(subtitleMenu).getByRole("menuitemradio", { name: subtitle })).toBeInTheDocument();
    });
    expect(within(subtitleMenu).getByRole("menuitem", { name: "Subtitle appearance" })).toBeInTheDocument();
    fireEvent.click(within(subtitleMenu).getByRole("menuitemradio", { name: "Embedded Track 1" }));
    expect(within(subtitleMenu).getByRole("menuitemradio", { name: "Embedded Track 1" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(subtitleMenu).getByRole("menuitem", { name: "Back: Subtitle / CC" }));
    expect(subtitleMenu).toHaveAttribute("data-settings-view", "root");
    expect(within(subtitleMenu).getByRole("menuitem", { name: "Subtitle / CC" })).toHaveFocus();
    expect(within(subtitleMenu).getByRole("menuitem", { name: "Sheet / Thumbnail" })).toBeDisabled();
    expect(within(subtitleMenu).getByRole("menuitem", { name: "Open Externally" })).toBeDisabled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).not.toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("player-settings-dismiss-layer"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("consumes outside-menu dismissal without toggling playback", () => {
    const playback = productionPlayback({ paused: false });
    render(<LanguageProvider><VideoPlayerPrototype displayName="Dismiss Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} /></LanguageProvider>);
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByTestId("player-settings-dismiss-layer"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(playback.onPause).not.toHaveBeenCalled();
    expect(playback.onPlay).not.toHaveBeenCalled();
    expect(playback.onSeek).not.toHaveBeenCalled();
  });

  it("routes Shortcuts to its separate utility window without retaining the popover", () => {
    const onOpenShortcuts = vi.fn();
    const playback = productionPlayback({ onOpenShortcuts });
    render(<LanguageProvider><VideoPlayerPrototype displayName="Utility Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} /></LanguageProvider>);
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it("routes Subtitle appearance to its separate utility window", () => {
    const onOpenSubtitleAppearance = vi.fn();
    const playback = productionPlayback({ onOpenSubtitleAppearance });
    render(<LanguageProvider><VideoPlayerPrototype displayName="Utility Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} /></LanguageProvider>);
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle / CC" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle appearance" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onOpenSubtitleAppearance).toHaveBeenCalledTimes(1);
  });

  it("renders the Subtitle utility as a readable translucent standalone surface", () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <SubtitleSettingsDialog
          value={VIDEO_PLAYER_SUBTITLE_DEFAULTS}
          delay={0}
          onChange={vi.fn()}
          onDelayChange={vi.fn()}
          onClose={onClose}
        />
      </LanguageProvider>,
    );
    const panel = screen.getByTestId("player-settings-panel");
    expect(panel).toHaveAttribute("aria-modal", "false");
    expect(panel).toHaveClass("h-screen", "bg-white/80", "dark:bg-slate-950/80", "backdrop-blur-xl");
    expect(panel).not.toHaveClass("opacity-80", "p-3", "rounded-2xl");
    expect(panel.querySelector("section[role=dialog]")).toBeNull();
    expect(within(panel).getByLabelText("Font family").tagName).toBe("SELECT");
    expect(within(panel).getByLabelText("Font family")).toHaveValue("");
    expect(within(panel).getAllByText("Source / authored default")).toHaveLength(2);
    expect(within(panel).getByLabelText("Base position")).toHaveValue("source");
    expect(within(panel).getByLabelText("Vertical adjustment (0)")).toBeDisabled();
    expect(panel.querySelector('[data-layout="landscape-two-column"]')).toHaveClass("md:grid-cols-2");
    expect(within(panel).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps one persisted adjustment enabled across Bottom, Middle, and Top", () => {
    const onChange = vi.fn();
    const renderDialog = (basePosition: "source" | "bottom" | "middle" | "top") => (
      <LanguageProvider>
        <SubtitleSettingsDialog
          value={{ ...VIDEO_PLAYER_SUBTITLE_DEFAULTS, basePosition, verticalAdjustment: 35 }}
          delay={0}
          onChange={onChange}
          onDelayChange={vi.fn()}
          onClose={vi.fn()}
        />
      </LanguageProvider>
    );
    const view = render(renderDialog("bottom"));
    const position = screen.getByLabelText("Base position");
    expect(screen.getByLabelText("Vertical adjustment (35)")).toBeEnabled();
    fireEvent.change(position, { target: { value: "middle" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      basePosition: "middle",
      verticalAdjustment: 35,
    }));
    view.rerender(renderDialog("middle"));
    expect(screen.getByLabelText("Vertical adjustment (35)")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Base position"), { target: { value: "top" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      basePosition: "top",
      verticalAdjustment: 35,
    }));
    view.rerender(renderDialog("top"));
    expect(screen.getByLabelText("Vertical adjustment (35)")).toBeEnabled();
    view.rerender(renderDialog("bottom"));
    expect(screen.getByLabelText("Vertical adjustment (35)")).toBeEnabled();
    view.rerender(renderDialog("source"));
    expect(screen.getByLabelText("Vertical adjustment (35)")).toBeDisabled();
  });

  it("lets transport hide after opening the independent Shortcuts utility", () => {
    vi.useFakeTimers();
    const onOpenShortcuts = vi.fn();
    render(<LanguageProvider><VideoPlayerPrototype displayName="Utility Fixture" resolution="640 × 360" durationLabel="2 min" playback={productionPlayback({ onOpenShortcuts })} /></LanguageProvider>);
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
    const controls = screen.getByLabelText("Video player controls");
    act(() => vi.advanceTimersByTime(1500));
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(controls).toHaveAttribute("aria-hidden", "true");
    fireEvent.pointerMove(screen.getByLabelText("Sakurava Video Player"));
    act(() => vi.advanceTimersByTime(1499));
    expect(controls).toHaveAttribute("aria-hidden", "false");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByLabelText("Video player controls")).toHaveAttribute("aria-hidden", "true");
  });

  it("holds the complete Settings hierarchy past idle and resumes auto-hide after dismissal", () => {
    vi.useFakeTimers();
    const onOpenSubtitleAppearance = vi.fn();
    render(<LanguageProvider><VideoPlayerPrototype displayName="Lifecycle Fixture" resolution="640 × 360" durationLabel="2 min" playback={productionPlayback({ onOpenSubtitleAppearance })} /></LanguageProvider>);
    const controls = screen.getByLabelText("Video player controls");
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Playback Speed" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(controls).toHaveAttribute("aria-hidden", "false");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1499));
    expect(controls).toHaveAttribute("aria-hidden", "false");
    act(() => vi.advanceTimersByTime(1));
    expect(controls).toHaveAttribute("aria-hidden", "true");

    fireEvent.pointerMove(screen.getByLabelText("Sakurava Video Player"));
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle / CC" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("menu")).toHaveAttribute("data-settings-view", "subtitle");
    expect(controls).toHaveAttribute("aria-hidden", "false");
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle appearance" }));
    expect(onOpenSubtitleAppearance).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1500));
    expect(controls).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps all four normal-width actions in the locked order", () => {
    renderPlayer();
    const actionLabels = within(screen.getByTestId("right-action-group"))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(actionLabels).toEqual([
      "Capture screenshot",
      "Player settings",
      "Enter Mini Player mode",
      "Enter fullscreen prototype",
    ]);
    const actions = screen.getByTestId("right-action-group");
    expect(actions.querySelector(".lucide-camera")).toBeInTheDocument();
    expect(actions.querySelector(".lucide-settings")).toBeInTheDocument();
    expect(actions.querySelector(".lucide-square-arrow-out-up-right")).toBeInTheDocument();
    expect(actions.querySelector(".lucide-maximize")).toBeInTheDocument();
  });

  it("hides the complete Main chrome atomically instead of exposing a timeline-only transition", () => {
    vi.useFakeTimers();
    render(<LanguageProvider><VideoPlayerPrototype displayName="Main Chrome Fixture" resolution="640 × 360" durationLabel="2 min" playback={productionPlayback()} /></LanguageProvider>);
    const controls = screen.getByLabelText("Video player controls");
    expect(controls).not.toHaveClass("translate-y-0", "translate-y-full");
    act(() => vi.advanceTimersByTime(1500));
    expect(controls).toHaveAttribute("aria-hidden", "true");
    expect(controls).toHaveClass("opacity-0", "pointer-events-none");
    expect(controls).not.toHaveClass("translate-y-full");
    expect(screen.getByTestId("timeline-row")).toBeInTheDocument();
    expect(screen.getByTestId("transport-row")).toBeInTheDocument();
  });

  it("shows exactly eight capture-only shortcut defaults and normalizes keyboard input", () => {
    expect(Object.values(VIDEO_PLAYER_SHORTCUT_DEFAULTS)).toEqual([
      "Space",
      "ArrowLeft",
      "ArrowRight",
      "S",
      "M",
      "C",
      "L",
      "F",
    ]);

    renderShortcutDialog();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryAllByRole("textbox")).toHaveLength(0);
    const captureFields = SHORTCUT_TEST_IDS.map((testId) => within(dialog).getByTestId(testId));
    expect(captureFields).toHaveLength(8);
    expect(captureFields.map((field) => field.textContent)).toEqual(
      Object.values(VIDEO_PLAYER_SHORTCUT_DEFAULTS),
    );

    const backward = within(dialog).getByTestId("shortcut-capture-backward");
    fireEvent.click(backward);
    expect(backward).toHaveTextContent("Listening…");
    fireEvent.keyDown(backward, { key: "Control", ctrlKey: true });
    expect(backward).toHaveTextContent("Listening…");
    fireEvent.keyDown(backward, { key: "k", ctrlKey: true, shiftKey: true, altKey: true, repeat: true });
    expect(backward).toHaveTextContent("Listening…");
    fireEvent.keyDown(backward, { key: "k", ctrlKey: true, shiftKey: true, altKey: true, metaKey: true });
    expect(backward).toHaveTextContent("Ctrl+Shift+Alt+Win+K");

    const forward = within(dialog).getByTestId("shortcut-capture-forward");
    fireEvent.click(forward);
    fireEvent.keyDown(forward, { key: " ", code: "Space" });
    expect(forward).toHaveTextContent("Space");
    expect(within(dialog).getAllByText("Shortcut already used")).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(backward);
    fireEvent.keyDown(backward, { key: "Escape" });
    expect(backward).toHaveTextContent("Ctrl+Shift+Alt+Win+K");
    fireEvent.click(backward);
    fireEvent.keyDown(backward, { key: "Backspace" });
    expect(backward).toHaveTextContent("Unbound");
    fireEvent.click(forward);
    fireEvent.keyDown(forward, { key: "Delete" });
    expect(forward).toHaveTextContent("Unbound");
    expect(within(dialog).queryByText("Shortcut already used")).not.toBeInTheDocument();
  });

  it("captures only Middle Mouse and modifier combinations from supported mouse input", () => {
    renderShortcutDialog();
    const dialog = screen.getByRole("dialog");
    const backward = within(dialog).getByTestId("shortcut-capture-backward");
    fireEvent.click(backward);

    fireEvent.mouseDown(backward, { button: 0 });
    fireEvent.mouseDown(backward, { button: 2 });
    fireEvent.mouseDown(backward, { button: 3 });
    fireEvent.mouseDown(backward, { button: 4 });
    fireEvent.wheel(backward, { deltaY: 100 });
    expect(backward).toHaveTextContent("Listening…");

    fireEvent.mouseDown(backward, { button: 1 });
    expect(backward).toHaveTextContent("MouseMiddle");

    const forward = within(dialog).getByTestId("shortcut-capture-forward");
    fireEvent.click(forward);
    fireEvent.mouseDown(forward, { button: 1, ctrlKey: true, shiftKey: true });
    expect(forward).toHaveTextContent("Ctrl+Shift+MouseMiddle");
  });

  it("preserves conflict, Reset, Cancel, and canonical player-command behavior", () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const { view } = renderShortcutDialog(onSave, onCancel);
    let dialog = screen.getByRole("dialog");
    const backward = within(dialog).getByTestId("shortcut-capture-backward");
    fireEvent.click(backward);
    fireEvent.keyDown(backward, { key: " " });
    expect(within(dialog).getAllByText("Shortcut already used")).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Defaults" }));
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(SHORTCUT_TEST_IDS.map((testId) => within(dialog).getByTestId(testId).textContent)).toEqual(
      Object.values(VIDEO_PLAYER_SHORTCUT_DEFAULTS),
    );

    const changeStep = within(dialog).getByTestId("shortcut-capture-changeStep");
    fireEvent.click(changeStep);
    fireEvent.keyDown(changeStep, { key: "k", ctrlKey: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    view.unmount();
    renderShortcutDialog(onSave, onCancel);
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("shortcut-capture-changeStep")).toHaveTextContent("S");

    const playPause = within(dialog).getByTestId("shortcut-capture-playPause");
    fireEvent.click(playPause);
    fireEvent.keyDown(playPause, { key: "k", ctrlKey: true });
    const loop = within(dialog).getByTestId("shortcut-capture-loop");
    fireEvent.click(loop);
    fireEvent.keyDown(loop, { key: "l" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      playPause: "Ctrl+K",
      loop: "L",
    }));
  });

  it("opens the real Mini window seam without changing the main player toolbar", () => {
    const openMini = vi.spyOn(videoPlayerWindows, "openMiniPlayerWindow")
      .mockResolvedValue({ mode: "window" });
    renderPlayer();
    const root = screen.getByLabelText("Sakurava Video Player");
    expect(root).not.toHaveAttribute("data-player-mode");
    expect(root).toHaveAttribute("data-responsive-tiers", "main-full-functionality");

    fireEvent.click(screen.getByLabelText("Enter Mini Player mode"));
    expect(openMini).toHaveBeenCalledWith({
      displayName: "Prototype Video",
      resolution: "1920 × 1080",
      durationLabel: "84 min",
    });
    expect(within(screen.getByTestId("right-action-group")).getAllByRole("button")).toHaveLength(4);
  });

  it("fits the CompositionController host and leaves its video surface transparent", () => {
    const playback = {
      durationSeconds: 45,
      error: null,
      paused: true,
      positionSeconds: 8,
      speed: 1,
      volume: 72,
      muted: false,
      lastNonzeroVolume: 72,
      loopASeconds: null,
      loopBSeconds: null,
      loopEnabled: false,
      subtitleTracks: [],
      activeSubtitleId: null,
      presentation: "main" as const,
      fullscreen: false,
      status: "ready" as const,
      onPause: vi.fn(),
      onPlay: vi.fn(),
      onSeek: vi.fn(),
      onStep: vi.fn(),
      onSetSpeed: vi.fn(),
      onSetVolume: vi.fn(),
      onToggleMute: vi.fn(),
      onSetLoopA: vi.fn(),
      onSetLoopB: vi.fn(),
      onClearLoop: vi.fn(),
      onSetSubtitleTrack: vi.fn(),
      onSubtitleOff: vi.fn(),
      onToggleSubtitle: vi.fn(),
      onLoadExternalSubtitle: vi.fn(),
      onOpenExternally: vi.fn(),
      onToggleFullscreen: vi.fn(),
      onEnterPip: vi.fn(),
    };
    render(
      <LanguageProvider>
        <VideoPlayerPrototype
          displayName="Production fixture"
          resolution="960 × 540"
          durationLabel="45 sec"
          playback={playback}
          windowHost="composition"
        />
      </LanguageProvider>,
    );

    expect(screen.getByLabelText("Sakurava Video Player")).toHaveClass(
      "h-full",
      "bg-transparent",
    );
    expect(screen.getByLabelText("Sakurava Video Player")).not.toHaveClass(
      "h-screen",
    );
  });

  it("routes accepted Stage 2 controls to the engine adapter without changing the toolbar", () => {
    const playback = productionPlayback();
    render(
      <LanguageProvider>
        <VideoPlayerPrototype displayName="Engine" resolution="1280 × 720" durationLabel="2 min" playback={playback} windowHost="composition" />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByLabelText("Seek backward by 1F"));
    fireEvent.click(screen.getByLabelText("Seek forward by 1F"));
    expect(playback.onStep).toHaveBeenNthCalledWith(1, "backward", "1F");
    expect(playback.onStep).toHaveBeenNthCalledWith(2, "forward", "1F");
    fireEvent.click(screen.getByLabelText("Seek step: one frame. Activate to choose the next step."));
    fireEvent.click(screen.getByLabelText("Seek forward by 1S"));
    expect(playback.onStep).toHaveBeenLastCalledWith("forward", "1S");

    fireEvent.click(screen.getByRole("button", { name: "Loop Off" }));
    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    expect(playback.onSetLoopA).toHaveBeenCalledWith(12);
    fireEvent.click(screen.getByLabelText("Clear loop markers"));
    expect(playback.onClearLoop).toHaveBeenCalledTimes(1);

    fireEvent.mouseEnter(screen.getByTestId("volume-control"));
    fireEvent.change(screen.getByLabelText("Mock volume"), { target: { value: "45" } });
    expect(playback.onSetVolume).toHaveBeenCalledWith(45);
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(playback.onToggleMute).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Playback Speed" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "3x" }));
    expect(playback.onSetSpeed).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("menuitem", { name: "Back: Playback Speed" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle / CC" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Embedded Track 1" }));
    expect(playback.onSetSubtitleTrack).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Load Subtitle File…" }));
    expect(playback.onLoadExternalSubtitle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Back: Subtitle / CC" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open Externally" }));
    expect(playback.onOpenExternally).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Enter Mini Player mode"));
    fireEvent.click(screen.getByLabelText("Enter fullscreen prototype"));
    expect(playback.onEnterPip).toHaveBeenCalledTimes(1);
    expect(playback.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });
});
