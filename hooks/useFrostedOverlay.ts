'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * "A full-screen frosted surface is on screen."
 *
 * ## Why this exists
 *
 * `backdrop-filter` is invalidated as a **whole element**, not per damaged rect.
 * Anything that paints a moving pixel *above* a `backdrop-filter` layer — even
 * one pixel, even a 24px dot wiggling in a 50px arc — makes Chromium re-run the
 * blur over the entire element, every frame, for as long as it moves.
 *
 * Measured (headless Chromium, 1920×1080, `.radial-hub__blur` = `inset: 0` with
 * `blur(20px) saturate(118%)`, vsync on, a synthetic pointer sweep):
 *
 * | above the open menu                    | fps  | p50 frame |
 * | -------------------------------------- | ---- | --------- |
 * | nothing moving                         | 60.2 | 16.7ms    |
 * | a plain 24px dot, 50px arc             | 10.7 | 99.9ms    |
 * | a plain 24px dot, full-screen sweep    | 10.8 | 83.4ms    |
 * | the pointer metaball                   | 10.6 | 100.0ms   |
 * | the pointer metaball, no backdrop-filter | 60.1 | 16.7ms  |
 *
 * The damage's *size* and *position* are irrelevant; only the blurred element's
 * area matters (a 500px frosted disc with the same dot moving over it stays at
 * 60fps). Blur radius barely matters either — `blur(6px)` still measured 11.9fps
 * — so this is not something you tune your way out of. `will-change`,
 * `isolation` and promotion hints do nothing.
 *
 * The pointer metaball is the one element on this site that is *guaranteed* to
 * move above every overlay, because it replaces the OS cursor. So a full-screen
 * scrim plus the drop is a standing 6× frame-time regression, and the drop is
 * the only pointer on screen — which is why it reads as "the cursor is laggy"
 * rather than "the menu is janky".
 *
 * ## The contract
 *
 * Anything that renders a **viewport-covering `backdrop-filter` layer** (today:
 * `.glass-scrim`, `.radial-hub__blur`) calls {@link useFrostedOverlay} for as
 * long as that layer is up. `MetaballCursor` subscribes and hands the pointer
 * back to the OS — as a still image of the drop, so the mark is unchanged and
 * the compositor is drawing it instead of the page. Zero page damage, 60fps.
 *
 * `lib/__tests__/metaball-perf-budget.test.ts` fails the build on a component
 * that renders one of those layers without calling the hook.
 */

/** Keys currently claiming a frosted overlay. Non-empty ⇒ the drop stands down. */
const claims = new Set<symbol>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** True while at least one viewport-covering frosted layer is mounted. */
export function hasFrostedOverlay(): boolean {
  return claims.size > 0;
}

/** Subscribe to changes in {@link hasFrostedOverlay}. Returns an unsubscribe. */
export function subscribeFrostedOverlay(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Claim a frosted overlay while `active` (default: for this component's whole
 * mounted lifetime, which is the right shape for a scrim that only renders when
 * its dialog is open).
 */
export function useFrostedOverlay(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const key = Symbol('frosted-overlay');
    const was = claims.size > 0;
    claims.add(key);
    if (!was) emit();
    return () => {
      claims.delete(key);
      if (claims.size === 0) emit();
    };
  }, [active]);
}

/** React binding for {@link hasFrostedOverlay}. SSR snapshot is `false`. */
export function useHasFrostedOverlay(): boolean {
  return useSyncExternalStore(subscribeFrostedOverlay, hasFrostedOverlay, () => false);
}
