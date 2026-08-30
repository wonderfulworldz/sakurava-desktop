import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_CONTROLS_IDLE_MS, usePlayerControlsVisibility } from "./usePlayerControlsVisibility";

afterEach(() => vi.useRealTimers());

describe("usePlayerControlsVisibility", () => {
  it("hides playing controls after three seconds and reveals on activity", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayerControlsVisibility({ playing: true, held: false }));
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS));
    expect(result.current.visible).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.visible).toBe(true);
  });

  it("keeps paused or actively held controls visible", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ playing, held }) => usePlayerControlsVisibility({ playing, held }),
      { initialProps: { playing: true, held: false } },
    );
    rerender({ playing: true, held: true });
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS * 2));
    expect(result.current.visible).toBe(true);
    rerender({ playing: false, held: false });
    act(() => vi.advanceTimersByTime(PLAYER_CONTROLS_IDLE_MS * 2));
    expect(result.current.visible).toBe(true);
  });
});
