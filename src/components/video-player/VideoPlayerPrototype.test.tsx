import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/LanguageContext";
import * as videoPlayerWindows from "../../runtime/videoPlayerWindows";
import VideoPlayerPrototype, {
  VIDEO_PLAYER_SHORTCUT_DEFAULTS,
  type VideoPlayerPlaybackAdapter,
} from "./VideoPlayerPrototype";

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

afterEach(() => vi.useRealTimers());

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

  it("makes hidden playing controls non-interactive after three seconds", () => {
    vi.useFakeTimers();
    const playback = productionPlayback({ paused: false });
    render(<LanguageProvider><VideoPlayerPrototype displayName="Idle Fixture" resolution="640 × 360" durationLabel="2 min" playback={playback} /></LanguageProvider>);
    const controls = screen.getByLabelText("Video player controls");
    act(() => vi.advanceTimersByTime(3000));
    expect(controls).toHaveAttribute("aria-hidden", "true");
    expect(controls).toHaveAttribute("inert");
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
    expect(screen.getByTestId("transport-row")).toHaveClass("h-9");
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

  it("uses one unclipped Settings panel with Back and two-stage Escape navigation", () => {
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
    expect(menu).toHaveAttribute("data-settings-view", "root");
    expect(within(menu).getByRole("menuitem", { name: "Playback Speed" })).toHaveFocus();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Subtitle / CC" }));
    expect(menu).toHaveAttribute("data-settings-view", "subtitle");
    expect(within(menu).queryByRole("menuitem", { name: "Playback Speed" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Back: Subtitle / CC" })).toHaveFocus();
    ["Off", "Embedded Track 1", "Load .SRT..."].forEach((subtitle) => {
      expect(within(menu).getByRole("menuitemradio", { name: subtitle })).toBeInTheDocument();
    });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Embedded Track 1" }));
    expect(within(menu).getByRole("menuitemradio", { name: "Embedded Track 1" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Back: Subtitle / CC" }));
    expect(menu).toHaveAttribute("data-settings-view", "root");
    expect(within(menu).getByRole("menuitem", { name: "Subtitle / CC" })).toHaveFocus();
    expect(within(menu).getByRole("menuitem", { name: "Sheet / Thumbnail" })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: "Open Externally" })).toBeDisabled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    const outsideControl = screen.getByLabelText("Play");
    outsideControl.focus();
    fireEvent.mouseDown(outsideControl);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(outsideControl).toHaveFocus();
  });

  it("opens Shortcuts from the Settings root without retaining the popover", () => {
    renderPlayer();
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps all four normal-width actions in the locked order", () => {
    renderPlayer();
    const actionLabels = within(screen.getByTestId("right-action-group"))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(actionLabels).toEqual([
      "Capture screenshot preview",
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

    renderPlayer();
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
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
    renderPlayer();
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
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
    renderPlayer();
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
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
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("shortcut-capture-changeStep")).toHaveTextContent("S");

    const playPause = within(dialog).getByTestId("shortcut-capture-playPause");
    fireEvent.click(playPause);
    fireEvent.keyDown(playPause, { key: "k", ctrlKey: true });
    const loop = within(dialog).getByTestId("shortcut-capture-loop");
    fireEvent.click(loop);
    fireEvent.keyDown(loop, { key: "l" });
    expect(screen.getByRole("button", { name: "Loop Off" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    fireEvent.keyDown(window, { key: "k" });
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByLabelText("Pause")).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the real Mini window seam without changing the main player toolbar", () => {
    const openMini = vi.spyOn(videoPlayerWindows, "openMiniPlayerWindow")
      .mockResolvedValue({ mode: "window" });
    renderPlayer();
    const root = screen.getByLabelText("Sakurava Video Player");
    expect(root).not.toHaveAttribute("data-player-mode");
    expect(root).toHaveAttribute("data-responsive-tiers", "normal compact minimum");

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
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle / CC" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Embedded Track 1" }));
    expect(playback.onSetSubtitleTrack).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Load .SRT..." }));
    expect(playback.onLoadExternalSubtitle).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Open Externally" }));
    expect(playback.onOpenExternally).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Enter Mini Player mode"));
    fireEvent.click(screen.getByLabelText("Enter fullscreen prototype"));
    expect(playback.onEnterPip).toHaveBeenCalledTimes(1);
    expect(playback.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });
});
