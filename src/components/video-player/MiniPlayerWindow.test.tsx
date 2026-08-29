import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { LanguageProvider } from "../../lib/LanguageContext";
import * as videoPlayerWindows from "../../runtime/videoPlayerWindows";
import { MiniPlayerContent } from "./MiniPlayerWindow";

const payload = {
  displayName: "Prototype Video",
  resolution: "1920 × 1080",
  durationLabel: "84 min",
  requestId: "mini-player-test",
};

function renderMini() {
  return render(
    <LanguageProvider>
      <MiniPlayerContent payload={payload} />
    </LanguageProvider>,
  );
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("MiniPlayerWindow", () => {
  it("uses one full-window media surface with responsive overlay controls", () => {
    renderMini();

    const root = screen.getByLabelText("Sakurava Mini Player");
    expect(root).toHaveAttribute("data-auxiliary-window", "mini-player");
    expect(root).toHaveAttribute("data-pip-aspect-ratio", "1920/1080");
    expect(root).toHaveAttribute("data-responsive-tiers", "wide compact minimum");
    expect(root).toHaveAttribute("data-theme-source", "sakurava-appearance");
    expect(root).toHaveClass("relative", "h-screen", "w-screen", "overflow-hidden", "bg-slate-950");

    const media = screen.getByTestId("pip-media-surface");
    expect(media).toHaveClass("absolute", "inset-0", "h-full", "w-full", "object-contain");
    expect(media).toHaveStyle({ aspectRatio: "1920 / 1080" });
    expect(root.querySelector('[data-overlay-layer="top-actions"]')).toHaveClass("absolute");
    expect(root.querySelector('[data-overlay-layer="center-transport"]')).toHaveClass(
      "absolute",
      "pointer-events-none",
    );
    expect(root.querySelector('[data-overlay-layer="bottom-controls"]')).toHaveClass("absolute");
    expect(root.querySelector("[data-permanent-toolbar]")).not.toBeInTheDocument();
    expect(root.querySelector("[data-fake-window-chrome]")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Backward" })).toHaveClass("max-[279px]:hidden");
    expect(screen.getByRole("button", { name: "Play" })).toHaveClass("pointer-events-auto");
    expect(screen.getByRole("button", { name: "Forward" })).toHaveClass("max-[279px]:hidden");
    expect(screen.getByText("Prototype Video")).toHaveClass("hidden", "min-[460px]:block");
    expect(screen.getByLabelText("Mini Player volume").closest("label")).toHaveClass(
      "hidden",
      "min-[460px]:block",
    );
    expect(screen.getByLabelText("Mock video timeline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to normal player" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(root.querySelectorAll("[data-resize-handle]")).toHaveLength(4);
    expect(
      Array.from(root.querySelectorAll("[data-resize-handle]")).map((handle) =>
        handle.getAttribute("data-resize-handle"),
      ),
    ).toEqual(["north-west", "north-east", "south-west", "south-east"]);
  });

  it("keeps mock playback, progress, and volume interactions local", () => {
    renderMini();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Mock video timeline"), { target: { value: "45" } });
    expect(screen.getByLabelText("Mock video timeline")).toHaveValue("45");
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses engine truth and native-host ownership in the production composition PiP", () => {
    const playback = {
      paused: true,
      positionSeconds: 12,
      durationSeconds: 60,
      volume: 64,
      muted: false,
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onSeek: vi.fn(),
      onSeekRelative: vi.fn(),
      onSetVolume: vi.fn(),
      onToggleMute: vi.fn(),
      onReturn: vi.fn(),
      onClose: vi.fn(),
    };
    render(
      <LanguageProvider>
        <MiniPlayerContent payload={payload} playback={playback} windowHost="composition" />
      </LanguageProvider>,
    );
    const root = screen.getByLabelText("Sakurava Mini Player");
    expect(root).toHaveClass("bg-transparent");
    expect(screen.getByTestId("pip-media-surface")).toHaveClass("bg-transparent");
    expect(root.querySelectorAll("[data-resize-handle]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Backward" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to normal player" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(playback.onPlay).toHaveBeenCalledTimes(1);
    expect(playback.onSeekRelative).toHaveBeenNthCalledWith(1, -10);
    expect(playback.onSeekRelative).toHaveBeenNthCalledWith(2, 10);
    expect(playback.onToggleMute).toHaveBeenCalledTimes(1);
    expect(playback.onReturn).toHaveBeenCalledTimes(1);
    expect(playback.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Return and Close as distinct native-window actions", () => {
    const returnToPlayer = vi
      .spyOn(videoPlayerWindows, "returnToVideoPlayerWindow")
      .mockResolvedValue(true);
    const closePip = vi
      .spyOn(videoPlayerWindows, "closeCurrentAuxiliaryWindow")
      .mockResolvedValue(true);
    renderMini();

    fireEvent.click(screen.getByRole("button", { name: "Return to normal player" }));
    expect(returnToPlayer).toHaveBeenCalledTimes(1);
    expect(closePip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closePip).toHaveBeenCalledTimes(1);
  });

  it("starts window dragging only from the narrow primary-pointer drag region", () => {
    const startDragging = vi
      .spyOn(videoPlayerWindows, "startCurrentMiniPlayerDragging")
      .mockResolvedValue(true);
    renderMini();
    const dragRegion = screen.getByTestId("pip-drag-region");
    fireEvent.pointerDown(dragRegion, { button: 2 });
    expect(startDragging).not.toHaveBeenCalled();
    fireEvent.pointerDown(dragRegion, { button: 0 });
    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it("does not expose resize regions when a manually loaded payload has no valid ratio", () => {
    render(
      <LanguageProvider>
        <MiniPlayerContent payload={{ ...payload, resolution: "N/A" }} />
      </LanguageProvider>,
    );
    const root = screen.getByLabelText("Sakurava Mini Player");
    expect(root).toHaveAttribute("data-pip-aspect-ratio", "unknown");
    expect(root.querySelectorAll("[data-resize-handle]")).toHaveLength(0);
  });

  it("is selected by the App auxiliary root without AppShell notifications", () => {
    window.history.replaceState({}, "", "/?sakuravaWindow=mini-player");
    render(<App />);

    expect(screen.getByLabelText("Sakurava Mini Player")).toHaveAttribute(
      "data-auxiliary-window",
      "mini-player",
    );
    expect(screen.queryByLabelText("Notifications")).not.toBeInTheDocument();
  });
});
