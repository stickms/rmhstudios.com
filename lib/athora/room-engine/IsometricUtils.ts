/**
 * Athora — Isometric Coordinate Utilities
 *
 * Handles conversion between world grid coordinates and screen pixel coordinates
 * for the 2.5D isometric room view.
 */

export const ISO_TILE_WIDTH = 64;
export const ISO_TILE_HEIGHT = 32;

/** Convert world grid coords → screen pixel coords */
export function worldToScreen(
  wx: number,
  wy: number
): { sx: number; sy: number } {
  return {
    sx: (wx - wy) * (ISO_TILE_WIDTH / 2),
    sy: (wx + wy) * (ISO_TILE_HEIGHT / 2),
  };
}

/** Convert screen pixel coords → world grid coords */
export function screenToWorld(
  sx: number,
  sy: number
): { wx: number; wy: number } {
  return {
    wx:
      (sx / (ISO_TILE_WIDTH / 2) + sy / (ISO_TILE_HEIGHT / 2)) / 2,
    wy:
      (sy / (ISO_TILE_HEIGHT / 2) - sx / (ISO_TILE_WIDTH / 2)) / 2,
  };
}

/** Get depth sort value for rendering order (higher = rendered later = in front) */
export function getDepth(wx: number, wy: number): number {
  return wx + wy;
}

/** Distance between two world positions */
export function worldDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}
