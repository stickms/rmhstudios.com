import { useRef } from 'react';
import type React from 'react';

const LONG_PRESS_MS = 500;
const DEBOUNCE_MS = 300;

/**
 * Shared timer/debounce core behind both hooks below. Android fires
 * contextmenu on long-press natively; the touch timer covers iOS Safari.
 * A short debounce prevents double-opens when both fire.
 */
function useSharedReactionTrigger(onOpen: (x: number, y: number) => void) {
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

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    clear();
    open(e.clientX, e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    clear();
    const { clientX, clientY } = touch;
    timer.current = window.setTimeout(() => open(clientX, clientY), LONG_PRESS_MS);
  };

  return { onContextMenu, onTouchStart, onTouchMove: clear, onTouchEnd: clear };
}

/**
 * Right-click (desktop) / long-press (touch) trigger for the reaction menu.
 * Android fires contextmenu on long-press natively; the touch timer covers
 * iOS Safari. A short debounce prevents double-opens when both fire.
 */
export function useReactionTrigger(onOpen: (x: number, y: number) => void) {
  return useSharedReactionTrigger(onOpen);
}

/**
 * Per-item variant for lists: call the hook once at component level, then
 * spread `handlersFor(id)` onto each row. All rows share one timer and one
 * debounce window, so contextmenu + long-press can't double-open.
 */
export function useItemReactionTrigger(onOpen: (x: number, y: number, id: string) => void) {
  const idRef = useRef<string | null>(null);
  const { onContextMenu, onTouchStart, onTouchMove, onTouchEnd } = useSharedReactionTrigger(
    (x, y) => {
      if (idRef.current !== null) onOpen(x, y, idRef.current);
    },
  );

  const handlersFor = (id: string) => ({
    onContextMenu: (e: React.MouseEvent) => {
      idRef.current = id;
      onContextMenu(e);
    },
    onTouchStart: (e: React.TouchEvent) => {
      idRef.current = id;
      onTouchStart(e);
    },
    onTouchMove,
    onTouchEnd,
  });

  return handlersFor;
}
