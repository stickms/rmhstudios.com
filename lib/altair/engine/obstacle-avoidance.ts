// =============================================================================
// ALTAIR ENGINE -- Obstacle Avoidance (Steering-Based)
// =============================================================================
// Potential-field repulsion for enemies to steer around destructible props.
// Uses spatial hash queries to find nearby obstacles and blends repulsion
// forces with the desired velocity to produce smooth avoidance.
// Uses AABB prop hitboxes for accurate distance calculation.
// =============================================================================

import { DestructibleProp, PROP_COLLISION_OFFSET_Y } from './tile-generator';
import { SpatialHash } from './spatial-hash';

const LOOK_AHEAD = 60; // px ahead to scan for obstacles
const REPULSION_STRENGTH = 80000; // inverse-square repulsion constant
const MIN_DISTANCE = 8; // clamp minimum distance to avoid division explosion

/**
 * Apply obstacle avoidance to a desired velocity vector.
 * Returns the adjusted (vx, vy) that steers around nearby props.
 */
export function avoidObstacles(
  x: number,
  y: number,
  radius: number,
  desiredVx: number,
  desiredVy: number,
  speed: number,
  propHash: SpatialHash,
): { vx: number; vy: number } {
  // If stationary, nothing to avoid
  if (speed < 0.1) return { vx: desiredVx, vy: desiredVy };

  // Query nearby props (broad-phase uses bounding circle)
  const nearby = propHash.query(x, y, LOOK_AHEAD + radius);
  if (nearby.length === 0) return { vx: desiredVx, vy: desiredVy };

  let repX = 0;
  let repY = 0;

  for (const entity of nearby) {
    const prop = entity as unknown as DestructibleProp;
    const boxCx = prop.x;
    const boxCy = prop.y + PROP_COLLISION_OFFSET_Y;

    // Closest point on AABB to enemy center
    const closestX = Math.max(boxCx - prop.halfW, Math.min(x, boxCx + prop.halfW));
    const closestY = Math.max(boxCy - prop.halfH, Math.min(y, boxCy + prop.halfH));

    const dx = x - closestX;
    const dy = y - closestY;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;

    // Only repel when enemy is moving toward the obstacle (dot product check)
    const toPropX = boxCx - x;
    const toPropY = boxCy - y;
    const dot = desiredVx * toPropX + desiredVy * toPropY;
    if (dot <= 0) continue; // moving away from or parallel to this prop

    // Repulsion force inversely proportional to distance squared
    const force = REPULSION_STRENGTH / (dist * dist);

    // Repulsion direction: away from closest point on AABB
    const nx = dx / dist;
    const ny = dy / dist;

    repX += nx * force;
    repY += ny * force;
  }

  // Blend repulsion with desired velocity
  let outVx = desiredVx + repX;
  let outVy = desiredVy + repY;

  // Re-normalize to preserve original speed
  const outSpeed = Math.sqrt(outVx * outVx + outVy * outVy);
  if (outSpeed > 0.1) {
    outVx = (outVx / outSpeed) * speed;
    outVy = (outVy / outSpeed) * speed;
  }

  return { vx: outVx, vy: outVy };
}
