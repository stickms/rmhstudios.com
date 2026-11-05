/**
 * The city's ground cover as plain typed arrays, like terrain-mesh.ts: roads (a lane with arms to every joined
 * neighbour that follows the block heights, ramping across a one-block step) and the tinted pads of zoned tiles.
 * Pure data in, arrays out — the renderer just uploads them, and the same `roadLink` rule that decides what a walker
 * may do decides which arms are drawn.
 */

import type { ZoneId } from '../content';
import {
  cellLevel,
  cellRoad,
  cellZone,
  roadLink,
  FLAG_CONNECTED,
  tileTop,
  type World,
} from '../world';
import { PALETTE, type PaletteKey } from './palette';
import { hexToLinear } from './terrain-mesh';

export interface CityMeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear-sRGB vertex colours. */
  colors: Float32Array;
  indices: Uint32Array;
}

/** Half the width of a road lane, in tiles, and how far it floats above the ground so it never z-fights it. */
export const ROAD_HALF_WIDTH = 0.3;
export const ROAD_LIFT = 0.025;
/** Zone pads sit just under the roads' height and are inset from the tile edge. */
const ZONE_LIFT = 0.012;
const ZONE_INSET = 0.04;

type Rgb = readonly [number, number, number];
type V3 = readonly [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scale = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const lin = (k: PaletteKey): Rgb => hexToLinear(PALETTE[k]);

/** Stable per-tile grain in [0,1). */
function grain(x: number, z: number): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(z + 1274126177, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  /** A quad whose corners go round in order; wound so it faces `normal`. */
  quad(v: readonly [V3, V3, V3, V3], normal: V3, color: Rgb): void {
    const base = this.positions.length / 3;
    for (const p of v) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.colors.push(color[0], color[1], color[2]);
    }
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const cross = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const facing = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] >= 0;
    if (facing) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  done(): CityMeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    };
  }
}

const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/**
 * How a road tile sits on the ground: flat at its top, or — when a joined neighbour stands one block higher — a ramp
 * rising across the whole tile to meet it. Returns the surface height at a point `u` tiles along the ramp
 * direction (u = -0.5 .. 0.5 across the tile); `dir` is null for a flat tile.
 */
function rampOf(
  world: World,
  x: number,
  z: number,
): { dir: readonly [number, number]; rise: number } | null {
  const y = tileTop(world, x, z);
  for (const d of DIRS) {
    if (!roadLink(world, x, z, x + d[0], z + d[1])) continue;
    const rise = tileTop(world, x + d[0], z + d[1]) - y;
    if (rise > 1e-6) return { dir: d, rise };
  }
  return null;
}

export function buildRoadMesh(world: World): CityMeshData {
  const n = world.size;
  const b = new Builder();
  const road = lin('wood');
  const paler = mix(road, lin('cream'), 0.28);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      if (!cellRoad(world.city.cells[z * n + x])) continue;
      const y0 = tileTop(world, x, z);
      const ramp = rampOf(world, x, z);
      /** Surface height above world point (px, pz) within this tile. */
      const h = (px: number, pz: number): number => {
        if (!ramp) return y0 + ROAD_LIFT;
        const u = (px - x) * ramp.dir[0] + (pz - z) * ramp.dir[1];
        return y0 + ROAD_LIFT + (u + 0.5) * ramp.rise;
      };
      const tint = mix(paler, road, 0.5 + 0.4 * (grain(x, z) - 0.5));
      const up: V3 = [0, 1, 0];
      // Slope normal for a ramp, so lighting follows the surface.
      const normal: V3 = ramp
        ? normalise([-ramp.dir[0] * ramp.rise, 1, -ramp.dir[1] * ramp.rise])
        : up;
      const flat = (x0: number, z0: number, x1: number, z1: number) =>
        b.quad(
          [
            [x0, h(x0, z0), z0],
            [x1, h(x1, z0), z0],
            [x1, h(x1, z1), z1],
            [x0, h(x0, z1), z1],
          ],
          normal,
          tint,
        );
      const r = ROAD_HALF_WIDTH;
      // The junction square, then an arm to each joined neighbour.
      flat(x - r, z - r, x + r, z + r);
      for (const d of DIRS) {
        if (!roadLink(world, x, z, x + d[0], z + d[1])) continue;
        const [ax0, ax1] =
          d[0] === 0 ? [x - r, x + r] : d[0] > 0 ? [x + r, x + 0.5] : [x - 0.5, x - r];
        const [az0, az1] =
          d[1] === 0 ? [z - r, z + r] : d[1] > 0 ? [z + r, z + 0.5] : [z - 0.5, z - r];
        flat(ax0, az0, ax1, az1);
      }
      if (ramp) {
        // Close the wedge's two long sides down to the ground so it reads as a solid ramp.
        const dark = scale(road, 0.78);
        const px = ramp.dir[1]; // perpendicular axis (x when moving along z, and vice versa)
        const pz = ramp.dir[0];
        for (const side of [-1, 1]) {
          const ox = side * r * px;
          const oz = side * r * pz;
          const lo: V3 = [x - ramp.dir[0] * 0.5 + ox, y0, z - ramp.dir[1] * 0.5 + oz];
          const hi: V3 = [x + ramp.dir[0] * 0.5 + ox, y0, z + ramp.dir[1] * 0.5 + oz];
          b.quad(
            [lo, hi, [hi[0], h(hi[0], hi[2]), hi[2]], [lo[0], h(lo[0], lo[2]), lo[2]]],
            [side * px, 0, side * pz],
            dark,
          );
        }
      }
    }
  }
  return b.done();
}

const normalise = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const ZONE_COLOR: Record<ZoneId, PaletteKey> = {
  homes: 'blush',
  market: 'butter',
  workshop: 'stone',
};

/** The tinted pad of every zoned tile, fainter where no road reaches it yet. */
export function buildZoneMesh(world: World): CityMeshData {
  const n = world.size;
  const b = new Builder();
  const ground = lin('aqua');
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const cell = world.city.cells[i];
      const zone = cellZone(cell);
      if (!zone) continue;
      const connected = (world.city.flags[i] & FLAG_CONNECTED) !== 0;
      const developed = cellLevel(cell) > 0;
      // Empty pads are strong enough to read as a plan; under a built lot they are a quiet tint.
      const amount = developed ? 0.55 : connected ? 0.85 : 0.65;
      const color = mix(ground, lin(ZONE_COLOR[zone]), amount);
      const y = tileTop(world, x, z) + ZONE_LIFT;
      const e = 0.5 - ZONE_INSET;
      b.quad(
        [
          [x - e, y, z - e],
          [x + e, y, z - e],
          [x + e, y, z + e],
          [x - e, y, z + e],
        ],
        [0, 1, 0],
        color,
      );
    }
  }
  return b.done();
}
