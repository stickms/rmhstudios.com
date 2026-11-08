/**
 * The soft body's numbers (docs/plasmatic-jelly-system.md §3, master plan R3/R12): the hover and press poses, the
 * springs they move on, and the size cap that keeps a host's edge inside {@link MOTION_BOUNDS}. The soft body is CSS
 * (`app/jelly-material.css` §8); this file is where the CSS gets its numbers. `lib/__tests__/jelly-spring-tokens.test.ts`
 * holds every `--spring-*` literal equal to what `lib/jelly/spring-curves.ts` generates from {@link CSS_SPRINGS}, and
 * `lib/__tests__/jelly-soft-body.test.ts` holds the `--jelly-*` poses equal to {@link CSS_SOFT_BODY}.
 *
 * Pure; nothing here touches the DOM. (The physics service, the element-traits table, the body budgets and the
 * neighbour-nudge picker that used to live here went with the JavaScript soft body.)
 */

import { SPRINGS, type Spring } from '@/lib/fluid';

import { springCurveStops } from './spring-curves';

import { MOTION_BOUNDS } from './tiers';

/** The soft body's poses (scale deltas) and the one pointer-slop the eversion point still reads. */
export const SOFT_BODY = {
  /** Hover plump on cards (scale delta). */
  hoverPlump: 0.008,
  /** Hover dent on controls (scale delta, negative). */
  hoverDent: 0.004,
  /** Press squash amount of a control. */
  pressSquash: 0.025,
  /** Pointer travel that releases a press (`hooks/useEvertPoint.ts` cancels its point past this). */
  scrollSlopPx: 10,
  /** CSS soft body: a card's press sinks this share (≤ 4px of edge travel up to an 800px card, `MOTION_BOUNDS`). */
  pressCardSquash: 0.01,
} as const;

/**
 * The CSS soft body (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3). Hover,
 * press and release are CSS transitions on `scale`, eased by `linear(...)` curves sampled from these springs with
 * `dampedSpringLinear` (`lib/jelly/spring-curves.ts`) and authored once as the `--spring-*` tokens in
 * `app/jelly-material.css`; `lib/__tests__/jelly-spring-tokens.test.ts` keeps each literal equal to its generator.
 * They are the soft body's own springs: the press is `jellyPress` (critically damped, quick), the release and the
 * hover `jellyRelease` (ζ 0.42: the let-go wobble). A CSS transition does not carry velocity across an interruption;
 * the spec accepts that.
 */
export const CSS_SPRINGS = {
  press: SPRINGS.jellyPress,
  release: SPRINGS.jellyRelease,
} as const satisfies Record<string, Spring>;

/**
 * The scale poses the CSS soft body moves between (mirrored as `--jelly-hover-*` / `--jelly-press-*` tokens in
 * `app/jelly-material.css`, held equal by the same parity gate). Every pose, and every frame of the springs between
 * them, stays inside `MOTION_BOUNDS.maxScaleDelta` (spring-curves.test.ts).
 */
export const CSS_SOFT_BODY = {
  /** Cards plump under a hovering fine pointer. */
  hoverPlump: 1 + SOFT_BODY.hoverPlump,
  /** Controls dent slightly under a hovering fine pointer. */
  hoverDent: 1 - SOFT_BODY.hoverDent,
  /** A control is pushed into the surface by the full scale bound. */
  pressControl: 1 - MOTION_BOUNDS.maxScaleDelta,
  /** A card sinks gently: cards are wide, and the bound is in pixels too. */
  pressCard: 1 - SOFT_BODY.pressCardSquash,
} as const;

/**
 * The host size CSS assumes before `--jelly-s` is written (a keyboard press, the frame before the first write): a
 * conservative 1000px, so a pose computed with it is within the edge bound for every host up to that size.
 */
export const CSS_SIZE_FALLBACK_PX = 1000;

/**
 * The size a press body (`data-jelly-press-body`: a JellyGroup, the top bar, the selection bar, a scroller's pill)
 * assumes before `--jelly-s` is written (app/jelly-material.css §8 sets it as the body's default). A body can be as
 * wide as the viewport, so 1000px would let a keyboard press on a wide bar move its edge past the 4 px bound; the
 * widest desktop viewport in CSS px (a 4K screen at 1×) keeps every body inside it, at the cost of a fainter squash
 * until the pointer variable sizes the body (it does on every pointer press).
 */
export const CSS_BODY_SIZE_FALLBACK_PX = 3840;

/**
 * The size cap's numerator (the `--jelly-edge-reach` token). A host whose larger side is `S` px moves its edge by
 * `S · |scale − 1| / 2`, so `MOTION_BOUNDS.maxEdgeTravelPx` allows a scale delta of `2 · maxEdgeTravelPx / S`. The
 * worst CSS move is the release from a press on one side of rest to the hover pose on the other (0.99 → 1.008): it
 * travels both deltas and overshoots by the release spring's overshoot `o` of that span, reaching `c · (1 + 2o)` for
 * equal caps `c`. So each pose's delta is capped at `reach / S` with `reach = 2 · maxEdgeTravelPx / (1 + 2o)`, `o`
 * measured from the very stops the CSS curve carries, floored to the 4 decimals the token is written with.
 */
let edgeReach: number | null = null;
export function cssEdgeReach(): number {
  // Sampling the curve costs a settle search: computed once, on first use (nothing runs at import).
  if (edgeReach === null) {
    const overshoot = Math.max(...springCurveStops(CSS_SPRINGS.release)) - 1;
    edgeReach = Math.floor(((2 * MOTION_BOUNDS.maxEdgeTravelPx) / (1 + 2 * overshoot)) * 1e4) / 1e4;
  }
  return edgeReach;
}

/**
 * The pose CSS gives a host of larger side `sizePx` (app/jelly-material.css §8): the configured pose, capped by size —
 * `min(pose, 1 + reach / S)` above rest, `max(pose, 1 − reach / S)` below it. The JS twin of the CSS, for the tests.
 */
export function cssCappedPose(
  pose: number,
  sizePx: number = CSS_SIZE_FALLBACK_PX,
  reach: number = cssEdgeReach(),
): number {
  if (pose > 1) return Math.min(pose, 1 + reach / sizePx);
  if (pose < 1) return Math.max(pose, 1 - reach / sizePx);
  return 1;
}
