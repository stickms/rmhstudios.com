/**
 * Isleworks — island generation.
 *
 * Deterministic from a single integer seed, so a city's board can be rebuilt
 * from the save file's `seed` alone and a shared seed always produces the same
 * island. No noise library: value noise over a hashed lattice is a dozen lines
 * and is plenty for a 24×24 board where every tile is visible at once.
 *
 * The shape is deliberately *island-ish rather than blobby*. A pure radial
 * falloff gives a circle, and a circle gives every city the same silhouette; the
 * two octaves of noise added to the radius are what produce bays worth putting a
 * ferry dock in and headlands worth putting a lighthouse-shaped observatory on.
 */

import { TERRAIN_COLORS } from './palette';
import type { Tile, TerrainType } from './types';
import { index } from './grid';

export const DEFAULT_WIDTH = 24;
export const DEFAULT_HEIGHT = 24;

/** mulberry32 — small, fast, good enough, and identical across engines. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of a lattice point, in [0, 1). */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on a lattice of `scale` tiles. */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function makeTile(x: number, y: number, terrainType: TerrainType, elevation: number): Tile {
  return {
    x,
    y,
    terrainType,
    elevation,
    occupied: false,
    roadConnections: [],
    hasPower: false,
    hasWater: false,
    pollution: 0,
    noise: 0,
    landValue: 0,
    traffic: 0,
    unlocked: false,
  };
}

/**
 * Generate the board.
 *
 * Terrain assignment is a strict cascade so no tile can end up ambiguous:
 * water → shoreline sand → high ground (rock, then snow at the very top) →
 * forest where the moisture field is dense → grass everywhere else.
 */
export function generateIsland(
  seed: number,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
): Tile[] {
  const tiles: Tile[] = new Array(width * height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxRadius = Math.min(width, height) / 2;

  // Pass 1 — land or sea.
  const land = new Uint8Array(width * height);
  const heightField = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y, width);
      const dx = (x - cx) / maxRadius;
      const dy = (y - cy) / maxRadius;
      const radial = Math.sqrt(dx * dx + dy * dy);

      // Two octaves: the coarse one carves bays, the fine one roughens the edge.
      const coast = valueNoise(x, y, 7.5, seed) * 0.28 + valueNoise(x, y, 3.1, seed + 917) * 0.12;
      const shaped = radial - coast + 0.1;

      land[i] = shaped < 0.78 ? 1 : 0;
      heightField[i] =
        valueNoise(x, y, 6.2, seed + 4451) * 0.75 +
        valueNoise(x, y, 2.7, seed + 8123) * 0.25 -
        radial * 0.35;
    }
  }

  // Pass 2 — terrain cascade.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y, width);
      if (!land[i]) {
        tiles[i] = makeTile(x, y, 'water', 0);
        continue;
      }

      const nearWater = neighboursAnyWater(land, x, y, width, height);
      const h = heightField[i];
      const moisture = valueNoise(x, y, 4.4, seed + 2266);

      let terrain: TerrainType;
      let elevation = 1;

      if (nearWater && h < 0.42) {
        terrain = 'sand';
      } else if (h > 0.62) {
        terrain = h > 0.72 ? 'snow' : 'rock';
        elevation = h > 0.72 ? 3 : 2;
      } else if (moisture > 0.62) {
        terrain = 'forest';
      } else {
        terrain = 'grass';
      }

      tiles[i] = makeTile(x, y, terrain, elevation);
    }
  }

  // Pass 3 — flatten the middle. The city needs a decent buildable heart, and a
  // hill dropped on the start tile is a bad first thirty seconds.
  const heartRadius = 4;
  for (let y = Math.floor(cy - heartRadius); y <= Math.ceil(cy + heartRadius); y++) {
    for (let x = Math.floor(cx - heartRadius); x <= Math.ceil(cx + heartRadius); x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = index(x, y, width);
      const d = Math.hypot(x - cx, y - cy);
      if (d > heartRadius) continue;
      const tile = tiles[i];
      if (tile.terrainType === 'water') continue;
      tile.elevation = 1;
      if (tile.terrainType === 'rock' || tile.terrainType === 'snow') tile.terrainType = 'grass';
    }
  }

  return tiles;
}

function neighboursAnyWater(
  land: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
      if (!land[index(nx, ny, width)]) return true;
    }
  }
  return false;
}

/**
 * Scenery scattered on empty tiles — the trees, boulders and tufts that make an
 * unbuilt tile look like somewhere rather than like a blank square.
 *
 * Derived from the tile's own coordinates, so it is stable across renders and
 * costs nothing to store in the save.
 */
export interface Scatter {
  kind: 'tree' | 'pine' | 'rock' | 'tuft' | 'flower';
  /** Offsets within the tile, −0.35…0.35. */
  ox: number;
  oz: number;
  scale: number;
  rotation: number;
}

export function scatterFor(tile: Tile, seed: number): Scatter[] {
  if (tile.terrainType === 'water' || tile.occupied) return [];
  const r = makeRng((tile.x * 73856093) ^ (tile.y * 19349663) ^ seed);
  const out: Scatter[] = [];

  const density =
    tile.terrainType === 'forest'
      ? 3
      : tile.terrainType === 'rock' || tile.terrainType === 'snow'
        ? 2
        : tile.terrainType === 'sand'
          ? 1
          : 2;

  for (let i = 0; i < density; i++) {
    if (r() > (tile.terrainType === 'forest' ? 0.92 : 0.42)) continue;
    const kind: Scatter['kind'] =
      tile.terrainType === 'forest'
        ? r() > 0.45
          ? 'pine'
          : 'tree'
        : tile.terrainType === 'rock' || tile.terrainType === 'snow'
          ? 'rock'
          : tile.terrainType === 'sand'
            ? 'tuft'
            : r() > 0.75
              ? 'flower'
              : 'tuft';
    out.push({
      kind,
      ox: (r() - 0.5) * 0.7,
      oz: (r() - 0.5) * 0.7,
      scale: 0.7 + r() * 0.6,
      rotation: r() * Math.PI * 2,
    });
  }
  return out;
}

export function terrainColor(terrain: TerrainType): string {
  return TERRAIN_COLORS[terrain];
}
