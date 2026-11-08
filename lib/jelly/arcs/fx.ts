/**
 * Per-strike light geometry for a bolt (CSS-first jelly Task 9): everything the renderer strokes beyond the bare
 * channel, computed ONCE when the arc is created so frames only stroke precomputed arrays (the renderer's cost rule).
 *
 * - `main`: the channel with the gel's lens shift applied to any point that lies inside a struck host
 *   (`refraction.ts`; points outside are untouched, so the channel stays straight in the air).
 * - `channels`: for each glow pass that splits (bloom, mid), the red and blue copies of `main`, offset perpendicular
 *   by `dispersion.ts`'s curve: by the pass's half-width, more near a rim, more inside the gel. Green is `main`.
 * - `stubs`: per struck end with a known host rect, the light carrying on into the gel, refracted per colour.
 * - `rims`: per struck end with a host rect, the stretch of the rim lit by the bolt (`reflection.ts`).
 *
 * Pure: plain points and rounded rects, no DOM.
 */

import type { BoltPath } from './bolt';
import { channelOffset, lightSide, rimProximity, splitPolyline } from './dispersion';
import { pointToRoundedRect, type RoundedRect } from './geometry';
import { GLOW } from './glow';
import { mixSeed } from './rng';
import { displaceInside, entryStubs, type EntryStubs } from './refraction';
import { rimLightPath } from './reflection';

/** A struck end: a rim point, its outward normal, and its host's rounded rect when known. */
export interface FxEnd {
  x: number;
  y: number;
  nx: number;
  ny: number;
  rect?: RoundedRect | null;
}

export interface ChannelPair {
  id: 'bloom' | 'mid';
  /** Half-width of the pass the pair belongs to (energy applied), px. */
  halfWidth: number;
  r: Float32Array;
  b: Float32Array;
}

export interface StrikeFx {
  main: Float32Array;
  channels: ChannelPair[];
}

export interface RimFx {
  /** The contact the light is centred on. */
  x: number;
  y: number;
  points: Float32Array;
}

export interface ArcFx {
  strikes: StrikeFx[];
  stubs: EntryStubs[];
  rims: RimFx[];
  /** The struck hosts' rects (for the ring clip). */
  rects: RoundedRect[];
}

/** Below this depth inside a host (px) the gel weight ramps in, so the split grows smoothly across the rim. */
const GEL_RAMP_PX = 4;

function strikeFx(points: Float32Array, rects: readonly RoundedRect[], energy: number): StrikeFx {
  const main = displaceInside(points, rects);
  const n = main.length / 2;
  const rim = new Float32Array(n);
  const gel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = { x: main[2 * i], y: main[2 * i + 1] };
    for (const rr of rects) {
      const d = pointToRoundedRect(p, rr).distance;
      rim[i] = Math.max(rim[i], rimProximity(d));
      gel[i] = Math.max(gel[i], Math.max(0, Math.min(1, -d / GEL_RAMP_PX)));
    }
  }
  const sign = lightSide(main);
  const channels: ChannelPair[] = [];
  for (const pass of GLOW.dark) {
    if (pass.colour !== 'glow') continue;
    const halfWidth = (pass.width + pass.perEnergy * energy) / 2;
    const offsets = new Float32Array(n);
    for (let i = 0; i < n; i++) offsets[i] = channelOffset(halfWidth, rim[i], gel[i]);
    channels.push({
      id: pass.id as 'bloom' | 'mid',
      halfWidth,
      r: splitPolyline(main, offsets, sign),
      b: splitPolyline(main, offsets, -sign),
    });
  }
  return { main, channels };
}

/** The unit direction from `points[from]` to `points[to]` (pair indices), or null when they coincide. */
function dir(points: Float32Array, from: number, to: number) {
  const dx = points[2 * to] - points[2 * from];
  const dy = points[2 * to + 1] - points[2 * from + 1];
  const len = Math.hypot(dx, dy);
  return len > 0 ? { x: dx / len, y: dy / len } : null;
}

/** Build a bolt's light geometry. `ends` are the bolt's [a, b] (b may lack a rect: a cursor). */
export function buildArcFx(
  paths: readonly BoltPath[],
  ends: readonly FxEnd[],
  energy: number,
  seed: number,
): ArcFx {
  const rects = ends.map((e) => e.rect).filter((r): r is RoundedRect => !!r && r.w > 0 && r.h > 0);
  const strikes = paths.map((p) => strikeFx(p.points, rects, energy));
  const stubs: EntryStubs[] = [];
  const rims: RimFx[] = [];
  const first = strikes[0]?.main;
  if (first && first.length >= 4) {
    const n = first.length / 2;
    const look = Math.min(3, n - 1);
    ends.forEach((e, k) => {
      if (!e.rect || !(e.rect.w > 0 && e.rect.h > 0)) return;
      // The arrival direction into this end's host: from a few points back along the channel to the rim point.
      const incoming = k === 0 ? dir(first, look, 0) : dir(first, n - 1 - look, n - 1);
      if (incoming) {
        stubs.push(
          entryStubs(
            { x: e.x, y: e.y },
            { x: e.nx, y: e.ny },
            incoming,
            e.rect,
            mixSeed(seed, 0x57b + k),
          ),
        );
      }
      const lit = rimLightPath(e.rect, { x: e.x, y: e.y });
      if (lit) rims.push({ x: e.x, y: e.y, points: lit.points });
    });
  }
  return { strikes, stubs, rims, rects };
}
