// =============================================================================
// ALTAIR ENGINE -- Simulation runtime state
// =============================================================================
// The per-run state createGameLoop used to keep in closure variables. It lives
// in one object so the fixed-step body (sim-step.ts) can be shared by the
// single-player loop and the multiplayer host, and so the host can swap a
// player's slice of it in and out (engine/multiplayer/player-state.ts).
// =============================================================================

import type { GameWorld } from './types';
import type { PlayerStats } from '../stores/game-store';
import { createClassAbilityState, type ClassAbilityState } from './player-system';
import { createWaveDirectorState } from './wave-director';
import type { BossState } from './boss-system';
import { CatalystRuntimeState, createCatalystRuntimeStates } from './catalyst-system';
import { SpatialHash } from './spatial-hash';

export interface GameLoopCallbacks {
  onPlayerDamage: (amount: number, sourceDefId?: string) => void;
  onPlayerHeal: (amount: number) => void;
  onXPGain: (amount: number) => void;
  onCoinGain: (amount: number) => void;
  onKill: (defId: string) => void;
  onEnemySpawns: (defIds: string[]) => void;
  onLevelUp: () => void;
  onBossSpawn: (bossId: string) => void;
  onBossKill: (bossId: string) => void;
  onVictory: () => void;
  onWeaponDisable: (duration: number) => void;
}

export const MAX_PARTICLES = 300;
export const MAX_PROJECTILES = 500;
export const CORPSE_DURATION = 1.5; // seconds to display grayed-out corpse

export interface SimRuntime {
  // ---- player-slot state (swapped per player in multiplayer) ----
  abilityState: ClassAbilityState;
  catalystStates: CatalystRuntimeState[];
  effectiveStats: PlayerStats | null;
  /**
   * Permanent meta-upgrade stat bonuses for this run (keys as in computeEffectiveStats). Absent/empty for
   * multiplayer and the golden-master harness, which play without meta upgrades.
   */
  metaBonuses?: Record<string, number>;
  lastStatsWeaponCount: number;
  lastStatsPassiveCount: number;
  lastStatsCatalystCount: number;
  // ---- shared state ----
  waveState: ReturnType<typeof createWaveDirectorState>;
  bossState: BossState | null;
  propHash: SpatialHash;
  damageablePropHash: SpatialHash;
}

export function createSimRuntime(world: GameWorld): SimRuntime {
  return {
    abilityState: createClassAbilityState(),
    catalystStates: createCatalystRuntimeStates(world.catalysts),
    effectiveStats: null,
    lastStatsWeaponCount: 0,
    lastStatsPassiveCount: 0,
    lastStatsCatalystCount: 0,
    waveState: createWaveDirectorState(),
    bossState: null,
    propHash: new SpatialHash(100),
    damageablePropHash: new SpatialHash(100),
  };
}

/** What loop.start() resets (bossState and the inventory counters deliberately are not). */
export function resetSimRuntimeForStart(rt: SimRuntime, world: GameWorld): void {
  rt.abilityState = createClassAbilityState();
  rt.waveState = createWaveDirectorState();
  rt.catalystStates = createCatalystRuntimeStates(world.catalysts);
  rt.effectiveStats = null;
}
