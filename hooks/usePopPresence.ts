'use client';

import { useEffect, useRef, useState } from 'react';
import { POP_COLLAPSE_MS } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** What to put on `data-state`. Matches the values Radix emits. */
export type PopState = 'open' | 'closed';

export interface PopPresence<T> {
  /**
   * Render while this is truthy. It is the caller's own open value while the
   * menu is open, and the LAST open value for the length of the close — so a
   * menu keyed by something richer than a boolean (a pointer position, which
   * item's menu is showing) still has that value to render from on the way out,
   * after the state that produced it has already been cleared.
   */
  present: T | null;
  /** Feed straight to `data-state` beside `data-motion="pop"`. */
  state: PopState;
}

/**
 * Keep a hand-rolled menu mounted long enough to play its close.
 *
 * `globals.css` §7.1 has two halves — `[data-motion='pop']:not([data-state='closed'])`
 * for the open and `[data-motion='pop'][data-state='closed']` for the close —
 * and a Radix surface gets both for free, because Radix keeps its content
 * mounted while the exit runs and only then unmounts it.
 *
 * The site's hand-rolled menus are all `{open && <div/>}`. React removes them on
 * the tick the state flips, so there is no element left for a close animation to
 * run on: they had an opening animation and, however good the keyframes were,
 * nothing at all on the way out. This is the missing half. It holds the last
 * open value for exactly `POP_COLLAPSE_MS` (the mirror of `--motion-collapse`)
 * and reports `closed` for that window, which is all the CSS needs.
 *
 * ```tsx
 * const { present, state } = usePopPresence(open);
 * …
 * {present && (
 *   <div data-motion="pop" data-state={state} className="… origin-top-right">…</div>
 * )}
 * ```
 *
 * Two things it deliberately does NOT do:
 *
 *  - **Gate anything but the render.** Escape handlers, outside-click
 *    listeners and focus-return stay on the caller's own `open`, because a menu
 *    that is visibly leaving should already have stopped behaving like a menu.
 *    (The CSS puts `pointer-events: none` on the closing panel for the same
 *    reason.) The one thing that DOES want `present` is
 *    `useMenuViewportFit` — its cleanup strips the clamp it applied, and a
 *    panel that jumps back to its unclamped position for the length of its own
 *    exit is worse than no exit at all.
 *  - **Hold anything under reduced motion.** There is no animation to wait for,
 *    so the menu goes when it is told to go.
 *
 * The open transition is applied during render rather than from an effect: an
 * effect would let one frame commit with the element already gone, and React
 * would then mount a NEW node for the close — losing the element the animation
 * was supposed to be continuous with.
 *
 * The retained value lives in a REF, not in state, and that is load-bearing.
 * Callers pass things like `contextMenuMessage && pos ? { message, pos } : null`
 * — a fresh object on every render — and a state copy compared by identity would
 * see "changed" every time, schedule an update, and loop forever. Only the two
 * things that must force a re-render on their own (the `data-state` value, and
 * the moment the element is finally allowed to go) are state; the value itself
 * is only ever read back, so caching it costs nothing and cannot churn.
 */
export function usePopPresence<T>(open: T): PopPresence<T> {
  const reduced = useReducedMotion();
  const held = useRef<T | null>(open ? open : null);
  if (open) held.current = open;

  const [state, setState] = useState<PopState>(() => (open ? 'open' : 'closed'));
  const [gone, setGone] = useState(() => !open);

  // Both updates are guarded on a comparison of a two-value state, so the extra
  // render they schedule finds nothing left to change and this converges at once.
  if (open) {
    if (state !== 'open') setState('open');
    if (gone) setGone(false);
  } else if (state !== 'closed') {
    setState('closed');
  }

  useEffect(() => {
    if (open || gone) return;
    if (reduced) {
      setGone(true);
      return;
    }
    const timer = window.setTimeout(() => setGone(true), POP_COLLAPSE_MS);
    // Re-opening inside the close window clears the pending removal, so a fast
    // toggle re-enters the open state on the element that is already there.
    return () => window.clearTimeout(timer);
  }, [open, gone, reduced]);

  return { present: open ? open : gone ? null : held.current, state };
}
