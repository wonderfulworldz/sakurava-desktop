import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const windowMocks = vi.hoisted(() => ({
  supportsMultipleWindows: vi.fn(),
  getByLabel: vi.fn(),
  construct: vi.fn(),
  setFocus: vi.fn(),
  emitTo: vi.fn(),
  setFullscreen: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  startDragging: vi.fn(),
  close: vi.fn(),
  currentMonitor: vi.fn(),
  primaryMonitor: vi.fn(),
  scaleFactor: vi.fn(),
  outerPosition: vi.fn(),
  innerSize: vi.fn(),
  setPosition: vi.fn(),
  setSize: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: windowMocks.invoke,
}));

vi.mock("@tauri-apps/api/app", () => ({
  supportsMultipleWindows: windowMocks.supportsMultipleWindows,
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: windowMocks.emitTo,
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: windowMocks.currentMonitor,
  primaryMonitor: windowMocks.primaryMonitor,
  LogicalPosition: class LogicalPosition {
    constructor(public x: number, public y: number) {}
  },
  LogicalSize: class LogicalSize {
    constructor(public width: number, public height: number) {}
  },
  getCurrentWindow: () => ({
    close: windowMocks.close,
    innerSize: windowMocks.innerSize,
    outerPosition: windowMocks.outerPosition,
    scaleFactor: windowMocks.scaleFactor,
    setAlwaysOnTop: windowMocks.setAlwaysOnTop,
    setFullscreen: windowMocks.setFullscreen,
    setPosition: windowMocks.setPosition,
    setSize: windowMocks.setSize,
    startDragging: windowMocks.startDragging,
  }),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class MockWebviewWindow {
    static getByLabel = windowMocks.getByLabel;

    constructor(label: string, options: Record<string, unknown>) {
      windowMocks.construct(label, options);
    }

    setFocus = windowMocks.setFocus;

    once(event: string, handler: (event: { payload: unknown }) => void) {
      if (event === "tauri://created") handler({ payload: null });
      return Promise.resolve(() => undefined);
    }
  },
}));

import {
  applyCurrentMiniPlayerGeometry,
  calculateInitialMiniPlayerGeometry,
  calculateMiniPlayerResize,
  CONTACT_SHEET_WINDOW_LABEL,
  MINI_PLAYER_WINDOW_LABEL,
  openContactSheetWindow,
  openMiniPlayerWindow,
  openVideoPlayerWindow,
  parseVideoResolution,
  returnToVideoPlayerWindow,
  setCurrentPlayerAlwaysOnTop,
  setCurrentPlayerFullscreen,
  startCurrentMiniPlayerDragging,
  VIDEO_PLAYER_WINDOW_LABEL,
  type MiniPlayerResizeSession,
} from "./videoPlayerWindows";

const payload = {
  displayName: "Prototype Video",
  resolution: "1920 × 1080",
  durationLabel: "84 min",
};

const productionPayload = {
  ...payload,
  sourceIdentity: "V-2608-0001",
  outputParent: "D:\\Sakurava Output",
};

function logicalPhysical(value: { x: number; y: number } | { width: number; height: number }) {
  return {
    ...value,
    toLogical: (scaleFactor: number) => {
      if ("x" in value) {
        return { x: value.x / scaleFactor, y: value.y / scaleFactor };
      }
      return {
        width: value.width / scaleFactor,
        height: value.height / scaleFactor,
      };
    },
  };
}

function monitor(
  workArea = { x: -1920, y: 0, width: 1920, height: 1040 },
  scaleFactor = 1,
) {
  return {
    name: "Test monitor",
    position: logicalPhysical({ x: workArea.x, y: workArea.y }),
    size: logicalPhysical({ width: workArea.width, height: workArea.height }),
    workArea: {
      position: logicalPhysical({ x: workArea.x, y: workArea.y }),
      size: logicalPhysical({ width: workArea.width, height: workArea.height }),
    },
    scaleFactor,
  };
}

describe("videoPlayerWindows", () => {
  beforeEach(() => {
    windowMocks.supportsMultipleWindows.mockResolvedValue(true);
    windowMocks.getByLabel.mockResolvedValue(null);
    windowMocks.setFocus.mockResolvedValue(undefined);
    windowMocks.emitTo.mockResolvedValue(undefined);
    windowMocks.setFullscreen.mockResolvedValue(undefined);
    windowMocks.setAlwaysOnTop.mockResolvedValue(undefined);
    windowMocks.startDragging.mockResolvedValue(undefined);
    windowMocks.close.mockResolvedValue(undefined);
    windowMocks.currentMonitor.mockResolvedValue(monitor());
    windowMocks.primaryMonitor.mockResolvedValue(null);
    windowMocks.scaleFactor.mockResolvedValue(1);
    windowMocks.outerPosition.mockResolvedValue(logicalPhysical({ x: 100, y: 100 }));
    windowMocks.innerSize.mockResolvedValue(logicalPhysical({ width: 520, height: 292.5 }));
    windowMocks.setPosition.mockResolvedValue(undefined);
    windowMocks.setSize.mockResolvedValue(undefined);
    windowMocks.invoke.mockResolvedValue({ mode: "opened" });
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete window.__TAURI_INTERNALS__;
    window.localStorage.clear();
  });

  it.each([
    ["1920x1080", { width: 1920, height: 1080 }],
    [" 1920 x 1080 ", { width: 1920, height: 1080 }],
    ["1920 × 1080", { width: 1920, height: 1080 }],
    ["1080X1920", { width: 1080, height: 1920 }],
  ])("parses validated video resolution %s", (value, expected) => {
    expect(parseVideoResolution(value)).toEqual(expected);
  });

  it.each(["", "N/A", "unknown", "1920", "0x1080", "1920x0", "-1x1080", "1.5x1"])(
    "rejects invalid video resolution %s",
    (value) => {
      expect(parseVideoResolution(value)).toBeNull();
    },
  );

  it("derives initial and minimum PiP sizes without reordering portrait dimensions", () => {
    expect(calculateInitialMiniPlayerGeometry({ width: 1920, height: 1080 })).toMatchObject({
      width: 520,
      height: 293,
      minWidth: 391,
      minHeight: 220,
    });
    expect(calculateInitialMiniPlayerGeometry({ width: 4, height: 3 })).toMatchObject({
      width: 520,
      height: 390,
      minWidth: 293,
      minHeight: 220,
    });
    expect(calculateInitialMiniPlayerGeometry({ width: 9, height: 16 })).toMatchObject({
      width: 293,
      height: 520,
      minWidth: 220,
      minHeight: 391,
    });
  });

  it("places PiP at the bottom-right of a logical work area with negative coordinates", () => {
    expect(
      calculateInitialMiniPlayerGeometry(
        { width: 1920, height: 1080 },
        { x: -1920, y: 40, width: 1920, height: 1000 },
      ),
    ).toMatchObject({ width: 520, height: 293, x: -536, y: 731 });
  });

  it("opens the production media host by stable identity instead of a frontend media path", async () => {
    await expect(openVideoPlayerWindow(productionPayload)).resolves.toEqual({ mode: "window" });
    expect(windowMocks.invoke).toHaveBeenCalledWith("video_player_open", {
      input: productionPayload,
    });
    expect(windowMocks.construct).not.toHaveBeenCalledWith(VIDEO_PLAYER_WINDOW_LABEL, expect.anything());
  });

  it("passes explicit one-session focus and replacement intents and preserves typed errors", async () => {
    await expect(openVideoPlayerWindow({ ...productionPayload, intent: "replace" })).resolves.toEqual({ mode: "window" });
    expect(windowMocks.invoke).toHaveBeenLastCalledWith("video_player_open", { input: { ...productionPayload, intent: "replace" } });
    windowMocks.invoke.mockRejectedValueOnce({ code: "ACTIVE_SESSION_DIFFERENT_SOURCE", message: "Another source is active" });
    await expect(openVideoPlayerWindow(productionPayload)).resolves.toEqual({ mode: "unavailable", code: "ACTIVE_SESSION_DIFFERENT_SOURCE", reason: "Another source is active" });
  });

  it("creates Contact Sheet as a distinct WebviewWindow root", async () => {
    await expect(openContactSheetWindow({ ...payload, sourceIdentity: "V-2608-0001" })).resolves.toEqual({ mode: "window" });
    expect(windowMocks.construct).toHaveBeenCalledWith(
      CONTACT_SHEET_WINDOW_LABEL,
      expect.objectContaining({
        decorations: true,
        resizable: true,
        title: "Sakurava Contact Sheet",
        url: "/?sakuravaWindow=contact-sheet",
      }),
    );
  });

  it("creates borderless ratio-aware Always-on-Top PiP at the monitor work-area edge", async () => {
    await expect(openMiniPlayerWindow(payload)).resolves.toEqual({ mode: "window" });
    expect(windowMocks.construct).toHaveBeenCalledWith(
      MINI_PLAYER_WINDOW_LABEL,
      expect.objectContaining({
        alwaysOnTop: true,
        center: false,
        decorations: false,
        height: 293,
        minHeight: 220,
        minWidth: 391,
        preventOverflow: { width: 16, height: 16 },
        resizable: false,
        title: "Sakurava Mini Player",
        url: "/?sakuravaWindow=mini-player",
        width: 520,
        x: -536,
        y: 731,
      }),
    );
  });

  it("converts a physical mixed-DPI work area before initial placement", async () => {
    windowMocks.currentMonitor.mockResolvedValue(
      monitor({ x: 1920, y: 80, width: 2560, height: 1360 }, 2),
    );
    await openMiniPlayerWindow({ ...payload, resolution: "1080x1920" });
    expect(windowMocks.construct).toHaveBeenCalledWith(
      MINI_PLAYER_WINDOW_LABEL,
      expect.objectContaining({ width: 293, height: 520, x: 1931, y: 184 }),
    );
  });

  it("declines PiP creation when video dimensions are unknown", async () => {
    await expect(openMiniPlayerWindow({ ...payload, resolution: "N/A" })).resolves.toEqual({
      mode: "unavailable",
      reason: "video-dimensions-unknown",
    });
    expect(windowMocks.construct).not.toHaveBeenCalled();
    expect(windowMocks.currentMonitor).not.toHaveBeenCalled();
  });

  it("reuses and focuses existing PiP without querying placement or moving it", async () => {
    windowMocks.getByLabel.mockResolvedValue({ setFocus: windowMocks.setFocus });
    await expect(openMiniPlayerWindow(payload)).resolves.toEqual({ mode: "window" });
    expect(windowMocks.construct).not.toHaveBeenCalled();
    expect(windowMocks.currentMonitor).not.toHaveBeenCalled();
    expect(windowMocks.setPosition).not.toHaveBeenCalled();
    expect(windowMocks.setFocus).toHaveBeenCalledTimes(1);
    expect(windowMocks.emitTo).toHaveBeenCalledWith(
      { kind: "WebviewWindow", label: MINI_PLAYER_WINDOW_LABEL },
      "mini-player:payload",
      expect.objectContaining({ displayName: payload.displayName }),
    );
  });

  it("preserves landscape, portrait, minimum, maximum, and anchored resize geometry", () => {
    const base: MiniPlayerResizeSession = {
      corner: "south-east",
      pointerX: 0,
      pointerY: 0,
      startX: 100,
      startY: 100,
      startWidth: 520,
      startHeight: 292.5,
      ratio: 16 / 9,
      minimum: { width: 220 * (16 / 9), height: 220 },
      workArea: { x: 0, y: 0, width: 800, height: 600 },
    };
    expect(calculateMiniPlayerResize(base, 100, 56)).toMatchObject({
      width: 620,
      height: 348.75,
      x: 100,
      y: 100,
    });
    const minimum = calculateMiniPlayerResize(base, -1000, -1000);
    expect(minimum.width / minimum.height).toBeCloseTo(16 / 9);
    expect(minimum.height).toBeCloseTo(220);
    const maximum = calculateMiniPlayerResize(base, 1000, 1000);
    expect(maximum.width).toBeCloseTo(700);
    expect(maximum.width / maximum.height).toBeCloseTo(16 / 9);

    const northWest = calculateMiniPlayerResize(
      { ...base, corner: "north-west" },
      50,
      28,
    );
    expect(northWest.x + northWest.width).toBeCloseTo(620);
    expect(northWest.y + northWest.height).toBeCloseTo(392.5);

    const portrait = calculateMiniPlayerResize(
      {
        ...base,
        startWidth: 292.5,
        startHeight: 520,
        ratio: 9 / 16,
        minimum: { width: 220, height: 220 / (9 / 16) },
      },
      56,
      100,
    );
    expect(portrait.width / portrait.height).toBeCloseTo(9 / 16);
    expect(portrait.height).toBeGreaterThan(portrait.width);
  });

  it("uses installed window APIs for drag and coalesced geometry application", async () => {
    await expect(startCurrentMiniPlayerDragging()).resolves.toBe(true);
    expect(windowMocks.startDragging).toHaveBeenCalledTimes(1);
    await expect(
      applyCurrentMiniPlayerGeometry({ x: 12.4, y: 24.6, width: 520.2, height: 292.8 }),
    ).resolves.toBe(true);
    expect(windowMocks.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 12, y: 25 }));
    expect(windowMocks.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 520, height: 293 }),
    );
  });

  it("returns focus to the Video Player before closing PiP", async () => {
    windowMocks.getByLabel.mockResolvedValue({ setFocus: windowMocks.setFocus });
    await expect(returnToVideoPlayerWindow()).resolves.toBe(true);
    expect(windowMocks.setFocus).toHaveBeenCalledTimes(1);
    expect(windowMocks.close).toHaveBeenCalledTimes(1);
  });

  it("uses only the current player window for fullscreen and Always on Top", async () => {
    await expect(setCurrentPlayerFullscreen(true)).resolves.toBe(true);
    await expect(setCurrentPlayerAlwaysOnTop(true)).resolves.toBe(true);
    expect(windowMocks.setFullscreen).toHaveBeenCalledWith(true);
    expect(windowMocks.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });
});
