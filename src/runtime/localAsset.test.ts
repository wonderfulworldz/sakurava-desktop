import { describe, expect, it, beforeEach, vi } from "vitest";
import { localImagePathToAssetSrc } from "./localAsset";

describe("localImagePathToAssetSrc", () => {
  beforeEach(() => {
    delete window.__TAURI_INTERNALS__;
  });

  it.each([null, undefined, "", "   "])("returns null for empty path %s", (path) => {
    expect(localImagePathToAssetSrc(path)).toBeNull();
  });

  it("returns null outside the Tauri runtime", () => {
    expect(localImagePathToAssetSrc("D:/Media/cover.jpg")).toBeNull();
  });

  it("returns null when Tauri invoke exists but asset conversion is unavailable", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };

    expect(localImagePathToAssetSrc("D:/Media/cover.jpg")).toBeNull();
  });

  it("converts local paths with Tauri convertFileSrc when available", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
      convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
    };

    expect(localImagePathToAssetSrc("  D:/Media/cover.jpg  ")).toBe(
      "asset://localhost/D:/Media/cover.jpg",
    );
    expect(window.__TAURI_INTERNALS__.convertFileSrc).toHaveBeenCalledWith(
      "D:/Media/cover.jpg",
      "asset",
    );
  });

  it("returns null when conversion fails", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
      convertFileSrc: vi.fn(() => {
        throw new Error("conversion failed");
      }),
    };

    expect(localImagePathToAssetSrc("D:/Media/cover.jpg")).toBeNull();
  });
});
