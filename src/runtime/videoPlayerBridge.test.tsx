import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/LanguageContext";
import VideoPlayerProductionRoot from "../components/video-player/VideoPlayerProductionRoot";
import { parsePlaybackSnapshot, parsePlayerCommandResult, VIDEO_PLAYER_PROTOCOL_VERSION } from "./videoPlayerBridge";

function snapshot(revision: number, positionSeconds = 12) {
  return {
    protocolVersion: VIDEO_PLAYER_PROTOCOL_VERSION,
    kind: "snapshot",
    snapshot: {
      protocolVersion: VIDEO_PLAYER_PROTOCOL_VERSION,
      revision,
      sessionId: "session-1",
      sourceIdentity: "V-2608-0001",
      displayName: "Engine Fixture",
      resolution: "1280 × 720",
      paused: true,
      positionSeconds,
      durationSeconds: 60,
      speed: 1,
      volume: 72,
      muted: false,
      lastNonzeroVolume: 72,
      loopASeconds: null,
      loopBSeconds: null,
      loopEnabled: false,
      subtitleTracks: [{ id: 2, label: "Embedded Track 1", language: "eng", title: null, selected: false }],
      activeSubtitleId: null,
      subtitleDelaySeconds: 0,
      presentation: "main",
      fullscreen: false,
      doubleClickIntervalMs: 500,
      status: "ready",
      hwdecCurrent: null,
      error: null,
    },
  };
}

describe("videoPlayerBridge", () => {
  it("accepts typed command success, cancel, and failure results", () => {
    expect(parsePlayerCommandResult({ protocolVersion: VIDEO_PLAYER_PROTOCOL_VERSION, kind: "commandResult", requestId: "r1", sessionId: "s1", revision: 2, commandKind: "loadExternalSubtitle", status: "success", code: "EXTERNAL_SUBTITLE_LOADED", message: "fixture.srt" })).toMatchObject({ status: "success", commandKind: "loadExternalSubtitle" });
    expect(parsePlayerCommandResult({ protocolVersion: VIDEO_PLAYER_PROTOCOL_VERSION, kind: "commandResult", requestId: "r2", sessionId: "s1", revision: 2, commandKind: "loadExternalSubtitle", status: "cancelled", code: "EXTERNAL_SUBTITLE_CANCELLED", message: null })).toMatchObject({ status: "cancelled" });
    expect(parsePlayerCommandResult({ protocolVersion: 1, kind: "commandResult" })).toBeNull();
  });
  it("accepts only the versioned engine snapshot shape", () => {
    expect(parsePlaybackSnapshot(snapshot(1))).toMatchObject({ revision: 1, sourceIdentity: "V-2608-0001" });
    expect(parsePlaybackSnapshot({ ...snapshot(1), protocolVersion: 1 })).toBeNull();
    expect(parsePlaybackSnapshot({ protocolVersion: 2, kind: "snapshot", snapshot: {} })).toBeNull();
  });

  it("routes Subtitle and Shortcuts URLs to standalone utility-window surfaces", () => {
    const postMessage = vi.fn();
    window.chrome = { webview: {
      postMessage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } };

    window.history.pushState({}, "", "/?presentation=subtitle-appearance");
    const subtitle = render(<LanguageProvider><VideoPlayerProductionRoot /></LanguageProvider>);
    expect(screen.getByRole("dialog", { name: "Subtitle appearance" })).toBeInTheDocument();
    expect(screen.getByTestId("player-settings-panel")).toHaveAttribute("data-player-overlay", "utility-window");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Font family"), { target: { value: "Georgia" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ fontFamily: "Georgia", fontFamilyOverride: true }),
    }));
    fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "56" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ fontSize: 56, fontSizeOverride: true }),
    }));
    const textColorInput = screen.getByText("Text color and opacity (100%)")
      .closest("label")?.querySelector<HTMLInputElement>('input[type="color"]');
    expect(textColorInput).not.toBeNull();
    fireEvent.change(textColorInput!, { target: { value: "#ff0000" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ textColor: "#FF0000", textColorOverride: true }),
    }));
    const backgroundColorInput = screen.getByText("Background color and opacity (0%)")
      .closest("label")?.querySelector<HTMLInputElement>('input[type="color"]');
    expect(backgroundColorInput).not.toBeNull();
    fireEvent.change(backgroundColorInput!, { target: { value: "#112233" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ backgroundColor: "#112233", backgroundOverride: true }),
    }));
    fireEvent.change(screen.getByLabelText("Edge style"), { target: { value: "shadow" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ edgeStyle: "shadow", edgeStyleOverride: true }),
    }));
    fireEvent.change(screen.getByLabelText("Base position"), { target: { value: "middle" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ basePosition: "middle", verticalAdjustment: 0 }),
    }));
    const verticalAdjustment = screen.getByLabelText("Vertical adjustment (0)");
    expect(verticalAdjustment).toBeEnabled();
    fireEvent.change(verticalAdjustment, { target: { value: "60" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ basePosition: "middle", verticalAdjustment: 60 }),
    }));
    fireEvent.change(screen.getByLabelText("Font family"), { target: { value: "" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({ fontFamily: "sans-serif", fontFamilyOverride: false }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to Default" }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "setSubtitleAppearance",
      payload: expect.objectContaining({
        fontFamilyOverride: false,
        fontSizeOverride: false,
        textColorOverride: false,
        backgroundOverride: false,
        edgeStyleOverride: false,
        basePosition: "source",
      }),
    }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "close" }));
    subtitle.unmount();

    window.history.pushState({}, "", "/?presentation=shortcuts");
    render(<LanguageProvider><VideoPlayerProductionRoot /></LanguageProvider>);
    expect(screen.getByRole("dialog", { name: "Custom Shortcuts" })).toBeInTheDocument();
    expect(screen.getByTestId("player-settings-panel")).toHaveClass("bg-white/80", "dark:bg-slate-950/80");
    expect(screen.getByTestId("player-settings-panel")).toHaveAttribute("data-material", "sakurava-true-glass");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getByTestId("player-settings-panel").querySelector("section[role=dialog]")).toBeNull();

    window.history.pushState({}, "", "/");
    delete window.chrome;
  });

  it("renders engine truth and sends typed Play, Pause, and seek messages", () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const postMessage = vi.fn();
    window.chrome = { webview: {
      postMessage,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    } };
    render(<LanguageProvider><VideoPlayerProductionRoot /></LanguageProvider>);
    act(() => listeners.forEach((listener) => listener(new MessageEvent("message", { data: snapshot(1) }))));
    expect(screen.getByText("Engine Fixture")).toBeInTheDocument();
    expect(screen.getByText("0:12 / 1:00")).toBeInTheDocument();
    screen.getByLabelText("Play").click();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "play", protocolVersion: VIDEO_PLAYER_PROTOCOL_VERSION, sessionId: "session-1" }));
    act(() => listeners.forEach((listener) => listener(new MessageEvent("message", { data: { ...snapshot(2, 20), snapshot: { ...snapshot(2, 20).snapshot, paused: false } } }))));
    screen.getByLabelText("Pause").click();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "pause", sessionId: "session-1" }));
    const timeline = screen.getByLabelText("Mock video timeline");
    fireEvent.change(timeline, { target: { value: "30" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "seekAbsolute", payload: { seconds: 30 } }));
    fireEvent.click(screen.getByLabelText("Seek step: one frame. Activate to choose the next step."));
    fireEvent.click(screen.getByLabelText("Seek backward by 1S"));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "seekRelative", payload: { seconds: -1 } }));
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Playback Speed" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "2x" }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "setSpeed", payload: { speed: 2 } }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Back: Playback Speed" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle / CC" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Load Subtitle File…" }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "loadExternalSubtitle" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Back: Subtitle / CC" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open Externally" }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "openExternally" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "openShortcuts" }));
    fireEvent.click(screen.getByLabelText("Player settings"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle / CC" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subtitle appearance" }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "openSubtitleAppearance" }));
    fireEvent.click(screen.getByLabelText("Capture screenshot"));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "captureScreenshot",
      protocolVersion: VIDEO_PLAYER_PROTOCOL_VERSION,
      sessionId: "session-1",
    }));
    delete window.chrome;
  });

  it("ignores stale revisions so React cannot overwrite newer engine truth", () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    window.chrome = { webview: { postMessage: vi.fn(), addEventListener: (_type, listener) => listeners.add(listener), removeEventListener: (_type, listener) => listeners.delete(listener) } };
    render(<LanguageProvider><VideoPlayerProductionRoot /></LanguageProvider>);
    act(() => listeners.forEach((listener) => listener(new MessageEvent("message", { data: snapshot(4, 40) }))));
    act(() => listeners.forEach((listener) => listener(new MessageEvent("message", { data: snapshot(3, 10) }))));
    expect(screen.getByText("0:40 / 1:00")).toBeInTheDocument();
    delete window.chrome;
  });
});
