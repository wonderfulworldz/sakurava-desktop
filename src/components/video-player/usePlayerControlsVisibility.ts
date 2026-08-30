import { useCallback, useEffect, useRef, useState } from "react";

export const PLAYER_CONTROLS_IDLE_MS = 3000;

export function usePlayerControlsVisibility({
  playing,
  held,
}: {
  playing: boolean;
  held: boolean;
}) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const schedule = useCallback(() => {
    cancelTimer();
    if (!playing || held) {
      setVisible(true);
      return;
    }
    timer.current = setTimeout(() => setVisible(false), PLAYER_CONTROLS_IDLE_MS);
  }, [cancelTimer, held, playing]);

  const reveal = useCallback(() => {
    setVisible(true);
    schedule();
  }, [schedule]);

  useEffect(() => {
    schedule();
    return cancelTimer;
  }, [cancelTimer, schedule]);

  return { visible, reveal };
}
