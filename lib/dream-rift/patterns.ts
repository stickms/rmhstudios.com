import type { BulletPatternDef, DifficultyMultipliers } from './types';

export interface SpawnedBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sprite: string;
}

/**
 * Spawn bullets in a radial (circular / fan) pattern.
 *
 * Distributes `count` bullets evenly across a `spread`-degree arc
 * starting from `angle` degrees.  When spread is 360 the last bullet
 * overlaps the first, so we divide by count (not count-1) to keep
 * even spacing around the full circle.
 */
export function spawnRadial(
  originX: number,
  originY: number,
  pattern: BulletPatternDef,
): SpawnedBullet[] {
  const { count, speed, angle, spread, bulletSprite } = pattern;
  const bullets: SpawnedBullet[] = [];

  const startRad = (angle * Math.PI) / 180;
  const spreadRad = (spread * Math.PI) / 180;

  // For a full circle (360) we want even spacing without doubling the
  // start/end position, so step = spreadRad / count.
  // For a partial arc the same formula works because the spec treats
  // spread as the total arc covered and count as how many bullets fill it.
  const step = count > 1 ? spreadRad / count : 0;

  for (let i = 0; i < count; i++) {
    const theta = startRad + step * i;
    bullets.push({
      x: originX,
      y: originY,
      vx: Math.cos(theta) * speed,
      vy: Math.sin(theta) * speed,
      sprite: bulletSprite,
    });
  }

  return bullets;
}

/**
 * Spawn bullets aimed at a target position.
 *
 * Calculates the angle from (originX, originY) to (targetX, targetY)
 * with atan2, then spreads `count` bullets around that angle across
 * the given `spread` arc.
 */
export function spawnAimed(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  pattern: BulletPatternDef,
): SpawnedBullet[] {
  const { count, speed, spread, bulletSprite } = pattern;
  const bullets: SpawnedBullet[] = [];

  const baseAngle = Math.atan2(targetY - originY, targetX - originX);
  const spreadRad = (spread * Math.PI) / 180;

  // Centre the spread arc around the aim angle.
  const halfSpread = spreadRad / 2;
  const step = count > 1 ? spreadRad / (count - 1) : 0;
  const startAngle = count > 1 ? baseAngle - halfSpread : baseAngle;

  for (let i = 0; i < count; i++) {
    const theta = startAngle + step * i;
    bullets.push({
      x: originX,
      y: originY,
      vx: Math.cos(theta) * speed,
      vy: Math.sin(theta) * speed,
      sprite: bulletSprite,
    });
  }

  return bullets;
}

/**
 * Return a new pattern definition with count and speed scaled by the
 * given difficulty multipliers.  The original pattern is not mutated.
 */
export function applyDifficultyToPattern(
  pattern: BulletPatternDef,
  multipliers: DifficultyMultipliers,
): BulletPatternDef {
  return {
    ...pattern,
    count: Math.round(pattern.count * multipliers.bulletCount),
    speed: pattern.speed * multipliers.bulletSpeed,
  };
}
