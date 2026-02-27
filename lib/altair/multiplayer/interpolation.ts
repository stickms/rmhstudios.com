// =============================================================================
// ALTAIR MULTIPLAYER -- State Interpolation System
// =============================================================================
// Buffers snapshots from the host and interpolates between them for smooth
// remote entity rendering. Uses a 100ms (2 tick) buffer.
// =============================================================================

import type { GameStateSnapshot, PlayerStateSnapshot, EnemyStateSnapshot } from './types';

const INTERPOLATION_BUFFER_MS = 100;
const MAX_BUFFER_SIZE = 5;

export interface InterpolationBuffer {
  snapshots: GameStateSnapshot[];
  renderTime: number;
}

export function createInterpolationBuffer(): InterpolationBuffer {
  return {
    snapshots: [],
    renderTime: 0,
  };
}

/**
 * Add a new snapshot to the buffer.
 */
export function pushSnapshot(
  buffer: InterpolationBuffer,
  snapshot: GameStateSnapshot,
): void {
  buffer.snapshots.push(snapshot);

  // Keep buffer trimmed
  if (buffer.snapshots.length > MAX_BUFFER_SIZE) {
    buffer.snapshots.shift();
  }
}

/**
 * Get interpolated state for the current render time.
 * Returns the interpolated snapshot or the latest available.
 */
export function getInterpolatedState(
  buffer: InterpolationBuffer,
  currentTime: number,
): GameStateSnapshot | null {
  if (buffer.snapshots.length === 0) return null;

  // Target render time is currentTime - buffer delay
  const renderTime = currentTime - INTERPOLATION_BUFFER_MS;

  // Find the two snapshots to interpolate between
  let before: GameStateSnapshot | null = null;
  let after: GameStateSnapshot | null = null;

  for (let i = 0; i < buffer.snapshots.length - 1; i++) {
    if (
      buffer.snapshots[i].timestamp <= renderTime &&
      buffer.snapshots[i + 1].timestamp >= renderTime
    ) {
      before = buffer.snapshots[i];
      after = buffer.snapshots[i + 1];
      break;
    }
  }

  // If no bracketing pair found, use latest
  if (!before || !after) {
    return buffer.snapshots[buffer.snapshots.length - 1];
  }

  // Calculate interpolation factor
  const range = after.timestamp - before.timestamp;
  const t = range > 0 ? (renderTime - before.timestamp) / range : 0;

  return interpolateSnapshots(before, after, t);
}

/**
 * Linearly interpolate between two snapshots.
 */
function interpolateSnapshots(
  a: GameStateSnapshot,
  b: GameStateSnapshot,
  t: number,
): GameStateSnapshot {
  const clampT = Math.max(0, Math.min(1, t));

  return {
    tick: b.tick,
    time: lerp(a.time, b.time, clampT),
    timestamp: lerp(a.timestamp, b.timestamp, clampT),
    players: interpolatePlayers(a.players, b.players, clampT),
    enemies: interpolateEnemies(a.enemies, b.enemies, clampT),
    projectiles: b.projectiles, // Projectiles don't interpolate well — use latest
    pickups: b.pickups, // Same for pickups
    bossActive: b.bossActive,
    bossWarning: b.bossWarning,
    sharedKills: b.sharedKills,
  };
}

function interpolatePlayers(
  a: PlayerStateSnapshot[],
  b: PlayerStateSnapshot[],
  t: number,
): PlayerStateSnapshot[] {
  return b.map((bp) => {
    const ap = a.find((p) => p.playerId === bp.playerId);
    if (!ap) return bp;

    return {
      ...bp,
      x: lerp(ap.x, bp.x, t),
      y: lerp(ap.y, bp.y, t),
      hp: lerp(ap.hp, bp.hp, t),
      facingX: lerp(ap.facingX, bp.facingX, t),
      facingY: lerp(ap.facingY, bp.facingY, t),
      downTimer: lerp(ap.downTimer, bp.downTimer, t),
      revivalProgress: lerp(ap.revivalProgress, bp.revivalProgress, t),
    };
  });
}

function interpolateEnemies(
  a: EnemyStateSnapshot[],
  b: EnemyStateSnapshot[],
  t: number,
): EnemyStateSnapshot[] {
  return b.map((be) => {
    const ae = a.find((e) => e.id === be.id);
    if (!ae) return be;

    return {
      ...be,
      x: lerp(ae.x, be.x, t),
      y: lerp(ae.y, be.y, t),
      hp: lerp(ae.hp, be.hp, t),
    };
  });
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
