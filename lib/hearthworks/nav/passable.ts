/**
 * What a walker can do, tile to tile, on block-stepped terrain — one rulebook shared by the pathfinder and the
 * movers, so a route is only ever planned from moves the world will actually let them make:
 *   - level ground and gentle slopes are walks;
 *   - up ONE block is a jump (more is a wall);
 *   - down 1 block is a walk, down 2–3 is a fall (more is a cliff);
 *   - a single tile of water can be jumped straight across;
 *   - nobody cuts a corner through something solid.
 */

import { MAX_FALL, MAX_STEP_UP, levelAt, tileBlocked } from '../avatar/collision';
import type { World } from '../world';

export { MAX_FALL, MAX_STEP_UP };

export type MoveKind = 'walk' | 'jump' | 'fall';
export interface Move {
  kind: MoveKind;
  /** Planning cost (≥ the number of tiles covered, so the octile heuristic is admissible). */
  cost: number;
}

/** Cells that are temporarily off limits (another person standing there, a fresh building). */
export type Blocker = (x: number, z: number) => boolean;

export function walkable(world: World, x: number, z: number, extra?: Blocker): boolean {
  return !tileBlocked(world, x, z) && !(extra?.(x, z) ?? false);
}

function stepCost(rise: number, diagonal: boolean): Move | null {
  const d = diagonal ? Math.SQRT2 : 1;
  if (rise > MAX_STEP_UP) return null;
  if (rise === 1) return { kind: 'jump', cost: d * 2.2 };
  if (rise === 0) return { kind: 'walk', cost: d };
  if (rise === -1) return { kind: 'walk', cost: d * 1.15 };
  if (rise >= -MAX_FALL) return { kind: 'fall', cost: d * (1.6 - rise * 0.9) };
  return null;
}

/** The move from tile A to the ADJACENT (8-neighbour) tile B, or null if it is not allowed. */
export function adjacentMove(world: World, ax: number, az: number, bx: number, bz: number, extra?: Blocker): Move | null {
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.abs(dx) > 1 || Math.abs(dz) > 1 || (dx === 0 && dz === 0)) return null;
  if (!walkable(world, bx, bz, extra)) return null;
  const diagonal = dx !== 0 && dz !== 0;
  if (diagonal) {
    // No cutting corners: both tiles the diagonal passes beside must be open and within a step of both ends.
    for (const [cx, cz] of [
      [ax + dx, az],
      [ax, az + dz],
    ] as const) {
      if (!walkable(world, cx, cz, extra)) return null;
      const lc = levelAt(world, cx, cz);
      if (Math.abs(lc - levelAt(world, ax, az)) > MAX_STEP_UP || Math.abs(lc - levelAt(world, bx, bz)) > MAX_STEP_UP) return null;
    }
  }
  return stepCost(levelAt(world, bx, bz) - levelAt(world, ax, az), diagonal);
}

/** A straight-line jump over exactly one tile of water to the tile two away. */
export function gapMove(world: World, ax: number, az: number, bx: number, bz: number, extra?: Blocker): Move | null {
  const dx = bx - ax;
  const dz = bz - az;
  if (!((Math.abs(dx) === 2 && dz === 0) || (Math.abs(dz) === 2 && dx === 0))) return null;
  const mx = ax + dx / 2;
  const mz = az + dz / 2;
  if (!(mx >= 0 && mz >= 0 && mx < world.size && mz < world.size)) return null;
  if (world.terrain[mz * world.size + mx] !== 'water') return null;
  if (!walkable(world, bx, bz, extra)) return null;
  const rise = levelAt(world, bx, bz) - levelAt(world, ax, az);
  if (rise > MAX_STEP_UP || rise < -MAX_FALL) return null;
  return { kind: 'jump', cost: 3.6 };
}

/** Whatever move (step or gap jump) takes a walker from A to B, if any. */
export function moveBetween(world: World, ax: number, az: number, bx: number, bz: number, extra?: Blocker): Move | null {
  return adjacentMove(world, ax, az, bx, bz, extra) ?? gapMove(world, ax, az, bx, bz, extra);
}

/** The open tile closest to (x, z), searching outward — where to put someone who asked for a blocked spot. */
export function nearestWalkable(world: World, x: number, z: number, extra?: Blocker, maxRing = 6): { x: number; z: number } | null {
  const cx = Math.round(x);
  const cz = Math.round(z);
  for (let r = 0; r <= maxRing; r++) {
    let best: { x: number; z: number } | null = null;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!walkable(world, cx + dx, cz + dz, extra)) continue;
        if (!best || dz < best.z - cz || (dz === best.z - cz && dx < best.x - cx)) best = { x: cx + dx, z: cz + dz };
      }
    }
    if (best) return best;
  }
  return null;
}
