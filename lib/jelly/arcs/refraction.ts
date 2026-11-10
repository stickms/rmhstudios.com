/**
 * Refraction of a bolt in the gel (CSS-first jelly Task 9, "lighting effects that are properly reflected/refracted").
 *
 * A bolt lands on a host's rim and its light carries on into the gel a short way, bent as light is at a water-like
 * surface:
 *
 * - **Snell's law at the rim.** {@link refract} is the vector form of Snell's law; {@link entryStubs} continues the
 *   arriving channel into the host along the refracted direction, a little dimmer and more dispersed than outside.
 *   Each colour has its own index (`ior ± iorSpread`, normal dispersion: blue bends most), and the copies also part
 *   perpendicular to the stub as it deepens, so red, green and blue fan out from the entry point, zero at the rim.
 * - **The gel as a lens.** {@link displaceInside} shifts any bolt point that lies inside a host along the local edge
 *   normal (inward), by {@link refractShift}: exactly 0 outside and on the rim, a smoothstep ramp over
 *   {@link REFRACTION.rampPx} of depth, at most {@link REFRACTION.maxShiftPx}. So the part of a channel inside the gel
 *   appears to bend at the rim while everything outside stays straight, and the field is continuous at the rim.
 *
 * Pure: points and rounded rects in viewport CSS px, no DOM. Run once per strike, never per frame.
 */

import { pointToRoundedRect, type Point, type RoundedRect } from './geometry';
import { mulberry32 } from '@/lib/core/rng';

export const REFRACTION = {
  /** The gel's index (water-like jelly). */
  ior: 1.33,
  /** Red's index is `ior − iorSpread`, blue's `ior + iorSpread` (exaggerated over real water so it reads at 1px). */
  iorSpread: 0.06,
  /** The lens shift inside the gel, px (the bound). */
  maxShiftPx: 3,
  /** Depth over which the shift ramps from 0 to the bound, px. */
  rampPx: 10,
  /** How far the channel's light carries into the gel, px. */
  stubDepthPx: 22,
  /** …and never more than this share of the host's smaller side (a thin control gets a short stub). */
  stubMaxShare: 0.4,
  /** Points per stub (the rim point included). */
  stubPoints: 5,
  /** Seeded zigzag on the stub's interior points, px. */
  stubJitterPx: 1.2,
  /** Red and blue part by this much at the stub's end, px (perpendicular, growing linearly with depth). */
  stubSplitPx: 2.4,
} as const;

/** The lens shift (px) at `depth` px inside the gel: 0 at and outside the rim, smoothstep up to the bound. */
export function refractShift(depth: number): number {
  if (!(depth > 0)) return 0;
  const u = Math.min(1, depth / REFRACTION.rampPx);
  return REFRACTION.maxShiftPx * u * u * (3 - 2 * u);
}

/** The deepest host containing `p`: its signed distance (negative inside) and outward normal, or null. */
function deepest(
  p: Point,
  rects: readonly RoundedRect[],
): { depth: number; nx: number; ny: number } | null {
  let best: { depth: number; nx: number; ny: number } | null = null;
  for (const rr of rects) {
    const hit = pointToRoundedRect(p, rr);
    if (!(hit.distance < 0)) continue;
    const depth = -hit.distance;
    if (!best || depth > best.depth) best = { depth, nx: hit.normal.x, ny: hit.normal.y };
  }
  return best;
}

/** Every point inside a host shifted inward along its local edge normal by {@link refractShift}; others unchanged. */
export function displaceInside(points: Float32Array, rects: readonly RoundedRect[]): Float32Array {
  const out = new Float32Array(points);
  if (rects.length === 0) return out;
  for (let i = 0; i < out.length; i += 2) {
    const hit = deepest({ x: out[i], y: out[i + 1] }, rects);
    if (!hit) continue;
    const s = refractShift(hit.depth);
    out[i] -= hit.nx * s;
    out[i + 1] -= hit.ny * s;
  }
  return out;
}

/**
 * Snell's law in vector form. `d` is the unit direction of travel, `n` the unit surface normal facing against it
 * (outward, for light entering), `eta` = n₁/n₂. Null on total internal reflection.
 */
export function refract(d: Point, n: Point, eta: number): Point | null {
  const cosi = -(n.x * d.x + n.y * d.y);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const m = eta * cosi - Math.sqrt(k);
  const x = eta * d.x + m * n.x;
  const y = eta * d.y + m * n.y;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

export interface EntryStubs {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

/**
 * The channel's light continuing into a host from its rim `contact` (outward normal `normal`), arriving along unit
 * direction `incoming` (pointing into the host). One polyline per colour, each starting exactly on the rim, refracted
 * with its own index, lens-shifted, and truncated before it would leave the host.
 */
export function entryStubs(
  contact: Point,
  normal: Point,
  incoming: Point,
  rect: RoundedRect,
  seed: number,
): EntryStubs {
  const len = Math.hypot(incoming.x, incoming.y) || 1;
  let d = { x: incoming.x / len, y: incoming.y / len };
  // A grazing or outward-pointing arrival enters along the inward normal instead.
  if (d.x * normal.x + d.y * normal.y > -0.05) d = { x: -normal.x, y: -normal.y };
  const depth = Math.max(
    0,
    Math.min(REFRACTION.stubDepthPx, REFRACTION.stubMaxShare * Math.min(rect.w, rect.h)),
  );
  const steps = REFRACTION.stubPoints - 1;
  const rand = mulberry32(seed >>> 0);
  const jitter = [0];
  for (let k = 1; k <= steps; k++) jitter.push((rand() * 2 - 1) * REFRACTION.stubJitterPx);
  jitter[steps] = 0;

  const channel = (ior: number, side: number): Float32Array => {
    const t = refract(d, normal, 1 / ior) ?? { x: -normal.x, y: -normal.y };
    const px = -t.y;
    const py = t.x;
    const pts: number[] = [contact.x, contact.y];
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const along = depth * f;
      const lateral = jitter[k] + (side * REFRACTION.stubSplitPx * f) / 2;
      const p = {
        x: contact.x + t.x * along + px * lateral,
        y: contact.y + t.y * along + py * lateral,
      };
      const hit = pointToRoundedRect(p, rect);
      if (!(hit.distance < 0)) break;
      const s = refractShift(-hit.distance);
      pts.push(p.x - hit.normal.x * s, p.y - hit.normal.y * s);
    }
    return new Float32Array(pts);
  };
  return {
    r: channel(REFRACTION.ior - REFRACTION.iorSpread, 1),
    g: channel(REFRACTION.ior, 0),
    b: channel(REFRACTION.ior + REFRACTION.iorSpread, -1),
  };
}
