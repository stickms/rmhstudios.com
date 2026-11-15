// =============================================================================
// ALTAIR ENGINE -- Per-player simulation state & context swap
// =============================================================================
// The engine systems are written against ONE player: world.player,
// world.weapons/passives/catalysts, world.inputState, world.classId, plus the
// runtime's ability state, catalyst runtime states and effective stats. The
// multiplayer host keeps one PlayerSim per player and, for each player-owned
// phase of a step (sim-step.ts), points those single slots at that player's
// containers (swapIn), runs the unchanged system code, and writes back anything
// the systems reassigned (swapOut). Nothing here runs in single-player.
// =============================================================================

import type { GameWorld, PlayerEntity, WeaponState, PassiveState, CatalystState, InputState } from '../types';
import type { PlayerStats } from '../../stores/game-store';
import type { ClassAbilityState } from '../player-system';
import { getPositionHistoryAccum, setPositionHistoryAccum, createClassAbilityState } from '../player-system';
import { createCatalystRuntimeStates, type CatalystRuntimeState } from '../catalyst-system';
import type { SimRuntime } from '../sim-runtime';

/** One player's slice of simulation state. */
export interface PlayerSim {
  player: PlayerEntity;
  classId: string;
  weapons: WeaponState[];
  passives: PassiveState[];
  catalysts: CatalystState[];
  inputState: InputState;
  abilityState: ClassAbilityState;
  catalystStates: CatalystRuntimeState[];
  effectiveStats: PlayerStats | null;
  lastStatsWeaponCount: number;
  lastStatsPassiveCount: number;
  lastStatsCatalystCount: number;
  /** player-system's module-level position-history accumulator, per player. */
  positionHistoryAccum: number;
}

/** Fresh slice around an existing player entity. */
export function createPlayerSim(
  player: PlayerEntity,
  classId: string,
  weapons: WeaponState[],
  inputState: InputState,
): PlayerSim {
  return {
    player,
    classId,
    weapons,
    passives: [],
    catalysts: [],
    inputState,
    abilityState: createClassAbilityState(),
    catalystStates: createCatalystRuntimeStates([]),
    effectiveStats: null,
    lastStatsWeaponCount: 0,
    lastStatsPassiveCount: 0,
    lastStatsCatalystCount: 0,
    positionHistoryAccum: 0,
  };
}

/** Point the world's/runtime's single-player slots at `ps`. */
export function swapIn(world: GameWorld, rt: SimRuntime, ps: PlayerSim): void {
  world.player = ps.player;
  world.classId = ps.classId;
  world.weapons = ps.weapons;
  world.passives = ps.passives;
  world.catalysts = ps.catalysts;
  world.inputState = ps.inputState;
  rt.abilityState = ps.abilityState;
  rt.catalystStates = ps.catalystStates;
  rt.effectiveStats = ps.effectiveStats;
  rt.lastStatsWeaponCount = ps.lastStatsWeaponCount;
  rt.lastStatsPassiveCount = ps.lastStatsPassiveCount;
  rt.lastStatsCatalystCount = ps.lastStatsCatalystCount;
  setPositionHistoryAccum(ps.positionHistoryAccum);
}

/** Write back what the systems may have reassigned while `ps` was swapped in. */
export function swapOut(world: GameWorld, rt: SimRuntime, ps: PlayerSim): void {
  ps.player = world.player;
  ps.weapons = world.weapons;
  ps.passives = world.passives;
  ps.catalysts = world.catalysts;
  ps.abilityState = rt.abilityState;
  ps.catalystStates = rt.catalystStates;
  ps.effectiveStats = rt.effectiveStats;
  ps.lastStatsWeaponCount = rt.lastStatsWeaponCount;
  ps.lastStatsPassiveCount = rt.lastStatsPassiveCount;
  ps.lastStatsCatalystCount = rt.lastStatsCatalystCount;
  ps.positionHistoryAccum = getPositionHistoryAccum();
}
