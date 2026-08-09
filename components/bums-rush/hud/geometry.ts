/**
 * Where a HUD element goes, in the stage's own coordinates.
 *
 * The playfield is a 16:9 `.app-stage` whose CSS box IS the design rect
 * (1920×1080) scaled uniformly — that is the whole point of using the stage
 * primitive instead of measuring the canvas. So anything that must sit over a
 * world position converts to a PERCENTAGE of the stage and needs no pixel
 * measurement, no resize listener and no re-layout when the window changes
 * shape. A phone rotating from 390×844 to 844×390 moves every marker correctly
 * without this file being told.
 *
 * Pure, and separated from the components for that reason: this is the part
 * that can be wrong on an aspect ratio nobody has, and the part a test can hold
 * still.
 */

import { PHYSICS } from '@/lib/bums-rush/constants';
import type { EdgeIndicator } from '@/lib/bums-rush/engine';

const DESIGN_W = PHYSICS.DESIGN_WIDTH;
const DESIGN_H = PHYSICS.DESIGN_HEIGHT;

export interface CameraLike {
  x: number;
  y: number;
  zoom: number;
}

export interface StagePlacement {
  /** 0..100, percentage across the stage. */
  leftPct: number;
  topPct: number;
  /** Degrees, for a CSS `rotate()`. */
  angleDeg: number;
}

/** World point → design-space point under the camera. */
export function worldToDesign(x: number, y: number, camera: CameraLike): { x: number; y: number } {
  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  return {
    x: DESIGN_W / 2 + (x - camera.x) * zoom,
    y: DESIGN_H / 2 + (y - camera.y) * zoom,
  };
}

/**
 * An off-screen player's arrow, as a stage percentage.
 *
 * The engine already put the indicator on the frame rectangle, so this is only
 * the coordinate change — but it clamps anyway. A camera one frame stale (the
 * HUD reads the same `RenderState` the canvas drew, but a host migration can
 * hand it a snapshot from a different frame) would otherwise push an arrow off
 * the stage and, with it, the parent's scrollWidth — which on a phone is a
 * horizontal page scroll caused by a decoration.
 */
export function edgeIndicatorPlacement(
  indicator: Pick<EdgeIndicator, 'x' | 'y' | 'angle'>,
  camera: CameraLike,
): StagePlacement {
  const design = worldToDesign(indicator.x, indicator.y, camera);
  // 3% inset so the arrow's own box stays inside the stage rather than
  // straddling the edge it points at.
  return {
    leftPct: clamp((design.x / DESIGN_W) * 100, 3, 97),
    topPct: clamp((design.y / DESIGN_H) * 100, 3, 97),
    angleDeg: (indicator.angle * 180) / Math.PI,
  };
}

/**
 * The distance readout on an edge arrow, in whole metres.
 *
 * A design pixel is not a metre and pretending otherwise would be a made-up
 * number; the head is 26px across, so ~52 design px reads as roughly a body
 * width. 100 px/m keeps the number small enough to read in a 10px glyph at a
 * glance, which is the only thing this label is for.
 */
export const DESIGN_PX_PER_METRE = 100;

export function edgeDistanceMetres(distancePx: number): number {
  return Math.max(1, Math.round(distancePx / DESIGN_PX_PER_METRE));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Which arm a touch belongs to, expressed as a percentage split, so the touch
 * layer's visual hint and `armForTouchX`'s maths cannot drift apart.
 */
export const TOUCH_SPLIT_PCT = 50;
