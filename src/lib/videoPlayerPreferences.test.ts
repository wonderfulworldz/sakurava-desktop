import { describe, expect, it } from "vitest";
import {
  getVideoPlayerSourcePreferences,
  loadVideoPlayerPreferences,
  parseVideoPlayerPreferences,
  saveVideoPlayerPreferences,
  resumablePosition,
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

  it("persists and reloads subtitle, shortcuts, playback, and Contact Sheet settings", () => {
    let stored: string | null = null;
    const writer = { setItem: (key: string, value: string) => {
      expect(key).toBe(VIDEO_PLAYER_PREFERENCES_STORAGE_KEY);
      stored = value;
    } };
    const preferences = parseVideoPlayerPreferences({
      subtitles: { fontFamily: "Arial", fontFamilyOverride: true, basePosition: "top", edgeStyle: "shadow" },
      shortcuts: { playPause: "P" },
      playback: {
        speed: 1.5,
        volume: 48,
        muted: true,
      },
      sources: {
        "video:one": {
        loopEnabled: true,
        loopASeconds: 12,
        loopBSeconds: 24,
        subtitlesEnabled: true,
        subtitleTrackId: 3,
        positionSeconds: 30,
        },
      },
      contactSheet: { rows: 8, columns: 24, width: 1920, quality: 82, format: "png", timestamp: false, header: true, subtitles: true },
    });
    expect(saveVideoPlayerPreferences(preferences, writer)).toBe(true);
    expect(loadVideoPlayerPreferences({ getItem: () => stored })).toEqual(preferences);
  });

  it("distinguishes the source font default from a backward-compatible explicit font choice", () => {
    expect(parseVideoPlayerPreferences(null).subtitles).toMatchObject({
      fontFamily: "sans-serif",
      fontFamilyOverride: false,
    });
    expect(parseVideoPlayerPreferences({ subtitles: { fontFamily: "sans-serif" } }).subtitles.fontFamilyOverride).toBe(false);
    expect(parseVideoPlayerPreferences({ subtitles: { fontFamily: "Georgia" } }).subtitles).toMatchObject({
      fontFamily: "Georgia",
      fontFamilyOverride: true,
    });
    expect(parseVideoPlayerPreferences({ subtitles: { fontFamily: "Georgia", fontFamilyOverride: false } }).subtitles.fontFamilyOverride).toBe(false);
  });

  it("distinguishes Source position from explicit anchors and migrates legacy positions defensively", () => {
    expect(parseVideoPlayerPreferences(null).subtitles.basePosition).toBe("source");
    expect(parseVideoPlayerPreferences({ version: 2, subtitles: { basePosition: "bottom" } }).subtitles.basePosition)
      .toBe("source");
    expect(parseVideoPlayerPreferences({ version: 2, subtitles: { basePosition: "middle" } }).subtitles.basePosition)
      .toBe("middle");
    expect(parseVideoPlayerPreferences({ version: 2, subtitles: { basePosition: "top" } }).subtitles.basePosition)
      .toBe("top");
    expect(parseVideoPlayerPreferences({ version: 3, subtitles: { basePosition: "bottom" } }).subtitles.basePosition)
      .toBe("bottom");
    expect(parseVideoPlayerPreferences({ version: 3, subtitles: { basePosition: "source" } }).subtitles.basePosition)
      .toBe("source");
  });

  it("infers legacy explicit ASS overrides and preserves explicit reset flags", () => {
    expect(parseVideoPlayerPreferences({
      subtitles: {
        fontSize: 56,
        textColor: "#FF0000",
        backgroundOpacity: 0.5,
        edgeStyle: "shadow",
      },
    }).subtitles).toMatchObject({
      fontSizeOverride: true,
      textColorOverride: true,
      backgroundOverride: true,
      edgeStyleOverride: true,
    });
    expect(parseVideoPlayerPreferences({
      subtitles: {
        fontSize: 56,
        fontSizeOverride: false,
        textColor: "#FF0000",
        textColorOverride: false,
        backgroundOpacity: 0.5,
        backgroundOverride: false,
        edgeStyle: "shadow",
        edgeStyleOverride: false,
      },
    }).subtitles).toMatchObject({
      fontSizeOverride: false,
      textColorOverride: false,
      backgroundOverride: false,
      edgeStyleOverride: false,
    });
  });

  it("rejects invalid remembered Contact Sheet totals", () => {
    expect(parseVideoPlayerPreferences({ contactSheet: { rows: 8, columns: 25 } }).contactSheet)
      .toEqual(VIDEO_PLAYER_PREFERENCES_DEFAULTS.contactSheet);
  });

  it("falls back safely for invalid remembered loop and subtitle track state", () => {
    const parsed = parseVideoPlayerPreferences({
      sources: { "video:one": {
        loopEnabled: true,
        loopASeconds: 20,
        loopBSeconds: 10,
        subtitlesEnabled: true,
        subtitleTrackId: -2,
        positionSeconds: -10,
      } },
    });
    expect(getVideoPlayerSourcePreferences(parsed, "video:one")).toMatchObject({
      loopEnabled: false,
      loopASeconds: null,
      loopBSeconds: null,
      subtitlesEnabled: true,
      subtitleTrackId: null,
      positionSeconds: 0,
    });
  });

  it("uses source-aware resume thresholds without leaking state to another source", () => {
    const parsed = parseVideoPlayerPreferences({ sources: { alpha: { positionSeconds: 45 } } });
    expect(getVideoPlayerSourcePreferences(parsed, "alpha").positionSeconds).toBe(45);
    expect(getVideoPlayerSourcePreferences(parsed, "beta").positionSeconds).toBe(0);
    expect(resumablePosition(4.9, 120)).toBe(0);
    expect(resumablePosition(60, 120)).toBe(60);
    expect(resumablePosition(114, 120)).toBe(0);
    expect(resumablePosition(95, 120)).toBe(0);
  });
});
