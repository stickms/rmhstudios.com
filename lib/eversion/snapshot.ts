/**
 * Construction and copying of {@link TimelineSnapshot} — the one object the
 * timeline writes and the renderer reads, every frame.
 *
 * Kept out of `types.ts` (which holds no behaviour) and out of `timeline.ts`
 * (a T10 stub) because three parties need it before the timeline exists: the
 * renderer's tests need a snapshot to draw, the harness needs one to scrub, and
 * the timeline needs the rest-state values to start from. A shared constructor
 * is also what keeps the field list in ONE place: add a field to the snapshot
 * type and this function stops compiling until it is initialised.
 */

import type { TimelineSnapshot } from './types';

/**
 * A snapshot at rest: the round, un-swollen globe before anything has moved —
 * `wrap` 0 (flat page), `unwrap` 1, `evert` 0, the canvas
 * opaque, no ripple. Geometry (`radius`, `centre*`) is 0 until a timeline
 * writes the hub's pose into it.
 */
export function createSnapshot(): TimelineSnapshot {
  return {
    t: 0,
    stage: 'wrap',
    wrap: 0,
    unwrap: 1,
    evert: 0,
    spin: 0,
    tilt: 0,
    radius: 0,
    centreX: 0,
    centreY: 0,
    hubFade: 1,
    afterMix: 0,
    pageAlpha: 1,
    rippleAge: -1,
    bgAlpha: 1,
  };
}

/** Copy `src` into `dst` field by field (no allocation); returns `dst`. */
export function copySnapshot(
  src: Readonly<TimelineSnapshot>,
  dst: TimelineSnapshot,
): TimelineSnapshot {
  dst.t = src.t;
  dst.stage = src.stage;
  dst.wrap = src.wrap;
  dst.unwrap = src.unwrap;
  dst.evert = src.evert;
  dst.spin = src.spin;
  dst.tilt = src.tilt;
  dst.radius = src.radius;
  dst.centreX = src.centreX;
  dst.centreY = src.centreY;
  dst.hubFade = src.hubFade;
  dst.afterMix = src.afterMix;
  dst.pageAlpha = src.pageAlpha;
  dst.rippleAge = src.rippleAge;
  dst.bgAlpha = src.bgAlpha;
  return dst;
}
