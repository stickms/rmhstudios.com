// =============================================================================
// ALTAIR ENGINE -- Obstacle Avoidance (Tangent Steering + Repulsion)
// =============================================================================
// Combines repulsion to prevent overlap with tangent-based wall sliding to
// properly navigate around obstacles. Uses the enemy's radius to inflate
// AABBs (Minkowski sum) so wider enemies keep proper clearance.
// =============================================================================

import { DestructibleProp, PROP_COLLISION_OFFSET_Y } from './tile-generator';
import { SpatialHash } from './spatial-hash';

const LOOK_AHEAD = 60; // px ahead to scan for obstacles
const REPULSION_STRENGTH = 80000; // inverse-square repulsion constant
const MIN_DISTANCE = 4; // clamp minimum distance to avoid division explosion
const TANGENT_THRESHOLD = 0.7; // if repulsion opposes desired dir this strongly, add tangent

/**
 * Apply obstacle avoidance to a desired velocity vector.
 * Uses inflated AABBs (by enemy radius) for proper clearance, repulsion to
 * prevent overlap, and tangent steering to slide along walls.
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
  // Track the most blocking obstacle for tangent steering
  let closestBlockDist = Infinity;
  let blockNx = 0;
  let blockNy = 0;

  for (const entity of nearby) {
    const prop = entity as unknown as DestructibleProp;
    const boxCx = prop.x;
    const boxCy = prop.y + PROP_COLLISION_OFFSET_Y;

    // Inflate AABB by enemy radius (Minkowski sum) so wider enemies keep clearance
    const expandedHalfW = prop.halfW + radius;
    const expandedHalfH = prop.halfH + radius;

    // Closest point on expanded AABB to enemy center
    const closestX = Math.max(boxCx - expandedHalfW, Math.min(x, boxCx + expandedHalfW));
    const closestY = Math.max(boxCy - expandedHalfH, Math.min(y, boxCy + expandedHalfH));

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

    // Repulsion direction: away from closest point on expanded AABB
    const nx = dx / dist;
    const ny = dy / dist;

    repX += nx * force;
    repY += ny * force;

    // Track the closest blocking obstacle for tangent computation
    if (dist < closestBlockDist) {
      closestBlockDist = dist;
      blockNx = nx;
      blockNy = ny;
    }
  }

  // Blend repulsion with desired velocity
  let outVx = desiredVx + repX;
  let outVy = desiredVy + repY;

  // Check if repulsion is fighting the desired direction (enemy stuck against wall)
  // If so, add tangent steering to slide along the wall
  const repMag = Math.sqrt(repX * repX + repY * repY);
  if (repMag > 0.1 && closestBlockDist < LOOK_AHEAD) {
    // Normalize desired direction
    const dMag = Math.sqrt(desiredVx * desiredVx + desiredVy * desiredVy);
    if (dMag > 0.1) {
      const dNx = desiredVx / dMag;
      const dNy = desiredVy / dMag;

      // How opposed is the repulsion to the desired direction?
      // dot = -1 means perfectly opposed (wall directly ahead)
      const opposeDot = -(dNx * blockNx + dNy * blockNy);

      if (opposeDot > TANGENT_THRESHOLD) {
        // Compute two tangent directions (perpendicular to wall normal)
        const tanAx = -blockNy;
        const tanAy = blockNx;
        const tanBx = blockNy;
        const tanBy = -blockNx;

        // Pick the tangent that aligns better with desired direction
        const dotA = tanAx * desiredVx + tanAy * desiredVy;
        const dotB = tanBx * desiredVx + tanBy * desiredVy;

        const tanX = dotA >= dotB ? tanAx : tanBx;
        const tanY = dotA >= dotB ? tanAy : tanBy;

        // Blend tangent into output: stronger when more opposed and closer
        const tangentStrength = opposeDot * speed * 1.5;
        outVx += tanX * tangentStrength;
        outVy += tanY * tangentStrength;
      }
    }
  }

  // Re-normalize to preserve original speed
  const outSpeed = Math.sqrt(outVx * outVx + outVy * outVy);
  if (outSpeed > 0.1) {
    outVx = (outVx / outSpeed) * speed;
    outVy = (outVy / outSpeed) * speed;
  }

  return { vx: outVx, vy: outVy };
}
