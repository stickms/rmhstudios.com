// Collision detection functions for Dream Rift bullet hell
// All use squared distance comparisons (no sqrt for performance)

/**
 * Circle vs Circle collision.
 * Used for bullet-player (tiny 2px hitbox), bullet-enemy, and item pickup.
 */
export function circleCircle(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const radii = r1 + r2;
  return dx * dx + dy * dy <= radii * radii;
}

/**
 * Point in Rectangle check.
 * Used for boundary checks and simple containment tests.
 */
export function pointInRect(
  px: number, py: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Circle vs Rectangle collision.
 * Clamps circle center to nearest point on rect, then checks distance.
 * Used for playfield boundary collisions and rectangular hitboxes.
 */
export function circleRect(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  // Find the closest point on the rectangle to the circle center
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));

  const dx = cx - closestX;
  const dy = cy - closestY;

  return dx * dx + dy * dy <= cr * cr;
}
