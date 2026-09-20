import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_CONTROLS_IDLE_MS, usePlayerControlsVisibility } from "./usePlayerControlsVisibility";

afterEach(() => vi.useRealTimers());

describe("usePlayerControlsVisibility", () => {
  it("hides controls after 1.5 seconds and reveals on pointer activity", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayerControlsVisibility());
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS));
    expect(result.current.visible).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.visible).toBe(true);
  });

  it("holds during active interaction and restarts the timer when released", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayerControlsVisibility());
    act(() => result.current.acquireHold("timeline-seek"));
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS * 2));
    expect(result.current.visible).toBe(true);
    act(() => result.current.releaseHold("timeline-seek"));
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS));
    expect(result.current.visible).toBe(false);
  });

  it("keeps independent interaction owners from releasing each other", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayerControlsVisibility());
    act(() => {
      result.current.acquireHold("timeline-seek");
      result.current.acquireHold("volume-adjust");
      result.current.releaseHold("timeline-seek");
    });
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS * 2));
    expect(result.current.visible).toBe(true);
    act(() => result.current.releaseHold("volume-adjust"));
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS));
    expect(result.current.visible).toBe(false);
  });

});
