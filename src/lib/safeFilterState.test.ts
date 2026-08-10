import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySafeFilterFeatureState,
  getSafeFilterEnabled,
  SAFE_FILTER_STATE_EVENT,
  SAFE_FILTER_STORAGE_KEY,
  safeFilterFeatureState,
  setSafeFilterEnabled,
} from "./safeFilterState";

describe("Safe Filter state", () => {
  beforeEach(() => window.localStorage.clear());

  it("fails safe to ON for absent, malformed, unavailable, and throwing storage", () => {
    const throwingStorage: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => {
        throw new Error("unavailable");
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };

    expect(getSafeFilterEnabled()).toBe(true);
    window.localStorage.setItem(SAFE_FILTER_STORAGE_KEY, "invalid");
    expect(getSafeFilterEnabled()).toBe(true);
    expect(getSafeFilterEnabled(null)).toBe(true);
    expect(getSafeFilterEnabled(throwingStorage)).toBe(true);
  });

  it("persists explicit OFF and emits immediate state changes", () => {
    const listener = vi.fn();
    window.addEventListener(SAFE_FILTER_STATE_EVENT, listener);
    expect(setSafeFilterEnabled(false)).toBe(true);
    expect(getSafeFilterEnabled()).toBe(false);
    expect(window.localStorage.getItem(SAFE_FILTER_STORAGE_KEY)).toBe("false");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: false }));
    expect(safeFilterFeatureState()).toEqual({ [SAFE_FILTER_STORAGE_KEY]: false });
    window.removeEventListener(SAFE_FILTER_STATE_EVENT, listener);
  });

  it("restores OFF only from explicit protected state and otherwise resolves ON", () => {
    applySafeFilterFeatureState({ [SAFE_FILTER_STORAGE_KEY]: false });
    expect(getSafeFilterEnabled()).toBe(false);
    applySafeFilterFeatureState({});
    expect(getSafeFilterEnabled()).toBe(true);
  });
});
