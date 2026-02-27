// =============================================================================
// ALTAIR ENGINE -- Player System
// =============================================================================
// Player movement, stat computation, and class ability management.
// =============================================================================

import {
  GameWorld,
  PlayerEntity,
  EnemyEntity,
  SummonEntity,
  MeleeHitbox,
  ProjectileEntity,
  WeaponState,
  PassiveState,
  createId,
} from './types';
import { getMovementVector } from './input';
import { CLASSES, ClassDef } from '../data/classes';
import { PASSIVES } from '../data/passives';
import {
  PlayerStats,
  GLOBAL_BASE_STATS,
  STAT_SOFT_CAPS,
  STAT_HARD_CAPS,
} from '../stores/game-store';
import {
  applyStatusEffect,
  applySlow,
  applyStun,
  applyFreeze,
  applyMark,
  hasEffect,
  getEffectMagnitude,
} from './status-effects';

// =============================================================================
// Class Ability State
// =============================================================================

export interface ClassAbilityState {
  ability1Timer: number;
  ability2Timer: number;

  // Knight
  shieldTimer?: number;
  rallyCrySpeedTimer?: number;

  // Arcanist
  manaSurgeCharges?: number;

  // Ranger (no extra state needed beyond timers)

  // Plague Doctor
  miasmaTrailTimer?: number;
  pandemicChainCount?: number;
  pandemicChainTimer?: number;

  // Berserker
  savageSlamActive?: boolean;
  savageSlamTimer?: number;

  // Chronomancer
  timeDilationApplied?: boolean;

  // Hemomancer
  lifestealAccum?: number;
  bloodNovaKillHealAccum?: number;
}

/** Create a fresh ClassAbilityState with all timers at 0 (abilities ready). */
export function createClassAbilityState(): ClassAbilityState {
  return {
    ability1Timer: 0,
    ability2Timer: 0,
    manaSurgeCharges: 0,
    savageSlamActive: false,
    savageSlamTimer: 0,
    timeDilationApplied: false,
    lifestealAccum: 0,
    bloodNovaKillHealAccum: 0,
    shieldTimer: 0,
    rallyCrySpeedTimer: 0,
    miasmaTrailTimer: 0,
    pandemicChainCount: 0,
    pandemicChainTimer: 0,
  };
}

// =============================================================================
// Helper: find a ClassDef by id
// =============================================================================

function getClassDef(classId: string): ClassDef | undefined {
  return CLASSES.find((c) => c.id === classId);
}

// =============================================================================
// Helper: distance between two points
// =============================================================================

function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// =============================================================================
// 1. updatePlayer
// =============================================================================

/** Position history recording interval in seconds (10 Hz). */
const POSITION_HISTORY_INTERVAL = 0.1;
/** Maximum position history duration in seconds. */
const POSITION_HISTORY_DURATION = 4.0;
/** Maximum entries to keep. */
const POSITION_HISTORY_MAX = Math.ceil(
  POSITION_HISTORY_DURATION / POSITION_HISTORY_INTERVAL,
);

/** Tracks time since last position history record. */
let positionHistoryAccum = 0;

/**
 * Update the player entity each frame: movement, facing, iFrames, HP regen,
 * position history for Chronomancer, and stat capping.
 */
export function updatePlayer(
  world: GameWorld,
  classId: string,
  stats: PlayerStats,
  delta: number,
): void {
  const player = world.player;
  const { dx, dy } = getMovementVector(world.inputState);

  // ---- Movement ----
  const speed = stats.moveSpeed * delta;

  // Normalize diagonal movement (getMovementVector already normalizes, but be safe)
  let mx = dx;
  let my = dy;
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }

  player.x += mx * speed;
  player.y += my * speed;

  // ---- Facing direction (only update when moving) ----
  if (mx !== 0 || my !== 0) {
    player.facingX = mx;
    player.facingY = my;
  }

  // ---- iFrames decrement ----
  if (player.iFrames > 0) {
    player.iFrames = Math.max(0, player.iFrames - delta);
  }

  // ---- HP regen ----
  if (stats.hpRegen !== 0) {
    player.hp = Math.min(player.maxHp, player.hp + stats.hpRegen * delta);
    // Clamp to 1 minimum (regen should not kill, but negative regen can drain)
    if (stats.hpRegen < 0) {
      player.hp = Math.max(1, player.hp);
    }
  }

  // ---- Position history for Chronomancer rewind (10 Hz, last 4 seconds) ----
  positionHistoryAccum += delta;
  if (positionHistoryAccum >= POSITION_HISTORY_INTERVAL) {
    positionHistoryAccum -= POSITION_HISTORY_INTERVAL;
    player.positionHistory.push({
      x: player.x,
      y: player.y,
      hp: player.hp,
      time: world.time,
    });
    // Trim to max entries
    while (player.positionHistory.length > POSITION_HISTORY_MAX) {
      player.positionHistory.shift();
    }
  }

  // ---- Sync maxHp ----
  player.maxHp = stats.maxHp;
}

/** Reset the position history accumulator (call on run start). */
export function resetPositionHistoryAccum(): void {
  positionHistoryAccum = 0;
}

// =============================================================================
// 2. computeEffectiveStats
// =============================================================================

/**
 * Compute effective player stats by layering:
 * 1. Global base stats
 * 2. Class base stat modifiers
 * 3. Passive item bonuses (per level)
 * 4. Meta bonuses
 * 5. Soft caps and hard caps
 */
export function computeEffectiveStats(
  classId: string,
  level: number,
  weapons: WeaponState[],
  passives: PassiveState[],
  metaBonuses: Record<string, number>,
): PlayerStats {
  // Step 1: Start with a copy of global base stats
  const s: PlayerStats = { ...GLOBAL_BASE_STATS };

  // Step 2: Apply class base stat modifiers
  const classDef = getClassDef(classId);
  if (classDef) {
    const cb = classDef.baseStats;
    // Flat overrides / additions from class definition
    if (cb.maxHp !== undefined) s.maxHp = cb.maxHp;
    if (cb.hpRegen !== undefined) s.hpRegen = cb.hpRegen;
    if (cb.moveSpeed !== undefined) s.moveSpeed = cb.moveSpeed;
    if (cb.might !== undefined) s.might = cb.might;
    if (cb.attackSpeed !== undefined) s.attackSpeed = cb.attackSpeed;
    if (cb.area !== undefined) s.area = cb.area;
    if (cb.projCount !== undefined) s.projCount = cb.projCount;
    if (cb.projSpeed !== undefined) s.projSpeed = cb.projSpeed;
    if (cb.duration !== undefined) s.duration = cb.duration;
    if (cb.pickupRange !== undefined) s.pickupRange = cb.pickupRange;
    if (cb.luck !== undefined) s.luck = cb.luck;
    if (cb.armor !== undefined) s.armor = cb.armor;
    if (cb.cdr !== undefined) s.cdr = cb.cdr;
    if (cb.revival !== undefined) s.revival = cb.revival;
    if (cb.growth !== undefined) s.growth = cb.growth;
  }

  // Step 3: Accumulate passive item bonuses
  // Separate flat and percentage accumulators
  let flatArmor = 0;
  let flatProjCount = 0;
  let flatMaxHp = 0;
  let flatHpRegen = 0;
  let flatPickupRange = 0;

  let pctMight = 0;
  let pctArea = 0;
  let pctMoveSpeed = 0;
  let pctProjSpeed = 0;
  let pctDuration = 0;
  let pctCdr = 0;
  let pctMaxHp = 0;
  let pctLuck = 0;
  let pctGrowth = 0;

  for (const ps of passives) {
    const passiveDef = PASSIVES.find((p) => p.id === ps.passiveId);
    if (!passiveDef) continue;

    const bonuses = passiveDef.statBonusPerLevel;
    const lvl = ps.level;

    for (const [key, valuePerLevel] of Object.entries(bonuses)) {
      const total = valuePerLevel * lvl;

      switch (key) {
        // Flat bonuses
        case 'armor':
          flatArmor += total;
          break;
        case 'projCount':
          flatProjCount += total;
          break;
        case 'maxHp':
          flatMaxHp += total;
          break;
        case 'hpRegen':
          flatHpRegen += total;
          break;
        case 'pickupRange':
          flatPickupRange += total;
          break;

        // Percentage bonuses (accumulated as percentages, applied as multipliers)
        case 'mightPercent':
          pctMight += total;
          break;
        case 'areaPercent':
          pctArea += total;
          break;
        case 'moveSpeedPercent':
          pctMoveSpeed += total;
          break;
        case 'projSpeedPercent':
          pctProjSpeed += total;
          break;
        case 'durationPercent':
          pctDuration += total;
          break;
        case 'cdrPercent':
          pctCdr += total;
          break;
        case 'maxHpPercent':
          pctMaxHp += total;
          break;
        case 'luckPercent':
          pctLuck += total;
          break;
        case 'growthPercent':
          pctGrowth += total;
          break;
      }
    }
  }

  // Apply flat bonuses
  s.armor += flatArmor;
  s.projCount += flatProjCount;
  s.maxHp += flatMaxHp;
  s.hpRegen += flatHpRegen;
  s.pickupRange += flatPickupRange;

  // Apply percentage bonuses as multipliers
  s.might *= 1 + pctMight / 100;
  s.area *= 1 + pctArea / 100;
  s.moveSpeed *= 1 + pctMoveSpeed / 100;
  s.projSpeed *= 1 + pctProjSpeed / 100;
  s.duration *= 1 + pctDuration / 100;
  s.cdr *= 1 - pctCdr / 100; // CDR reduces cooldowns, so subtract
  s.maxHp *= 1 + pctMaxHp / 100;
  s.luck *= 1 + pctLuck / 100;
  s.growth *= 1 + pctGrowth / 100;

  // Round maxHp to integer after percentage
  s.maxHp = Math.floor(s.maxHp);

  // Step 4: Apply meta bonuses
  for (const [key, value] of Object.entries(metaBonuses)) {
    switch (key) {
      // Flat meta bonuses
      case 'armor':
        s.armor += value;
        break;
      case 'projCount':
        s.projCount += value;
        break;
      case 'maxHp':
        s.maxHp += value;
        break;
      case 'hpRegen':
        s.hpRegen += value;
        break;
      case 'pickupRange':
        s.pickupRange += value;
        break;
      case 'revival':
        s.revival += value;
        break;

      // Percent meta bonuses (applied as multipliers)
      case 'mightPercent':
        s.might *= 1 + value / 100;
        break;
      case 'areaPercent':
        s.area *= 1 + value / 100;
        break;
      case 'moveSpeedPercent':
        s.moveSpeed *= 1 + value / 100;
        break;
      case 'projSpeedPercent':
        s.projSpeed *= 1 + value / 100;
        break;
      case 'durationPercent':
        s.duration *= 1 + value / 100;
        break;
      case 'cdrPercent':
        s.cdr *= 1 - value / 100;
        break;
      case 'maxHpPercent':
        s.maxHp = Math.floor(s.maxHp * (1 + value / 100));
        break;
      case 'luckPercent':
        s.luck *= 1 + value / 100;
        break;
      case 'growthPercent':
        s.growth *= 1 + value / 100;
        break;
    }
  }

  // Step 5: Apply soft caps and hard caps
  applyCaps(s);

  // Round projCount to nearest integer
  s.projCount = Math.round(s.projCount);

  return s;
}

/**
 * Apply soft caps (diminishing returns past the cap) and hard caps (absolute max).
 * For stats where lower is better (cdr, attackSpeed), soft cap is a floor.
 */
function applyCaps(s: PlayerStats): void {
  // Use an indexable reference for dynamic property assignment
  const stats = s as unknown as Record<string, number>;

  for (const key of Object.keys(s) as (keyof PlayerStats)[]) {
    const softCap = STAT_SOFT_CAPS[key];
    const hardCap = STAT_HARD_CAPS[key];

    if (softCap !== undefined) {
      const isInverse = key === 'cdr' || key === 'attackSpeed';
      if (isInverse) {
        // For cdr/attackSpeed, lower is better. Soft cap is a floor with diminishing returns.
        if (stats[key] < softCap) {
          const excess = softCap - stats[key];
          stats[key] = softCap - excess * 0.5;
        }
      } else {
        // For normal stats, soft cap is a ceiling with diminishing returns.
        if (stats[key] > softCap) {
          const excess = stats[key] - softCap;
          stats[key] = softCap + excess * 0.5;
        }
      }
    }

    if (hardCap !== undefined) {
      const isInverse = key === 'cdr';
      if (isInverse) {
        // Hard cap is a floor for inverse stats
        stats[key] = Math.max(stats[key], hardCap);
      } else {
        stats[key] = Math.min(stats[key], hardCap);
      }
    }
  }
}

// =============================================================================
// 3. updateClassAbilities
// =============================================================================

/**
 * Update class abilities each frame. Decrements cooldowns, triggers abilities
 * when ready, and manages per-class persistent state.
 *
 * @returns Updated ClassAbilityState (caller should persist this).
 */
export function updateClassAbilities(
  world: GameWorld,
  classId: string,
  stats: PlayerStats,
  level: number,
  delta: number,
  abilityState: ClassAbilityState,
): ClassAbilityState {
  const state = { ...abilityState };
  const classDef = getClassDef(classId);
  if (!classDef) return state;

  // Decrement ability timers
  if (state.ability1Timer > 0) state.ability1Timer -= delta;
  if (state.ability2Timer > 0) state.ability2Timer -= delta;

  // Execute class-specific ability logic
  switch (classId) {
    case 'knight':
      handleKnight(world, stats, level, delta, state, classDef);
      break;
    case 'arcanist':
      handleArcanist(world, stats, level, delta, state, classDef);
      break;
    case 'ranger':
      handleRanger(world, stats, level, delta, state, classDef);
      break;
    case 'plague_doctor':
      handlePlagueDoctor(world, stats, level, delta, state, classDef);
      break;
    case 'berserker':
      handleBerserker(world, stats, level, delta, state, classDef);
      break;
    case 'necromancer':
      handleNecromancer(world, stats, level, delta, state, classDef);
      break;
    case 'chronomancer':
      handleChronomancer(world, stats, level, delta, state, classDef);
      break;
    case 'hemomancer':
      handleHemomancer(world, stats, level, delta, state, classDef);
      break;
  }

  return state;
}

// =============================================================================
// Knight Abilities
// =============================================================================

function handleKnight(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Shield Wall (Innate, CD 25s x cdr) ----
  if (state.ability1Timer <= 0) {
    // Activate shield
    const shieldAmount = 30 + 10 * Math.floor(level / 10);
    player.shieldHp = shieldAmount;
    state.shieldTimer = 8; // Shield lasts 8 seconds
    state.ability1Timer = classDef.ability1.cooldown * stats.cdr;
  }

  // Decrement shield timer, expire shield
  if (state.shieldTimer !== undefined && state.shieldTimer > 0) {
    state.shieldTimer -= delta;
    if (state.shieldTimer <= 0) {
      player.shieldHp = 0;
      state.shieldTimer = 0;
    }
  }

  // ---- Rally Cry (Level 10, CD 45s x cdr) ----
  if (level >= 10 && state.ability2Timer <= 0) {
    const radius = 250 * stats.area;
    const damage = 50 * stats.might;

    // Stun and damage all enemies within radius
    for (const enemy of world.enemies) {
      const d = dist(player.x, player.y, enemy.x, enemy.y);
      if (d <= radius) {
        applyStun(enemy.statusEffects, 1.5);
        enemy.hp -= damage;
        enemy.flashTimer = Math.max(enemy.flashTimer, 0.1);
      }
    }

    // Player gets +15% moveSpeed for 5 seconds (tracked via rallyCrySpeedTimer)
    state.rallyCrySpeedTimer = 5;

    state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
  }

  // Decrement rally cry speed buff timer
  if (state.rallyCrySpeedTimer !== undefined && state.rallyCrySpeedTimer > 0) {
    state.rallyCrySpeedTimer -= delta;
    if (state.rallyCrySpeedTimer <= 0) {
      state.rallyCrySpeedTimer = 0;
    }
  }
}

/**
 * Returns the Knight's rally cry move speed multiplier.
 * Call this when computing effective move speed for the frame.
 */
export function getKnightSpeedBonus(state: ClassAbilityState): number {
  if (state.rallyCrySpeedTimer !== undefined && state.rallyCrySpeedTimer > 0) {
    return 1.15;
  }
  return 1.0;
}

// =============================================================================
// Arcanist Abilities
// =============================================================================

function handleArcanist(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Mana Surge (Innate, CD 30s x cdr) ----
  if (state.ability1Timer <= 0 && (state.manaSurgeCharges ?? 0) <= 0) {
    state.manaSurgeCharges = 3;
    state.ability1Timer = classDef.ability1.cooldown * stats.cdr;
  }

  // ---- Arcane Nova (Level 10, CD 40s x cdr) ----
  if (level >= 10 && state.ability2Timer <= 0) {
    const radius = 400 * stats.area;
    const damage = 80 * stats.might;

    // Spawn a full-circle melee hitbox at player position
    const hitbox: MeleeHitbox = {
      x: player.x,
      y: player.y,
      radius,
      angle: 0,
      arc: 2 * Math.PI,
      damage,
      lifetime: 0.3, // brief visual
      maxLifetime: 0.3,
      hitEnemyIds: new Set(),
      weaponId: 'arcane_nova',
    };
    world.meleeHitboxes.push(hitbox);

    // Apply slow to all enemies in radius
    for (const enemy of world.enemies) {
      const d = dist(player.x, player.y, enemy.x, enemy.y);
      if (d <= radius) {
        applySlow(enemy.statusEffects, 0.3, 3);
      }
    }

    state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
  }
}

/**
 * Check if the Arcanist's Mana Surge is active.
 * Returns { damageMul, areaMul } for the weapon system to apply.
 * Consumes one charge when called with consume=true.
 */
export function consumeManaSurgeCharge(
  state: ClassAbilityState,
): { damageMul: number; areaMul: number } | null {
  if (state.manaSurgeCharges !== undefined && state.manaSurgeCharges > 0) {
    state.manaSurgeCharges--;
    return { damageMul: 2.0, areaMul: 1.5 };
  }
  return null;
}

/**
 * Peek at Mana Surge state without consuming a charge.
 */
export function hasManaSurgeCharges(state: ClassAbilityState): boolean {
  return (state.manaSurgeCharges ?? 0) > 0;
}

// =============================================================================
// Ranger Abilities
// =============================================================================

function handleRanger(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Evasion Roll (Innate, CD 20s x cdr) ----
  if (state.ability1Timer <= 0) {
    // Check if any enemy is within 60px
    let closestEnemy: EnemyEntity | null = null;
    let closestDist = Infinity;

    for (const enemy of world.enemies) {
      const d = dist(player.x, player.y, enemy.x, enemy.y);
      if (d < closestDist) {
        closestDist = d;
        closestEnemy = enemy;
      }
    }

    if (closestDist <= 60 && closestEnemy) {
      // Determine dash direction
      const mov = getMovementVector(world.inputState);
      let dashDx: number;
      let dashDy: number;

      if (mov.dx !== 0 || mov.dy !== 0) {
        // Dash in movement direction
        dashDx = mov.dx;
        dashDy = mov.dy;
      } else {
        // Dash away from nearest enemy
        const awayX = player.x - closestEnemy.x;
        const awayY = player.y - closestEnemy.y;
        const awayLen = Math.sqrt(awayX * awayX + awayY * awayY);
        if (awayLen > 0) {
          dashDx = awayX / awayLen;
          dashDy = awayY / awayLen;
        } else {
          // Fallback: dash right
          dashDx = 1;
          dashDy = 0;
        }
      }

      // Move player instantly 150px
      player.x += dashDx * 150;
      player.y += dashDy * 150;

      // Grant iFrames
      player.iFrames = 0.5;

      state.ability1Timer = classDef.ability1.cooldown * stats.cdr;
    }
  }

  // ---- Hunter's Mark (Level 10, CD 35s x cdr) ----
  if (level >= 10 && state.ability2Timer <= 0) {
    // Find enemy with highest HP currently on screen
    const cam = world.camera;
    const halfW = cam.width / 2;
    const halfH = cam.height / 2;

    let bestEnemy: EnemyEntity | null = null;
    let bestHp = -1;

    for (const enemy of world.enemies) {
      // Check if on screen
      const screenX = enemy.x - cam.x;
      const screenY = enemy.y - cam.y;
      if (
        Math.abs(screenX) <= halfW + enemy.radius &&
        Math.abs(screenY) <= halfH + enemy.radius
      ) {
        if (enemy.hp > bestHp) {
          bestHp = enemy.hp;
          bestEnemy = enemy;
        }
      }
    }

    if (bestEnemy) {
      applyMark(bestEnemy.statusEffects, 0.4, 8);
      state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
    }
    // If no enemy found, don't start cooldown -- try again next frame
  }
}

// =============================================================================
// Plague Doctor Abilities
// =============================================================================

function handlePlagueDoctor(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Miasma Trail (Innate, passive, every 0.3s) ----
  if (state.miasmaTrailTimer === undefined) state.miasmaTrailTimer = 0;
  state.miasmaTrailTimer += delta;

  if (state.miasmaTrailTimer >= 0.3) {
    state.miasmaTrailTimer -= 0.3;

    const poolRadius = 15 * stats.area; // width 30px -> radius 15
    const poolLifetime = 2 * stats.duration;
    const poolDamage = 5 * stats.might;

    const pool: ProjectileEntity = {
      id: createId(world),
      x: player.x,
      y: player.y,
      radius: poolRadius,
      vx: 0,
      vy: 0,
      damage: poolDamage,
      pierceLeft: 9999,
      hitEnemyIds: new Set(),
      lifetime: poolLifetime,
      isEnemy: false,
      weaponId: 'miasma_trail',
      color: '#10B981',
      isPool: true,
      poolDamagePerTick: poolDamage,
      poolTickInterval: 0.5,
      poolTimer: 0,
      poolRadius: poolRadius,
    };
    world.projectiles.push(pool);
  }

  // ---- Pandemic (Level 10, CD 50s x cdr) ----
  if (level >= 10 && state.ability2Timer <= 0) {
    // Check if there are any poisoned enemies before triggering
    const poisonedEnemies = world.enemies.filter((e) =>
      hasEffect(e.statusEffects, 'poison'),
    );

    if (poisonedEnemies.length > 0) {
      // Trigger first chain burst immediately
      triggerPandemicBurst(world, stats);

      // Set up chain tracking for subsequent bursts
      state.pandemicChainCount = 1; // 1 burst done, 2 more to go
      state.pandemicChainTimer = 0.3;

      state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
    }
  }

  // Handle pandemic chain bursts
  if (
    state.pandemicChainCount !== undefined &&
    state.pandemicChainCount > 0 &&
    state.pandemicChainCount < 3
  ) {
    if (state.pandemicChainTimer !== undefined) {
      state.pandemicChainTimer -= delta;
      if (state.pandemicChainTimer <= 0) {
        triggerPandemicBurst(world, stats);
        state.pandemicChainCount++;
        state.pandemicChainTimer = 0.3;

        if (state.pandemicChainCount >= 3) {
          state.pandemicChainCount = 0;
          state.pandemicChainTimer = 0;
        }
      }
    }
  }
}

/** Execute one Pandemic burst: damage poisoned enemies and deal AoE. */
function triggerPandemicBurst(world: GameWorld, stats: PlayerStats): void {
  const aoeRadius = 100 * stats.area;

  for (const enemy of world.enemies) {
    const poisonEffect = enemy.statusEffects.find((e) => e.type === 'poison');
    if (!poisonEffect) continue;

    // 40% of remaining poison damage as instant damage
    // Remaining poison = magnitude (dps) * duration (remaining seconds)
    const remainingPoison = poisonEffect.magnitude * poisonEffect.duration;
    const burstDamage = remainingPoison * 0.4;

    // Deal AoE around this enemy
    for (const target of world.enemies) {
      const d = dist(enemy.x, enemy.y, target.x, target.y);
      if (d <= aoeRadius) {
        target.hp -= burstDamage;
        target.flashTimer = Math.max(target.flashTimer, 0.1);
      }
    }
  }
}

// =============================================================================
// Berserker Abilities
// =============================================================================

function handleBerserker(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Blood Rage (Innate, passive) ----
  // Handled via getBerserkerBonuses() -- no timer logic needed here.

  // ---- Savage Slam (Level 10, CD 30s x cdr) ----
  // If slam is in progress, handle the timer
  if (state.savageSlamActive && state.savageSlamTimer !== undefined) {
    state.savageSlamTimer -= delta;
    if (state.savageSlamTimer <= 0) {
      state.savageSlamActive = false;
      state.savageSlamTimer = 0;
    }
    return; // Don't trigger another slam while one is active
  }

  if (level >= 10 && state.ability2Timer <= 0) {
    // Find densest cluster within 300px
    const searchRadius = 300;
    let bestX = player.x;
    let bestY = player.y;
    let bestCount = 0;

    // Simple cluster finding: for each enemy, count how many enemies are
    // within the slam radius of that enemy's position
    const slamRadius = 180 * stats.area;

    for (const enemy of world.enemies) {
      const d = dist(player.x, player.y, enemy.x, enemy.y);
      if (d > searchRadius) continue;

      let count = 0;
      for (const other of world.enemies) {
        if (dist(enemy.x, enemy.y, other.x, other.y) <= slamRadius) {
          count++;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestX = enemy.x;
        bestY = enemy.y;
      }
    }

    if (bestCount > 0) {
      // Leap to position
      player.x = bestX;
      player.y = bestY;
      player.iFrames = 0.6;
      state.savageSlamActive = true;
      state.savageSlamTimer = 0.6;

      const damage = 120 * stats.might;
      const innerRadius = 60 * stats.area;

      // Deal damage in slam radius
      for (const enemy of world.enemies) {
        const d = dist(bestX, bestY, enemy.x, enemy.y);
        if (d <= slamRadius) {
          enemy.hp -= damage;
          enemy.flashTimer = Math.max(enemy.flashTimer, 0.15);

          // Inner radius: knockback + stun
          if (d <= innerRadius) {
            applyStun(enemy.statusEffects, 1);

            // Knockback 100px away from slam center
            const kbDist = 100;
            const dx = enemy.x - bestX;
            const dy = enemy.y - bestY;
            const kbLen = Math.sqrt(dx * dx + dy * dy);
            if (kbLen > 0) {
              enemy.x += (dx / kbLen) * kbDist;
              enemy.y += (dy / kbLen) * kbDist;
            }
          }
        }
      }

      state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
    }
  }
}

/**
 * Get Berserker's Blood Rage bonus stats.
 * Returns { bonusMight, bonusAttackSpeed } to be applied on top of effective stats.
 */
export function getBerserkerBonuses(
  hp: number,
  maxHp: number,
): { bonusMight: number; bonusAttackSpeed: number } {
  const hpRatio = maxHp > 0 ? hp / maxHp : 1;
  const bonusMight = 0.8 * (1 - hpRatio);
  const bonusAttackSpeed = hpRatio < 0.3 ? 0.2 : 0;
  return { bonusMight, bonusAttackSpeed };
}

// =============================================================================
// Necromancer Abilities
// =============================================================================

function handleNecromancer(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Raise Dead (Innate, passive) ----
  // Handled via tryRaiseDead() called by the kill/collision system.

  // ---- Army of Darkness (Level 10, CD 60s x cdr) ----
  if (level >= 10 && state.ability2Timer <= 0) {
    const ringRadius = 200 * stats.area;
    const pillarLifetime = 6 * stats.duration;
    const pillarDamage = 25 * stats.might;
    const pillarCount = 12;

    for (let i = 0; i < pillarCount; i++) {
      const angle = (2 * Math.PI * i) / pillarCount;
      const px = player.x + Math.cos(angle) * ringRadius;
      const py = player.y + Math.sin(angle) * ringRadius;

      const pillar: ProjectileEntity = {
        id: createId(world),
        x: px,
        y: py,
        radius: 20,
        vx: 0,
        vy: 0,
        damage: pillarDamage,
        pierceLeft: 9999,
        hitEnemyIds: new Set(),
        lifetime: pillarLifetime,
        isEnemy: false,
        weaponId: 'army_of_darkness',
        color: '#6B21A8',
        isPool: true,
        poolDamagePerTick: pillarDamage,
        poolTickInterval: 0.5,
        poolTimer: 0,
        poolRadius: 20,
      };
      world.projectiles.push(pillar);
    }

    state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
  }
}

/**
 * Attempt to raise a skeleton when an enemy dies.
 * Called by the collision/kill system. 25% chance scaled by luck.
 * Respects max summon caps based on player level.
 */
export function tryRaiseDead(
  world: GameWorld,
  x: number,
  y: number,
  stats: PlayerStats,
  level: number,
): void {
  // Determine max summons
  let maxSummons = 8;
  if (level >= 25) maxSummons = 12;
  else if (level >= 15) maxSummons = 10;

  // Check current summon count
  if (world.summons.length >= maxSummons) return;

  // 25% chance scaled by luck
  const chance = 0.25 * stats.luck;
  if (Math.random() >= chance) return;

  const skeleton: SummonEntity = {
    id: createId(world),
    x,
    y,
    radius: 12,
    hp: 30,
    maxHp: 30,
    damage: 15 * stats.might,
    attackSpeed: 1,
    attackTimer: 0,
    speed: 180,
    lifetime: 12 * stats.duration,
    targetId: null,
    type: 'skeleton',
  };

  world.summons.push(skeleton);
}

// =============================================================================
// Chronomancer Abilities
// =============================================================================

function handleChronomancer(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Time Dilation Field (Innate, passive, always active) ----
  const dilationRadius = 150 * stats.area;

  for (const enemy of world.enemies) {
    const d = dist(player.x, player.y, enemy.x, enemy.y);
    if (d <= dilationRadius) {
      // Apply 30% slow, refresh each frame with a short duration
      applySlow(enemy.statusEffects, 0.3, delta + 0.05);
    }
  }

  // ---- Temporal Rewind (Level 10, CD 50s x cdr) ----
  if (level >= 10 && state.ability2Timer <= 0) {
    const history = player.positionHistory;

    if (history.length > 0) {
      // Find the entry closest to 4 seconds ago
      const targetTime = world.time - POSITION_HISTORY_DURATION;
      let bestEntry = history[0];
      let bestTimeDiff = Infinity;

      for (const entry of history) {
        const timeDiff = Math.abs(entry.time - targetTime);
        if (timeDiff < bestTimeDiff) {
          bestTimeDiff = timeDiff;
          bestEntry = entry;
        }
      }

      // Freeze enemies near current (pre-teleport) position
      const freezeRadius = 200;
      for (const enemy of world.enemies) {
        const d = dist(player.x, player.y, enemy.x, enemy.y);
        if (d <= freezeRadius) {
          applyFreeze(enemy.statusEffects, 2.5);
        }
      }

      // Teleport to historical position, keep higher HP
      player.x = bestEntry.x;
      player.y = bestEntry.y;
      player.hp = Math.max(player.hp, bestEntry.hp);
      player.iFrames = 0.3;

      state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
    }
  }
}

// =============================================================================
// Hemomancer Abilities
// =============================================================================

function handleHemomancer(
  world: GameWorld,
  stats: PlayerStats,
  level: number,
  delta: number,
  state: ClassAbilityState,
  classDef: ClassDef,
): void {
  const player = world.player;

  // ---- Sanguine Feast (Innate, passive) ----
  // Lifesteal processing happens via processSanguineFeast(), called externally.
  // Here we just apply the accumulated healing, capped at 8 HP/s.
  if (state.lifestealAccum !== undefined && state.lifestealAccum > 0) {
    const maxHealPerFrame = 8 * delta;
    const healAmount = Math.min(state.lifestealAccum, maxHealPerFrame);
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    state.lifestealAccum -= healAmount;
    // Prevent accumulator from growing unbounded
    if (state.lifestealAccum > 8) {
      state.lifestealAccum = 8;
    }
  }

  // ---- Blood Nova (Level 10, CD 35s x cdr) ----
  if (level >= 10 && state.ability2Timer <= 0) {
    // Sacrifice 15% of current HP
    const sacrifice = player.hp * 0.15;
    player.hp -= sacrifice;
    // Don't let sacrifice kill the player
    if (player.hp < 1) player.hp = 1;

    const radius = 250 * stats.area;
    const damage = 3 * sacrifice + 60 * stats.might;

    // Spawn a full-circle melee hitbox
    const hitbox: MeleeHitbox = {
      x: player.x,
      y: player.y,
      radius,
      angle: 0,
      arc: 2 * Math.PI,
      damage,
      lifetime: 0.3,
      maxLifetime: 0.3,
      hitEnemyIds: new Set(),
      weaponId: 'blood_nova',
    };
    world.meleeHitboxes.push(hitbox);

    // Track kills for healing (the collision system should call
    // reportBloodNovaKill for each kill from this hitbox)
    state.bloodNovaKillHealAccum = 0;

    state.ability2Timer = classDef.ability2.cooldown * stats.cdr;
  }

  // Apply blood nova kill healing
  if (
    state.bloodNovaKillHealAccum !== undefined &&
    state.bloodNovaKillHealAccum > 0
  ) {
    player.hp = Math.min(
      player.maxHp,
      player.hp + state.bloodNovaKillHealAccum,
    );
    state.bloodNovaKillHealAccum = 0;
  }
}

/**
 * Process lifesteal for Sanguine Feast.
 * Called by the weapon/collision system when player deals damage.
 *
 * @param damageDealt Total damage dealt this frame
 * @param hp Current player HP
 * @param maxHp Current player max HP
 */
export function processSanguineFeast(
  state: ClassAbilityState,
  damageDealt: number,
  hp: number,
  maxHp: number,
): void {
  if (state.lifestealAccum === undefined) state.lifestealAccum = 0;

  const hpRatio = maxHp > 0 ? hp / maxHp : 1;
  const lifestealRate = hpRatio < 0.5 ? 0.08 : 0.05;
  state.lifestealAccum += damageDealt * lifestealRate;
}

/**
 * Report a kill from Blood Nova for healing purposes.
 * Each kill heals 5 HP (uncapped).
 */
export function reportBloodNovaKill(state: ClassAbilityState): void {
  if (state.bloodNovaKillHealAccum === undefined)
    state.bloodNovaKillHealAccum = 0;
  state.bloodNovaKillHealAccum += 5;
}
