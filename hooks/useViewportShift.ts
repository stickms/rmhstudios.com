'use client';

import { useEffect, type RefObject } from 'react';
import { subscribeViewportShift } from '@/lib/viewport-shift';

/**
 * Keep a bottom-anchored fixed control on the visible area while iOS Safari's toolbar is changing size: writes
 * `--vv-shift` (px, positive = move down) on the element, for its `bottom` to subtract (`lib/viewport-shift.ts`).
 * Written on the element itself, never on `<html>`. `onChange` runs after each write (re-measure whatever depends on
 * where the control is).
 */
export function useViewportShift(
  ref: RefObject<HTMLElement | null>,
  onChange?: (px: number) => void,
): void {
  useEffect(() => {
    return subscribeViewportShift((px) => {
      const el = ref.current;
      if (!el) return;
      if (px === 0) el.style.removeProperty('--vv-shift');
      else el.style.setProperty('--vv-shift', `${px}px`);
      onChange?.(px);
    });
    // `onChange` is read at call time through the closure of the render that subscribed; callers pass a stable one.
  }, [ref, onChange]);
}
