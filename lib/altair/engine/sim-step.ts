// =============================================================================
// ALTAIR ENGINE -- Fixed-step simulation body
// =============================================================================
// The per-step body of createGameLoop, extracted verbatim so the single-player
// loop and the multiplayer host share it. It is split into phases whose order
// is exactly the original step order:
//
//   world prep  -> player actions -> enemies+boss -> collisions
//   -> player post -> world post
//
// Single-player runs them once, back to back (stepSimulation). The host runs
// the player-owned phases once per player with that player's slice swapped into
// the world/runtime slots (engine/multiplayer/player-state.ts) and the shared
// phases once. Behaviour of the single-player path is pinned by
// __tests__/golden-master.test.ts.
// =============================================================================

import { GameWorld, PickupEntity, Entity } from './types';
import { PlayerStats } from '../stores/game-store';
import { updateParticles, spawnDeathBurst } from './particle-system';
import { updatePlayerAnimation, updateEnemyAnimation, updateSummonAnimation } from './renderer';
import {
  updatePlayer,
  computeEffectiveStats,
  updateClassAbilities,
  processSanguineFeast,
  getBerserkerBonuses,
  getKnightSpeedBonus,
} from './player-system';
import { fireWeapons, updateBoomerangs } from './weapon-system';
import { updatePickups as updatePickupSystem, spawnBossDrops } from './pickup-system';
import { updateWaveDirector as updateWaveDirectorSystem, spawnEnemyAt } from './wave-director';
import { updateEnemyAI as updateEnemyAISystem, setEnemyPropHash } from './enemy-system';
import { spawnBoss, updateBoss, snapshotBossHp, enforceBossDpsCap } from './boss-system';
import { createCatalystRuntimeStates, updateCatalysts, onCatalystAttack } from './catalyst-system';
import { DestructibleProp } from './tile-generator';
import type { TileGenerator } from './tile-generator';
import { circleVsPropAABB, handleCollisions } from './collisions';
import { spawnPickup } from './pickup-system';
import {
  CORPSE_DURATION,
  MAX_PARTICLES,
  MAX_PROJECTILES,
  type GameLoopCallbacks,
  type SimRuntime,
} from './sim-runtime';

// ---- Stats ------------------------------------------------------------------

export function recomputeStats(world: GameWorld, rt: SimRuntime): PlayerStats {
  const stats = computeEffectiveStats(
    world.classId,
    1, // level comes from Zustand store, but we track weapons/passives from world
    world.weapons,
    world.passives,
    {}, // meta bonuses applied at run start
  );

  // Apply Berserker blood rage
  if (world.classId === 'berserker') {
    const bonuses = getBerserkerBonuses(world.player.hp, world.player.maxHp);
    stats.might += bonuses.bonusMight;
    stats.attackSpeed *= 1 + bonuses.bonusAttackSpeed;
  }

  // Apply Knight rally cry speed bonus
  if (world.classId === 'knight') {
    stats.moveSpeed *= getKnightSpeedBonus(rt.abilityState);
  }

  return stats;
}

/**
 * Once per frame (not per step): re-sync catalyst runtime states and recompute
 * effective stats when the inventory changed (e.g. after the upgrade screen).
 */
export function refreshInventoryStats(world: GameWorld, rt: SimRuntime): void {
  const needsRecompute =
    !rt.effectiveStats ||
    world.weapons.length !== rt.lastStatsWeaponCount ||
    world.passives.length !== rt.lastStatsPassiveCount;

  // Re-sync catalyst runtime states when catalysts change (e.g. after upgrade screen)
  if (world.catalysts.length !== rt.lastStatsCatalystCount) {
    rt.catalystStates = createCatalystRuntimeStates(world.catalysts);
    rt.lastStatsCatalystCount = world.catalysts.length;
  }

  if (needsRecompute) {
    rt.effectiveStats = recomputeStats(world, rt);
    rt.lastStatsWeaponCount = world.weapons.length;
    rt.lastStatsPassiveCount = world.passives.length;

    // Update player max HP from stats
    const oldMaxHp = world.player.maxHp;
    world.player.maxHp = rt.effectiveStats.maxHp;
    if (rt.effectiveStats.maxHp > oldMaxHp) {
      world.player.hp += rt.effectiveStats.maxHp - oldMaxHp;
    }
  }
}

// ---- Phases -----------------------------------------------------------------

/** Steps 1, 1b: weapon-disable timer and the prop spatial hashes. (Shared.) */
export function stepWorldPrep(world: GameWorld, rt: SimRuntime, tileGen: TileGenerator, scaledDt: number): void {
  // 1. Weapon disable timer
  if (world.weaponsDisabled) {
    world.weaponsDisabledTimer -= scaledDt;
    if (world.weaponsDisabledTimer <= 0) {
      world.weaponsDisabled = false;
      world.weaponsDisabledTimer = 0;
    }
  }

  // 1b. Build prop spatial hash for collision queries
  rt.propHash.clear();
  rt.damageablePropHash.clear();
  const activeProps = tileGen.getProps();
  for (const prop of activeProps) {
    rt.propHash.insert(prop as unknown as Entity);
  }
  const damageableProps = tileGen.getDamageableProps();
  for (const prop of damageableProps) {
    rt.damageablePropHash.insert(prop as unknown as Entity);
  }
}

/** Steps 2-4: movement, prop push-out, class abilities, catalysts, weapons. (Per player.) */
export function stepPlayerActions(
  world: GameWorld,
  rt: SimRuntime,
  stats: PlayerStats,
  scaledDt: number,
): void {
  // 2. Player movement
  updatePlayer(world, world.classId, stats, scaledDt);

  // 2b. Player vs prop collision (push-out using AABB)
  {
    const nearbyProps = rt.propHash.query(world.player.x, world.player.y, world.player.radius + 20);
    for (const propEntity of nearbyProps) {
      const prop = propEntity as unknown as DestructibleProp;
      const push = circleVsPropAABB(world.player.x, world.player.y, world.player.radius, prop);
      if (push) {
        world.player.x += push.pushX;
        world.player.y += push.pushY;
      }
    }
  }

  // 3. Class abilities
  rt.abilityState = updateClassAbilities(world, world.classId, stats, 1, scaledDt, rt.abilityState);

  // 3b. Catalyst per-frame update
  updateCatalysts(world, stats, rt.catalystStates, scaledDt);

  // 4. Weapons
  const prevCooldowns = world.weapons.map((ws) => ws.cooldownTimer);
  fireWeapons(world, stats, scaledDt);
  for (let wi = 0; wi < world.weapons.length; wi++) {
    const ws = world.weapons[wi];
    if (prevCooldowns[wi] <= scaledDt && ws.cooldownTimer > prevCooldowns[wi]) {
      onCatalystAttack(rt.catalystStates, world, stats, { weaponId: ws.weaponId });
    }
  }
  updateBoomerangs(world, scaledDt);
}

/** Steps 5-6c: enemy AI, prop push-back, boss warning and boss update. (Shared.) */
export function stepEnemiesAndBoss(
  world: GameWorld,
  rt: SimRuntime,
  callbacks: GameLoopCallbacks,
  scaledDt: number,
): void {
  const propHash = rt.propHash;

  // 5. Enemy AI (with obstacle avoidance)
  setEnemyPropHash(propHash);
  const enemyEvents = updateEnemyAISystem(world, scaledDt);
  if (enemyEvents.enemyProjectiles.length > 0 && world.projectiles.length < MAX_PROJECTILES) {
    world.projectiles.push(...enemyEvents.enemyProjectiles);
  }
  if (enemyEvents.splitSpawns.length > 0) {
    world.enemies.push(...enemyEvents.splitSpawns);
    callbacks.onEnemySpawns(enemyEvents.splitSpawns.map((e) => e.defId));
  }
  if (enemyEvents.weaponsDisabled) {
    world.weaponsDisabled = true;
    world.weaponsDisabledTimer = enemyEvents.weaponsDisabled.duration;
    callbacks.onWeaponDisable(enemyEvents.weaponsDisabled.duration);
  }

  // 5b. Enemy vs prop collision (push-back using AABB, skip intangible/flying/dead)
  for (const enemy of world.enemies) {
    if (enemy.intangible || enemy.canFly || enemy.isDead) continue;
    const nearbyProps = propHash.query(enemy.x, enemy.y, enemy.radius + 20);
    for (const propEntity of nearbyProps) {
      const prop = propEntity as unknown as DestructibleProp;
      const push = circleVsPropAABB(enemy.x, enemy.y, enemy.radius, prop);
      if (push) {
        enemy.x += push.pushX;
        enemy.y += push.pushY;
      }
    }
  }

  // 6. Boss warning timer
  if (world.bossWarning) {
    world.bossWarning.timer -= scaledDt;
    if (world.bossWarning.timer <= 0) {
      world.bossWarning = null;
    }
  }

  // 6b. Boss update
  const bossState = rt.bossState;
  if (bossState) {
    const bossPrevX = bossState.entity.x;
    const bossPrevY = bossState.entity.y;
    const bossEvents = updateBoss(world, bossState, scaledDt);

    if (bossEvents.bossProjectiles.length > 0 && world.projectiles.length < MAX_PROJECTILES) {
      for (const bp of bossEvents.bossProjectiles) {
        bp.sourceDefId = bossState.bossId;
      }
      world.projectiles.push(...bossEvents.bossProjectiles);
    }

    if (bossEvents.bossSpawnEnemies.length > 0) {
      const minionIds: string[] = [];
      for (const spawn of bossEvents.bossSpawnEnemies) {
        if (spawnEnemyAt(world, spawn.defId, spawn.x, spawn.y, spawn.hpMul)) {
          minionIds.push(spawn.defId);
        }
      }
      if (minionIds.length > 0) callbacks.onEnemySpawns(minionIds);
    }

    if (bossEvents.screenShake) {
      world.camera.shakeIntensity = bossEvents.screenShake;
      world.camera.shakeDuration = 0.3;
    }

    if (bossEvents.weaponsDisabled) {
      world.weaponsDisabled = true;
      world.weaponsDisabledTimer = bossEvents.weaponsDisabled;
      callbacks.onWeaponDisable(bossEvents.weaponsDisabled);
    }

    if (bossEvents.playerPull) {
      world.player.x += bossEvents.playerPull.forceX * scaledDt;
      world.player.y += bossEvents.playerPull.forceY * scaledDt;
    }

    if (bossEvents.bossPhaseChanged) {
      bossState.entity.bossPhase = bossEvents.bossPhaseChanged.phase;
    }

    if (scaledDt > 0) {
      const bossVx = (bossState.entity.x - bossPrevX) / scaledDt;
      const bossVy = (bossState.entity.y - bossPrevY) / scaledDt;
      if (Math.abs(bossVx) > 0.1 || Math.abs(bossVy) > 0.1) {
        bossState.entity.lastMoveVx = bossVx;
        bossState.entity.lastMoveVy = bossVy;
      }
    }

    if (bossEvents.bossDefeated) {
      callbacks.onKill(bossEvents.bossDefeated);
      callbacks.onBossKill(bossEvents.bossDefeated);
      world.bossActive = false;
      spawnBossDrops(world, bossState.entity.x, bossState.entity.y, 15, 30);
      spawnDeathBurst(world, bossState.entity.x, bossState.entity.y, '#ff4444');
      bossState.entity.isDead = true;
      bossState.entity.corpseTimer = CORPSE_DURATION * 2;
      rt.bossState = null;
    }
  }

  // 6c. Snapshot boss HP before collisions (for DPS cap enforcement)
  if (rt.bossState) snapshotBossHp(rt.bossState);
}

/** Steps 7, 7b: collisions + enemy death processing; returns damage dealt. */
export function stepCollisions(
  world: GameWorld,
  rt: SimRuntime,
  stats: PlayerStats,
  callbacks: GameLoopCallbacks,
  tileGen: TileGenerator,
  scaledDt: number,
): number {
  // 7. Collisions + enemy death processing
  const damageDealt = handleCollisions(
    world,
    stats,
    scaledDt,
    rt.abilityState,
    callbacks,
    tileGen,
    rt.propHash,
    rt.damageablePropHash,
    rt.catalystStates,
  );

  // 7b. Enforce boss DPS cap after collisions
  if (rt.bossState) enforceBossDpsCap(rt.bossState, scaledDt);

  return damageDealt;
}

/** Steps 8-9: lifesteal and pickups. (Per player.) */
export function stepPlayerPost(
  world: GameWorld,
  rt: SimRuntime,
  stats: PlayerStats,
  callbacks: GameLoopCallbacks,
  scaledDt: number,
  damageDealt: number,
): void {
  const abilityState = rt.abilityState;

  // 8. Hemomancer lifesteal
  if (world.classId === 'hemomancer' && damageDealt > 0) {
    processSanguineFeast(abilityState, damageDealt, world.player.hp, world.player.maxHp);
  }
  if (abilityState.lifestealAccum && abilityState.lifestealAccum > 0) {
    const maxHealPerStep = 8 * scaledDt;
    const heal = Math.min(abilityState.lifestealAccum, maxHealPerStep);
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + heal);
    abilityState.lifestealAccum -= heal;
  }
  if (abilityState.bloodNovaKillHealAccum && abilityState.bloodNovaKillHealAccum > 0) {
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + abilityState.bloodNovaKillHealAccum);
    abilityState.bloodNovaKillHealAccum = 0;
  }

  // 9. Pickups
  const pickupEvents = updatePickupSystem(world, stats, scaledDt);
  if (pickupEvents.xpGained > 0) callbacks.onXPGain(pickupEvents.xpGained);
  if (pickupEvents.coinsGained > 0) callbacks.onCoinGain(pickupEvents.coinsGained);
  if (pickupEvents.healed > 0) callbacks.onPlayerHeal(pickupEvents.healed);
}

/** Steps 10-12: particles, wave director (spawns bosses), animations. (Shared.) */
export function stepWorldPost(
  world: GameWorld,
  rt: SimRuntime,
  callbacks: GameLoopCallbacks,
  scaledDt: number,
  animatePlayer: boolean,
): void {
  // 10. Particles
  updateParticles(world.particles, scaledDt);
  if (world.particles.length > MAX_PARTICLES) {
    world.particles.splice(0, world.particles.length - MAX_PARTICLES);
  }

  // 11. Wave director
  const waveEvents = updateWaveDirectorSystem(world, rt.waveState, scaledDt);
  if (waveEvents.bossSpawn) {
    callbacks.onBossSpawn(waveEvents.bossSpawn);
    world.bossActive = true;
    world.bossWarning = { bossId: waveEvents.bossSpawn, timer: 3 };

    const newBossState = spawnBoss(world, waveEvents.bossSpawn);
    if (newBossState) {
      rt.bossState = newBossState;
      world.enemies.push(newBossState.entity);
    }
  }
  if (waveEvents.spawned.length > 0) {
    callbacks.onEnemySpawns(waveEvents.spawned);
  }
  if (waveEvents.victory) {
    callbacks.onVictory();
  }

  // 12. Sprite animations
  if (animatePlayer) updatePlayerAnimation(world, scaledDt);
  for (const enemy of world.enemies) {
    if (enemy.isDead) continue;
    updateEnemyAnimation(enemy, scaledDt);
  }
  for (const summon of world.summons) {
    let svx = 0,
      svy = 0;
    let nearestDist = Infinity;
    for (const e of world.enemies) {
      if (e.isDead) continue;
      const dx = e.x - summon.x;
      const dy = e.y - summon.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) {
        nearestDist = d;
        svx = dx;
        svy = dy;
      }
    }
    updateSummonAnimation(summon, svx, svy, scaledDt);
  }
}

// ---- Single-player step -----------------------------------------------------

/** One fixed 60 Hz step of the single-player world. */
export function stepSimulation(
  world: GameWorld,
  rt: SimRuntime,
  tileGen: TileGenerator,
  callbacks: GameLoopCallbacks,
  fixedDt: number,
): void {
  // Berserker stats change with HP (recompute each step since combat changes HP)
  if (world.classId === 'berserker') {
    rt.effectiveStats = recomputeStats(world, rt);
  }
  const stats = rt.effectiveStats!;
  const scaledDt = fixedDt * world.timeScale;

  // Advance game clock
  world.time += scaledDt;

  stepWorldPrep(world, rt, tileGen, scaledDt);
  stepPlayerActions(world, rt, stats, scaledDt);
  stepEnemiesAndBoss(world, rt, callbacks, scaledDt);
  const damageDealt = stepCollisions(world, rt, stats, callbacks, tileGen, scaledDt);
  stepPlayerPost(world, rt, stats, callbacks, scaledDt, damageDealt);
  stepWorldPost(world, rt, callbacks, scaledDt, true);
}

/** Per-frame (outside the fixed step): spawn structure pickups queued by the tile generator. */
export function drainTilePickups(world: GameWorld, tileGen: TileGenerator): void {
  for (const pp of tileGen.drainPendingPickups()) {
    spawnPickup(world, pp.x, pp.y, pp.type as PickupEntity['type'], pp.value);
  }
}
