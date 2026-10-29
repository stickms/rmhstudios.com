/**
 * A small collision world for movement tests: convex brushes (boxes, ramps,
 * anything bounded by planes) traced the way the engine traces BSP brushes —
 * each plane pushed out by the box's support point, entry/exit fractions
 * pulled back by DIST_EPSILON, and startSolid/allSolid reported like
 * CM_ClipBoxToBrush. Every brush carries its axial bounding planes as bevels
 * (vbsp adds the same), so a swept box never snags on a sloped face's edges.
 */

import type { CollisionWorld, TraceFilter, TraceResult } from '../../core/types';
import { NO_ENTITY, WORLD_ENTITY } from '../../core/types';
import type { Vec3 } from '../../core/vec';
import { CONTENTS_SOLID, CONTENTS_WATER } from '../../core/constants';

/** coordsize.h DIST_EPSILON. */
const DIST_EPSILON = 0.03125;
/** cmodel.cpp: enter fraction before any plane was crossed. */
const NEVER_UPDATED = -9999;

export interface BrushPlane {
  normal: Vec3;
  dist: number;
}

export interface Brush {
  planes: BrushPlane[];
  mins: Vec3;
  maxs: Vec3;
  contents: number;
  surfaceName: string;
  entity: number;
}

export interface BrushOptions {
  contents?: number;
  surfaceName?: string;
  entity?: number;
}

function axialPlanes(mins: Vec3, maxs: Vec3): BrushPlane[] {
  return [
    { normal: { x: 1, y: 0, z: 0 }, dist: maxs.x },
    { normal: { x: -1, y: 0, z: 0 }, dist: -mins.x },
    { normal: { x: 0, y: 1, z: 0 }, dist: maxs.y },
    { normal: { x: 0, y: -1, z: 0 }, dist: -mins.y },
    { normal: { x: 0, y: 0, z: 1 }, dist: maxs.z },
    { normal: { x: 0, y: 0, z: -1 }, dist: -mins.z },
  ];
}

/** An axis-aligned box brush. */
export function boxBrush(mins: Vec3, maxs: Vec3, opts: BrushOptions = {}): Brush {
  return {
    planes: axialPlanes(mins, maxs),
    mins: { ...mins },
    maxs: { ...maxs },
    contents: opts.contents ?? CONTENTS_SOLID,
    surfaceName: opts.surfaceName ?? 'concrete',
    entity: opts.entity ?? WORLD_ENTITY,
  };
}

/**
 * A ramp (triangular prism) rising along +x from height `z0` at `x0` to `z1`
 * at `x1`, spanning `y0…y1`, with a flat base at `z0`. Its slope normal has
 * z = (x1 − x0) / hypot(x1 − x0, z1 − z0).
 */
export function rampBrush(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  opts: BrushOptions = {},
): Brush {
  const mins = { x: x0, y: y0, z: z0 };
  const maxs = { x: x1, y: y1, z: z1 };
  const rise = z1 - z0;
  const run = x1 - x0;
  const len = Math.hypot(rise, run);
  const n = { x: -rise / len, y: 0, z: run / len };
  const slope: BrushPlane = { normal: n, dist: n.x * x0 + n.z * z0 };
  return {
    planes: [...axialPlanes(mins, maxs), slope],
    mins,
    maxs,
    contents: opts.contents ?? CONTENTS_SOLID,
    surfaceName: opts.surfaceName ?? 'concrete',
    entity: opts.entity ?? WORLD_ENTITY,
  };
}

/** A water volume (CONTENTS_WATER, not solid to players). */
export const waterBrush = (mins: Vec3, maxs: Vec3): Brush =>
  boxBrush(mins, maxs, { contents: CONTENTS_WATER, surfaceName: 'water' });

export class BoxWorld implements CollisionWorld {
  readonly brushes: Brush[];
  /** Number of traces run (tests use it to sanity-check costs). */
  traceCount = 0;

  constructor(brushes: Brush[] = []) {
    this.brushes = brushes;
  }

  add(brush: Brush): this {
    this.brushes.push(brush);
    return this;
  }

  traceHull(
    start: Vec3,
    end: Vec3,
    mins: Vec3,
    maxs: Vec3,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult {
    this.traceCount++;
    out.fraction = 1;
    out.startSolid = false;
    out.allSolid = false;
    out.contents = 0;
    out.surfaceFlags = 0;
    out.surfaceName = '';
    out.entity = NO_ENTITY;
    out.hitGroup = 0;
    out.plane.normal.x = out.plane.normal.y = out.plane.normal.z = 0;
    out.plane.dist = 0;

    // Swept bounds for a cheap reject.
    const lox = Math.min(start.x, end.x) + mins.x - 1;
    const loy = Math.min(start.y, end.y) + mins.y - 1;
    const loz = Math.min(start.z, end.z) + mins.z - 1;
    const hix = Math.max(start.x, end.x) + maxs.x + 1;
    const hiy = Math.max(start.y, end.y) + maxs.y + 1;
    const hiz = Math.max(start.z, end.z) + maxs.z + 1;

    for (const b of this.brushes) {
      if ((b.contents & mask) === 0) continue;
      if (
        b.maxs.x < lox ||
        b.mins.x > hix ||
        b.maxs.y < loy ||
        b.mins.y > hiy ||
        b.maxs.z < loz ||
        b.mins.z > hiz
      ) {
        continue;
      }
      if (b.entity !== WORLD_ENTITY && filter && !filter(b.entity, mask)) continue;
      clipBoxToBrush(b, start, end, mins, maxs, out);
      if (out.allSolid) break;
    }

    const f = out.allSolid ? 0 : out.fraction;
    out.endPos.x = start.x + (end.x - start.x) * f;
    out.endPos.y = start.y + (end.y - start.y) * f;
    out.endPos.z = start.z + (end.z - start.z) * f;
    return out;
  }

  traceLine(
    start: Vec3,
    end: Vec3,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult {
    return this.traceHull(start, end, ZERO, ZERO, mask, filter, out);
  }

  pointContents(p: Vec3): number {
    let contents = 0;
    for (const b of this.brushes) {
      let inside = true;
      for (const pl of b.planes) {
        if (p.x * pl.normal.x + p.y * pl.normal.y + p.z * pl.normal.z - pl.dist > 0) {
          inside = false;
          break;
        }
      }
      if (inside) contents |= b.contents;
    }
    return contents;
  }
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** CM_ClipBoxToBrush for one brush, folding the result into `out`. */
function clipBoxToBrush(
  b: Brush,
  start: Vec3,
  end: Vec3,
  mins: Vec3,
  maxs: Vec3,
  out: TraceResult,
): void {
  let enterFrac = NEVER_UPDATED;
  let leaveFrac = 1;
  let clip: BrushPlane | null = null;
  let getOut = false;
  let startOut = false;

  for (const pl of b.planes) {
    const n = pl.normal;
    // Push the plane out by the box corner that touches it first.
    const ox = n.x < 0 ? maxs.x : mins.x;
    const oy = n.y < 0 ? maxs.y : mins.y;
    const oz = n.z < 0 ? maxs.z : mins.z;
    const dist = pl.dist - (ox * n.x + oy * n.y + oz * n.z);
    const d1 = start.x * n.x + start.y * n.y + start.z * n.z - dist;
    const d2 = end.x * n.x + end.y * n.y + end.z * n.z - dist;

    if (d2 > 0) getOut = true;
    if (d1 > 0) startOut = true;

    // Entirely in front of this plane: the brush cannot be hit.
    if (d1 > 0 && (d2 >= DIST_EPSILON || d2 >= d1)) return;
    // Entirely behind: this plane does not clip.
    if (d1 <= 0 && d2 <= 0) continue;

    if (d1 > d2) {
      let f = (d1 - DIST_EPSILON) / (d1 - d2);
      if (f < 0) f = 0;
      if (f > enterFrac) {
        enterFrac = f;
        clip = pl;
      }
    } else {
      let f = (d1 + DIST_EPSILON) / (d1 - d2);
      if (f > 1) f = 1;
      if (f < leaveFrac) leaveFrac = f;
    }
  }

  if (!startOut) {
    out.startSolid = true;
    if (out.entity === NO_ENTITY) {
      out.entity = b.entity;
      out.contents = b.contents;
      out.surfaceName = b.surfaceName;
    }
    if (!getOut) {
      out.allSolid = true;
      out.fraction = 0;
      out.contents = b.contents;
      out.entity = b.entity;
    }
    return;
  }

  if (enterFrac < leaveFrac && enterFrac > NEVER_UPDATED && enterFrac < out.fraction && clip) {
    out.fraction = enterFrac < 0 ? 0 : enterFrac;
    out.plane.normal.x = clip.normal.x;
    out.plane.normal.y = clip.normal.y;
    out.plane.normal.z = clip.normal.z;
    out.plane.dist = clip.dist;
    out.contents = b.contents;
    out.surfaceName = b.surfaceName;
    out.entity = b.entity;
  }
}

/**
 * A closed room: floor top at z = 0, inner extents ±half in x/y and `height`
 * tall, walls `thick` units thick. Returns the brushes.
 */
export function roomBrushes(half: number, height: number, thick = 32): Brush[] {
  const h = half;
  return [
    boxBrush({ x: -h - thick, y: -h - thick, z: -thick }, { x: h + thick, y: h + thick, z: 0 }),
    boxBrush(
      { x: -h - thick, y: -h - thick, z: height },
      { x: h + thick, y: h + thick, z: height + thick },
    ),
    boxBrush({ x: -h - thick, y: -h - thick, z: 0 }, { x: -h, y: h + thick, z: height }),
    boxBrush({ x: h, y: -h - thick, z: 0 }, { x: h + thick, y: h + thick, z: height }),
    boxBrush({ x: -h, y: -h - thick, z: 0 }, { x: h, y: -h, z: height }),
    boxBrush({ x: -h, y: h, z: 0 }, { x: h, y: h + thick, z: height }),
  ];
}
