/**
 * Laundry Sort — the static world.
 *
 * The arena is a shallow slab: a floor, four bounding walls (the front one
 * invisible, so cloth cannot drift out of the locked frame toward the camera),
 * and four open-topped bins built from five boxes each. Everything is an
 * axis-aligned box, which is all the collision shape cloth needs here and is
 * cheap enough to test every particle against every box, every substep.
 *
 * This module is pure geometry — no three.js, no DOM — so the solver, the
 * renderer and the tests all read the same arena.
 */

import { ARENA, BIN, binCenterX, WASH_COLORS } from './constants';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /**
   * Tangential velocity kept after a contact, per contact. Bin walls are
   * slick so a garment slides in rather than sticking to the rim; the floor
   * grips, so a dropped garment stays where it lands instead of skating.
   */
  friction: number;
}

export interface BinVolume {
  index: number;
  colorId: string;
  centerX: number;
  /** Inner cavity — the region a garment must occupy to count as sorted. */
  interior: Box;
  /** Rim height, for the "is it actually in the basket" test. */
  rimY: number;
}

function box(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  friction: number,
): Box {
  return { minX, minY, minZ, maxX, maxY, maxZ, friction };
}

const WALL_FRICTION = 0.86;
const FLOOR_FRICTION = 0.55;
const BIN_FRICTION = 0.92;

/** Thickness of the invisible bounding shells. Only the inner face matters. */
const SHELL = 1.5;

/** Height of a bin's camera-facing lip, as a fraction of the bin height. */
export const FRONT_LIP = 0.55;

export interface ArenaLayout {
  colliders: Box[];
  bins: BinVolume[];
}

export function buildArena(): ArenaLayout {
  const { halfWidth, halfDepth, floorY } = ARENA;
  const colliders: Box[] = [];

  // Floor — extends past the slab so a garment sliding into a corner still
  // finds ground under it.
  colliders.push(
    box(
      -halfWidth - SHELL,
      floorY - SHELL,
      -halfDepth - SHELL,
      halfWidth + SHELL,
      floorY,
      halfDepth + SHELL,
      FLOOR_FRICTION,
    ),
  );

  // Side walls.
  colliders.push(
    box(
      -halfWidth - SHELL,
      floorY - SHELL,
      -halfDepth - SHELL,
      -halfWidth,
      20,
      halfDepth + SHELL,
      WALL_FRICTION,
    ),
    box(
      halfWidth,
      floorY - SHELL,
      -halfDepth - SHELL,
      halfWidth + SHELL,
      20,
      halfDepth + SHELL,
      WALL_FRICTION,
    ),
  );

  // Back wall, and the invisible front pane that keeps the slab shallow. The
  // pane is what makes a 2D pointer an unambiguous 3D control.
  colliders.push(
    box(
      -halfWidth - SHELL,
      floorY - SHELL,
      -halfDepth - SHELL,
      halfWidth + SHELL,
      20,
      -halfDepth,
      WALL_FRICTION,
    ),
    box(
      -halfWidth - SHELL,
      floorY - SHELL,
      halfDepth,
      halfWidth + SHELL,
      20,
      halfDepth + SHELL,
      WALL_FRICTION,
    ),
  );

  const bins: BinVolume[] = [];
  const t = BIN.wallThickness;
  const halfOuter = BIN.outerWidth / 2;
  const halfBinDepth = BIN.depth / 2;

  for (let i = 0; i < BIN.count; i++) {
    const cx = binCenterX(i);
    const x0 = cx - halfOuter;
    const x1 = cx + halfOuter;
    const z0 = -halfBinDepth;
    const z1 = halfBinDepth;
    const y1 = floorY + BIN.height;

    // Base, then four walls. Open top — that is the whole game.
    //
    // The camera-facing wall is a low lip rather than a full side, exactly like
    // a real laundry hamper: it lets the player watch the pile build up inside
    // instead of staring at a colour-coded box, and it makes an overstuffed bin
    // legible at a glance. The collider is the lip, not the full height, so
    // what you can see over you can also spill over.
    colliders.push(box(x0, floorY, z0, x1, floorY + t, z1, BIN_FRICTION));
    colliders.push(box(x0, floorY, z0, x0 + t, y1, z1, BIN_FRICTION));
    colliders.push(box(x1 - t, floorY, z0, x1, y1, z1, BIN_FRICTION));
    colliders.push(box(x0, floorY, z0, x1, y1, z0 + t, BIN_FRICTION));
    colliders.push(box(x0, floorY, z1 - t, x1, floorY + BIN.height * FRONT_LIP, z1, BIN_FRICTION));

    bins.push({
      index: i,
      colorId: WASH_COLORS[i].id,
      centerX: cx,
      rimY: y1,
      interior: box(x0 + t, floorY + t, z0 + t, x1 - t, y1, z1 - t, BIN_FRICTION),
    });
  }

  return { colliders, bins };
}

/** Is a point inside a box, optionally expanded by `pad` on every axis? */
export function pointInBox(b: Box, x: number, y: number, z: number, pad = 0): boolean {
  return (
    x >= b.minX - pad &&
    x <= b.maxX + pad &&
    y >= b.minY - pad &&
    y <= b.maxY + pad &&
    z >= b.minZ - pad &&
    z <= b.maxZ + pad
  );
}
