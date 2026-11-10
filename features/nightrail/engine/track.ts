/**
 * Nightrail — track curve sampling.
 *
 * A level's track is a list of {@link TrackSegment}s laid end to end. The sim
 * only ever needs *local* facts about the curve (how tight is it here, how
 * steep, how banked), which are a direct lookup. The renderer needs the actual
 * shape in world space, which is an integration of the curve — so this module
 * does that integration once at level load and caches the result as a polyline
 * the renderer can sample cheaply every frame.
 *
 * World convention for the baked polyline:
 *   +X = east, +Y = up, +Z = north. Heading 0 points along +Z.
 */

import type { LevelConfig, TrackSegment } from './types';

/** Local properties of the curve at some arc length. */
export interface TrackSample {
  /** Signed turn rate, rad/m. */
  curvature: number;
  grade: number;
  bank: number;
}

/** A baked point on the centre line, in world space. */
export interface TrackPoint {
  s: number;
  x: number;
  y: number;
  z: number;
  /** Compass heading of the centre line here, radians. */
  heading: number;
  bank: number;
  grade: number;
  curvature: number;
}

/** Spacing between baked centre-line points, metres. */
const BAKE_STEP = 4;

/**
 * Total length of a segment list.
 *
 * Callers treat this as the finish line, so a level's length is implied by its
 * geometry rather than authored separately — there is no way for the two to
 * disagree.
 */
export function trackLength(segments: TrackSegment[]): number {
  let total = 0;
  for (const seg of segments) total += seg.length;
  return total;
}

/**
 * Look up the curve's local properties at arc length `s`.
 *
 * Clamps at both ends: before the start the track behaves like its first
 * segment, past the finish like its last, which keeps the physics well-defined
 * during the countdown and the run-out after the finish line.
 */
export function sampleTrack(segments: TrackSegment[], s: number): TrackSample {
  if (segments.length === 0) return { curvature: 0, grade: 0, bank: 0 };

  let remaining = s;
  for (const seg of segments) {
    if (remaining < seg.length) {
      return { curvature: seg.curvature, grade: seg.grade, bank: seg.bank };
    }
    remaining -= seg.length;
  }
  const last = segments[segments.length - 1];
  return { curvature: last.curvature, grade: last.grade, bank: last.bank };
}

/**
 * Integrate the curve into a world-space polyline.
 *
 * Run once per level, not per frame. Heading accumulates as `curvature × ds`
 * and position follows the heading, which is exactly the definition of
 * curvature — so a segment list and the shape you see are guaranteed to agree
 * without the level author ever placing a coordinate by hand.
 */
export function bakeTrack(segments: TrackSegment[]): TrackPoint[] {
  const total = trackLength(segments);
  const points: TrackPoint[] = [];

  let x = 0;
  let y = 0;
  let z = 0;
  let heading = 0;

  for (let s = 0; s <= total; s += BAKE_STEP) {
    const sample = sampleTrack(segments, s);
    points.push({
      s,
      x,
      y,
      z,
      heading,
      bank: sample.bank,
      grade: sample.grade,
      curvature: sample.curvature,
    });

    const ds = Math.min(BAKE_STEP, total - s);
    if (ds <= 0) break;
    // Advance along the *current* heading, then turn — a forward Euler step,
    // which at 4 m spacing is far below the visible error of any bend the
    // level format can express.
    x += Math.sin(heading) * ds;
    z += Math.cos(heading) * ds;
    y += sample.grade * ds;
    heading += sample.curvature * ds;
  }

  return points;
}

/**
 * Interpolate the baked polyline at arc length `s`.
 *
 * Heading is interpolated as an angle rather than as a vector, which is safe
 * here because consecutive baked points are 4 m apart and the format caps
 * curvature well below the wrap-around case.
 */
export function samplePoint(points: TrackPoint[], s: number): TrackPoint {
  if (points.length === 0) {
    return { s: 0, x: 0, y: 0, z: 0, heading: 0, bank: 0, grade: 0, curvature: 0 };
  }
  const raw = s / BAKE_STEP;
  const i = Math.max(0, Math.min(points.length - 1, Math.floor(raw)));
  const j = Math.min(points.length - 1, i + 1);
  const t = Math.max(0, Math.min(1, raw - i));
  const a = points[i];
  const b = points[j];
  return {
    s,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    heading: a.heading + (b.heading - a.heading) * t,
    bank: a.bank + (b.bank - a.bank) * t,
    grade: a.grade + (b.grade - a.grade) * t,
    curvature: a.curvature + (b.curvature - a.curvature) * t,
  };
}

/**
 * World position of a point offset laterally and vertically from the centre.
 *
 * This is the one function that turns the sim's `(s, lateral, height)` triple
 * into something drawable, and it is shared by the train, the features and the
 * particles so they can never disagree about where the track is.
 */
export function railPosition(
  points: TrackPoint[],
  s: number,
  lateral: number,
  height: number,
): { x: number; y: number; z: number; heading: number; bank: number } {
  const p = samplePoint(points, s);
  // The lateral axis is the centre-line heading rotated a quarter turn, tilted
  // by the bank so an offset rail rides up the banking rather than through it.
  const cos = Math.cos(p.heading);
  const sin = Math.sin(p.heading);
  const lift = Math.sin(p.bank) * lateral;
  return {
    x: p.x + cos * lateral,
    y: p.y + height + lift,
    z: p.z - sin * lateral,
    heading: p.heading,
    bank: p.bank,
  };
}

/** Lateral offset of a rail index on a track with `railCount` rails. */
export function railOffset(rail: number, railCount: number, spacing: number): number {
  return (rail - (railCount - 1) / 2) * spacing;
}

/** Convenience: bake a whole level. */
export function bakeLevel(level: LevelConfig): TrackPoint[] {
  return bakeTrack(level.segments);
}
