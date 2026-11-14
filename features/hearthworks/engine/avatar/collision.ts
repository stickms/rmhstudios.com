import {
  LEVEL_HEIGHT,
  SOLID_BUILDINGS,
  citySolidAt,
} from '../world';
import type { World } from '../world';

/** Body radius in tiles (a person is ~0.5 m wide against a ~4 m tile). */
export const AVATAR_RADIUS = 0.12;
/** The most block levels a person hops up in one move, as in a voxel world. */
export const MAX_STEP_UP = 1;
/** The most block levels a person will drop down (a fall); further than this is a cliff. */
export const MAX_FALL = 3;

/** Block level a tile stands at (water reads as its one fixed level). */
export function levelAt(
  world: World,
  tx: number,
  tz: number,
): number {
  return world
    .height[
    tz *
      world.size +
      tx
  ];
}

/** True if nothing can stand on this tile: off the map, water, trees, or a solid building. */
export function tileBlocked(
  world: World,
  tx: number,
  tz: number,
): boolean {
  if (
    !Number.isInteger(
      tx,
    ) ||
    !Number.isInteger(
      tz,
    ) ||
    tx <
      0 ||
    tz <
      0 ||
    tx >=
      world.size ||
    tz >=
      world.size
  )
    return true;
  const kind =
    world
      .terrain[
      tz *
        world.size +
        tx
    ];
  if (
    kind ===
      'water' ||
    kind ===
      'forest'
  )
    return true;
  if (
    citySolidAt(
      world,
      tx,
      tz,
    )
  )
    return true; // a developed lot or a utility
  return world.buildings.some(
    (
      b,
    ) =>
      b.x ===
        tx &&
      b.z ===
        tz &&
      SOLID_BUILDINGS.has(
        b.kind,
      ),
  );
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
  if (
    !Number.isFinite(
      x,
    ) ||
    !Number.isFinite(
      z,
    )
  )
    return false;
  // Lenient mode is for an avatar that is already overlapping something solid (it was built around them, or a
  // save put them there): any move that stays on the map is allowed, so they can always walk back out.
  if (
    lenient
  )
    return (
      x >=
        0 &&
      z >=
        0 &&
      x <=
        world.size -
          1 &&
      z <=
        world.size -
          1
    );
  const fromLevel =
    levelAt(
      world,
      fromX,
      fromZ,
    );
  for (const ox of [
    -AVATAR_RADIUS,
    AVATAR_RADIUS,
  ]) {
    for (const oz of [
      -AVATAR_RADIUS,
      AVATAR_RADIUS,
    ]) {
      const tx =
        Math.round(
          x +
            ox,
        );
      const tz =
        Math.round(
          z +
            oz,
        );
      if (
        tileBlocked(
          world,
          tx,
          tz,
        )
      )
        return false;
      const rise =
        levelAt(
          world,
          tx,
          tz,
        ) -
        fromLevel;
      if (
        rise >
          MAX_STEP_UP ||
        rise <
          -MAX_FALL
      )
        return false;
    }
  }
  return true;
}

export { LEVEL_HEIGHT };
