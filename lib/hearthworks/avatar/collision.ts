import { LEVEL_HEIGHT, SOLID_BUILDINGS } from '../world';
import type { World } from '../world';

export const AVATAR_RADIUS = 0.22;
/** The most block levels the avatar steps up (or down) in one move, as in a voxel world. */
export const MAX_STEP_LEVELS = 1;

/** Block level a tile stands at (water reads as its one fixed level). */
export function levelAt(world: World, tx: number, tz: number): number {
  return world.height[tz * world.size + tx];
}

/** True if nothing can stand on this tile: off the map, water, trees, or a solid building. */
export function tileBlocked(world: World, tx: number, tz: number): boolean {
  if (!Number.isInteger(tx) || !Number.isInteger(tz) || tx < 0 || tz < 0 || tx >= world.size || tz >= world.size)
    return true;
  const kind = world.terrain[tz * world.size + tx];
  if (kind === 'water' || kind === 'forest') return true;
  return world.buildings.some((b) => b.x === tx && b.z === tz && SOLID_BUILDINGS.has(b.kind));
}

/**
 * Can an avatar whose centre is at (x, z) stand there, having come from tile (fromX, fromZ)? Every tile the
 * body overlaps must be open, and none may be more than MAX_STEP_LEVELS above or below the tile it came from.
 */
export function canStand(
  world: World,
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  lenient = false,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  // Lenient mode is for an avatar that is already overlapping something solid (it was built around them, or a
  // save put them there): any move that stays on the map is allowed, so they can always walk back out.
  if (lenient) return x >= 0 && z >= 0 && x <= world.size - 1 && z <= world.size - 1;
  const fromLevel = levelAt(world, fromX, fromZ);
  for (const ox of [-AVATAR_RADIUS, AVATAR_RADIUS]) {
    for (const oz of [-AVATAR_RADIUS, AVATAR_RADIUS]) {
      const tx = Math.round(x + ox);
      const tz = Math.round(z + oz);
      if (tileBlocked(world, tx, tz)) return false;
      if (Math.abs(levelAt(world, tx, tz) - fromLevel) > MAX_STEP_LEVELS) return false;
    }
  }
  return true;
}

export { LEVEL_HEIGHT };
