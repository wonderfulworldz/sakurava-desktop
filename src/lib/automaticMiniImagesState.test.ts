import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAutomaticMiniImagesFeatureState,
  automaticMiniImagesFeatureState,
  getAutomaticMiniImagesEnabled,
  setAutomaticMiniImagesEnabled,
  AUTOMATIC_MINI_IMAGES_STORAGE_KEY,
} from "./automaticMiniImagesState";

describe("Automatic Mini Images state", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults invalid and missing state to ON while persisting explicit OFF", () => {
    expect(getAutomaticMiniImagesEnabled()).toBe(true);
    window.localStorage.setItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY, "invalid");
    expect(getAutomaticMiniImagesEnabled()).toBe(true);
    expect(setAutomaticMiniImagesEnabled(false)).toBe(true);
    expect(getAutomaticMiniImagesEnabled()).toBe(false);
    expect(automaticMiniImagesFeatureState()).toEqual({ [AUTOMATIC_MINI_IMAGES_STORAGE_KEY]: false });
  });

  it("restores OFF only when protected feature state explicitly records it", () => {
    applyAutomaticMiniImagesFeatureState({ [AUTOMATIC_MINI_IMAGES_STORAGE_KEY]: false });
    expect(getAutomaticMiniImagesEnabled()).toBe(false);
    applyAutomaticMiniImagesFeatureState({});
    expect(getAutomaticMiniImagesEnabled()).toBe(true);
  });
});
