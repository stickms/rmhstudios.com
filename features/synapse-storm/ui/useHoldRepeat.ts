import { useCallback, useEffect, useRef } from 'react';

/** How often a held press repeats the tap. */
export const HOLD_REPEAT_MS = 220;

/**
 * Hold-to-press: while `enabled`, holding Enter or Space, or holding a pointer
 * down, fires `fire` every {@link HOLD_REPEAT_MS}. The first press is the
 * button's own click. The interval exists only while a press is held, never at rest.
 */
export function useHoldRepeat(enabled: boolean, fire: () => void) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fireRef = useRef(fire);
  useEffect(() => {
    fireRef.current = fire;
  }, [fire]);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const begin = useCallback(() => {
    if (!enabled || timer.current) return;
    timer.current = setInterval(() => fireRef.current(), HOLD_REPEAT_MS);
  }, [enabled]);

  if (!enabled) return {};
  return {
    onPointerDown: begin,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onBlur: stop,
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.repeat) {
        e.preventDefault();
        fireRef.current();
      }
    },
  };
}
