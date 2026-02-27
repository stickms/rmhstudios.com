// =============================================================================
// ALTAIR ENGINE -- Multiplayer Dynamic Difficulty Scaling
// =============================================================================
// Smoothly interpolates scaling multipliers when players join, leave, die,
// or get revived. Applied to wave director budget, enemy HP/damage at spawn.
// =============================================================================

import { ScalingState } from '../types';
import {
  getEnemyHpMultiplier,
  getEnemyDamageMultiplier,
  getSpawnBudgetMultiplier,
  getBossHpMultiplier,
  getMaxEnemies,
  getCoinDropRate,
  SCALING_DECREASE_DURATION,
  SCALING_INCREASE_DURATION,
} from '../../data/multiplayer-scaling';

/**
 * Create the initial scaling state for a given player count.
 */
export function createScalingState(playerCount: number): ScalingState {
  return {
    targetPlayerCount: playerCount,
    currentPlayerCount: playerCount,
    transitionTimer: 0,
    transitionDuration: 0,
    hpMultiplier: getEnemyHpMultiplier(playerCount),
    damageMultiplier: getEnemyDamageMultiplier(playerCount),
    spawnBudgetMultiplier: getSpawnBudgetMultiplier(playerCount),
    bossHpMultiplier: getBossHpMultiplier(playerCount),
    maxEnemies: getMaxEnemies(playerCount),
    coinDropRate: getCoinDropRate(playerCount),
  };
}

/**
 * Set a new target player count, starting a smooth transition.
 */
export function setScalingTarget(
  state: ScalingState,
  newPlayerCount: number,
): void {
  if (newPlayerCount === state.targetPlayerCount) return;

  const isDecreasing = newPlayerCount < state.targetPlayerCount;
  state.targetPlayerCount = newPlayerCount;
  state.transitionDuration = isDecreasing ? SCALING_DECREASE_DURATION : SCALING_INCREASE_DURATION;
  state.transitionTimer = state.transitionDuration;
}

/**
 * Update scaling state each frame. Smoothly lerps current values toward target.
 */
export function updateScaling(state: ScalingState, delta: number): void {
  if (state.transitionTimer <= 0) return;

  state.transitionTimer -= delta;
  if (state.transitionTimer < 0) state.transitionTimer = 0;

  // Calculate interpolation progress (0 = just started, 1 = done)
  const t = state.transitionDuration > 0
    ? 1 - state.transitionTimer / state.transitionDuration
    : 1;

  // Lerp currentPlayerCount toward target
  const prevCount = state.currentPlayerCount;
  state.currentPlayerCount = prevCount + (state.targetPlayerCount - prevCount) * Math.min(1, delta / Math.max(0.001, state.transitionTimer + delta));

  // Recalculate multipliers from interpolated count
  const n = state.currentPlayerCount;
  state.hpMultiplier = getEnemyHpMultiplier(n);
  state.damageMultiplier = getEnemyDamageMultiplier(n);
  state.spawnBudgetMultiplier = getSpawnBudgetMultiplier(n);
  state.bossHpMultiplier = getBossHpMultiplier(n);
  state.maxEnemies = getMaxEnemies(Math.round(n));
  state.coinDropRate = getCoinDropRate(Math.round(n));

  // Snap to target when transition complete
  if (state.transitionTimer <= 0) {
    state.currentPlayerCount = state.targetPlayerCount;
    state.hpMultiplier = getEnemyHpMultiplier(state.targetPlayerCount);
    state.damageMultiplier = getEnemyDamageMultiplier(state.targetPlayerCount);
    state.spawnBudgetMultiplier = getSpawnBudgetMultiplier(state.targetPlayerCount);
    state.bossHpMultiplier = getBossHpMultiplier(state.targetPlayerCount);
    state.maxEnemies = getMaxEnemies(state.targetPlayerCount);
    state.coinDropRate = getCoinDropRate(state.targetPlayerCount);
  }
}
