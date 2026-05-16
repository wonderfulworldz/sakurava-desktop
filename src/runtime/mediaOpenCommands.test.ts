import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMediaPath } from "./mediaOpenCommands";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

describe("openMediaPath", () => {
  beforeEach(() => {
    delete window.__TAURI_INTERNALS__;
    tauriMocks.invoke.mockReset();
  });

  it("returns a safe failure for empty paths without invoking Tauri", async () => {
    await expect(openMediaPath("   ")).resolves.toEqual({
      path: "",
      opened: false,
      message: "Media path is required",
    });
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("returns a browser fallback when Tauri is unavailable", async () => {
    await expect(openMediaPath(" D:/Media/video.mp4 ")).resolves.toEqual({
      path: "D:/Media/video.mp4",
      opened: false,
      message: "Available in desktop runtime",
    });
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("invokes open_media_path when Tauri is available", async () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };
    tauriMocks.invoke.mockResolvedValue({
      path: "D:/Media/video.mp4",
      opened: true,
      message: "Media file open request sent",
    });

    await expect(openMediaPath(" D:/Media/video.mp4 ")).resolves.toEqual({
      path: "D:/Media/video.mp4",
      opened: true,
      message: "Media file open request sent",
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "open_media_path",
      { path: "D:/Media/video.mp4" },
    );
  });

  it("returns a safe failure when the command fails", async () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };
    tauriMocks.invoke.mockRejectedValue(new Error("raw platform error"));

    await expect(openMediaPath("D:/Media/missing.mp4")).resolves.toEqual({
      path: "D:/Media/missing.mp4",
      opened: false,
      message: "Media file could not be opened",
    });
  });
});
