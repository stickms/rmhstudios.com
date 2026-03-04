// =============================================================================
// ALTAIR ENGINE -- Multiplayer Game Loop Wrapper
// =============================================================================
// Uses the "swap trick" to run per-player systems (movement, abilities, weapons)
// by temporarily swapping world.player to each player entity. Shared systems
// (enemies, collisions, pickups, rendering) run once with multi-player awareness.
// =============================================================================

import {
  GameWorld,
  MultiplayerGameWorld,
  MultiplayerPlayerEntity,
  WeaponState,
  PassiveState,
  InputState,
  Camera,
  PLAYER_SLOT_COLORS,
  createId,
} from '../types';
import { createCamera, updateCamera } from '../camera';
import { createInputState } from '../input';
import { TileGenerator } from '../tile-generator';
import {
  updateParticles,
  spawnDamageNumber,
  spawnDeathBurst,
  spawnLevelUp,
  spawnEvolution,
} from '../particle-system';
import { renderFrame, type WebGLRenderer } from '../renderer';
import { initWebGL } from '../webgl/webgl-context';
import { SpriteBatch } from '../webgl/webgl-sprite-batch';
import { ShapeBatch } from '../webgl/webgl-shapes';
import { setGLContext } from '../webgl/webgl-textures';
import { PlayerStats } from '../../stores/game-store';
import { CLASSES } from '../../data/classes';

// System imports
import {
  updatePlayer,
  computeEffectiveStats,
  updateClassAbilities,
  createClassAbilityState,
  ClassAbilityState,
  tryRaiseDead,
  processSanguineFeast,
  getBerserkerBonuses,
  getKnightSpeedBonus,
  reportBloodNovaKill,
  tryTransferHuntersMark,
} from '../player-system';
import { fireWeapons, updateBoomerangs, activateBlock, getBlockDR, getWhipLifesteal } from '../weapon-system';
import { getMarkMultiplier, applySlow } from '../status-effects';
import { updatePickups as updatePickupSystem, spawnEnemyDrops, spawnBossDrops } from '../pickup-system';
import {
  updateWaveDirector as updateWaveDirectorSystem,
  createWaveDirectorState,
  spawnEnemyAt,
} from '../wave-director';
import { updateEnemyAI as updateEnemyAISystem } from '../enemy-system';
import { spawnBoss, updateBoss, BossState } from '../boss-system';

import { updateRevivalSystem } from './revival-system';
import { updateThreatScores } from './threat-system';
import { updateScaling, createScalingState } from './scaling-system';
import { updateAfkDetection } from './afk-detector';
import { getAlivePlayers } from './player-helpers';

// ---- Callbacks ---------------------------------------------------------------

export interface MultiplayerCallbacks {
  onPlayerDamage: (playerId: string, amount: number) => void;
  onPlayerHeal: (playerId: string, amount: number) => void;
  onPlayerDowned: (playerId: string) => void;
  onPlayerRevived: (playerId: string, reviverId: string) => void;
  onPlayerDead: (playerId: string) => void;
  onXPGain: (playerId: string, amount: number) => void;
  onCoinGain: (playerId: string, amount: number) => void;
  onKill: (playerId: string | null) => void;
  onLevelUp: (playerId: string) => void;
  onBossSpawn: (bossId: string) => void;
  onBossKill: (bossId: string) => void;
  onVictory: () => void;
  onWeaponDisable: (duration: number) => void;
  onAfkWarning: (playerId: string) => void;
  onAfkKick: (playerId: string) => void;
  onTpk: () => void;
}

// ---- Constants ---------------------------------------------------------------

const PLAYER_RADIUS = 12;
const MAX_DELTA = 1 / 15;
const THREAT_RECALC_INTERVAL = 30; // seconds

// ---- Per-player state --------------------------------------------------------

interface PerPlayerState {
  abilityState: ClassAbilityState;
  effectiveStats: PlayerStats | null;
  lastWeaponCount: number;
  lastPassiveCount: number;
}

// ---- Factory -----------------------------------------------------------------

/**
 * Create a multiplayer game world with the host player.
 */
export function createMultiplayerGameWorld(
  canvasWidth: number,
  canvasHeight: number,
  hostPlayerId: string,
  hostClassId: string,
  doubleTime: boolean,
): MultiplayerGameWorld {
  const classDef = CLASSES.find((c) => c.id === hostClassId) || CLASSES[0];
  const maxHp = (classDef.baseStats.maxHp as number) || 100;

  const hostPlayer: MultiplayerPlayerEntity = {
    id: 1,
    x: 0,
    y: 0,
    radius: PLAYER_RADIUS,
    facingX: 1,
    facingY: 0,
    hp: maxHp,
    maxHp,
    iFrames: 0,
    shieldHp: 0,
    positionHistory: [],
    playerId: hostPlayerId,
    classId: hostClassId,
    color: PLAYER_SLOT_COLORS[0],
    slot: 0,
    isDowned: false,
    downTimer: 0,
    revivalProgress: 0,
    reviverId: null,
    isSpectating: false,
    isDead: false,
    weapons: [
      {
        weaponId: classDef.startingWeaponId,
        level: 1,
        evolved: false,
        cooldownTimer: 0,
      },
    ],
    passives: [],
    catalysts: [],
    abilityState: {},
    inputState: createInputState(),
    camera: createCamera(canvasWidth, canvasHeight),
    threatScore: 0,
    damageDealt: 0,
    lastInputTime: 0,
    isAfk: false,
    invulnTimer: 0,
    mightBuff: 0,
    mightBuffAmount: 0,
    joinTime: 0,
  };

  const players = new Map<string, MultiplayerPlayerEntity>();
  players.set(hostPlayerId, hostPlayer);

  const world: MultiplayerGameWorld = {
    isMultiplayer: true,
    classId: hostClassId,
    player: hostPlayer, // world.player points to the local player
    enemies: [],
    projectiles: [],
    pickups: [],
    particles: [],
    meleeHitboxes: [],
    auras: [],
    summons: [],
    pools: [],
    camera: hostPlayer.camera,
    inputState: hostPlayer.inputState,
    weapons: hostPlayer.weapons,
    passives: hostPlayer.passives,
    catalysts: hostPlayer.catalysts,
    time: 0,
    timeScale: doubleTime ? 2.0 : 1.0,
    nextId: 100,
    bossActive: false,
    bossWarning: null,
    weaponsDisabled: false,
    weaponsDisabledTimer: 0,
    players,
    playerCount: 1,
    alivePlayerCount: 1,
    scalingState: createScalingState(1),
    sharedKills: 0,
    hostPlayerId,
    xpTrickleAccum: new Map(),
  };

  // Snap camera to player
  hostPlayer.camera.x = 0;
  hostPlayer.camera.y = 0;

  return world;
}

/**
 * Add a player to the multiplayer world (for lobby start or drop-in).
 */
export function addPlayerToWorld(
  world: MultiplayerGameWorld,
  playerId: string,
  classId: string,
  slot: number,
  spawnX: number,
  spawnY: number,
  startLevel: number,
  canvasWidth: number,
  canvasHeight: number,
): MultiplayerPlayerEntity {
  const classDef = CLASSES.find((c) => c.id === classId) || CLASSES[0];
  const maxHp = (classDef.baseStats.maxHp as number) || 100;

  const player: MultiplayerPlayerEntity = {
    id: createId(world),
    x: spawnX,
    y: spawnY,
    radius: PLAYER_RADIUS,
    facingX: 1,
    facingY: 0,
    hp: maxHp,
    maxHp,
    iFrames: 0,
    shieldHp: 0,
    positionHistory: [],
    playerId,
    classId,
    color: PLAYER_SLOT_COLORS[slot % 4],
    slot,
    isDowned: false,
    downTimer: 0,
    revivalProgress: 0,
    reviverId: null,
    isSpectating: false,
    isDead: false,
    weapons: [
      {
        weaponId: classDef.startingWeaponId,
        level: 1,
        evolved: false,
        cooldownTimer: 0,
      },
    ],
    passives: [],
    catalysts: [],
    abilityState: {},
    inputState: createInputState(),
    camera: createCamera(canvasWidth, canvasHeight),
    threatScore: 0,
    damageDealt: 0,
    lastInputTime: world.time,
    isAfk: false,
    invulnTimer: 3, // 3s invulnerability on join
    mightBuff: 0,
    mightBuffAmount: 0,
    joinTime: world.time,
  };

  world.players.set(playerId, player);
  world.playerCount = world.players.size;
  world.alivePlayerCount = getAlivePlayers(world).length;

  return player;
}

/**
 * Remove a player from the world (disconnect/kick).
 */
export function removePlayerFromWorld(
  world: MultiplayerGameWorld,
  playerId: string,
): void {
  world.players.delete(playerId);
  world.playerCount = world.players.size;
  world.alivePlayerCount = getAlivePlayers(world).length;
}

// ---- Swap trick helpers ------------------------------------------------------

function swapToPlayer(world: MultiplayerGameWorld, player: MultiplayerPlayerEntity): void {
  world.player = player;
  world.inputState = player.inputState;
  world.weapons = player.weapons;
  world.passives = player.passives;
  world.classId = player.classId;
}

function restoreLocalPlayer(
  world: MultiplayerGameWorld,
  localPlayer: MultiplayerPlayerEntity,
): void {
  world.player = localPlayer;
  world.inputState = localPlayer.inputState;
  world.weapons = localPlayer.weapons;
  world.passives = localPlayer.passives;
  world.classId = localPlayer.classId;
  world.camera = localPlayer.camera;
}

// ---- Multiplayer Game Loop ---------------------------------------------------

/**
 * Create the multiplayer game loop (host version — runs full simulation).
 */
export function createMultiplayerGameLoop(
  canvas: HTMLCanvasElement,
  world: MultiplayerGameWorld,
  localPlayerId: string,
  tileGen: TileGenerator,
  callbacks: MultiplayerCallbacks,
): {
  start: () => void;
  stop: () => void;
  getWorld: () => MultiplayerGameWorld;
} {
  let running = false;
  let rafId: number = 0;
  let lastTime: number = 0;

  // ---- WebGL setup ----
  const gl = initWebGL(canvas);
  setGLContext(gl);

  const spriteBatch = new SpriteBatch(gl);
  const shapeBatch = new ShapeBatch(gl);

  // Create transparent overlay canvas for text/HUD
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  overlayCanvas.style.position = 'absolute';
  overlayCanvas.style.top = '0';
  overlayCanvas.style.left = '0';
  overlayCanvas.style.width = '100%';
  overlayCanvas.style.height = '100%';
  overlayCanvas.style.pointerEvents = 'none';
  canvas.parentElement?.appendChild(overlayCanvas);
  const overlayCtx = overlayCanvas.getContext('2d')!;

  const renderer: WebGLRenderer = { gl, spriteBatch, shapeBatch, overlayCtx };
  const localPlayer = world.players.get(localPlayerId)!;

  // Per-player state tracking
  const playerStates = new Map<string, PerPlayerState>();
  let waveState = createWaveDirectorState();
  let bossState: BossState | null = null;
  let threatRecalcTimer = THREAT_RECALC_INTERVAL;

  function getOrCreatePlayerState(playerId: string): PerPlayerState {
    let state = playerStates.get(playerId);
    if (!state) {
      state = {
        abilityState: createClassAbilityState(),
        effectiveStats: null,
        lastWeaponCount: 0,
        lastPassiveCount: 0,
      };
      playerStates.set(playerId, state);
    }
    return state;
  }

  function computePlayerStats(
    player: MultiplayerPlayerEntity,
    pState: PerPlayerState,
  ): PlayerStats {
    const needsRecompute =
      !pState.effectiveStats ||
      player.weapons.length !== pState.lastWeaponCount ||
      player.passives.length !== pState.lastPassiveCount;

    if (needsRecompute || player.classId === 'berserker') {
      const stats = computeEffectiveStats(
        player.classId,
        1,
        player.weapons,
        player.passives,
        {},
      );

      // Apply Berserker blood rage
      if (player.classId === 'berserker') {
        const bonuses = getBerserkerBonuses(player.hp, player.maxHp);
        stats.might += bonuses.bonusMight;
        stats.attackSpeed *= 1 + bonuses.bonusAttackSpeed;
      }

      // Apply Knight rally speed
      if (player.classId === 'knight') {
        stats.moveSpeed *= getKnightSpeedBonus(pState.abilityState);
      }

      // Apply Heroic Rescue might buff
      if (player.mightBuff > 0) {
        stats.might *= 1 + player.mightBuffAmount;
      }

      pState.effectiveStats = stats;
      pState.lastWeaponCount = player.weapons.length;
      pState.lastPassiveCount = player.passives.length;

      // Update player max HP
      const oldMaxHp = player.maxHp;
      player.maxHp = stats.maxHp;
      if (stats.maxHp > oldMaxHp) {
        player.hp += stats.maxHp - oldMaxHp;
      }
    }

    return pState.effectiveStats!;
  }

  function tick(now: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    let delta = (now - lastTime) / 1000;
    if (delta > MAX_DELTA) delta = MAX_DELTA;
    if (delta <= 0) delta = 1 / 60;
    lastTime = now;

    const scaledDelta = delta * world.timeScale;
    world.time += scaledDelta;

    // --- Weapon disable timer ---
    if (world.weaponsDisabled) {
      world.weaponsDisabledTimer -= scaledDelta;
      if (world.weaponsDisabledTimer <= 0) {
        world.weaponsDisabled = false;
        world.weaponsDisabledTimer = 0;
      }
    }

    // --- Update scaling (smooth transitions) ---
    updateScaling(world.scalingState, scaledDelta);

    // --- Per-player invuln/buff timers ---
    for (const player of world.players.values()) {
      if (player.invulnTimer > 0) {
        player.invulnTimer -= delta; // real-time, not scaled
        if (player.invulnTimer < 0) player.invulnTimer = 0;
      }
      if (player.mightBuff > 0) {
        player.mightBuff -= delta;
        if (player.mightBuff < 0) {
          player.mightBuff = 0;
          player.mightBuffAmount = 0;
        }
      }
    }

    // --- SWAP TRICK: Per-player systems ---
    const alivePlayers = getAlivePlayers(world);

    for (const player of alivePlayers) {
      const pState = getOrCreatePlayerState(player.playerId);
      const stats = computePlayerStats(player, pState);

      // Swap world to this player
      swapToPlayer(world, player);

      // 1. Player movement
      updatePlayer(world, player.classId, stats, scaledDelta);

      // 2. Class abilities
      pState.abilityState = updateClassAbilities(
        world,
        player.classId,
        stats,
        1,
        scaledDelta,
        pState.abilityState,
      );

      // 3. Weapons (only if not disabled)
      if (!world.weaponsDisabled) {
        fireWeapons(world, stats, scaledDelta);
      }
      updateBoomerangs(world, scaledDelta);
    }

    // Restore to local player
    restoreLocalPlayer(world, localPlayer);

    // --- Shared systems (run once) ---

    // 4. Enemy AI
    const enemyEvents = updateEnemyAISystem(world, scaledDelta);
    if (enemyEvents.enemyProjectiles.length > 0) {
      world.projectiles.push(...enemyEvents.enemyProjectiles);
    }
    if (enemyEvents.splitSpawns.length > 0) {
      world.enemies.push(...enemyEvents.splitSpawns);
    }
    if (enemyEvents.weaponsDisabled) {
      world.weaponsDisabled = true;
      world.weaponsDisabledTimer = enemyEvents.weaponsDisabled.duration;
      callbacks.onWeaponDisable(enemyEvents.weaponsDisabled.duration);
    }

    // 5. Boss warning timer
    if (world.bossWarning) {
      world.bossWarning.timer -= scaledDelta;
      if (world.bossWarning.timer <= 0) {
        world.bossWarning = null;
      }
    }

    // 5b. Boss update
    if (bossState) {
      const bossEvents = updateBoss(world, bossState, scaledDelta);

      if (bossEvents.bossProjectiles.length > 0) {
        world.projectiles.push(...bossEvents.bossProjectiles);
      }
      for (const spawn of bossEvents.bossSpawnEnemies) {
        spawnEnemyAt(world, spawn.defId, spawn.x, spawn.y, spawn.hpMul);
      }
      if (bossEvents.screenShake) {
        // Shake all player cameras
        for (const p of world.players.values()) {
          p.camera.shakeIntensity = bossEvents.screenShake;
          p.camera.shakeDuration = 0.3;
        }
      }
      if (bossEvents.weaponsDisabled) {
        world.weaponsDisabled = true;
        world.weaponsDisabledTimer = bossEvents.weaponsDisabled;
        callbacks.onWeaponDisable(bossEvents.weaponsDisabled);
      }
      // Player pull — apply to ALL alive players
      if (bossEvents.playerPull) {
        for (const p of alivePlayers) {
          p.x += bossEvents.playerPull.forceX * scaledDelta;
          p.y += bossEvents.playerPull.forceY * scaledDelta;
        }
      }
      if (bossEvents.bossPhaseChanged) {
        bossState.entity.bossPhase = bossEvents.bossPhaseChanged.phase;
      }
      if (bossEvents.bossDefeated) {
        callbacks.onKill(null);
        callbacks.onBossKill(bossEvents.bossDefeated);
        world.bossActive = false;
        // Spawn drops per player
        for (const p of alivePlayers) {
          spawnBossDrops(world, bossState.entity.x, bossState.entity.y, 15, 30);
        }
        const bossIdx = world.enemies.indexOf(bossState.entity);
        if (bossIdx >= 0) {
          spawnDeathBurst(world, bossState.entity.x, bossState.entity.y, '#ff4444');
          world.enemies.splice(bossIdx, 1);
        }
        bossState = null;
      }
    }

    // 6. Multiplayer collisions
    handleMultiplayerCollisions(world, alivePlayers, playerStates, scaledDelta, callbacks);

    // 7. Per-player lifesteal/hemomancer processing
    for (const player of alivePlayers) {
      const pState = getOrCreatePlayerState(player.playerId);
      if (player.classId === 'hemomancer') {
        if (pState.abilityState.lifestealAccum && pState.abilityState.lifestealAccum > 0) {
          const maxHealPerFrame = 8 * scaledDelta;
          const heal = Math.min(pState.abilityState.lifestealAccum, maxHealPerFrame);
          player.hp = Math.min(player.maxHp, player.hp + heal);
          pState.abilityState.lifestealAccum -= heal;
        }
        if (pState.abilityState.bloodNovaKillHealAccum && pState.abilityState.bloodNovaKillHealAccum > 0) {
          player.hp = Math.min(player.maxHp, player.hp + pState.abilityState.bloodNovaKillHealAccum);
          pState.abilityState.bloodNovaKillHealAccum = 0;
        }
      }
    }

    // 8. Pickups — each player checks pickup collection
    for (const player of alivePlayers) {
      const pState = getOrCreatePlayerState(player.playerId);
      const stats = pState.effectiveStats!;
      swapToPlayer(world, player);
      const pickupEvents = updatePickupSystem(world, stats, scaledDelta);
      if (pickupEvents.xpGained > 0) callbacks.onXPGain(player.playerId, pickupEvents.xpGained);
      if (pickupEvents.coinsGained > 0) callbacks.onCoinGain(player.playerId, pickupEvents.coinsGained);
      if (pickupEvents.healed > 0) callbacks.onPlayerHeal(player.playerId, pickupEvents.healed);
    }
    restoreLocalPlayer(world, localPlayer);

    // 9. Revival system
    updateRevivalSystem(world, delta, callbacks);

    // 10. Threat recalc
    threatRecalcTimer -= scaledDelta;
    if (threatRecalcTimer <= 0) {
      threatRecalcTimer = THREAT_RECALC_INTERVAL;
      updateThreatScores(world);
    }

    // 11. AFK detection
    updateAfkDetection(world, delta, callbacks);

    // 12. Particles
    updateParticles(world.particles, scaledDelta);

    // 13. Wave director
    const waveEvents = updateWaveDirectorSystem(world, waveState, scaledDelta);
    if (waveEvents.bossSpawn) {
      callbacks.onBossSpawn(waveEvents.bossSpawn);
      world.bossActive = true;
      world.bossWarning = { bossId: waveEvents.bossSpawn, timer: 3 };
      const newBossState = spawnBoss(world, waveEvents.bossSpawn);
      if (newBossState) {
        bossState = newBossState;
        world.enemies.push(newBossState.entity);
      }
    }
    if (waveEvents.victory) {
      callbacks.onVictory();
    }

    // 14. Camera (follow local player)
    updateCamera(localPlayer.camera, localPlayer, delta);
    world.camera = localPlayer.camera;
    tileGen.update(localPlayer.camera);

    // 15. Render
    renderFrame(renderer, world, tileGen);

    // 16. Check TPK
    const alive = getAlivePlayers(world);
    const allDowned = [...world.players.values()].every(
      (p) => p.isDowned || p.isDead || p.isSpectating,
    );
    if (allDowned && world.players.size > 0) {
      callbacks.onTpk();
    }

    // Update alive count
    world.alivePlayerCount = alive.length;
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      waveState = createWaveDirectorState();
      playerStates.clear();
      threatRecalcTimer = THREAT_RECALC_INTERVAL;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      overlayCanvas.parentElement?.removeChild(overlayCanvas);
    },
    getWorld() {
      return world;
    },
  };
}

// ---- Multiplayer collision handler -------------------------------------------

function handleMultiplayerCollisions(
  world: MultiplayerGameWorld,
  alivePlayers: MultiplayerPlayerEntity[],
  playerStates: Map<string, PerPlayerState>,
  delta: number,
  callbacks: MultiplayerCallbacks,
): void {
  // -- Move & collide player projectiles vs enemies (same as solo) --
  for (let pi = world.projectiles.length - 1; pi >= 0; pi--) {
    const proj = world.projectiles[pi];
    if (proj.isEnemy || proj.isPool) continue;

    proj.x += proj.vx * delta;
    proj.y += proj.vy * delta;

    // Homing
    if (proj.homing) {
      let closest: { dist: number; e: import('../types').EnemyEntity } | null = null;
      for (const e of world.enemies) {
        if (e.intangible) continue;
        const dx = e.x - proj.x;
        const dy = e.y - proj.y;
        const d = dx * dx + dy * dy;
        if (!closest || d < closest.dist) {
          closest = { dist: d, e };
        }
      }
      if (closest) {
        const dx = closest.e.x - proj.x;
        const dy = closest.e.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          const strength = proj.homingStrength || 3;
          proj.vx += (dx / dist) * strength * delta * 60;
          proj.vy += (dy / dist) * strength * delta * 60;
        }
      }
    }

    // Boomerang return
    if (proj.returning && proj.originX !== undefined && proj.originY !== undefined) {
      const dx = proj.originX - proj.x;
      const dy = proj.originY - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const returnSpeed = 400;
        proj.vx = (dx / dist) * returnSpeed;
        proj.vy = (dy / dist) * returnSpeed;
      }
      if (dist < 20) {
        world.projectiles.splice(pi, 1);
        continue;
      }
    }

    proj.lifetime -= delta;
    if (proj.lifetime <= 0) {
      world.projectiles.splice(pi, 1);
      continue;
    }

    // Check collision with enemies
    for (const e of world.enemies) {
      if (e.intangible) continue;
      if (proj.hitEnemyIds.has(e.id)) continue;

      const dx = e.x - proj.x;
      const dy = e.y - proj.y;
      const distSq = dx * dx + dy * dy;
      const combinedR = e.radius + proj.radius;

      if (distSq <= combinedR * combinedR) {
        proj.hitEnemyIds.add(e.id);

        const markMul = getMarkMultiplier(e.statusEffects, e.isBoss);

        // v1.2: Crit system (Shortbow)
        let critMul = 1;
        if (proj.critChance && proj.critMultiplier) {
          if (Math.random() < proj.critChance) {
            critMul = proj.critMultiplier;
          }
        }

        const effectiveDmg = Math.max(1, proj.damage * markMul * critMul - e.armor);
        e.hp -= effectiveDmg;
        e.flashTimer = 0.1;

        spawnDamageNumber(world, e.x, e.y - e.radius, effectiveDmg, false);

        // v1.2: Slow on hit (Temporal Shard)
        if (proj.slowOnHitPct && proj.slowOnHitDuration) {
          applySlow(e.statusEffects, proj.slowOnHitPct, proj.slowOnHitDuration);
        }

        // v1.2: Lifesteal on hit (Crimson Whip)
        if (proj.lifestealPct && proj.lifestealPct > 0) {
          const heal = effectiveDmg * proj.lifestealPct;
          if (heal > 0) {
            world.player.hp = Math.min(world.player.hp + heal, world.player.maxHp);
          }
        }

        // v1.2: Splash on kill (Arcane Bolt)
        if (e.hp <= 0 && proj.splashOnKillRadius && proj.splashOnKillDamagePct) {
          const splashR = proj.splashOnKillRadius;
          const splashDmgPct = proj.splashOnKillDamagePct;
          for (const ae of world.enemies) {
            if (ae.id === e.id || ae.intangible || ae.hp <= 0) continue;
            const adx = ae.x - e.x;
            const ady = ae.y - e.y;
            if (adx * adx + ady * ady <= splashR * splashR) {
              const splashDmg = Math.max(1, proj.damage * splashDmgPct - ae.armor);
              ae.hp -= splashDmg;
              ae.flashTimer = 0.05;
            }
          }
        }

        proj.pierceLeft--;
        if (proj.pierceLeft <= 0) {
          if (proj.aoeRadius && proj.aoeRadius > 0) {
            for (const ae of world.enemies) {
              if (ae.id === e.id || ae.intangible) continue;
              const adx = ae.x - proj.x;
              const ady = ae.y - proj.y;
              if (adx * adx + ady * ady <= proj.aoeRadius * proj.aoeRadius) {
                const aoeDmg = Math.max(1, proj.damage * 0.6 - ae.armor);
                ae.hp -= aoeDmg;
                ae.flashTimer = 0.05;
              }
            }
          }
          world.projectiles.splice(pi, 1);
          break;
        }
      }
    }
  }

  // -- Enemy projectiles vs ALL players --
  for (let pi = world.projectiles.length - 1; pi >= 0; pi--) {
    const proj = world.projectiles[pi];
    if (!proj.isEnemy) continue;

    if (proj.isPool) {
      // Pool tick logic — check all players
      if (proj.poolTimer !== undefined && proj.poolTickInterval !== undefined) {
        proj.poolTimer -= delta;
        if (proj.poolTimer <= 0) {
          proj.poolTimer += proj.poolTickInterval;
          const poolR = proj.poolRadius || proj.radius;
          for (const pl of alivePlayers) {
            if (pl.iFrames > 0 || pl.invulnTimer > 0) continue;
            const pdx = pl.x - proj.x;
            const pdy = pl.y - proj.y;
            if (pdx * pdx + pdy * pdy <= (poolR + pl.radius) * (poolR + pl.radius)) {
              let dmg = proj.poolDamagePerTick || proj.damage;
              // v1.2: Block damage reduction
              dmg = Math.round(dmg * getBlockDR(world));
              pl.hp -= dmg;
              pl.iFrames = 0.2;
              callbacks.onPlayerDamage(pl.playerId, dmg);
            }
          }
        }
      }
      proj.lifetime -= delta;
      if (proj.lifetime <= 0) {
        world.projectiles.splice(pi, 1);
      }
      continue;
    }

    proj.x += proj.vx * delta;
    proj.y += proj.vy * delta;
    proj.lifetime -= delta;

    if (proj.lifetime <= 0) {
      world.projectiles.splice(pi, 1);
      continue;
    }

    // Hit any player?
    for (const pl of alivePlayers) {
      if (pl.iFrames > 0 || pl.invulnTimer > 0) continue;

      const dx = pl.x - proj.x;
      const dy = pl.y - proj.y;
      const distSq = dx * dx + dy * dy;
      const combinedR = pl.radius + proj.radius;

      if (distSq <= combinedR * combinedR) {
        let dmg = proj.damage;

        // v1.2: Block damage reduction (Broad Sword)
        dmg = Math.round(dmg * getBlockDR(world));

        if (pl.shieldHp > 0) {
          const absorbed = Math.min(pl.shieldHp, dmg);
          pl.shieldHp -= absorbed;
          dmg -= absorbed;
        }

        if (dmg > 0) {
          pl.hp -= dmg;
          pl.iFrames = 0.5;
          callbacks.onPlayerDamage(pl.playerId, dmg);
        }

        world.projectiles.splice(pi, 1);
        break;
      }
    }
  }

  // -- Friendly pool damage ticks vs enemies --
  for (const proj of world.projectiles) {
    if (!proj.isPool || proj.isEnemy) continue;
    if (proj.poolTimer !== undefined && proj.poolTickInterval !== undefined) {
      proj.poolTimer -= delta;
      if (proj.poolTimer <= 0) {
        proj.poolTimer += proj.poolTickInterval;
        const poolR = proj.poolRadius || proj.radius;
        for (const e of world.enemies) {
          if (e.intangible) continue;
          const dx = e.x - proj.x;
          const dy = e.y - proj.y;
          if (dx * dx + dy * dy <= (poolR + e.radius) * (poolR + e.radius)) {
            const dmg = proj.poolDamagePerTick || proj.damage;
            const effectiveDmg = Math.max(1, dmg - e.armor);
            e.hp -= effectiveDmg;
            e.flashTimer = 0.05;

            // v1.2: Pool slow effect (Toxic Flask)
            if (proj.poolSlowPct && proj.poolSlowPct > 0) {
              applySlow(e.statusEffects, proj.poolSlowPct, proj.poolTickInterval! * 1.5);
            }
          }
        }
      }
    }
    proj.lifetime -= delta;
  }

  // Remove expired pools
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    if (world.projectiles[i].isPool && world.projectiles[i].lifetime <= 0) {
      world.projectiles.splice(i, 1);
    }
  }

  // -- Enemy body vs ALL players --
  for (const pl of alivePlayers) {
    if (pl.iFrames > 0 || pl.invulnTimer > 0) continue;

    for (const e of world.enemies) {
      if (e.intangible) continue;

      const dx = pl.x - e.x;
      const dy = pl.y - e.y;
      const distSq = dx * dx + dy * dy;
      const combinedR = pl.radius + e.radius;

      if (distSq <= combinedR * combinedR) {
        let dmg = e.damage;

        // v1.2: Block damage reduction (Broad Sword)
        dmg = Math.round(dmg * getBlockDR(world));

        if (pl.shieldHp > 0) {
          const absorbed = Math.min(pl.shieldHp, dmg);
          pl.shieldHp -= absorbed;
          dmg -= absorbed;
        }

        if (dmg > 0) {
          pl.hp -= dmg;
          pl.iFrames = 0.8;
          callbacks.onPlayerDamage(pl.playerId, dmg);
        }
        break;
      }
    }
  }

  // -- Melee hitboxes vs enemies --
  for (let hi = world.meleeHitboxes.length - 1; hi >= 0; hi--) {
    const hb = world.meleeHitboxes[hi];
    hb.lifetime -= delta;

    if (hb.lifetime <= 0) {
      world.meleeHitboxes.splice(hi, 1);
      continue;
    }

    // Pass 1: Collect enemies in arc
    const meleeTargets: import('../types').EnemyEntity[] = [];
    for (const e of world.enemies) {
      if (e.intangible) continue;
      if (hb.hitEnemyIds.has(e.id)) continue;

      const dx = e.x - hb.x;
      const dy = e.y - hb.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hb.radius + e.radius) {
        const angle = Math.atan2(dy, dx);
        let angleDiff = angle - hb.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) <= hb.arc / 2) {
          meleeTargets.push(e);
        }
      }
    }

    // v1.2: maxTargets limiting (War Axe)
    let finalMeleeTargets = meleeTargets;
    if (hb.maxTargets && meleeTargets.length > hb.maxTargets) {
      finalMeleeTargets = meleeTargets
        .sort((a, b) => {
          const da = (a.x - hb.x) ** 2 + (a.y - hb.y) ** 2;
          const db = (b.x - hb.x) ** 2 + (b.y - hb.y) ** 2;
          return da - db;
        })
        .slice(0, hb.maxTargets);
    }

    // Pass 2: Apply damage
    let meleeHitAny = false;
    for (const e of finalMeleeTargets) {
      hb.hitEnemyIds.add(e.id);
      const markMul = getMarkMultiplier(e.statusEffects, e.isBoss);
      const effectiveDmg = Math.max(1, hb.damage * markMul - e.armor);
      e.hp -= effectiveDmg;
      e.flashTimer = 0.1;
      meleeHitAny = true;
      spawnDamageNumber(world, e.x, e.y - e.radius, effectiveDmg, false);

      // v1.2: Whip lifesteal (Crimson Whip / Sanguine Scourge)
      const whipLS = getWhipLifesteal(hb.weaponId);
      if (whipLS > 0) {
        const heal = effectiveDmg * whipLS;
        if (heal > 0) {
          world.player.hp = Math.min(world.player.hp + heal, world.player.maxHp);
        }
      }
    }

    // v1.2: Activate block on melee hit (Broad Sword)
    if (meleeHitAny) {
      activateBlock(world, hb);
    }
  }

  // -- Aura damage ticks (positioned on owning player) --
  for (const aura of world.auras) {
    // Auras follow whoever's player was active (swap trick handles this)
    aura.timer -= delta;
    if (aura.timer <= 0) {
      aura.timer += aura.tickInterval;
      aura.tickHitEnemyIds.clear();

      const auraTargets: import('../types').EnemyEntity[] = [];
      for (const e of world.enemies) {
        if (e.intangible) continue;
        const dx = e.x - aura.x;
        const dy = e.y - aura.y;
        if (dx * dx + dy * dy <= (aura.radius + e.radius) * (aura.radius + e.radius)) {
          auraTargets.push(e);
        }
      }

      // v1.2: maxTargets limiting (Garlic)
      let finalAuraTargets = auraTargets;
      if (aura.maxTargets && auraTargets.length > aura.maxTargets) {
        finalAuraTargets = auraTargets
          .sort((a, b) => {
            const da = (a.x - aura.x) ** 2 + (a.y - aura.y) ** 2;
            const db = (b.x - aura.x) ** 2 + (b.y - aura.y) ** 2;
            return da - db;
          })
          .slice(0, aura.maxTargets);
      }

      for (const e of finalAuraTargets) {
        // v1.2: Inner radius damage falloff (Garlic: outer ring does 50% damage)
        let falloff = 1;
        if (aura.innerRadius) {
          const eDist = Math.sqrt((e.x - aura.x) ** 2 + (e.y - aura.y) ** 2);
          if (eDist > aura.innerRadius) {
            falloff = 0.5;
          }
        }

        const effectiveDmg = Math.max(1, aura.damagePerTick * falloff - e.armor);
        e.hp -= effectiveDmg;
        e.flashTimer = 0.05;
        aura.tickHitEnemyIds.add(e.id);

        // v1.2: Knockback (Garlic)
        if (aura.knockback && aura.knockback > 0) {
          const kbDx = e.x - aura.x;
          const kbDy = e.y - aura.y;
          const kbDist = Math.sqrt(kbDx * kbDx + kbDy * kbDy);
          if (kbDist > 0.1) {
            e.x += (kbDx / kbDist) * aura.knockback;
            e.y += (kbDy / kbDist) * aura.knockback;
          }
        }
      }
    }
  }

  // -- Summon attacks --
  for (const s of world.summons) {
    s.lifetime -= delta;
    s.attackTimer -= delta;

    let nearestEnemy: import('../types').EnemyEntity | null = null;
    let nearestDist = Infinity;
    for (const e of world.enemies) {
      if (e.intangible) continue;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = e;
      }
    }

    if (nearestEnemy) {
      const dx = nearestEnemy.x - s.x;
      const dy = nearestEnemy.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > s.radius + nearestEnemy.radius) {
        s.x += (dx / dist) * s.speed * delta;
        s.y += (dy / dist) * s.speed * delta;
      } else if (s.attackTimer <= 0) {
        const effectiveDmg = Math.max(1, s.damage - nearestEnemy.armor);
        nearestEnemy.hp -= effectiveDmg;
        nearestEnemy.flashTimer = 0.1;
        s.attackTimer = 1 / s.attackSpeed;
      }
    }
  }

  // Remove dead summons
  for (let i = world.summons.length - 1; i >= 0; i--) {
    if (world.summons[i].hp <= 0 || world.summons[i].lifetime <= 0) {
      world.summons.splice(i, 1);
    }
  }

  // -- Remove dead enemies + spawn drops --
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (e.hp <= 0) {
      if (e.isBoss) continue;

      callbacks.onKill(null);
      world.sharedKills++;
      spawnDeathBurst(world, e.x, e.y, '#888');

      // Spawn pickups (luck from nearest player)
      const nearest = alivePlayers.reduce((best, p) => {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) return { p, d };
        return best;
      }, null as { p: MultiplayerPlayerEntity; d: number } | null);

      const luck = nearest
        ? (playerStates.get(nearest.p.playerId)?.effectiveStats?.luck ?? 1)
        : 1;
      spawnEnemyDrops(world, e, luck);

      // v1.2: Hunter's Mark transfer on kill (Ranger)
      for (const player of alivePlayers) {
        if (player.classId === 'ranger') {
          tryTransferHuntersMark(world, e);
          break;
        }
      }

      // Necromancer raise dead for any necromancer player
      for (const player of alivePlayers) {
        if (player.classId === 'necromancer') {
          const pState = playerStates.get(player.playerId);
          tryRaiseDead(world, e.x, e.y, pState?.effectiveStats || ({} as PlayerStats), 1);
          break; // Only one raise per enemy
        }
      }

      // Hemomancer blood nova kill healing
      for (const player of alivePlayers) {
        if (player.classId === 'hemomancer') {
          const pState = playerStates.get(player.playerId);
          if (pState) reportBloodNovaKill(pState.abilityState);
        }
      }

      world.enemies.splice(i, 1);
    }
  }
}
