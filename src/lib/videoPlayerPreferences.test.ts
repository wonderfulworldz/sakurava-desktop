import { describe, expect, it } from "vitest";
import {
  loadVideoPlayerPreferences,
  parseVideoPlayerPreferences,
  saveVideoPlayerPreferences,
  VIDEO_PLAYER_PREFERENCES_DEFAULTS,
  VIDEO_PLAYER_PREFERENCES_STORAGE_KEY,
} from "./videoPlayerPreferences";

describe("videoPlayerPreferences", () => {
  it("falls back safely for corrupt and out-of-range values", () => {
    expect(parseVideoPlayerPreferences({
      subtitles: { fontSize: 999, textColor: "red", basePosition: "side" },
      shortcuts: { playPause: "" },
    })).toEqual({
      ...VIDEO_PLAYER_PREFERENCES_DEFAULTS,
      subtitles: { ...VIDEO_PLAYER_PREFERENCES_DEFAULTS.subtitles, fontSize: 96 },
    });
  });

  it("persists and reloads subtitle appearance and shortcuts", () => {
    let stored: string | null = null;
    const writer = { setItem: (key: string, value: string) => {
      expect(key).toBe(VIDEO_PLAYER_PREFERENCES_STORAGE_KEY);
      stored = value;
    } };
    const preferences = parseVideoPlayerPreferences({
      subtitles: { fontFamily: "Arial", basePosition: "top", edgeStyle: "shadow" },
      shortcuts: { playPause: "P" },
    });
    expect(saveVideoPlayerPreferences(preferences, writer)).toBe(true);
    expect(loadVideoPlayerPreferences({ getItem: () => stored })).toEqual(preferences);
  });
});
