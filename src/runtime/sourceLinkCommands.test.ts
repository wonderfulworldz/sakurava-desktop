import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeHttpSourceUrl,
  openSourceLink,
} from "./sourceLinkCommands";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

describe("Source Link external opening", () => {
  beforeEach(() => {
    delete window.__TAURI_INTERNALS__;
    tauriMocks.invoke.mockReset();
  });

  it.each([
    ["https://example.com/source", "https://example.com/source"],
    ["http://example.com/source", "http://example.com/source"],
  ])("opens valid URL %s through Tauri", async (url, expectedUrl) => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    tauriMocks.invoke.mockResolvedValue({
      url: expectedUrl,
      opened: true,
      message: "Source Link open request sent",
    });

    await expect(openSourceLink(url)).resolves.toMatchObject({ opened: true });
    expect(tauriMocks.invoke).toHaveBeenCalledWith("open_source_link", {
      url: expectedUrl,
    });
  });

  it.each([
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/plain,source",
    "file:///D:/source.txt",
    "mailto:test@example.com",
    "/relative/source",
    "https://",
    "http://exa mple.com",
  ])("blocks invalid URL %s without invoking Tauri", async (url) => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };

    await expect(openSourceLink(url)).resolves.toMatchObject({
      opened: false,
      message: "Source Link URL is invalid",
    });
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("catches external browser open failures", async () => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    tauriMocks.invoke.mockRejectedValue(new Error("platform failure"));

    await expect(openSourceLink("https://example.com")).resolves.toMatchObject({
      opened: false,
      message: "Source Link could not be opened",
    });
  });

  it("normalizes only absolute HTTP(S) URLs", () => {
    expect(normalizeHttpSourceUrl(" HTTPS://Example.com/path ")).toBe(
      "https://example.com/path",
    );
    expect(normalizeHttpSourceUrl("example.com/path")).toBeNull();
  });
});
