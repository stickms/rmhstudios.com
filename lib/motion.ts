/**
 * Steel motion (docs/plans/2026-11-11-steel-design-implementation.md section 11): the durations and curves of M1 to M5
 * and nothing else. M6: nothing else animates (no page entrances, no list staggers, no hover lifts, no springs, no
 * parallax, no skeleton shimmer).
 *
 * | ID | What                        | Duration, curve                  | Here                        |
 * | -- | --------------------------- | -------------------------------- | --------------------------- |
 * | M1 | Hover and press fills       | 90 ms, ease                      | `DURATION.fast`             |
 * | M2 | Tab underline, toggle slide | 140 ms, ease                     | `DURATION.slide`            |
 * | M3 | Chrome activation (`--c`)   | 280 ms, ease                     | `DURATION.chrome`           |
 * | M4 | Globe open and close        | 360 ms, cubic-bezier(.2,0,0,1)   | `DURATION.globe`, `EASE.globe` |
 * | M5 | Overlay in and out          | 160 ms opacity, no scale, no slide | `DURATION.overlay`, `fade` |
 *
 * The CSS twins are `--m1` to `--m5` in `app/styles/steel-chrome.css`. M7: `prefers-reduced-motion` turns M3 and M4
 * into instant changes; the site's `<MotionConfig reducedMotion="never">` stays, so a consumer that animates M1, M2
 * or M5 needs no preference branch.
 *
 * The full-screen games and apps keep their own motion in `lib/app-motion.ts` (L8).
 */
import type { Transition, Variants } from 'framer-motion';

type Bezier = [number, number, number, number];

/** Durations in **seconds**. */
export const DURATION = {
  /** M1: hover and press fills. */
  fast: 0.09,
  /** M2: tab underline, toggle slide. */
  slide: 0.14,
  /** M3: chrome activation. */
  chrome: 0.28,
  /** M4: globe open and close. */
  globe: 0.36,
  /** M5: overlay in and out. */
  overlay: 0.16,
} as const;

/** CSS `ease` is `cubic-bezier(.25, .1, .25, 1)`. */
const EASE_CSS: Bezier = [0.25, 0.1, 0.25, 1];

export const EASE = {
  /** `ease`: every tween except the globe's. */
  standard: EASE_CSS,
  /** M4: the globe. */
  globe: [0.2, 0, 0, 1] as Bezier,
} as const;

/** M5: an overlay enters and leaves by opacity alone, in 160 ms. */
export const transition: Transition = { duration: DURATION.overlay, ease: EASE.standard };

/** M5: the exit is the same 160 ms. */
export const exitTransition: Transition = transition;

/** M5: opacity cross-fade. For dialogs, menus, popovers, scrims and panels. No scale, no slide. */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition },
  exit: { opacity: 0, transition: exitTransition },
};

/**
 * ── The pre-Steel runtime, deleted with it (plan 15.3, phase 6) ──────────────────────────────────────────────────
 * Not Steel tokens: the page-enter, view-transition and pop-presence code that is still wired reads these three.
 */

/** `ease` as a CSS timing function, for the WAAPI `easing` of the old page-swap code. */
export const SMOOTH_EASE_CSS = 'cubic-bezier(0.3, 0, 0.15, 1)';

/**
 * How long a `data-motion="pop"` surface stays mounted on close, in **milliseconds**: the M5 160 ms. The mirror of
 * `--motion-collapse` in `app/globals/page-motion.css` §7.1, which `hooks/usePopPresence.ts` counts before it lets
 * React remove a hand-rolled menu. If one moves, move the other (`lib/__tests__/motion-pop-spring.test.ts`).
 */
export const POP_COLLAPSE_MS = 160;

/** Mark the currently mounted route roots as already settled, so the CSS `page-enter` does not start late. */
export function markPageEnterComplete(): void {
  if (typeof document === 'undefined') return;
  for (const element of document.querySelectorAll<HTMLElement>('.page-root > *')) {
    element.dataset.pageEnterComplete = '';
  }
}
