'use client';

import { useEffect } from 'react';
import { keyboardInset } from '@/lib/keyboard-inset';

/**
 * Publishes the software keyboard's height as `--kb-inset` on `<html>`.
 *
 * ## The problem this exists for
 *
 * A full-screen game is exactly viewport-height and cannot scroll — that is the
 * point of `height: 100dvh; overflow: hidden`. Then the player taps a text field
 * and the keyboard covers the bottom 40% of the screen.
 *
 * The browser now has to reveal the focused field, and the page has given it no
 * legitimate way to do it: there is nowhere to scroll, because there is no
 * scrollable overflow. `dvh` is no help either — it tracks the browser's own
 * collapsing toolbars, not the keyboard, so the layout does not shrink. So the
 * engine moves what it can: the visual viewport. It pans, and where the field
 * still will not fit, it scales. That is what a player means by "it zoomed when
 * I tried to type" — the playfield jumps and magnifies, the other cards slide
 * off screen, and a timed run is lost to the interface.
 *
 * ## The fix is to remove the reason, not to fight the symptom
 *
 * `visualViewport` reports the region the keyboard is NOT covering. Publish the
 * difference as a length and let the layout spend it:
 *
 * ```css
 * .my-game-root { height: calc(100dvh - var(--kb-inset, 0px)); }
 * ```
 *
 * The shell now ends where the keyboard begins, the focused field is already
 * inside the visible region, and the engine has nothing to reveal — so it pans
 * and scales nothing. The playfield really is shorter while the keyboard is up,
 * which is honest: that is how much screen there is.
 *
 * The property is **absent** at rest rather than set to `0px`, so each
 * consumer's own `var(--kb-inset, 0px)` fallback is what applies — one place for
 * the default instead of two that can drift apart.
 *
 * Measurement and its two guards (pinch zoom, toolbar jitter) live in
 * `lib/keyboard-inset.ts`, where they are unit-tested. This hook is only the
 * subscription. No-ops where `visualViewport` is missing; on a device that never
 * raises a software keyboard the value simply never appears.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;

    const root = document.documentElement;
    let last = 0;

    const measure = () => {
      const inset = keyboardInset({ layoutHeight: root.clientHeight, visualViewport: visual });
      if (inset === last) return;
      last = inset;
      if (inset === 0) root.style.removeProperty('--kb-inset');
      else root.style.setProperty('--kb-inset', `${inset}px`);
    };

    measure();
    visual.addEventListener('resize', measure);
    // A keyboard's arrival often lands as a viewport SCROLL rather than a resize
    // — that is the engine panning to reveal the field — so both are watched.
    visual.addEventListener('scroll', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      visual.removeEventListener('resize', measure);
      visual.removeEventListener('scroll', measure);
      window.removeEventListener('orientationchange', measure);
      root.style.removeProperty('--kb-inset');
    };
  }, []);
}
