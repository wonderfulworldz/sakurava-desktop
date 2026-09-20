import { useCallback, useEffect, useRef, useState } from "react";

export const PLAYER_CONTROLS_IDLE_MS = 1500;

export function usePlayerControlsVisibility() {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holds = useRef(new Set<string>());

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const schedule = useCallback(() => {
    cancelTimer();
    if (holds.current.size > 0) {
      setVisible(true);
      return;
    }
    timer.current = setTimeout(() => {
      setVisible(false);
    }, PLAYER_CONTROLS_IDLE_MS);
  }, [cancelTimer]);

  const reveal = useCallback(() => {
    setVisible(true);
    schedule();
  }, [schedule]);

  useEffect(() => {
    schedule();
    return cancelTimer;
  }, [cancelTimer, schedule]);

  const acquireHold = useCallback((reason: string) => {
    holds.current.add(reason);
    cancelTimer();
    setVisible(true);
  }, [cancelTimer]);

  const releaseHold = useCallback((reason: string) => {
    holds.current.delete(reason);
    if (holds.current.size === 0) schedule();
  }, [schedule]);

  return { visible, reveal, acquireHold, releaseHold };
}
