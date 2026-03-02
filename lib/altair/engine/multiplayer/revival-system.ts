// =============================================================================
// ALTAIR ENGINE -- Multiplayer Revival System
// =============================================================================
// Manages downed state, teammate revival by proximity, permanent death,
// and spectator transitions.
// =============================================================================

import { MultiplayerGameWorld, MultiplayerPlayerEntity } from '../types';
import { REVIVAL } from '../../data/multiplayer-scaling';
import { getAlivePlayers } from './player-helpers';
import type { MultiplayerCallbacks } from './multiplayer-loop';

/**
 * Update the revival system for all players each frame.
 * Called with real-time delta (not scaled).
 */
export function updateRevivalSystem(
  world: MultiplayerGameWorld,
  realDelta: number,
  callbacks: MultiplayerCallbacks,
): void {
  const downTimer = world.timeScale >= 2.0 ? REVIVAL.DOWN_TIMER_DOUBLE_TIME : REVIVAL.DOWN_TIMER;

  for (const player of world.players.values()) {
    // Skip dead, spectating, or alive players
    if (player.isDead || player.isSpectating) continue;

    // Check if a non-downed player should become downed
    if (!player.isDowned && player.hp <= 0) {
      player.isDowned = true;
      player.downTimer = downTimer;
      player.revivalProgress = 0;
      player.reviverId = null;
      callbacks.onPlayerDowned(player.playerId);
      continue;
    }

    // Process downed players
    if (!player.isDowned) continue;

    // Count down the downed timer
    player.downTimer -= realDelta;

    // Check if any alive player is within revival range
    const alive = getAlivePlayers(world);
    let beingRevived = false;

    for (const reviver of alive) {
      if (reviver.playerId === player.playerId) continue;

      const dx = reviver.x - player.x;
      const dy = reviver.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= REVIVAL.CHANNEL_RANGE) {
        // Reviver is in range — fill progress
        beingRevived = true;
        player.reviverId = reviver.playerId;
        player.revivalProgress += realDelta / REVIVAL.CHANNEL_DURATION;

        if (player.revivalProgress >= 1) {
          // Revival complete
          player.isDowned = false;
          player.hp = Math.floor(player.maxHp * REVIVAL.RESTORE_HP_PERCENT);
          player.invulnTimer = REVIVAL.INVULN_DURATION;
          player.revivalProgress = 0;
          player.reviverId = null;
          player.downTimer = 0;

          // Grant "Heroic Rescue" buff to the reviver
          reviver.mightBuff = REVIVAL.HEROIC_RESCUE_DURATION;
          reviver.mightBuffAmount = REVIVAL.HEROIC_RESCUE_MIGHT;

          callbacks.onPlayerRevived(player.playerId, reviver.playerId);
        }
        break; // Only one reviver at a time
      }
    }

    // If no one is in range, reset progress
    if (!beingRevived) {
      player.revivalProgress = 0;
      player.reviverId = null;
    }

    // Check for permanent death
    if (player.downTimer <= 0 && player.isDowned) {
      player.isDowned = false;
      player.isDead = true;
      player.isSpectating = true;
      callbacks.onPlayerDead(player.playerId);
    }
  }
}
