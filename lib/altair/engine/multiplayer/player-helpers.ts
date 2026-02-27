// =============================================================================
// ALTAIR ENGINE -- Multiplayer Player Resolution Helpers
// =============================================================================
// Functions for resolving which player an enemy should target, finding alive
// players, calculating distances, etc. Used by enemy-system, wave-director,
// boss-system, and pickup-system when isMultiplayer is true.
// =============================================================================

import {
  MultiplayerPlayerEntity,
  MultiplayerGameWorld,
  EnemyEntity,
} from '../types';

/**
 * Get all alive (non-downed, non-dead, non-spectating) players.
 */
export function getAlivePlayers(world: MultiplayerGameWorld): MultiplayerPlayerEntity[] {
  const alive: MultiplayerPlayerEntity[] = [];
  for (const p of world.players.values()) {
    if (!p.isDowned && !p.isDead && !p.isSpectating) {
      alive.push(p);
    }
  }
  return alive;
}

/**
 * Get the nearest alive player to a given world position.
 * Returns null if no alive players exist.
 */
export function getNearestPlayer(
  world: MultiplayerGameWorld,
  x: number,
  y: number,
): MultiplayerPlayerEntity | null {
  let nearest: MultiplayerPlayerEntity | null = null;
  let nearestDist = Infinity;

  for (const p of world.players.values()) {
    if (p.isDowned || p.isDead || p.isSpectating) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const dist = dx * dx + dy * dy; // squared for perf
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = p;
    }
  }
  return nearest;
}

/**
 * Get the player with the highest threat score (most damage dealt recently).
 * Falls back to nearest player if all threats are 0.
 */
export function getHighestThreatPlayer(
  world: MultiplayerGameWorld,
): MultiplayerPlayerEntity | null {
  let highest: MultiplayerPlayerEntity | null = null;
  let highestThreat = -1;

  for (const p of world.players.values()) {
    if (p.isDowned || p.isDead || p.isSpectating) continue;
    if (p.threatScore > highestThreat) {
      highestThreat = p.threatScore;
      highest = p;
    }
  }
  return highest;
}

/**
 * Get the player with the lowest DPS (for witch targeting).
 */
export function getLowestDpsPlayer(
  world: MultiplayerGameWorld,
): MultiplayerPlayerEntity | null {
  let lowest: MultiplayerPlayerEntity | null = null;
  let lowestThreat = Infinity;

  for (const p of world.players.values()) {
    if (p.isDowned || p.isDead || p.isSpectating) continue;
    if (p.threatScore < lowestThreat) {
      lowestThreat = p.threatScore;
      lowest = p;
    }
  }
  return lowest;
}

/**
 * Get the player who has been stationary the longest (for shadow targeting).
 */
export function getMostStationaryPlayer(
  world: MultiplayerGameWorld,
): MultiplayerPlayerEntity | null {
  let most: MultiplayerPlayerEntity | null = null;
  let oldestInput = Infinity;

  for (const p of world.players.values()) {
    if (p.isDowned || p.isDead || p.isSpectating) continue;
    // Lower lastInputTime = more stationary
    if (p.lastInputTime < oldestInput) {
      oldestInput = p.lastInputTime;
      most = p;
    }
  }
  return most;
}

/**
 * Distance from enemy to nearest alive player. Returns { dx, dy, dist }.
 * Falls back to world.player if no alive multiplayer players.
 */
export function distToNearestPlayer(
  enemy: EnemyEntity,
  world: MultiplayerGameWorld,
): { dx: number; dy: number; dist: number } {
  const nearest = getNearestPlayer(world, enemy.x, enemy.y);
  if (!nearest) {
    // Fallback to world.player (solo compat or all dead)
    const dx = world.player.x - enemy.x;
    const dy = world.player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx, dy, dist };
  }
  const dx = nearest.x - enemy.x;
  const dy = nearest.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return { dx, dy, dist };
}

/**
 * Move enemy toward the nearest alive player at a given speed.
 */
export function moveTowardNearestPlayer(
  enemy: EnemyEntity,
  world: MultiplayerGameWorld,
  delta: number,
  speed: number,
): void {
  const { dx, dy, dist } = distToNearestPlayer(enemy, world);
  const vx = (dx / dist) * speed;
  const vy = (dy / dist) * speed;
  enemy.x += vx * delta;
  enemy.y += vy * delta;
  enemy.lastMoveVx = vx;
  enemy.lastMoveVy = vy;
}

/**
 * Maintain a preferred distance from the nearest alive player.
 */
export function maintainRangeFromNearestPlayer(
  enemy: EnemyEntity,
  world: MultiplayerGameWorld,
  delta: number,
  preferredRange: number,
  speed: number,
): void {
  const { dx, dy, dist } = distToNearestPlayer(enemy, world);
  const margin = 20;
  let vx = 0;
  let vy = 0;
  if (dist < preferredRange - margin) {
    vx = -(dx / dist) * speed;
    vy = -(dy / dist) * speed;
  } else if (dist > preferredRange + margin) {
    vx = (dx / dist) * speed;
    vy = (dy / dist) * speed;
  }
  enemy.x += vx * delta;
  enemy.y += vy * delta;
  if (vx !== 0 || vy !== 0) {
    enemy.lastMoveVx = vx;
    enemy.lastMoveVy = vy;
  }
}

/**
 * Get the spawn position for an enemy, targeting a specific player
 * within 600-900px off-screen distance.
 */
export function getSpawnPositionAroundPlayer(
  player: MultiplayerPlayerEntity,
): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = 600 + Math.random() * 300;
  return {
    x: player.x + Math.cos(angle) * dist,
    y: player.y + Math.sin(angle) * dist,
  };
}

/**
 * Get the position equidistant from all alive players (for banshee spawning).
 */
export function getEquidistantPosition(
  world: MultiplayerGameWorld,
): { x: number; y: number } {
  const alive = getAlivePlayers(world);
  if (alive.length === 0) return { x: world.player.x, y: world.player.y };

  // Centroid of all alive players
  let cx = 0, cy = 0;
  for (const p of alive) {
    cx += p.x;
    cy += p.y;
  }
  cx /= alive.length;
  cy /= alive.length;

  // Spawn at centroid offset by 600-900px
  const angle = Math.random() * Math.PI * 2;
  const dist = 600 + Math.random() * 300;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
  };
}
