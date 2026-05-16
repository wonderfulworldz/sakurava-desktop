import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkPathStatus } from "./pathStatusCommands";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

describe("checkPathStatus", () => {
  beforeEach(() => {
    delete window.__TAURI_INTERNALS__;
    tauriMocks.invoke.mockReset();
  });

  it("returns notSet for empty paths without invoking Tauri", async () => {
    await expect(checkPathStatus("   ")).resolves.toEqual({
      path: "",
      status: "notSet",
      kind: "unknown",
      message: "Path is not set",
    });
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("returns unknown browser fallback when Tauri is unavailable", async () => {
    await expect(checkPathStatus(" D:/Media/video.mp4 ")).resolves.toEqual({
      path: "D:/Media/video.mp4",
      status: "unknown",
      kind: "unknown",
      message: "Available in desktop runtime",
    });
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("invokes path_status_check when Tauri is available", async () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };
    tauriMocks.invoke.mockResolvedValue({
      path: "D:/Media/video.mp4",
      status: "exists",
      kind: "file",
      message: "Path exists",
    });

    await expect(checkPathStatus(" D:/Media/video.mp4 ")).resolves.toEqual({
      path: "D:/Media/video.mp4",
      status: "exists",
      kind: "file",
      message: "Path exists",
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "path_status_check",
      { path: "D:/Media/video.mp4" },
    );
  });

  it("returns safe unknown result when the command fails", async () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };
    tauriMocks.invoke.mockRejectedValue(new Error("raw platform error"));

    await expect(checkPathStatus("D:/Media/missing.mp4")).resolves.toEqual({
      path: "D:/Media/missing.mp4",
      status: "unknown",
      kind: "unknown",
      message: "Path status could not be checked",
    });
  });
});
