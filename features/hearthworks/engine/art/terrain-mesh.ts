/**
 * The ground as one mesh. The shape stays blocky — flat-topped columns in whole height levels with
 * vertical cliff walls, like a voxel world — but the SURFACE is soft: every top face's four corners take the
 * average colour of the four tiles that meet there, so grass bleeds into sand into rock with no hard seams,
 * a low-frequency tint wanders across the meadows, and corners tucked under a higher neighbour darken a
 * little (ambient occlusion). Pure data in, typed arrays out — the renderer just uploads them.
 */

import { valueNoise } from '../world/noise';
import { LEVEL_HEIGHT, WATER_LEVEL, type TerrainKind, type World } from '../world';
import { PALETTE, type PaletteKey } from './palette';

export interface TerrainMeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear-sRGB vertex colours (what three.js expects for vertexColors). */
  colors: Float32Array;
  indices: Uint32Array;
  /** Tile index (z * size + x) each triangle belongs to — for picking by `faceIndex`. */
  faceTile: Uint32Array;
}

export const TERRAIN_COLOR: Record<TerrainKind, PaletteKey> = {
  water: 'water',
  sand: 'sand',
  grass: 'aqua',
  forest: 'leaf',
  rock: 'stone',
};

/** How far below the rim tiles the skirt walls reach. */
const SKIRT = 0.7;
const AO_STRENGTH = [1, 0.93, 0.85, 0.76] as const;

type Rgb = readonly [number, number, number];

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function hexToLinear(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scale = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

/** Base colour of one tile: its terrain colour plus a gentle wandering tint and a touch of per-tile grain. */
function tileColor(world: World, x: number, z: number): Rgb {
  const kind = world.terrain[z * world.size + x];
  const base = hexToLinear(PALETTE[TERRAIN_COLOR[kind]]);
  const wander = valueNoise(world.seed ^ 0x51ed, x / 4.5, z / 4.5);
  const grain = valueNoise(world.seed ^ 0x2f1, x * 3.7, z * 3.7);
  let c = base;
  if (kind === 'grass') c = mix(base, hexToLinear(PALETTE.leaf), wander * 0.55);
  else if (kind === 'forest') c = mix(base, hexToLinear(PALETTE.leafDeep), wander * 0.5);
  else if (kind === 'sand') c = mix(base, hexToLinear(PALETTE.butter), wander * 0.4);
  else if (kind === 'water') c = mix(base, hexToLinear(PALETTE.powder), wander * 0.5);
  return scale(c, 0.96 + grain * 0.08);
}

export function buildTerrainMesh(world: World, opts: { ao?: boolean } = {}): TerrainMeshData {
  const n = world.size;
  const useAo = opts.ao ?? true;
  const top = (x: number, z: number): number =>
    x < 0 || z < 0 || x >= n || z >= n
      ? Number.NaN
      : (world.terrain[z * n + x] === 'water' ? WATER_LEVEL : world.height[z * n + x]) * LEVEL_HEIGHT;

  const colors: Rgb[] = new Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) colors[z * n + x] = tileColor(world, x, z);

  /** Colour at the grid corner (i, j) — the point where up to four tiles meet. */
  const corner = (i: number, j: number): Rgb => {
    let r = 0;
    let g = 0;
    let b = 0;
    let c = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
      const x = i + dx;
      const z = j + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const col = colors[z * n + x];
      r += col[0];
      g += col[1];
      b += col[2];
      c++;
    }
    return c === 0 ? [0, 0, 0] : [r / c, g / c, b / c];
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const colorOut: number[] = [];
  const indices: number[] = [];
  const faceTile: number[] = [];

  const quad = (
    v: readonly [Rgb3, Rgb3, Rgb3, Rgb3],
    cols: readonly [Rgb, Rgb, Rgb, Rgb],
    normal: Rgb3,
    tile: number,
  ) => {
    const base = positions.length / 3;
    for (let k = 0; k < 4; k++) {
      positions.push(v[k][0], v[k][1], v[k][2]);
      normals.push(normal[0], normal[1], normal[2]);
      colorOut.push(cols[k][0], cols[k][1], cols[k][2]);
    }
    // Wind so the face points along `normal`: test the first triangle's cross product.
    const e1: Rgb3 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const e2: Rgb3 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const cross: Rgb3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const facing = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] >= 0;
    if (facing) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    faceTile.push(tile, tile);
  };

  type Rgb3 = readonly [number, number, number];

  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const tile = z * n + x;
      const y = top(x, z);
      const x0 = x - 0.5;
      const x1 = x + 0.5;
      const z0 = z - 0.5;
      const z1 = z + 0.5;

      // Top face: corner colours blended across neighbouring tiles, darkened where a neighbour stands taller.
      const occluded = (sx: number, sz: number): number => {
        if (!useAo) return 0;
        const higher = (tx: number, tz: number) => {
          const t = top(tx, tz);
          return t > y + 1e-6;
        };
        const s1 = higher(x + sx, z);
        const s2 = higher(x, z + sz);
        if (s1 && s2) return 3;
        return (s1 ? 1 : 0) + (s2 ? 1 : 0) + (higher(x + sx, z + sz) ? 1 : 0);
      };
      const cornerCols: [Rgb, Rgb, Rgb, Rgb] = [
        scale(corner(x, z), AO_STRENGTH[occluded(-1, -1)]),
        scale(corner(x + 1, z), AO_STRENGTH[occluded(1, -1)]),
        scale(corner(x + 1, z + 1), AO_STRENGTH[occluded(1, 1)]),
        scale(corner(x, z + 1), AO_STRENGTH[occluded(-1, 1)]),
      ];
      quad(
        [
          [x0, y, z0],
          [x1, y, z0],
          [x1, y, z1],
          [x0, y, z1],
        ],
        cornerCols,
        [0, 1, 0],
        tile,
      );

      // Cliff walls toward any lower neighbour (and a skirt at the map's rim).
      const walls: { dx: number; dz: number; a: Rgb3; b: Rgb3; ci: [number, number]; cj: [number, number] }[] = [
        { dx: 1, dz: 0, a: [x1, 0, z0], b: [x1, 0, z1], ci: [x + 1, z], cj: [x + 1, z + 1] },
        { dx: -1, dz: 0, a: [x0, 0, z1], b: [x0, 0, z0], ci: [x, z + 1], cj: [x, z] },
        { dx: 0, dz: 1, a: [x1, 0, z1], b: [x0, 0, z1], ci: [x + 1, z + 1], cj: [x, z + 1] },
        { dx: 0, dz: -1, a: [x0, 0, z0], b: [x1, 0, z0], ci: [x, z], cj: [x + 1, z] },
      ];
      for (const w of walls) {
        const nt = top(x + w.dx, z + w.dz);
        const low = Number.isNaN(nt) ? y - SKIRT : nt;
        if (!(y > low + 1e-6)) continue;
        const ca = corner(w.ci[0], w.ci[1]);
        const cb = corner(w.cj[0], w.cj[1]);
        quad(
          [
            [w.a[0], y, w.a[2]],
            [w.b[0], y, w.b[2]],
            [w.b[0], low, w.b[2]],
            [w.a[0], low, w.a[2]],
          ],
          [scale(ca, 0.86), scale(cb, 0.86), scale(cb, 0.62), scale(ca, 0.62)],
          [w.dx, 0, w.dz],
          tile,
        );
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colorOut),
    indices: new Uint32Array(indices),
    faceTile: new Uint32Array(faceTile),
  };
}
