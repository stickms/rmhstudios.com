// =============================================================================
// ALTAIR ENGINE -- Boss Encounter System
// =============================================================================
// Manages boss spawning, phase transitions, attack patterns, and special
// mechanics for all four bosses: The Hollow King, The Crimson Countess,
// Elder Lich Malachar, and Terminus, The Undying.
// =============================================================================

import {
  EnemyEntity,
  ProjectileEntity,
  GameWorld,
  createId,
} from './types';
import { BOSSES, BossDef } from '../data/bosses';
import { getHPScale, getDamageScale, getSpeedScale } from '../data/scaling';
import { applyEmpower } from './status-effects';

// =============================================================================
// Types
// =============================================================================

export interface BossState {
  bossId: string;
  entity: EnemyEntity;
  defIndex: number; // index into BOSSES array
  currentPhase: number;
  attackTimers: Record<string, number>; // per-attack cooldown timers
  phaseState: Record<string, number>; // per-phase persistent state
  deathMarchActive?: boolean;
  consumeActive?: boolean;
  swoopActive?: boolean;
  teleportFading?: boolean;
  staggered?: boolean;
  orbitAngle?: number;
  soulStormAngle?: number;
  // v1.1 balance fields
  hpSnapshot: number;             // HP before collisions (set each frame for DPS cap)
  damageTakenThisSecond: number;   // cumulative damage in current 1-second window
  damageWindowTimer: number;       // countdown for the 1-second damage window
  timeSinceSpawn: number;          // total time since boss spawned (for enrage timer)
  enraged: boolean;                // whether the boss has enraged
}

export interface BossSystemEvents {
  bossSpawned?: { bossId: string; name: string; title: string; color: string; maxHp: number };
  bossDefeated?: string;
  bossPhaseChanged?: { phase: number; name: string };
  bossProjectiles: ProjectileEntity[];
  bossSpawnEnemies: { defId: string; x: number; y: number; hpMul: number }[];
  screenShake?: number;
  weaponsDisabled?: number;
  playerPull?: { forceX: number; forceY: number };
}

// =============================================================================
// Helpers
// =============================================================================

/** Distance and direction from one point to another. */
function distBetween(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dx: number; dy: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return { dx, dy, dist };
}

/** Create an enemy projectile. */
function makeProjectile(
  world: GameWorld,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  radius: number,
  lifetime: number,
  color: string,
  extra?: Partial<ProjectileEntity>,
): ProjectileEntity {
  return {
    id: createId(world),
    x,
    y,
    vx,
    vy,
    damage,
    radius,
    lifetime,
    pierceLeft: 999,
    hitEnemyIds: new Set(),
    isEnemy: true,
    color,
    ...extra,
  } as ProjectileEntity;
}

/** Create a fresh BossSystemEvents object. */
function createEvents(): BossSystemEvents {
  return {
    bossProjectiles: [],
    bossSpawnEnemies: [],
  };
}

// =============================================================================
// Spawn
// =============================================================================

/**
 * Spawn a boss by ID. Creates the EnemyEntity, scales stats, and returns
 * the initial BossState.
 */
export function spawnBoss(world: GameWorld, bossId: string): BossState | null {
  const defIndex = BOSSES.findIndex((b) => b.id === bossId);
  if (defIndex === -1) return null;

  const def = BOSSES[defIndex];
  const timeMinutes = world.time / 60;

  // Scale stats
  const hpScale = getHPScale(timeMinutes);
  const dmgScale = getDamageScale(timeMinutes);
  const spdScale = getSpeedScale(timeMinutes);

  const scaledHp = Math.round(def.baseHp * hpScale);
  const scaledSpeed = def.baseSpeed * spdScale;
  const bossRadius = 12 * def.size; // base radius 12 * size multiplier

  // Position 500px from player in a random direction
  const angle = Math.random() * Math.PI * 2;
  const spawnX = world.player.x + Math.cos(angle) * 500;
  const spawnY = world.player.y + Math.sin(angle) * 500;

  const entity: EnemyEntity = {
    id: createId(world),
    x: spawnX,
    y: spawnY,
    radius: bossRadius,
    defId: bossId,
    hp: scaledHp,
    maxHp: scaledHp,
    damage: Math.round(def.phases[0].attacks[0]?.damage ?? 30 * dmgScale),
    speed: scaledSpeed,
    xpDrop: 0, // bosses drop coins/chests, not XP gems
    flashTimer: 0,
    aiState: 'boss',
    aiTimer: 0,
    aiTimer2: 0,
    aiParams: { damageScale: dmgScale, speedScale: spdScale },
    statusEffects: [],
    isBoss: true,
    bossId,
    bossPhase: 0,
    armor: def.armor,
    intangible: false,
    canFly: false,
    opacity: 1.0,
    dashVx: 0,
    dashVy: 0,
    lastMoveVx: 0,
    lastMoveVy: 0,
    isDead: false,
    corpseTimer: 0,
  };

  // Initialize attack timers to half their cooldowns (first attack comes sooner)
  const attackTimers: Record<string, number> = {};
  for (const phase of def.phases) {
    for (const attack of phase.attacks) {
      attackTimers[attack.id] = attack.cooldown * 0.5;
    }
  }

  // Initialize phase state
  const phaseState: Record<string, number> = {};

  // Boss-specific initialization
  switch (bossId) {
    case 'crimson_countess': {
      const shieldHp = def.phases[0].modifiers.shieldHp ?? 100;
      phaseState.shieldHp = shieldHp;
      phaseState.shieldMaxHp = shieldHp;
      phaseState.shieldLastHitTimer = 0;
      break;
    }
    case 'elder_lich_malachar': {
      const phylHp = def.phases[0].modifiers.phylacteryHp ?? 200;
      phaseState.innerPhylacteryHp = phylHp;
      phaseState.middlePhylacteryHp = phylHp;
      phaseState.outerPhylacteryHp = phylHp;
      phaseState.phylacteryOrbitAngle = 0;
      phaseState.middleGravityWellTimer = 5;
      phaseState.outerRingTimer = 4;
      phaseState.innerBeamAccum = 0;
      break;
    }
    case 'terminus': {
      phaseState.spawnedAmalgamations = 0;
      phaseState.adaptiveResistTimer = 10;
      phaseState.adaptiveWeaponId = 0; // no resistance yet
      phaseState.orbitTimer = 0;
      phaseState.finalConsumeTriggered = 0;
      phaseState.finalConsumeTimer = 0;
      phaseState.staggerTimer = 0;
      break;
    }
  }

  const state: BossState = {
    bossId,
    entity,
    defIndex,
    currentPhase: 0,
    attackTimers,
    phaseState,
    orbitAngle: 0,
    soulStormAngle: 0,
    // v1.1 balance fields
    hpSnapshot: 0,
    damageTakenThisSecond: 0,
    damageWindowTimer: 0,
    timeSinceSpawn: 0,
    enraged: false,
  };

  return state;
}

// =============================================================================
// Update
// =============================================================================

/**
 * Update a boss each frame. Handles phase transitions, attack cooldowns,
 * movement, and returns events (projectiles, spawned enemies, etc.).
 */
export function updateBoss(
  world: GameWorld,
  state: BossState,
  delta: number,
): BossSystemEvents {
  const events = createEvents();
  const def = BOSSES[state.defIndex];
  const entity = state.entity;
  const dmgScale = entity.aiParams.damageScale ?? 1;

  // --- HP Regeneration (v1.1) ---
  if (def.hpRegenPerSecond > 0 && entity.hp > 0) {
    entity.hp = Math.min(entity.maxHp, entity.hp + def.hpRegenPerSecond * delta);
  }

  // --- Check for defeat ---
  if (entity.hp <= 0) {
    events.bossDefeated = state.bossId;
    return events;
  }

  // --- Enrage Timer (v1.1) ---
  state.timeSinceSpawn += delta;
  if (def.enrageTime > 0 && state.timeSinceSpawn >= def.enrageTime && !state.enraged) {
    state.enraged = true;
    events.screenShake = 10;

    // Boss-specific enrage behavior
    switch (state.bossId) {
      case 'hollow_king': {
        // +50% speed, Cleave every 2s, Bone Spikes every 4s
        entity.speed *= 1.5;
        state.attackTimers['hk_cleave'] = Math.min(state.attackTimers['hk_cleave'] ?? 2, 2);
        state.attackTimers['hk_cleave_p2'] = Math.min(state.attackTimers['hk_cleave_p2'] ?? 2, 2);
        state.attackTimers['hk_bone_spikes'] = Math.min(state.attackTimers['hk_bone_spikes'] ?? 4, 4);
        break;
      }
      case 'crimson_countess': {
        // Swoops every 1.5s, constant blood rain
        entity.speed *= 1.3;
        break;
      }
      case 'elder_lich_malachar': {
        // Transition to Enrage phase (phase index 1)
        const enragePhaseIndex = def.phases.findIndex((p) => p.name === 'Enrage');
        if (enragePhaseIndex >= 0) {
          state.currentPhase = enragePhaseIndex;
          entity.bossPhase = enragePhaseIndex;
          events.bossPhaseChanged = {
            phase: enragePhaseIndex,
            name: def.phases[enragePhaseIndex].name,
          };
          // Resurrect phylacteries at full HP per enrage modifiers
          const resHp = def.phases[enragePhaseIndex].modifiers.resurrectedPhylacteryHp ?? 100;
          state.phaseState.innerPhylacteryHp = resHp;
          state.phaseState.middlePhylacteryHp = resHp;
          state.phaseState.outerPhylacteryHp = resHp;
        }
        break;
      }
      // Terminus has enrageTime 0, so no enrage behavior needed
    }
  }

  // --- Phase transition check ---
  const hpPercent = entity.hp / entity.maxHp;
  let newPhase = state.currentPhase;
  for (let i = def.phases.length - 1; i >= 0; i--) {
    if (hpPercent <= def.phases[i].hpThreshold) {
      newPhase = i;
    }
  }
  // Phases are ordered by hpThreshold descending (1.0, 0.5, 0.25, etc.)
  // We want the phase whose threshold we are at or below
  for (let i = def.phases.length - 1; i > 0; i--) {
    if (hpPercent <= def.phases[i].hpThreshold) {
      newPhase = i;
      break;
    }
  }

  if (newPhase !== state.currentPhase) {
    state.currentPhase = newPhase;
    entity.bossPhase = newPhase;
    events.bossPhaseChanged = {
      phase: newPhase,
      name: def.phases[newPhase].name,
    };
    events.screenShake = 8;
  }

  const phase = def.phases[state.currentPhase];

  // --- Dispatch to boss-specific update ---
  switch (state.bossId) {
    case 'hollow_king':
      updateHollowKing(world, state, def, delta, events, dmgScale);
      break;
    case 'crimson_countess':
      updateCrimsonCountess(world, state, def, delta, events, dmgScale);
      break;
    case 'elder_lich_malachar':
      updateElderLichMalachar(world, state, def, delta, events, dmgScale);
      break;
    case 'terminus':
      updateTerminus(world, state, def, delta, events, dmgScale);
      break;
  }

  // --- Flash timer ---
  if (entity.flashTimer > 0) {
    entity.flashTimer -= delta;
    if (entity.flashTimer < 0) entity.flashTimer = 0;
  }

  return events;
}

// =============================================================================
// Boss 1: The Hollow King
// =============================================================================

function updateHollowKing(
  world: GameWorld,
  state: BossState,
  def: BossDef,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
): void {
  const entity = state.entity;
  const phase = def.phases[state.currentPhase];
  const { dx, dy, dist } = distBetween(entity.x, entity.y, world.player.x, world.player.y);

  // --- Phase 2 modifiers ---
  let speedMul = 1;
  if (state.currentPhase >= 1) {
    const speedBoost = phase.modifiers.speedBoost ?? 0;
    speedMul = 1 + speedBoost;

    // Empower all enemies with +15% speed
    const allEnemyBoost = phase.modifiers.allEnemySpeedBoost ?? 0;
    if (allEnemyBoost > 0) {
      for (const enemy of world.enemies) {
        if (!enemy.isBoss && enemy.hp > 0) {
          applyEmpower(enemy.statusEffects, allEnemyBoost, 1.0);
        }
      }
    }
  }

  // --- Death March handling ---
  if (state.deathMarchActive) {
    const marchDist = state.phaseState.marchDistRemaining ?? 0;
    if (marchDist > 0) {
      const marchSpeed = 250;
      const step = marchSpeed * delta;
      const marchDx = state.phaseState.marchDx ?? 0;
      const marchDy = state.phaseState.marchDy ?? 0;
      entity.x += marchDx * step;
      entity.y += marchDy * step;
      state.phaseState.marchDistRemaining = marchDist - step;

      // Leave bone spike trail (pool projectile)
      state.phaseState.trailTimer = (state.phaseState.trailTimer ?? 0) - delta;
      if (state.phaseState.trailTimer <= 0) {
        state.phaseState.trailTimer = 0.15; // trail segment interval
        events.bossProjectiles.push(
          makeProjectile(
            world,
            entity.x,
            entity.y,
            0,
            0,
            15 * dmgScale,
            30,
            3,
            '#2D5A27',
            {
              isPool: true,
              poolDamagePerTick: 15 * dmgScale,
              poolTickInterval: 0.5,
              poolTimer: 0,
              poolRadius: 30,
            },
          ),
        );
      }
    } else {
      state.deathMarchActive = false;
      entity.dashVx = 0;
      entity.dashVy = 0;
    }
    return; // Don't do other things during Death March
  }

  // --- Movement: chase player ---
  const chaseSpeed = entity.speed * speedMul;
  entity.x += (dx / dist) * chaseSpeed * delta;
  entity.y += (dy / dist) * chaseSpeed * delta;

  // --- Process attacks for current phase ---
  for (const attack of phase.attacks) {
    const timerId = attack.id;
    state.attackTimers[timerId] = (state.attackTimers[timerId] ?? 0) - delta;
    if (state.attackTimers[timerId] > 0) continue;

    switch (attack.id) {
      // Phase 1 attacks
      case 'hk_cleave': {
        state.attackTimers[timerId] = state.enraged ? 2 : attack.cooldown;
        // 180-degree melee arc, 150px range
        const arcRad = ((attack.params.arc ?? 180) * Math.PI) / 180;
        const range = attack.params.range ?? 150;
        if (dist <= range) {
          // Spawn a short-lived AoE projectile representing the cleave
          const angle = Math.atan2(dy, dx);
          events.bossProjectiles.push(
            makeProjectile(
              world,
              entity.x + Math.cos(angle) * 40,
              entity.y + Math.sin(angle) * 40,
              0,
              0,
              attack.damage * dmgScale,
              range,
              0.2,
              '#2D5A27',
              { aoeRadius: range },
            ),
          );
          events.screenShake = 3;
        }
        break;
      }

      case 'hk_summon_shambler': {
        state.attackTimers[timerId] = attack.cooldown;
        const count = attack.params.summonCount ?? 8;
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 * i) / count;
          const spawnDist = 80;
          events.bossSpawnEnemies.push({
            defId: 'shambler',
            x: entity.x + Math.cos(a) * spawnDist,
            y: entity.y + Math.sin(a) * spawnDist,
            hpMul: 1,
          });
        }
        break;
      }

      case 'hk_bone_spikes': {
        state.attackTimers[timerId] = state.enraged ? 4 : attack.cooldown;
        const spikeCount = attack.params.spikeCount ?? 5;
        const spacing = attack.params.spikeSpacing ?? 40;
        const ndx = dx / dist;
        const ndy = dy / dist;
        for (let i = 0; i < spikeCount; i++) {
          const offset = spacing * (i + 1);
          events.bossProjectiles.push(
            makeProjectile(
              world,
              entity.x + ndx * offset,
              entity.y + ndy * offset,
              0,
              0,
              attack.damage * dmgScale,
              20,
              1.5,
              '#2D5A27',
            ),
          );
        }
        break;
      }

      // Phase 2 attacks
      case 'hk_cleave_p2': {
        state.attackTimers[timerId] = state.enraged ? 2 : attack.cooldown;
        const range = attack.params.range ?? 150;
        if (dist <= range) {
          const angle = Math.atan2(dy, dx);
          events.bossProjectiles.push(
            makeProjectile(
              world,
              entity.x + Math.cos(angle) * 40,
              entity.y + Math.sin(angle) * 40,
              0,
              0,
              attack.damage * dmgScale,
              range,
              0.2,
              '#2D5A27',
              { aoeRadius: range },
            ),
          );
          events.screenShake = 4;
        }
        break;
      }

      case 'hk_death_march': {
        state.attackTimers[timerId] = attack.cooldown;
        const chargeDistance = attack.params.chargeDistance ?? 400;
        state.deathMarchActive = true;
        state.phaseState.marchDistRemaining = chargeDistance;
        state.phaseState.marchDx = dx / dist;
        state.phaseState.marchDy = dy / dist;
        state.phaseState.trailTimer = 0;
        events.screenShake = 5;
        break;
      }
    }
  }
}

// =============================================================================
// Boss 2: The Crimson Countess
// =============================================================================

function updateCrimsonCountess(
  world: GameWorld,
  state: BossState,
  def: BossDef,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
): void {
  const entity = state.entity;
  const phase = def.phases[state.currentPhase];
  const { dx, dy, dist } = distBetween(entity.x, entity.y, world.player.x, world.player.y);

  // --- Shield management ---
  const shieldRemoved = phase.modifiers.shieldRemoved ?? 0;
  if (shieldRemoved > 0) {
    state.phaseState.shieldHp = 0;
  } else {
    // Shield regen
    const regenDelay = phase.modifiers.shieldRegenDelay ?? 3;
    const regenRate = phase.modifiers.shieldRegenPerSecond ?? 10;
    state.phaseState.shieldLastHitTimer = (state.phaseState.shieldLastHitTimer ?? 0) + delta;
    if (
      state.phaseState.shieldLastHitTimer >= regenDelay &&
      state.phaseState.shieldHp < (state.phaseState.shieldMaxHp ?? 100)
    ) {
      state.phaseState.shieldHp = Math.min(
        state.phaseState.shieldMaxHp ?? 100,
        (state.phaseState.shieldHp ?? 0) + regenRate * delta,
      );
    }
  }

  // --- Speed modifier ---
  const speedBoost = phase.modifiers.speedBoost ?? 0;
  const speedMul = 1 + speedBoost;

  // --- Swoop handling (Crimson Fury) ---
  if (state.swoopActive) {
    const swoopTimer = state.phaseState.swoopTimer ?? 0;
    if (swoopTimer > 0) {
      entity.x += entity.dashVx * delta;
      entity.y += entity.dashVy * delta;
      state.phaseState.swoopTimer = swoopTimer - delta;
    } else {
      state.swoopActive = false;
      entity.dashVx = 0;
      entity.dashVy = 0;
    }
    // Still process other attacks during swoop
  }

  // --- Movement: chase player ---
  if (!state.swoopActive) {
    const chaseSpeed = entity.speed * speedMul;
    entity.x += (dx / dist) * chaseSpeed * delta;
    entity.y += (dy / dist) * chaseSpeed * delta;
  }

  // --- Process attacks for current phase ---
  for (const attack of phase.attacks) {
    const timerId = attack.id;
    state.attackTimers[timerId] = (state.attackTimers[timerId] ?? 0) - delta;
    if (state.attackTimers[timerId] > 0) continue;

    switch (attack.id) {
      // Phase 1 attacks
      case 'cc_blood_lance': {
        state.attackTimers[timerId] = attack.cooldown;
        const projSpeed = attack.params.projectileSpeed ?? 280;
        const ndx = dx / dist;
        const ndy = dy / dist;
        events.bossProjectiles.push(
          makeProjectile(
            world,
            entity.x,
            entity.y,
            ndx * projSpeed,
            ndy * projSpeed,
            attack.damage * dmgScale,
            10,
            3,
            '#8B0000',
          ),
        );
        break;
      }

      case 'cc_bat_cloud': {
        state.attackTimers[timerId] = attack.cooldown;
        const batCount = attack.params.batCount ?? 12;
        for (let i = 0; i < batCount; i++) {
          const a = (Math.PI * 2 * i) / batCount;
          const spawnDist = 40 + i * 8; // spiral pattern
          events.bossSpawnEnemies.push({
            defId: 'bat',
            x: entity.x + Math.cos(a) * spawnDist,
            y: entity.y + Math.sin(a) * spawnDist,
            hpMul: 0.3, // weaker bats with 3 HP (30% of base 5 = ~1.5, rounded)
          });
        }
        break;
      }

      // Phase 2 attacks
      case 'cc_blood_lance_p2': {
        state.attackTimers[timerId] = attack.cooldown;
        const projSpeed = attack.params.projectileSpeed ?? 280;
        const projCount = attack.params.projectileCount ?? 3;
        const spreadRad = ((attack.params.spreadAngle ?? 30) * Math.PI) / 180;
        const baseAngle = Math.atan2(dy, dx);
        const startAngle = baseAngle - spreadRad / 2;

        for (let i = 0; i < projCount; i++) {
          const a = projCount === 1 ? baseAngle : startAngle + (spreadRad * i) / (projCount - 1);
          events.bossProjectiles.push(
            makeProjectile(
              world,
              entity.x,
              entity.y,
              Math.cos(a) * projSpeed,
              Math.sin(a) * projSpeed,
              attack.damage * dmgScale,
              10,
              3,
              '#8B0000',
            ),
          );
        }
        break;
      }

      case 'cc_blood_rain': {
        state.attackTimers[timerId] = attack.cooldown;
        const radius = attack.params.radius ?? 300;
        const dropCount = attack.params.dropletCount ?? 15;
        // Spawn droplets around the player's current position
        for (let i = 0; i < dropCount; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          events.bossProjectiles.push(
            makeProjectile(
              world,
              world.player.x + Math.cos(a) * r,
              world.player.y + Math.sin(a) * r,
              0,
              0,
              attack.damage * dmgScale,
              15,
              1.0,
              '#DC143C',
            ),
          );
        }
        events.screenShake = 2;
        break;
      }

      // Phase 3 attacks
      case 'cc_crimson_fury': {
        state.attackTimers[timerId] = state.enraged ? 1.5 : attack.cooldown;
        const swoopDist = attack.params.swoopDistance ?? 300;
        const swoopDuration = attack.params.swoopDuration ?? 0.5;
        const swoopSpeed = swoopDist / swoopDuration;
        state.swoopActive = true;
        state.phaseState.swoopTimer = swoopDuration;
        entity.dashVx = (dx / dist) * swoopSpeed;
        entity.dashVy = (dy / dist) * swoopSpeed;
        break;
      }

      case 'cc_blood_rain_constant': {
        state.attackTimers[timerId] = state.enraged ? 1 : attack.cooldown;
        const radius = attack.params.radius ?? 200;
        const dropCount = attack.params.dropletCount ?? 5;
        for (let i = 0; i < dropCount; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          events.bossProjectiles.push(
            makeProjectile(
              world,
              world.player.x + Math.cos(a) * r,
              world.player.y + Math.sin(a) * r,
              0,
              0,
              10 * dmgScale,
              15,
              1.0,
              '#DC143C',
            ),
          );
        }
        break;
      }
    }
  }
}

/**
 * Process damage to the Crimson Countess. Damage goes to shield first.
 * Returns the actual HP damage to apply.
 */
export function processCrimsonCountessDamage(state: BossState, damage: number): number {
  if (state.bossId !== 'crimson_countess') return damage;

  const shieldHp = state.phaseState.shieldHp ?? 0;
  if (shieldHp > 0) {
    state.phaseState.shieldLastHitTimer = 0; // reset regen timer
    const absorbed = Math.min(shieldHp, damage);
    state.phaseState.shieldHp = shieldHp - absorbed;
    return damage - absorbed;
  }
  return damage;
}

// =============================================================================
// Boss 3: Elder Lich Malachar
// =============================================================================

function updateElderLichMalachar(
  world: GameWorld,
  state: BossState,
  def: BossDef,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
): void {
  const entity = state.entity;
  const phase = def.phases[state.currentPhase];
  const { dx, dy, dist } = distBetween(entity.x, entity.y, world.player.x, world.player.y);
  const mainMods = def.phases[0].modifiers;

  // --- Teleport fading: skip movement while fading ---
  if (state.teleportFading) {
    entity.opacity = Math.max(0.1, entity.opacity - delta * 2); // fade out over 0.5s
    if (entity.opacity <= 0.1) {
      // Complete teleport: reposition
      const minRange = 300;
      const maxRange = 500;
      const teleportDist = minRange + Math.random() * (maxRange - minRange);
      const teleportAngle = Math.random() * Math.PI * 2;
      // Explosion at departure point
      events.bossProjectiles.push(
        makeProjectile(
          world,
          entity.x,
          entity.y,
          0,
          0,
          15 * dmgScale,
          100,
          0.3,
          '#483D8B',
          { aoeRadius: 100 },
        ),
      );
      events.screenShake = 3;

      // Move to new position
      entity.x = world.player.x + Math.cos(teleportAngle) * teleportDist;
      entity.y = world.player.y + Math.sin(teleportAngle) * teleportDist;
      state.teleportFading = false;
      entity.opacity = 1.0;
    }
    // Don't do other things while fading
    return;
  }

  // --- Movement: maintain distance (ranged_kiter, prefer 350px) ---
  const preferredRange = 350;
  const moveSpeed = entity.speed;
  const margin = 30;
  if (dist < preferredRange - margin) {
    // Too close, move away
    entity.x -= (dx / dist) * moveSpeed * delta;
    entity.y -= (dy / dist) * moveSpeed * delta;
  } else if (dist > preferredRange + margin) {
    // Too far, move closer
    entity.x += (dx / dist) * moveSpeed * delta;
    entity.y += (dy / dist) * moveSpeed * delta;
  }

  // --- Phylactery mechanics ---
  const innerAlive = (state.phaseState.innerPhylacteryHp ?? 0) > 0;
  const middleAlive = (state.phaseState.middlePhylacteryHp ?? 0) > 0;
  const outerAlive = (state.phaseState.outerPhylacteryHp ?? 0) > 0;
  const anyPhylacteryAlive = innerAlive || middleAlive || outerAlive;

  // Update phylactery orbit angle
  state.phaseState.phylacteryOrbitAngle =
    (state.phaseState.phylacteryOrbitAngle ?? 0) + delta * 1.5; // ~86 deg/s

  const orbitAngle = state.phaseState.phylacteryOrbitAngle;

  // Inner phylactery: continuous beam toward player (32 dps, 200px range)
  if (innerAlive) {
    const innerOrbitR = mainMods.innerPhylacteryOrbitRadius ?? 150;
    const innerX = entity.x + Math.cos(orbitAngle) * innerOrbitR;
    const innerY = entity.y + Math.sin(orbitAngle) * innerOrbitR;
    const beamRange = mainMods.innerBeamRange ?? 200;
    const beamDps = mainMods.innerBeamDps ?? 32;
    const { dist: playerDist } = distBetween(innerX, innerY, world.player.x, world.player.y);

    if (playerDist <= beamRange) {
      // Apply continuous beam damage as a small projectile each frame
      state.phaseState.innerBeamAccum = (state.phaseState.innerBeamAccum ?? 0) + delta;
      if (state.phaseState.innerBeamAccum >= 0.25) {
        state.phaseState.innerBeamAccum = 0;
        const beamDamage = beamDps * 0.25; // damage per tick
        const { dx: bdx, dy: bdy, dist: bdist } = distBetween(
          innerX,
          innerY,
          world.player.x,
          world.player.y,
        );
        events.bossProjectiles.push(
          makeProjectile(
            world,
            innerX,
            innerY,
            (bdx / bdist) * 500,
            (bdy / bdist) * 500,
            beamDamage * dmgScale,
            8,
            0.5,
            '#7B68EE',
          ),
        );
      }
    }
  }

  // Middle phylactery: gravity well every 5s
  if (middleAlive) {
    const gravCooldown = mainMods.middleGravityWellCooldown ?? 5;
    state.phaseState.middleGravityWellTimer =
      (state.phaseState.middleGravityWellTimer ?? gravCooldown) - delta;
    if (state.phaseState.middleGravityWellTimer <= 0) {
      state.phaseState.middleGravityWellTimer = gravCooldown;
      const pullForce = mainMods.middleGravityWellPullForce ?? 60;
      const pullDuration = mainMods.middleGravityWellDuration ?? 2;
      // Signal a pull effect toward the middle phylactery position
      const middleOrbitR = mainMods.middlePhylacteryOrbitRadius ?? 250;
      const middleAngle = orbitAngle + (Math.PI * 2) / 3; // offset from inner
      const middleX = entity.x + Math.cos(middleAngle) * middleOrbitR;
      const middleY = entity.y + Math.sin(middleAngle) * middleOrbitR;
      const { dx: pdx, dy: pdy, dist: pdist } = distBetween(
        world.player.x,
        world.player.y,
        middleX,
        middleY,
      );
      events.playerPull = {
        forceX: (pdx / pdist) * pullForce,
        forceY: (pdy / pdist) * pullForce,
      };
    }
  }

  // Outer phylactery: ring of 8 projectiles every 4s
  if (outerAlive) {
    const ringCooldown = mainMods.outerRingCooldown ?? 4;
    state.phaseState.outerRingTimer =
      (state.phaseState.outerRingTimer ?? ringCooldown) - delta;
    if (state.phaseState.outerRingTimer <= 0) {
      state.phaseState.outerRingTimer = ringCooldown;
      const ringCount = mainMods.outerRingProjectiles ?? 8;
      const ringDamage = mainMods.outerRingDamage ?? 12;
      const ringSpeed = mainMods.outerRingProjectileSpeed ?? 160;
      const outerOrbitR = mainMods.outerPhylacteryOrbitRadius ?? 350;
      const outerAngle = orbitAngle + ((Math.PI * 2) * 2) / 3; // offset from inner
      const outerX = entity.x + Math.cos(outerAngle) * outerOrbitR;
      const outerY = entity.y + Math.sin(outerAngle) * outerOrbitR;

      for (let i = 0; i < ringCount; i++) {
        const a = (Math.PI * 2 * i) / ringCount;
        events.bossProjectiles.push(
          makeProjectile(
            world,
            outerX,
            outerY,
            Math.cos(a) * ringSpeed,
            Math.sin(a) * ringSpeed,
            ringDamage * dmgScale,
            8,
            3,
            '#9370DB',
          ),
        );
      }
    }
  }

  // --- Process attacks for current phase ---
  for (const attack of phase.attacks) {
    const timerId = attack.id;
    state.attackTimers[timerId] = (state.attackTimers[timerId] ?? 0) - delta;
    if (state.attackTimers[timerId] > 0) continue;

    switch (attack.id) {
      case 'elm_teleport':
      case 'elm_teleport_enrage': {
        state.attackTimers[timerId] = attack.cooldown;
        // Begin teleport fade
        state.teleportFading = true;
        break;
      }

      case 'elm_soul_barrage':
      case 'elm_soul_barrage_enrage': {
        state.attackTimers[timerId] = attack.cooldown;
        const orbCount = attack.params.orbCount ?? 3;
        const orbSpeed = attack.params.orbSpeed ?? 150;
        const orbTrackDuration = attack.params.orbTrackDuration ?? 4;
        const ndx = dx / dist;
        const ndy = dy / dist;

        for (let i = 0; i < orbCount; i++) {
          // Spread orbs slightly
          const spreadAngle = Math.atan2(ndy, ndx) + ((i - (orbCount - 1) / 2) * 0.3);
          events.bossProjectiles.push(
            makeProjectile(
              world,
              entity.x,
              entity.y,
              Math.cos(spreadAngle) * orbSpeed,
              Math.sin(spreadAngle) * orbSpeed,
              attack.damage * dmgScale,
              12,
              orbTrackDuration,
              '#483D8B',
              {
                homing: true,
                homingStrength: 2.5,
              },
            ),
          );
        }
        break;
      }

      case 'elm_mass_resurrection':
      case 'elm_mass_resurrection_enrage': {
        state.attackTimers[timerId] = attack.cooldown;
        const maxRes = attack.params.maxResurrect ?? 15;
        // Spawn shamblers as "resurrected" enemies
        for (let i = 0; i < maxRes; i++) {
          const a = (Math.PI * 2 * i) / maxRes;
          const spawnDist = 60 + Math.random() * 100;
          events.bossSpawnEnemies.push({
            defId: 'shambler',
            x: entity.x + Math.cos(a) * spawnDist,
            y: entity.y + Math.sin(a) * spawnDist,
            hpMul: attack.params.resurrectedHpPercent ?? 0.3,
          });
        }
        events.screenShake = 4;
        break;
      }
    }
  }
}

/**
 * Process damage to Elder Lich Malachar. While phylacteries are alive,
 * boss takes 50% reduced damage. Returns the actual HP damage to apply.
 */
export function processElderLichDamage(state: BossState, damage: number): number {
  if (state.bossId !== 'elder_lich_malachar') return damage;

  const innerAlive = (state.phaseState.innerPhylacteryHp ?? 0) > 0;
  const middleAlive = (state.phaseState.middlePhylacteryHp ?? 0) > 0;
  const outerAlive = (state.phaseState.outerPhylacteryHp ?? 0) > 0;
  const anyAlive = innerAlive || middleAlive || outerAlive;

  if (anyAlive) {
    return damage * 0.5;
  }
  return damage;
}

/**
 * Deal damage to a specific phylactery. Returns true if the phylactery was destroyed.
 */
export function damagePhylactery(
  state: BossState,
  phylactery: 'inner' | 'middle' | 'outer',
  damage: number,
): boolean {
  if (state.bossId !== 'elder_lich_malachar') return false;

  const key = `${phylactery}PhylacteryHp`;
  const currentHp = state.phaseState[key] ?? 0;
  if (currentHp <= 0) return false;

  state.phaseState[key] = Math.max(0, currentHp - damage);
  return state.phaseState[key] <= 0;
}

// =============================================================================
// Boss 4: Terminus, The Undying
// =============================================================================

function updateTerminus(
  world: GameWorld,
  state: BossState,
  def: BossDef,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
): void {
  const entity = state.entity;
  const phase = def.phases[state.currentPhase];
  const { dx, dy, dist } = distBetween(entity.x, entity.y, world.player.x, world.player.y);

  // --- Stagger check ---
  if (state.staggered) {
    state.phaseState.staggerTimer = (state.phaseState.staggerTimer ?? 0) - delta;
    if (state.phaseState.staggerTimer <= 0) {
      state.staggered = false;
    }
    // Boss doesn't move or attack while staggered, but Soul Storm continues
    if (state.currentPhase >= 2) {
      updateSoulStorm(world, state, delta, events, dmgScale);
    }
    return;
  }

  // --- Final Consume check (Phase 3, 10% HP) ---
  if (
    state.currentPhase >= 2 &&
    state.phaseState.finalConsumeTriggered === 0 &&
    entity.hp / entity.maxHp <= 0.1
  ) {
    state.phaseState.finalConsumeTriggered = 1;
    state.consumeActive = true;
    state.phaseState.finalConsumeTimer = 3; // 3s pull duration
    events.screenShake = 10;
  }

  // --- Final Consume active ---
  if (state.consumeActive && state.phaseState.finalConsumeTriggered === 1) {
    state.phaseState.finalConsumeTimer = (state.phaseState.finalConsumeTimer ?? 0) - delta;
    const pullForce = state.phaseState.finalConsumeTimer > 0 ? 200 : 0;
    if (pullForce > 0) {
      const { dx: pdx, dy: pdy, dist: pdist } = distBetween(
        world.player.x,
        world.player.y,
        entity.x,
        entity.y,
      );
      events.playerPull = {
        forceX: (pdx / pdist) * pullForce,
        forceY: (pdy / pdist) * pullForce,
      };
    }
    if (state.phaseState.finalConsumeTimer <= 0) {
      // Survived! Boss staggers for 5s
      state.consumeActive = false;
      state.staggered = true;
      state.phaseState.staggerTimer = 5;
      events.screenShake = 6;
    }
    // Soul Storm continues during final consume
    updateSoulStorm(world, state, delta, events, dmgScale);
    return;
  }

  // --- Phase-based behavior ---
  switch (state.currentPhase) {
    case 0:
      updateTerminusPhase1(world, state, def, delta, events, dmgScale, dx, dy, dist);
      break;
    case 1:
      updateTerminusPhase2(world, state, def, delta, events, dmgScale, dx, dy, dist);
      break;
    case 2:
      updateTerminusPhase3(world, state, def, delta, events, dmgScale, dx, dy, dist);
      break;
  }
}

// --- Phase 1: The Maw ---

function updateTerminusPhase1(
  world: GameWorld,
  state: BossState,
  def: BossDef,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
  dx: number,
  dy: number,
  dist: number,
): void {
  const entity = state.entity;
  const phase = def.phases[0];

  // Movement: walk toward player
  const moveSpeed = entity.speed;
  entity.x += (dx / dist) * moveSpeed * delta;
  entity.y += (dy / dist) * moveSpeed * delta;

  // Process attacks
  for (const attack of phase.attacks) {
    const timerId = attack.id;

    switch (attack.id) {
      case 'term_crushing_advance': {
        // Passive: contact damage handled by collision system
        break;
      }

      case 'term_consume': {
        state.attackTimers[timerId] = (state.attackTimers[timerId] ?? 0) - delta;
        if (state.attackTimers[timerId] > 0) break;
        state.attackTimers[timerId] = attack.cooldown;

        // Start consume: pull player for 2s
        state.consumeActive = true;
        state.phaseState.consumeTimer = attack.params.inhaleDuration ?? 2;
        break;
      }

      case 'term_spawn_amalgamation': {
        state.attackTimers[timerId] = (state.attackTimers[timerId] ?? 0) - delta;
        if (state.attackTimers[timerId] > 0) break;

        const maxSpawned = attack.params.maxSpawned ?? 5;
        if ((state.phaseState.spawnedAmalgamations ?? 0) < maxSpawned) {
          state.attackTimers[timerId] = attack.cooldown;
          state.phaseState.spawnedAmalgamations =
            (state.phaseState.spawnedAmalgamations ?? 0) + 1;

          // Spawn a random Tier 3-4 enemy
          const tier34Enemies = ['werewolf', 'cultist', 'witch', 'bone_golem', 'shadow'];
          const randomEnemy = tier34Enemies[Math.floor(Math.random() * tier34Enemies.length)];
          const angle = Math.random() * Math.PI * 2;
          const spawnDist = 60;
          events.bossSpawnEnemies.push({
            defId: randomEnemy,
            x: entity.x + Math.cos(angle) * spawnDist,
            y: entity.y + Math.sin(angle) * spawnDist,
            hpMul: 1,
          });
        }
        break;
      }
    }
  }

  // Handle active consume effect
  if (state.consumeActive && state.phaseState.finalConsumeTriggered !== 1) {
    state.phaseState.consumeTimer = (state.phaseState.consumeTimer ?? 0) - delta;
    if (state.phaseState.consumeTimer > 0) {
      const pullForce = 120;
      const { dx: pdx, dy: pdy, dist: pdist } = distBetween(
        world.player.x,
        world.player.y,
        entity.x,
        entity.y,
      );
      events.playerPull = {
        forceX: (pdx / pdist) * pullForce,
        forceY: (pdy / pdist) * pullForce,
      };
    } else {
      state.consumeActive = false;
    }
  }
}

// --- Phase 2: The Storm ---

function updateTerminusPhase2(
  world: GameWorld,
  state: BossState,
  def: BossDef,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
  dx: number,
  dy: number,
  dist: number,
): void {
  const entity = state.entity;
  const phase = def.phases[1];

  // Movement: walk toward player
  const moveSpeed = entity.speed;
  entity.x += (dx / dist) * moveSpeed * delta;
  entity.y += (dy / dist) * moveSpeed * delta;

  // Adaptive resistance timer
  const resistInterval = phase.modifiers.adaptiveResistanceInterval ?? 10;
  state.phaseState.adaptiveResistTimer =
    (state.phaseState.adaptiveResistTimer ?? resistInterval) - delta;
  if (state.phaseState.adaptiveResistTimer <= 0) {
    state.phaseState.adaptiveResistTimer = resistInterval;
    // The game loop should track which weapon dealt the most damage and
    // set state.phaseState.adaptiveWeaponId. Here we just signal the mechanic.
    // Actual resistance is applied by the damage processing function.
  }

  // Process attacks
  for (const attack of phase.attacks) {
    const timerId = attack.id;
    state.attackTimers[timerId] = (state.attackTimers[timerId] ?? 0) - delta;
    if (state.attackTimers[timerId] > 0) continue;

    switch (attack.id) {
      case 'term_void_zones': {
        state.attackTimers[timerId] = attack.cooldown;
        const zoneCount = attack.params.zoneCount ?? 3;
        const zoneRadius = attack.params.zoneRadius ?? 100;
        const zoneDps = attack.params.zoneDps ?? 15;
        const zoneDuration = attack.params.zoneDuration ?? 8;
        const spawnRange = attack.params.spawnRange ?? 400;

        for (let i = 0; i < zoneCount; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * spawnRange;
          events.bossProjectiles.push(
            makeProjectile(
              world,
              world.player.x + Math.cos(a) * r,
              world.player.y + Math.sin(a) * r,
              0,
              0,
              0, // pool handles damage
              zoneRadius,
              zoneDuration,
              'rgba(26, 26, 26, 0.5)',
              {
                isPool: true,
                poolDamagePerTick: zoneDps * 0.5 * dmgScale, // 2 ticks per second
                poolTickInterval: 0.5,
                poolTimer: 0,
                poolRadius: zoneRadius,
              },
            ),
          );
        }
        events.screenShake = 5;
        break;
      }

      case 'term_tendril_sweep': {
        state.attackTimers[timerId] = attack.cooldown;
        const tendrilCount = attack.params.tendrilCount ?? 4;
        const tendrilLength = attack.params.tendrilLength ?? 300;

        // Spawn 4 sweeping projectiles at 90-degree intervals
        for (let i = 0; i < tendrilCount; i++) {
          const a = (Math.PI * 2 * i) / tendrilCount;
          events.bossProjectiles.push(
            makeProjectile(
              world,
              entity.x + Math.cos(a) * tendrilLength * 0.5,
              entity.y + Math.sin(a) * tendrilLength * 0.5,
              0,
              0,
              25 * dmgScale,
              30,
              1.0,
              '#1A1A1A',
              { aoeRadius: tendrilLength * 0.3 },
            ),
          );
        }
        events.screenShake = 4;
        break;
      }
    }
  }

  // Continue phase 1 consume and amalgamation spawning
  const consumeAttack = def.phases[0].attacks.find((a) => a.id === 'term_consume');
  if (consumeAttack) {
    const cTimerId = consumeAttack.id;
    state.attackTimers[cTimerId] = (state.attackTimers[cTimerId] ?? 0) - delta;
    if (state.attackTimers[cTimerId] <= 0) {
      state.attackTimers[cTimerId] = consumeAttack.cooldown;
      state.consumeActive = true;
      state.phaseState.consumeTimer = consumeAttack.params.inhaleDuration ?? 2;
    }
  }

  // Handle active consume
  if (state.consumeActive && state.phaseState.finalConsumeTriggered !== 1) {
    state.phaseState.consumeTimer = (state.phaseState.consumeTimer ?? 0) - delta;
    if (state.phaseState.consumeTimer > 0) {
      const pullForce = 120;
      const { dx: pdx, dy: pdy, dist: pdist } = distBetween(
        world.player.x,
        world.player.y,
        entity.x,
        entity.y,
      );
      events.playerPull = {
        forceX: (pdx / pdist) * pullForce,
        forceY: (pdy / pdist) * pullForce,
      };
    } else {
      state.consumeActive = false;
    }
  }
}

// --- Phase 3: The End ---

function updateTerminusPhase3(
  world: GameWorld,
  state: BossState,
  def: BossDef,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
  dx: number,
  dy: number,
  dist: number,
): void {
  const entity = state.entity;
  const phase = def.phases[2];

  // --- Death Spiral: orbit player, closing spiral ---
  const startOrbitRadius = 200;
  const endOrbitRadius = 100;
  const closeDuration = 20;

  // Track orbit progress
  state.phaseState.orbitTimer = (state.phaseState.orbitTimer ?? 0) + delta;
  const orbitProgress = Math.min(1, state.phaseState.orbitTimer / closeDuration);
  const currentOrbitRadius =
    startOrbitRadius + (endOrbitRadius - startOrbitRadius) * orbitProgress;

  // Update orbit angle (speed increases as radius decreases)
  const orbitSpeed = (2.5 * startOrbitRadius) / Math.max(currentOrbitRadius, 50);
  state.orbitAngle = (state.orbitAngle ?? 0) + orbitSpeed * delta;

  // Position boss on orbit circle around player
  entity.x = world.player.x + Math.cos(state.orbitAngle) * currentOrbitRadius;
  entity.y = world.player.y + Math.sin(state.orbitAngle) * currentOrbitRadius;

  // Speed boost from phase modifiers
  const speedBoost = phase.modifiers.speedBoost ?? 1.0;

  // --- Soul Storm ---
  updateSoulStorm(world, state, delta, events, dmgScale);
}

/** Update the Soul Storm: 12 projectiles orbiting Terminus at 250px. */
function updateSoulStorm(
  world: GameWorld,
  state: BossState,
  delta: number,
  events: BossSystemEvents,
  dmgScale: number,
): void {
  const entity = state.entity;
  // Rotate at 180 deg/s
  const rotationSpeed = (180 * Math.PI) / 180; // radians per second
  state.soulStormAngle = (state.soulStormAngle ?? 0) + rotationSpeed * delta;

  // Emit orbiting projectiles periodically (every 0.5s to avoid flooding)
  state.phaseState.soulStormEmitTimer =
    (state.phaseState.soulStormEmitTimer ?? 0) - delta;
  if (state.phaseState.soulStormEmitTimer <= 0) {
    state.phaseState.soulStormEmitTimer = 0.5;

    const projCount = 12;
    const orbitRadius = 250;
    for (let i = 0; i < projCount; i++) {
      const a = state.soulStormAngle + (Math.PI * 2 * i) / projCount;
      const px = entity.x + Math.cos(a) * orbitRadius;
      const py = entity.y + Math.sin(a) * orbitRadius;
      events.bossProjectiles.push(
        makeProjectile(
          world,
          px,
          py,
          0,
          0,
          15 * dmgScale,
          15,
          0.6, // slightly longer than emit interval so they overlap
          '#1A1A1A',
        ),
      );
    }
  }
}

/**
 * Process damage to Terminus. Handles adaptive resistance in Phase 2.
 * The caller should provide the weaponId that dealt the damage.
 * Returns the actual HP damage to apply.
 */
export function processTerminusDamage(
  state: BossState,
  damage: number,
  weaponId?: string,
): number {
  if (state.bossId !== 'terminus') return damage;

  // Stagger: 2x damage taken
  if (state.staggered) {
    return damage * 2;
  }

  // Adaptive resistance in phase 2+
  if (state.currentPhase >= 1) {
    const resistWeaponId = state.phaseState.adaptiveWeaponId;
    if (resistWeaponId && weaponId && String(resistWeaponId) === weaponId) {
      return damage * 0.5; // 50% resistance to the adapted weapon
    }
  }

  return damage;
}

/**
 * Set the adaptive resistance target weapon for Terminus.
 * Should be called by the game loop every 10s with the weapon ID
 * that dealt the most damage during that interval.
 */
export function setTerminusAdaptiveResistance(
  state: BossState,
  weaponId: string,
): void {
  if (state.bossId !== 'terminus') return;
  // Store as a string-encoded number (phaseState uses numbers);
  // the game loop should compare weaponId strings.
  // We use a hash approach: store a simple numeric hash for comparison.
  state.phaseState.adaptiveWeaponId = hashString(weaponId);
}

/** Simple string hash for weapon ID comparison in phaseState. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

// =============================================================================
// Boss Damage Processing (unified entry point)
// =============================================================================

/**
 * Process incoming damage to any boss. Handles shields, phylacteries,
 * adaptive resistance, and stagger multipliers.
 * Returns the actual HP damage to apply to the boss entity.
 */
export function processBossDamage(
  state: BossState,
  damage: number,
  weaponId?: string,
): number {
  switch (state.bossId) {
    case 'crimson_countess':
      return processCrimsonCountessDamage(state, damage);
    case 'elder_lich_malachar':
      return processElderLichDamage(state, damage);
    case 'terminus':
      return processTerminusDamage(state, damage, weaponId);
    default:
      return damage;
  }
}

// =============================================================================
// DPS Cap: snapshot & enforce (v1.1)
// =============================================================================

/**
 * Snapshot the boss's current HP before collisions run.
 * Must be called each frame BEFORE handleCollisions in the game loop.
 */
export function snapshotBossHp(state: BossState): void {
  state.hpSnapshot = state.entity.hp;
}

/**
 * Enforce the per-second DPS cap after collisions have dealt damage.
 * Must be called each frame AFTER handleCollisions in the game loop.
 *
 * Tracks cumulative damage in a rolling 1-second window. If the total
 * damage exceeds dpsCapPerSecond, the excess HP is restored to the boss.
 */
export function enforceBossDpsCap(state: BossState, delta: number): void {
  const def = BOSSES[state.defIndex];
  if (!def) return;

  // Calculate damage taken this frame (from collision system)
  const frameDamage = Math.max(0, state.hpSnapshot - state.entity.hp);
  state.damageTakenThisSecond += frameDamage;

  // Advance the 1-second damage window
  state.damageWindowTimer += delta;
  if (state.damageWindowTimer >= 1.0) {
    state.damageWindowTimer -= 1.0;
    state.damageTakenThisSecond = 0;
  }

  // Enforce the cap: if cumulative damage this second exceeds the cap, restore excess HP
  if (def.dpsCapPerSecond > 0 && state.damageTakenThisSecond > def.dpsCapPerSecond) {
    const excess = state.damageTakenThisSecond - def.dpsCapPerSecond;
    state.entity.hp += excess;
    state.entity.hp = Math.min(state.entity.hp, state.entity.maxHp);
    state.damageTakenThisSecond = def.dpsCapPerSecond;
  }
}

// =============================================================================
// Utility: get phylactery positions for rendering
// =============================================================================

/**
 * Returns the current world positions of the three phylacteries for
 * rendering and hit-detection purposes.
 */
export function getPhylacteryPositions(
  state: BossState,
): { inner: { x: number; y: number; hp: number }; middle: { x: number; y: number; hp: number }; outer: { x: number; y: number; hp: number } } | null {
  if (state.bossId !== 'elder_lich_malachar') return null;

  const entity = state.entity;
  const orbitAngle = state.phaseState.phylacteryOrbitAngle ?? 0;

  const innerR = 150;
  const middleR = 250;
  const outerR = 350;

  return {
    inner: {
      x: entity.x + Math.cos(orbitAngle) * innerR,
      y: entity.y + Math.sin(orbitAngle) * innerR,
      hp: state.phaseState.innerPhylacteryHp ?? 0,
    },
    middle: {
      x: entity.x + Math.cos(orbitAngle + (Math.PI * 2) / 3) * middleR,
      y: entity.y + Math.sin(orbitAngle + (Math.PI * 2) / 3) * middleR,
      hp: state.phaseState.middlePhylacteryHp ?? 0,
    },
    outer: {
      x: entity.x + Math.cos(orbitAngle + ((Math.PI * 2) * 2) / 3) * outerR,
      y: entity.y + Math.sin(orbitAngle + ((Math.PI * 2) * 2) / 3) * outerR,
      hp: state.phaseState.outerPhylacteryHp ?? 0,
    },
  };
}
