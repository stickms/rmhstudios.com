// =============================================================================
// ALTAIR ENGINE -- Multiplayer Threat & Aggro System
// =============================================================================
// Recalculates threat scores every 30 seconds based on damage dealt.
// Used by wave director for spawn distribution and boss targeting.
// =============================================================================

import { MultiplayerGameWorld } from '../types';

/**
 * Recalculate threat scores for all alive players.
 * Called every 30 seconds by the multiplayer loop.
 *
 * Threat = normalized damage dealt (0-1 scale).
 * The highest damage dealer gets threat 1.0, others proportionally less.
 */
export function updateThreatScores(world: MultiplayerGameWorld): void {
  let maxDamage = 0;

  for (const player of world.players.values()) {
    if (player.isDead || player.isSpectating) {
      player.threatScore = 0;
      continue;
    }
    if (player.damageDealt > maxDamage) {
      maxDamage = player.damageDealt;
    }
  }

  // Normalize threats
  for (const player of world.players.values()) {
    if (player.isDead || player.isSpectating) continue;
    player.threatScore = maxDamage > 0 ? player.damageDealt / maxDamage : 1 / world.playerCount;
  }

  // Reset damage accumulators for next cycle
  for (const player of world.players.values()) {
    player.damageDealt = 0;
  }
}

/**
 * Record damage dealt by a player (called during collision processing).
 */
export function recordDamage(world: MultiplayerGameWorld, playerId: string, amount: number): void {
  const player = world.players.get(playerId);
  if (player) {
    player.damageDealt += amount;
  }
}
