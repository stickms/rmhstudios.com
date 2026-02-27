// =============================================================================
// ALTAIR ENGINE -- Multiplayer AFK Detection
// =============================================================================
// Flags players as AFK after 30s of no input, auto-disconnects at 60s.
// =============================================================================

import { MultiplayerGameWorld } from '../types';
import { AFK } from '../../data/multiplayer-scaling';
import type { MultiplayerCallbacks } from './multiplayer-loop';

/**
 * Update AFK detection for all players. Called with real-time delta.
 */
export function updateAfkDetection(
  world: MultiplayerGameWorld,
  realDelta: number,
  callbacks: MultiplayerCallbacks,
): void {
  const currentTime = world.time;

  for (const player of world.players.values()) {
    if (player.isDead || player.isSpectating || player.isDowned) continue;

    // Check if player has recent input
    const idleTime = currentTime - player.lastInputTime;

    if (idleTime >= AFK.DISCONNECT_TIME && !player.isAfk) {
      // Auto-disconnect
      player.isAfk = true;
      callbacks.onAfkKick(player.playerId);
    } else if (idleTime >= AFK.FLAG_TIME && !player.isAfk) {
      // Flag as AFK
      player.isAfk = true;
      callbacks.onAfkWarning(player.playerId);
    }

    // Un-flag if they moved
    if (player.isAfk && idleTime < AFK.FLAG_TIME) {
      player.isAfk = false;
    }
  }
}

/**
 * Record that a player provided input (called from input handler).
 */
export function recordPlayerInput(
  world: MultiplayerGameWorld,
  playerId: string,
): void {
  const player = world.players.get(playerId);
  if (player) {
    player.lastInputTime = world.time;
    if (player.isAfk) {
      player.isAfk = false;
    }
  }
}
