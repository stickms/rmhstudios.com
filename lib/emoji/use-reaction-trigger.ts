import { useRef } from 'react';
import type React from 'react';

const LONG_PRESS_MS = 500;
const DEBOUNCE_MS = 300;

/**
 * Right-click (desktop) / long-press (touch) trigger for the reaction menu.
 * Android fires contextmenu on long-press natively; the touch timer covers
 * iOS Safari. A short debounce prevents double-opens when both fire.
 */
export function useReactionTrigger(onOpen: (x: number, y: number) => void) {
  const timer = useRef<number | null>(null);
  const lastOpen = useRef(0);

  const open = (x: number, y: number) => {
    const now = performance.now();
    if (now - lastOpen.current < DEBOUNCE_MS) return;
    lastOpen.current = now;
    onOpen(x, y);
  };

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      open(e.clientX, e.clientY);
    },
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      clear();
      const { clientX, clientY } = touch;
      timer.current = window.setTimeout(() => open(clientX, clientY), LONG_PRESS_MS);
    },
    onTouchMove: clear,
    onTouchEnd: clear,
  };
}
