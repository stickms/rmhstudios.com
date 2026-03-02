// =============================================================================
// ALTAIR ENGINE -- Boss Multiplayer Adjustments
// =============================================================================
// Wraps boss targeting and ability spawning with per-boss multiplayer rules
// from the multiplayer design doc §9.
// =============================================================================

import {
  MultiplayerGameWorld,
  MultiplayerPlayerEntity,
  EnemyEntity,
} from '../types';
import { BOSS_MULTIPLAYER_CONFIG } from '../../data/multiplayer-scaling';
import { getAlivePlayers, getNearestPlayer, getHighestThreatPlayer } from './player-helpers';

/**
 * Get the boss primary target using aggro rules:
 * - Most damage in last 5s (approximated by threat score)
 * - If target > 500px away, switch to nearest
 */
export function getBossPrimaryTarget(
  world: MultiplayerGameWorld,
  boss: EnemyEntity,
): MultiplayerPlayerEntity | null {
  const highest = getHighestThreatPlayer(world);
  if (!highest) return null;

  // Check if highest threat is too far
  const dx = highest.x - boss.x;
  const dy = highest.y - boss.y;
  if (dx * dx + dy * dy > 500 * 500) {
    return getNearestPlayer(world, boss.x, boss.y);
  }

  return highest;
}

/**
 * Get targets for multi-target abilities (e.g., bone spikes at each player).
 */
export function getAllTargets(
  world: MultiplayerGameWorld,
): MultiplayerPlayerEntity[] {
  return getAlivePlayers(world);
}

/**
 * Get round-robin target for abilities like Blood Lance.
 * Uses world.time to cycle through players deterministically.
 */
export function getRoundRobinTarget(
  world: MultiplayerGameWorld,
  volleyIndex: number,
): MultiplayerPlayerEntity | null {
  const alive = getAlivePlayers(world);
  if (alive.length === 0) return null;
  return alive[volleyIndex % alive.length];
}

/**
 * Get the farthest player from a position (for Death March targeting).
 */
export function getFarthestPlayer(
  world: MultiplayerGameWorld,
  x: number,
  y: number,
): MultiplayerPlayerEntity | null {
  let farthest: MultiplayerPlayerEntity | null = null;
  let farthestDist = -1;

  for (const p of world.players.values()) {
    if (p.isDowned || p.isDead || p.isSpectating) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const dist = dx * dx + dy * dy;
    if (dist > farthestDist) {
      farthestDist = dist;
      farthest = p;
    }
  }
  return farthest;
}

/**
 * Get the centroid of all alive players (for Terminus Death Spiral).
 */
export function getPlayerCentroid(
  world: MultiplayerGameWorld,
): { x: number; y: number } {
  const alive = getAlivePlayers(world);
  if (alive.length === 0) return { x: 0, y: 0 };

  let cx = 0, cy = 0;
  for (const p of alive) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / alive.length, y: cy / alive.length };
}

/**
 * Calculate Terminus consume pull force, scaled by player count.
 * Force = 120 / sqrt(playerCount)
 */
export function getConsumePullForce(playerCount: number): number {
  return BOSS_MULTIPLAYER_CONFIG.terminus.consumePullForceBase / Math.sqrt(playerCount);
}

/**
 * Get number of void zones for Terminus Phase 2.
 * Zones = 3 × playerCount (max 12)
 */
export function getVoidZoneCount(playerCount: number): number {
  return Math.min(12, BOSS_MULTIPLAYER_CONFIG.terminus.voidZonesBase * playerCount);
}

/**
 * Get boss minion spawn count, multiplied by player count.
 */
export function getScaledMinionCount(baseCount: number, playerCount: number): number {
  return baseCount * playerCount;
}

/**
 * Get Crimson Countess blood shield regen rate, scaled by players.
 */
export function getBloodShieldRegenRate(phase: number, playerCount: number): number {
  const config = BOSS_MULTIPLAYER_CONFIG.crimson_countess;
  const base = phase >= 2 ? config.shieldRegenPhase2 : config.shieldRegenBase;
  return base * playerCount;
}

/**
 * Get Elder Lich phylactery HP, scaled by players.
 */
export function getPhylacteryHp(playerCount: number): number {
  return BOSS_MULTIPLAYER_CONFIG.elder_lich.phylacteryHpBase * playerCount;
}

/**
 * Get Terminus amalgamation spawn interval, faster with more players.
 * Interval = 8 / playerCount (min 2 seconds)
 */
export function getAmalgamationInterval(playerCount: number): number {
  return Math.max(2, BOSS_MULTIPLAYER_CONFIG.terminus.amalgamationIntervalBase / playerCount);
}
