/**
 * Pixel Pushers — Physics Utilities
 *
 * Extracted physics primitives for testability and modularity.
 * Provides circle-circle collision, circle-AABB collision,
 * vector math, and wall collision resolution.
 *
 * Reference: docs/rmhbox/implementation/phase-8.md §8.3.7
 */

// ─── Types ───────────────────────────────────────────────────────

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollisionResult {
  normal: { x: number; y: number };
  overlap: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Vector Utilities ────────────────────────────────────────────

/** Return the magnitude of a 2D vector. */
export function magnitude(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Normalize a 2D vector. Returns {0,0} if the magnitude is 0. */
export function normalizeVector(v: Vec2): Vec2 {
  const mag = magnitude(v);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

/** Clamp a vector's magnitude to a maximum value. */
export function clampMagnitude(v: Vec2, max: number): Vec2 {
  const mag = magnitude(v);
  if (mag <= max) return { x: v.x, y: v.y };
  const scale = max / mag;
  return { x: v.x * scale, y: v.y * scale };
}

// ─── Collision Detection ─────────────────────────────────────────

/**
 * Circle-Circle collision test.
 * Returns collision normal (from c1 to c2) and overlap, or null if no collision.
 */
export function circleCircleCollision(c1: Circle, c2: Circle): CollisionResult | null {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = c1.radius + c2.radius;

  if (dist >= minDist) return null;

  const overlap = minDist - dist;
  // Normal from c1 toward c2
  if (dist === 0) {
    // Perfectly overlapping — use arbitrary normal
    return { normal: { x: 1, y: 0 }, overlap };
  }
  return {
    normal: { x: dx / dist, y: dy / dist },
    overlap,
  };
}

/**
 * Circle-AABB collision test.
 * Returns collision normal (pointing away from AABB toward circle center) and overlap, or null.
 */
export function circleAABBCollision(circle: Circle, rect: AABB): CollisionResult | null {
  // Find the closest point on the AABB to the circle center
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= circle.radius * circle.radius) return null;

  const dist = Math.sqrt(distSq);
  const overlap = circle.radius - dist;

  if (dist === 0) {
    // Circle center is inside AABB — determine which face is closest
    const left = circle.x - rect.x;
    const right = rect.x + rect.width - circle.x;
    const top = circle.y - rect.y;
    const bottom = rect.y + rect.height - circle.y;
    const minDist = Math.min(left, right, top, bottom);

    if (minDist === left) return { normal: { x: -1, y: 0 }, overlap: left + circle.radius };
    if (minDist === right) return { normal: { x: 1, y: 0 }, overlap: right + circle.radius };
    if (minDist === top) return { normal: { x: 0, y: -1 }, overlap: top + circle.radius };
    return { normal: { x: 0, y: 1 }, overlap: bottom + circle.radius };
  }

  return {
    normal: { x: dx / dist, y: dy / dist },
    overlap,
  };
}

/**
 * Test whether a point is inside an AABB.
 */
export function pointInAABB(point: Vec2, rect: AABB): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

// ─── Collision Resolution ────────────────────────────────────────

/**
 * Resolve a circle-wall collision: push circle out and reflect velocity.
 * Returns the corrected position and velocity.
 */
export function resolveCircleWallCollision(
  circle: Circle,
  velocity: { vx: number; vy: number },
  wall: AABB,
  restitution: number,
): { position: Vec2; velocity: { vx: number; vy: number } } {
  const collision = circleAABBCollision(circle, wall);
  if (!collision) {
    return { position: { x: circle.x, y: circle.y }, velocity: { vx: velocity.vx, vy: velocity.vy } };
  }

  const { normal, overlap } = collision;

  // Push circle out of wall along collision normal
  const newPos = {
    x: circle.x + normal.x * overlap,
    y: circle.y + normal.y * overlap,
  };

  // Reflect velocity component perpendicular to collision face
  const dot = velocity.vx * normal.x + velocity.vy * normal.y;
  const newVel = {
    vx: velocity.vx - (1 + restitution) * dot * normal.x,
    vy: velocity.vy - (1 + restitution) * dot * normal.y,
  };

  return { position: newPos, velocity: newVel };
}
