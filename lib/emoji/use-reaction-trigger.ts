import { useRef } from 'react';
import type React from 'react';

const LONG_PRESS_MS = 500;
const DEBOUNCE_MS = 300;

// Elements where the user is composing/selecting text; the trigger must not
// hijack right-click or long-press inside these (native menu / text
// selection should win instead).
const EDITABLE_SELECTOR = 'textarea, input, [contenteditable="true"], [contenteditable=""]';

function isEditableTarget(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.(EDITABLE_SELECTOR);
}

/**
 * Shared timer/debounce core behind both hooks below. Android fires
 * contextmenu on long-press natively; the touch timer covers iOS Safari.
 * A short debounce prevents double-opens when both fire.
 *
 * Every handler here stops propagation once it decides to act. Nested
 * CommentItems each mount their own instance of this hook on their own
 * trigger element, and threaded replies render *inside* their ancestor's
 * trigger div — so without stopPropagation, a single contextmenu/touch
 * sequence on a reply bubbles up and fires every ancestor's handler too,
 * opening several ReactionMenus at once (the last-painted ancestor menu
 * wins and the reaction gets attached to the wrong comment). Stopping
 * propagation in onContextMenu and onTouchStart contains each gesture to
 * the innermost trigger that owns it. onTouchMove/onTouchEnd only ever
 * clear() (never open), but they're stopped too for the same reason: a
 * long-press that starts on a nested reply still delivers its touchmove/
 * touchend to that reply's own element first, and without stopPropagation
 * those events continue bubbling and could clear an unrelated pending
 * timer on an ancestor trigger — cheap to prevent, so we do it for
 * defense-in-depth even though a single-touch gesture rarely overlaps two
 * independent timers in practice.
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
    // Bail before touching preventDefault/stopPropagation/state so the
    // browser's native context menu (paste, spellcheck, etc.) still works
    // while composing in a textarea/input/contenteditable nested here.
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    clear();
    open(e.clientX, e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    // Same bail: let a long-press on an editable element fall through to
    // native text selection instead of opening the reaction menu.
    if (isEditableTarget(e.target)) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.stopPropagation();
    clear();
    const { clientX, clientY } = touch;
    timer.current = window.setTimeout(() => open(clientX, clientY), LONG_PRESS_MS);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    clear();
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    clear();
  };

  return { onContextMenu, onTouchStart, onTouchMove, onTouchEnd };
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
