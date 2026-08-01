/**
 * Isleworks — grid arithmetic and placement rules.
 *
 * Everything here is pure and index-based. The board is a flat `Tile[]` in
 * row-major order (`index = y * width + x`) because the simulation sweeps it
 * several times a month and an array of arrays costs a pointer chase per tile
 * for no readability gain.
 *
 * The one subtlety worth stating up front: a building's `gridX/gridY` is its
 * **north-west corner after rotation**, and `footprintTiles()` is the only
 * function allowed to expand that into tiles. Every check — affordability,
 * overlap, shore access, bulldozing, rendering — goes through it, so a rotated
 * 3×2 hospital can never disagree with itself about which tiles it stands on.
 */

import type { BuildingDefinition, BuildingInstance, Footprint, RoadDirection, Tile } from './types';

export const ROAD_ID = 'road';

export const DIRECTIONS: { dir: RoadDirection; dx: number; dy: number }[] = [
  { dir: 'n', dx: 0, dy: -1 },
  { dir: 'e', dx: 1, dy: 0 },
  { dir: 's', dx: 0, dy: 1 },
  { dir: 'w', dx: -1, dy: 0 },
];

export function index(x: number, y: number, width: number): number {
  return y * width + x;
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/** Footprint after rotation: odd quarter-turns swap the axes. */
export function rotatedFootprint(footprint: Footprint, rotation: number): Footprint {
  return rotation % 2 === 0
    ? { width: footprint.width, height: footprint.height }
    : { width: footprint.height, height: footprint.width };
}

/** Every tile a building at (x, y) with this rotation would stand on. */
export function footprintTiles(
  x: number,
  y: number,
  footprint: Footprint,
  rotation: number,
): { x: number; y: number }[] {
  const { width, height } = rotatedFootprint(footprint, rotation);
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) out.push({ x: x + dx, y: y + dy });
  }
  return out;
}

export function instanceTiles(
  instance: BuildingInstance,
  definition: BuildingDefinition,
): { x: number; y: number }[] {
  return footprintTiles(instance.gridX, instance.gridY, definition.footprint, instance.rotation);
}

/** World-space centre of a footprint, with the island centred on the origin. */
export function footprintCenter(
  x: number,
  y: number,
  footprint: Footprint,
  rotation: number,
  width: number,
  height: number,
): [number, number] {
  const fp = rotatedFootprint(footprint, rotation);
  return [x + fp.width / 2 - width / 2, y + fp.height / 2 - height / 2];
}

export function tileToWorld(x: number, y: number, width: number, height: number): [number, number] {
  return [x + 0.5 - width / 2, y + 0.5 - height / 2];
}

/** Terrain a building can stand on at all. Water never; rock/snow cost extra. */
export const BUILDABLE_TERRAIN = new Set<Tile['terrainType']>([
  'grass',
  'sand',
  'forest',
  'rock',
  'snow',
]);

/** Surcharge for clearing awkward ground, as a multiplier on the base cost. */
export function terrainCostMultiplier(terrain: Tile['terrainType']): number {
  switch (terrain) {
    case 'forest':
      return 1.15;
    case 'rock':
      return 1.4;
    case 'snow':
      return 1.25;
    default:
      return 1;
  }
}

export type PlacementError =
  | 'out-of-bounds'
  | 'locked'
  | 'water'
  | 'occupied'
  | 'needs-shore'
  | 'needs-road'
  | 'already-built'
  | 'too-expensive';

export interface PlacementCheck {
  ok: boolean;
  error?: PlacementError;
  /** Cost including terrain surcharges — what the player is actually charged. */
  cost: number;
  tiles: { x: number; y: number }[];
}

export interface PlacementContext {
  tiles: Tile[];
  width: number;
  height: number;
  money: number;
  /** Set of definition ids already placed, for `unique` buildings. */
  placedUnique: Set<string>;
}

/**
 * Can this building go here, and what does it cost?
 *
 * Returns the cost even when `ok` is false so the ghost can show the price of a
 * placement the player is still dragging toward a legal tile.
 */
export function checkPlacement(
  definition: BuildingDefinition,
  x: number,
  y: number,
  rotation: number,
  ctx: PlacementContext,
): PlacementCheck {
  const tiles = footprintTiles(x, y, definition.footprint, rotation);
  let cost = 0;
  let error: PlacementError | undefined;

  if (definition.unique && ctx.placedUnique.has(definition.id)) {
    return { ok: false, error: 'already-built', cost: definition.cost, tiles };
  }

  for (const t of tiles) {
    if (!inBounds(t.x, t.y, ctx.width, ctx.height)) {
      return { ok: false, error: 'out-of-bounds', cost: definition.cost, tiles };
    }
    const tile = ctx.tiles[index(t.x, t.y, ctx.width)];
    if (!tile.unlocked) error ??= 'locked';
    else if (!BUILDABLE_TERRAIN.has(tile.terrainType)) error ??= 'water';
    else if (tile.occupied) error ??= 'occupied';
    cost += (definition.cost / tiles.length) * terrainCostMultiplier(tile.terrainType);
  }

  cost = Math.round(cost);

  if (!error && definition.requiresShore && !touchesWater(tiles, ctx)) error = 'needs-shore';
  if (!error && cost > ctx.money) error = 'too-expensive';

  return { ok: !error, error, cost, tiles };
}

/** True when any footprint tile is orthogonally adjacent to a water tile. */
export function touchesWater(
  tiles: { x: number; y: number }[],
  ctx: Pick<PlacementContext, 'tiles' | 'width' | 'height'>,
): boolean {
  for (const t of tiles) {
    for (const { dx, dy } of DIRECTIONS) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (!inBounds(nx, ny, ctx.width, ctx.height)) continue;
      if (ctx.tiles[index(nx, ny, ctx.width)].terrainType === 'water') return true;
    }
  }
  return false;
}

/**
 * Recompute the auto-tiling bitmask for every road.
 *
 * Roads are the only thing on the board that changes shape because of its
 * neighbours, so this runs after any placement or demolition rather than being
 * maintained incrementally — 576 tiles is nothing, and incremental road masks
 * are a classic source of one-tile-stale seams.
 */
export function recomputeRoadConnections(
  tiles: Tile[],
  width: number,
  height: number,
  isRoad: (tile: Tile) => boolean,
): void {
  for (const tile of tiles) {
    if (!isRoad(tile)) {
      if (tile.roadConnections.length) tile.roadConnections = [];
      continue;
    }
    const connections: RoadDirection[] = [];
    for (const { dir, dx, dy } of DIRECTIONS) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      if (!inBounds(nx, ny, width, height)) continue;
      if (isRoad(tiles[index(nx, ny, width)])) connections.push(dir);
    }
    tile.roadConnections = connections;
  }
}

/**
 * Flood-fill the road graph into connected components.
 *
 * Returns a per-tile component id (`-1` for anything that is not a road) plus
 * the size of each component. The sim treats the *largest* component as "the
 * network": a spur someone forgot to join up still exists, still costs upkeep,
 * and still fails to deliver anything, which is exactly the feedback the player
 * needs.
 */
export function roadComponents(
  tiles: Tile[],
  width: number,
  height: number,
  isRoad: (tile: Tile) => boolean,
): { componentOf: Int32Array; sizes: number[] } {
  const componentOf = new Int32Array(tiles.length).fill(-1);
  const sizes: number[] = [];
  const queue: number[] = [];

  for (let i = 0; i < tiles.length; i++) {
    if (componentOf[i] !== -1 || !isRoad(tiles[i])) continue;
    const id = sizes.length;
    let size = 0;
    componentOf[i] = id;
    queue.length = 0;
    queue.push(i);
    while (queue.length) {
      const current = queue.pop() as number;
      size++;
      const tile = tiles[current];
      for (const { dx, dy } of DIRECTIONS) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (!inBounds(nx, ny, width, height)) continue;
        const ni = index(nx, ny, width);
        if (componentOf[ni] !== -1 || !isRoad(tiles[ni])) continue;
        componentOf[ni] = id;
        queue.push(ni);
      }
    }
    sizes.push(size);
  }

  return { componentOf, sizes };
}

export function largestComponent(sizes: number[]): number {
  let best = -1;
  let bestSize = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] > bestSize) {
      bestSize = sizes[i];
      best = i;
    }
  }
  return best;
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/* ── Land parcels ──────────────────────────────────────────────────────────
 * The island is sold in square parcels rather than single tiles: buying one
 * tile at a time turns expansion into clicking, and buying the whole island at
 * once removes the decision entirely. `PARCEL_SIZE` tiles is big enough that
 * each purchase is a real commitment to a direction.
 */

export const PARCEL_SIZE = 4;

export function parcelsAcross(width: number): number {
  return Math.ceil(width / PARCEL_SIZE);
}

export function parcelIndexFor(x: number, y: number, width: number): number {
  return Math.floor(y / PARCEL_SIZE) * parcelsAcross(width) + Math.floor(x / PARCEL_SIZE);
}

export function parcelBounds(
  parcel: number,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const across = parcelsAcross(width);
  const px = parcel % across;
  const py = Math.floor(parcel / across);
  return {
    x0: px * PARCEL_SIZE,
    y0: py * PARCEL_SIZE,
    x1: Math.min(width, (px + 1) * PARCEL_SIZE) - 1,
    y1: Math.min(height, (py + 1) * PARCEL_SIZE) - 1,
  };
}

/**
 * Price of the next parcel.
 *
 * Superlinear on purchases so far: the tenth parcel should be a decision the
 * city has to grow into, not a rounding error against a mature treasury.
 */
export function parcelPrice(ownedCount: number, buildableTiles: number): number {
  const base = 400 + Math.round(Math.pow(Math.max(0, ownedCount - 4), 1.6) * 240);
  const density = buildableTiles / (PARCEL_SIZE * PARCEL_SIZE);
  return Math.max(150, Math.round(base * (0.35 + density * 0.65)));
}
