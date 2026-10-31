/**
 * Shape helpers levels compose: boxes, rooms with door gaps, stairs, ramps, prisms, wedges.
 * Each returns plain `BrushSource`s (Source units, Z up). Pure and deterministic.
 */
import type { BrushContents, BrushSource, Face, PlaneSource, Vec3 } from './types';

export type Compass = 'north' | 'south' | 'east' | 'west';
type BrushExtras = Partial<Pick<BrushSource, 'faces' | 'contents' | 'layer'>>;

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** An axis-aligned brush. */
export function box(min: Vec3, max: Vec3, material: string, extra: BrushExtras = {}): BrushSource {
  return { box: { min, max }, material, ...extra };
}

/** A water volume (CONTENTS_WATER); give it a nodraw material for an invisible volume. */
export function waterBox(min: Vec3, max: Vec3, material: string): BrushSource {
  return box(min, max, material, { contents: 'water' });
}

export interface DoorGap {
  wall: Compass;
  /** Centre along the wall (x for north/south walls, y for east/west walls). */
  at: number;
  width: number;
  /** Opening height above the interior floor. Default 96. */
  height?: number;
}

export interface RoomOptions {
  /** The walkable interior. */
  min: Vec3;
  max: Vec3;
  /** Wall, floor and ceiling thickness. Default 16. */
  wall?: number;
  material: string;
  floorMaterial?: string;
  ceilingMaterial?: string;
  doors?: DoorGap[];
  /** Leave the ceiling open (outdoor courtyards). */
  open?: boolean;
  contents?: BrushContents;
}

/** A hollow box: floor, ceiling and four walls, with door gaps cut through the walls. */
export function room(o: RoomOptions): BrushSource[] {
  const t = o.wall ?? 16;
  const { min, max } = o;
  const floor = o.floorMaterial ?? o.material;
  const ceil = o.ceilingMaterial ?? o.material;
  const ex = { contents: o.contents };
  const out: BrushSource[] = [];
  out.push(box(v3(min.x - t, min.y - t, min.z - t), v3(max.x + t, max.y + t, min.z), floor, ex));
  if (!o.open)
    out.push(box(v3(min.x - t, min.y - t, max.z), v3(max.x + t, max.y + t, max.z + t), ceil, ex));

  const walls: {
    name: Compass;
    lo: number;
    hi: number;
    make: (a: number, b: number, z0: number, z1: number) => BrushSource;
  }[] = [
    {
      name: 'north',
      lo: min.x - t,
      hi: max.x + t,
      make: (a, b, z0, z1) => box(v3(a, max.y, z0), v3(b, max.y + t, z1), o.material, ex),
    },
    {
      name: 'south',
      lo: min.x - t,
      hi: max.x + t,
      make: (a, b, z0, z1) => box(v3(a, min.y - t, z0), v3(b, min.y, z1), o.material, ex),
    },
    {
      name: 'east',
      lo: min.y,
      hi: max.y,
      make: (a, b, z0, z1) => box(v3(max.x, a, z0), v3(max.x + t, b, z1), o.material, ex),
    },
    {
      name: 'west',
      lo: min.y,
      hi: max.y,
      make: (a, b, z0, z1) => box(v3(min.x - t, a, z0), v3(min.x, b, z1), o.material, ex),
    },
  ];
  for (const w of walls) {
    const gaps = (o.doors ?? [])
      .filter((d) => d.wall === w.name)
      .map((d) => ({
        a: Math.max(w.lo, d.at - d.width / 2),
        b: Math.min(w.hi, d.at + d.width / 2),
        h: d.height ?? 96,
      }))
      .sort((p, q) => p.a - q.a);
    let cursor = w.lo;
    for (const g of gaps) {
      if (g.a > cursor) out.push(w.make(cursor, g.a, min.z, max.z));
      const top = Math.min(max.z, min.z + g.h);
      if (top < max.z) out.push(w.make(g.a, g.b, top, max.z));
      cursor = Math.max(cursor, g.b);
    }
    if (cursor < w.hi) out.push(w.make(cursor, w.hi, min.z, max.z));
  }
  return out;
}

export interface StairsOptions {
  /** Minimum corner of the lowest step's footprint. */
  min: Vec3;
  /** Direction of ascent. */
  dir: Compass;
  width: number;
  steps: number;
  /** Height of each step. Default 8. */
  rise?: number;
  /** Depth of each step. Default 16. */
  run?: number;
  material: string;
  /** Material for the step tops. */
  topMaterial?: string;
}

/** Solid stairs: step i is a box from the base up to (i+1)*rise. */
export function stairs(o: StairsOptions): BrushSource[] {
  const rise = o.rise ?? 8;
  const run = o.run ?? 16;
  const out: BrushSource[] = [];
  for (let i = 0; i < o.steps; i++) {
    const z1 = o.min.z + (i + 1) * rise;
    const a = i * run;
    const b = (i + 1) * run;
    let lo: Vec3;
    let hi: Vec3;
    switch (o.dir) {
      case 'north':
        lo = v3(o.min.x, o.min.y + a, o.min.z);
        hi = v3(o.min.x + o.width, o.min.y + b, z1);
        break;
      case 'south':
        lo = v3(o.min.x, o.min.y - b + o.steps * run, o.min.z);
        hi = v3(o.min.x + o.width, o.min.y - a + o.steps * run, z1);
        break;
      case 'east':
        lo = v3(o.min.x + a, o.min.y, o.min.z);
        hi = v3(o.min.x + b, o.min.y + o.width, z1);
        break;
      default:
        lo = v3(o.min.x - b + o.steps * run, o.min.y, o.min.z);
        hi = v3(o.min.x - a + o.steps * run, o.min.y + o.width, z1);
        break;
    }
    const faces: Partial<Record<'top', Face>> = o.topMaterial
      ? { top: { material: o.topMaterial } }
      : {};
    out.push(box(lo, hi, o.material, { faces }));
  }
  return out;
}

/**
 * A wedge: the box (min, max) cut by a sloped top that is as high as `max.z` on the `high`
 * side and meets the bottom on the opposite side. A ramp is a wedge you walk up.
 */
export function wedge(
  min: Vec3,
  max: Vec3,
  high: Compass,
  material: string,
  extra: BrushExtras = {},
): BrushSource {
  const dx = max.x - min.x;
  const dy = max.y - min.y;
  const dz = max.z - min.z;
  const planes: PlaneSource[] = [
    { normal: v3(0, 0, -1), dist: -min.z },
    { normal: v3(1, 0, 0), dist: max.x },
    { normal: v3(-1, 0, 0), dist: -min.x },
    { normal: v3(0, 1, 0), dist: max.y },
    { normal: v3(0, -1, 0), dist: -min.y },
  ];
  // Slope plane through the low-edge bottom and the high-edge top.
  switch (high) {
    case 'north':
      planes.push({ normal: v3(0, -dz, dy), dist: -dz * min.y + dy * min.z });
      break;
    case 'south':
      planes.push({ normal: v3(0, dz, dy), dist: dz * max.y + dy * min.z });
      break;
    case 'east':
      planes.push({ normal: v3(-dz, 0, dx), dist: -dz * min.x + dx * min.z });
      break;
    default:
      planes.push({ normal: v3(dz, 0, dx), dist: dz * max.x + dx * min.z });
      break;
  }
  // The planes on the low side that are redundant (the wedge has zero height there) clip away.
  return { planes, material, ...extra };
}

/** A ramp rising toward `dir` from min.z at the low edge to max.z at the high edge. */
export function ramp(
  min: Vec3,
  max: Vec3,
  dir: Compass,
  material: string,
  extra: BrushExtras = {},
): BrushSource {
  return wedge(min, max, dir, material, extra);
}

/** An n-sided prism (a "cylinder"); `radius` is the circumradius, `rotationDeg` turns it about Z. */
export function prism(
  center: Vec3,
  radius: number,
  height: number,
  sides: number,
  material: string,
  rotationDeg = 0,
  extra: BrushExtras = {},
): BrushSource {
  if (sides < 3) throw new Error('prism needs at least 3 sides');
  const apothem = radius * Math.cos(Math.PI / sides);
  const planes: PlaneSource[] = [
    { normal: v3(0, 0, 1), dist: center.z + height },
    { normal: v3(0, 0, -1), dist: -center.z },
  ];
  for (let i = 0; i < sides; i++) {
    const a = ((rotationDeg + (360 * (i + 0.5)) / sides) * Math.PI) / 180;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    planes.push({ normal: v3(nx, ny, 0), dist: nx * center.x + ny * center.y + apothem });
  }
  return { planes, material, ...extra };
}

/** Alias for `prism` (architecture.md §3.1 calls it `cylinderish`). */
export const cylinderish = prism;
