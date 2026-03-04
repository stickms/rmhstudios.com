// =============================================================================
// ALTAIR ENGINE -- Catalyst Runtime System
// =============================================================================
// Per-frame tick and event-driven hooks for all 14 evolution catalysts.
// Each catalyst has a unique mechanical effect implemented as skeletal handlers
// that modify the GameWorld directly (spawn projectiles, apply statuses, etc.)
// =============================================================================

import type { GameWorld, CatalystState, EnemyEntity, ProjectileEntity, ParticleEntity } from './types';
import { createId } from './types';
import { CATALYSTS, type CatalystDef } from '../data/catalysts';
import type { PlayerStats } from '../stores/game-store';
import {
  applyStatusEffect,
  applySlow,
  applyStun,
  applyPoison,
  applyMark,
  hasEffect,
} from './status-effects';

// =============================================================================
// Runtime State
// =============================================================================

/** Runtime state tracked per-catalyst per-run. */
export interface CatalystRuntimeState {
  catalystId: string;
  level: number; // 0-indexed: 0=lv1, 1=lv2, 2=lv3
  // Shared runtime accumulators
  timer: number;        // general purpose timer (for periodic effects)
  accumulator: number;  // general purpose counter (for attack counting, etc.)
  charges: number;      // current charges (for shield, wisps, etc.)
  cooldownTimer: number; // internal cooldown
  active: boolean;      // whether an active effect is running
  extraState: Record<string, number>; // per-effect extra state
}

// =============================================================================
// Helpers
// =============================================================================

function findCatalystDef(catalystId: string): CatalystDef | undefined {
  return CATALYSTS.find((c) => c.id === catalystId);
}

function getParam(def: CatalystDef, key: string, level: number): number {
  const arr = def.effect.params[key];
  if (!arr) return 0;
  return arr[Math.min(level, arr.length - 1)];
}

function distSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(distSq(x1, y1, x2, y2));
}

function findNearestEnemy(
  world: GameWorld,
  x: number,
  y: number,
  maxRange: number,
  excludeIds?: Set<number>,
): EnemyEntity | null {
  let best: EnemyEntity | null = null;
  let bestD = maxRange * maxRange;
  for (const e of world.enemies) {
    if (e.hp <= 0) continue;
    if (excludeIds && excludeIds.has(e.id)) continue;
    const d = distSq(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function spawnParticle(
  world: GameWorld,
  x: number,
  y: number,
  color: string,
  count: number = 3,
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 40;
    world.particles.push({
      id: createId(world),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.6,
      color,
      radius: 2 + Math.random() * 2,
    });
  }
}

function spawnDamageNumber(
  world: GameWorld,
  x: number,
  y: number,
  damage: number,
  color: string,
): void {
  world.particles.push({
    id: createId(world),
    x,
    y: y - 10,
    vx: (Math.random() - 0.5) * 20,
    vy: -40,
    life: 0.8,
    maxLife: 0.8,
    color,
    radius: 0,
    text: String(Math.round(damage)),
    fontSize: 12,
  });
}

// =============================================================================
// Initialization
// =============================================================================

/** Create runtime state objects for each active catalyst at the start of a run. */
export function createCatalystRuntimeStates(
  catalysts: CatalystState[],
): CatalystRuntimeState[] {
  return catalysts.map((c) => ({
    catalystId: c.catalystId,
    level: c.level - 1, // convert 1-indexed level to 0-indexed
    timer: 0,
    accumulator: 0,
    charges: 0,
    cooldownTimer: 0,
    active: false,
    extraState: {},
  }));
}

// =============================================================================
// Per-Frame Update
// =============================================================================

/** Per-frame update -- called each game tick. */
export function updateCatalysts(
  world: GameWorld,
  stats: PlayerStats,
  runtimeStates: CatalystRuntimeState[],
  delta: number,
): void {
  for (const rs of runtimeStates) {
    const def = findCatalystDef(rs.catalystId);
    if (!def) continue;

    // Tick down cooldowns
    if (rs.cooldownTimer > 0) {
      rs.cooldownTimer = Math.max(0, rs.cooldownTimer - delta);
    }

    // Dispatch to per-catalyst tick handlers
    switch (rs.catalystId) {
      case 'wardens_crest':
        tickWardensCrest(rs, def, world, stats, delta);
        break;
      case 'berserkers_brand':
        tickBerserkersBrand(rs, def, world, stats, delta);
        break;
      case 'paradox_gear':
        tickParadoxGear(rs, def, world, stats, delta);
        break;
      case 'sanguine_heart':
        tickSanguineHeart(rs, def, world, stats, delta);
        break;
      case 'consecrated_water':
        tickConsecratedWater(rs, def, world, stats, delta);
        break;
      case 'celestial_compass':
        tickCelestialCompass(rs, def, world, stats, delta);
        break;
      case 'phylactery_shard':
        tickPhylacteryShard(rs, def, world, stats, delta);
        break;
      default:
        // Other catalysts are purely event-driven
        break;
    }
  }
}

// =============================================================================
// Per-Catalyst Tick Functions
// =============================================================================

// -- 1. Warden's Crest: tick down shield duration ----------------------------
function tickWardensCrest(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  _stats: PlayerStats,
  delta: number,
): void {
  // Shield timer is stored in rs.timer; charges = shield HP remaining
  if (rs.charges > 0) {
    rs.timer -= delta;
    if (rs.timer <= 0) {
      // Shield expired
      rs.charges = 0;
      rs.timer = 0;
      rs.active = false;
    }
  }
}

// -- 5. Berserker's Brand: tick down damage buff window ----------------------
function tickBerserkersBrand(
  rs: CatalystRuntimeState,
  _def: CatalystDef,
  _world: GameWorld,
  _stats: PlayerStats,
  delta: number,
): void {
  if (rs.active) {
    rs.timer -= delta;
    if (rs.timer <= 0) {
      rs.active = false;
      rs.timer = 0;
    }
  }
}

// -- 7. Paradox Gear: periodic temporal echo replay --------------------------
function tickParadoxGear(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
): void {
  const interval = getParam(def, 'intervalS', rs.level);
  const echoDuration = getParam(def, 'echoDurationS', rs.level);
  const echoDmgPct = getParam(def, 'echoDmgPercent', rs.level) / 100;

  rs.timer += delta;

  if (rs.timer >= interval) {
    rs.timer -= interval;
    rs.active = true;
    rs.accumulator = echoDuration; // use accumulator as echo remaining time

    // Spawn visual feedback
    spawnParticle(world, world.player.x, world.player.y, '#EAB308', 6);
  }

  // If echo is active, tick it down
  if (rs.active) {
    rs.accumulator -= delta;
    if (rs.accumulator <= 0) {
      rs.active = false;
      rs.accumulator = 0;
    } else {
      // Replay: spawn echo projectiles mimicking recent attacks at reduced damage
      // Skeletal: spawn a burst of ghost projectiles around the player
      const slowPct = getParam(def, 'slowPercent', rs.level);
      const slowDur = getParam(def, 'slowDurationS', rs.level);

      // Spawn an echo burst once per ~0.5s
      const prevBucket = Math.floor((rs.accumulator + delta) / 0.5);
      const curBucket = Math.floor(rs.accumulator / 0.5);
      if (curBucket !== prevBucket) {
        const target = findNearestEnemy(world, world.player.x, world.player.y, 300);
        if (target) {
          const dx = target.x - world.player.x;
          const dy = target.y - world.player.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const speed = 250;

          const proj: ProjectileEntity = {
            id: createId(world),
            x: world.player.x,
            y: world.player.y,
            radius: 5,
            vx: (dx / d) * speed,
            vy: (dy / d) * speed,
            damage: 10 * echoDmgPct * stats.might,
            pierceLeft: 1,
            hitEnemyIds: new Set(),
            lifetime: 1.5,
            isEnemy: false,
            weaponId: 'paradox_echo',
            color: '#EAB30880',
          };

          if (slowPct > 0) {
            proj.slowOnHitPct = slowPct / 100;
            proj.slowOnHitDuration = slowDur;
          }

          world.projectiles.push(proj);
        }
      }
    }
  }
}

// -- 8. Sanguine Heart: check HP threshold -----------------------------------
function tickSanguineHeart(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  _delta: number,
): void {
  if (rs.cooldownTimer > 0) return;

  const thresholdPct = getParam(def, 'hpThresholdPercent', rs.level) / 100;
  const currentHpPct = world.player.hp / world.player.maxHp;

  if (currentHpPct <= thresholdPct) {
    const pulseDmg = getParam(def, 'pulseDamage', rs.level) * stats.might;
    const pulseRadius = getParam(def, 'pulseRadiusPx', rs.level);
    const cooldown = getParam(def, 'cooldownS', rs.level);
    const healHp = getParam(def, 'healHp', rs.level);
    const slowPct = getParam(def, 'slowPercent', rs.level);
    const slowDur = getParam(def, 'slowDurationS', rs.level);

    rs.cooldownTimer = cooldown;

    // Deal AoE damage to nearby enemies
    for (const enemy of world.enemies) {
      if (enemy.hp <= 0) continue;
      const d = dist(world.player.x, world.player.y, enemy.x, enemy.y);
      if (d <= pulseRadius) {
        enemy.hp -= pulseDmg;
        enemy.flashTimer = 0.15;
        spawnDamageNumber(world, enemy.x, enemy.y, pulseDmg, '#DC2626');

        if (slowPct > 0 && slowDur > 0) {
          applySlow(enemy.statusEffects, slowPct / 100, slowDur);
        }
      }
    }

    // Heal player
    if (healHp > 0) {
      world.player.hp = Math.min(world.player.maxHp, world.player.hp + healHp);
    }

    // Visual feedback: blood pulse ring
    spawnParticle(world, world.player.x, world.player.y, '#DC2626', 10);
  }
}

// -- 9. Consecrated Water: track stationary time, create hallowed ground -----
function tickConsecratedWater(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
): void {
  const activationTime = getParam(def, 'activationTimeS', rs.level);
  const zoneRadius = getParam(def, 'zoneRadiusPx', rs.level);
  const dmgPerTick = getParam(def, 'dmgPerTick', rs.level);
  const tickInterval = getParam(def, 'tickIntervalS', rs.level);
  const selfHeal = getParam(def, 'selfHealPerS', rs.level);

  // Check if player is stationary (input dx/dy near zero)
  const isStationary =
    Math.abs(world.inputState.dx) < 0.1 && Math.abs(world.inputState.dy) < 0.1;

  if (isStationary) {
    rs.timer += delta;
  } else {
    rs.timer = 0;
    rs.active = false;
  }

  if (rs.timer >= activationTime && !rs.active) {
    rs.active = true;
    // Store activation position
    rs.extraState['zoneX'] = world.player.x;
    rs.extraState['zoneY'] = world.player.y;
    rs.extraState['tickTimer'] = 0;

    // Visual: hallowed ground creation
    spawnParticle(world, world.player.x, world.player.y, '#38BDF8', 8);
  }

  // Tick hallowed ground while active
  if (rs.active) {
    rs.extraState['tickTimer'] = (rs.extraState['tickTimer'] ?? 0) + delta;

    if (rs.extraState['tickTimer'] >= tickInterval) {
      rs.extraState['tickTimer'] -= tickInterval;

      const zx = rs.extraState['zoneX'] ?? world.player.x;
      const zy = rs.extraState['zoneY'] ?? world.player.y;

      // Damage enemies in zone
      for (const enemy of world.enemies) {
        if (enemy.hp <= 0) continue;
        const d = dist(zx, zy, enemy.x, enemy.y);
        if (d <= zoneRadius) {
          enemy.hp -= dmgPerTick * stats.might;
          enemy.flashTimer = 0.05;
        }
      }

      // Self heal at lv3
      if (selfHeal > 0) {
        const playerDist = dist(zx, zy, world.player.x, world.player.y);
        if (playerDist <= zoneRadius) {
          world.player.hp = Math.min(
            world.player.maxHp,
            world.player.hp + selfHeal * tickInterval,
          );
        }
      }
    }
  }
}

// -- 13. Celestial Compass: periodic detection pulse -------------------------
function tickCelestialCompass(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  _stats: PlayerStats,
  delta: number,
): void {
  const interval = getParam(def, 'intervalS', rs.level);
  const pulseRange = getParam(def, 'pulseRangePx', rs.level);
  const revealDuration = getParam(def, 'revealDurationS', rs.level);
  const dmgBonusPct = getParam(def, 'dmgBonusPercent', rs.level) / 100;

  rs.timer += delta;

  if (rs.timer >= interval) {
    rs.timer -= interval;

    // Apply mark to all enemies in range (mark = bonus damage taken)
    for (const enemy of world.enemies) {
      if (enemy.hp <= 0) continue;
      const d = dist(world.player.x, world.player.y, enemy.x, enemy.y);
      if (d <= pulseRange) {
        applyMark(enemy.statusEffects, dmgBonusPct, revealDuration);
      }
    }

    // Visual: expanding pulse ring
    spawnParticle(world, world.player.x, world.player.y, '#818CF8', 8);
  }
}

// -- 6. Phylactery Shard: tick existing wisp lifetimes -----------------------
function tickPhylacteryShard(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
): void {
  const healPerWispPerS = getParam(def, 'healPerWispPerS', rs.level);

  // Tick down wisp durations stored in extraState
  // Wisps are tracked as: wisp_0_life, wisp_1_life, etc.
  let activeWisps = 0;
  for (let i = 0; i < 4; i++) {
    const key = `wisp_${i}_life`;
    const life = rs.extraState[key];
    if (life !== undefined && life > 0) {
      rs.extraState[key] = life - delta;
      if (rs.extraState[key] <= 0) {
        rs.extraState[key] = 0;
      } else {
        activeWisps++;

        // Wisp damage: find nearest enemy and deal DPS
        const wispDps = getParam(def, 'wispDps', rs.level);
        const orbitRadius = getParam(def, 'orbitRadiusPx', rs.level);
        // Wisp orbits around player
        const angle =
          (world.time * 2 + (i * Math.PI * 2) / 4) % (Math.PI * 2);
        const wx = world.player.x + Math.cos(angle) * orbitRadius;
        const wy = world.player.y + Math.sin(angle) * orbitRadius;

        // Damage nearby enemies
        for (const enemy of world.enemies) {
          if (enemy.hp <= 0) continue;
          const d = dist(wx, wy, enemy.x, enemy.y);
          if (d <= 30) {
            enemy.hp -= wispDps * delta;
            enemy.flashTimer = Math.max(enemy.flashTimer, 0.05);
          }
        }
      }
    }
  }

  rs.charges = activeWisps;

  // Lv3: wisps heal
  if (healPerWispPerS > 0 && activeWisps > 0) {
    world.player.hp = Math.min(
      world.player.maxHp,
      world.player.hp + healPerWispPerS * activeWisps * delta,
    );
  }
}

// =============================================================================
// Event: On Hit
// =============================================================================

/** Called when a player attack hits an enemy. */
export function onCatalystHit(
  runtimeStates: CatalystRuntimeState[],
  world: GameWorld,
  stats: PlayerStats,
  context: { enemyId: number; damage: number; weaponId: string; x: number; y: number },
): void {
  for (const rs of runtimeStates) {
    const def = findCatalystDef(rs.catalystId);
    if (!def) continue;

    switch (rs.catalystId) {
      case 'hawk_talon':
        handleHawkTalonHit(rs, def, world, stats, context);
        break;
      case 'storm_conduit':
        handleStormConduitHit(rs, def, world, stats, context);
        break;
      default:
        break;
    }
  }
}

// -- 3. Hawk Talon: build focus stacks per enemy -----------------------------
function handleHawkTalonHit(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  _stats: PlayerStats,
  context: { enemyId: number; damage: number; weaponId: string; x: number; y: number },
): void {
  const maxStacks = getParam(def, 'maxStacks', rs.level);
  const dmgPerStack = getParam(def, 'dmgPerStackPercent', rs.level) / 100;
  const stackTimeout = getParam(def, 'stackTimeoutS', rs.level);
  const pierceAtMax = getParam(def, 'pierceAtMax', rs.level);

  const stackKey = `enemy_${context.enemyId}`;
  const timerKey = `enemy_${context.enemyId}_timer`;

  // Increment stacks (capped at max)
  const currentStacks = rs.extraState[stackKey] ?? 0;
  const newStacks = Math.min(currentStacks + 1, maxStacks);
  rs.extraState[stackKey] = newStacks;
  rs.extraState[timerKey] = stackTimeout;

  // Apply bonus damage to the enemy
  const enemy = world.enemies.find((e) => e.id === context.enemyId);
  if (enemy && enemy.hp > 0) {
    const bonusDamage = context.damage * dmgPerStack * newStacks;
    enemy.hp -= bonusDamage;
    if (bonusDamage >= 1) {
      spawnDamageNumber(world, enemy.x, enemy.y, bonusDamage, '#78716C');
    }

    // At max stacks + lv3: mark for pierce bonus (tracked via mark status)
    if (newStacks >= maxStacks && pierceAtMax > 0) {
      applyMark(enemy.statusEffects, 0.01, stackTimeout); // minimal mark as pierce flag
    }
  }
}

// -- 11. Storm Conduit: proc static discharge on wounded enemies -------------
function handleStormConduitHit(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  context: { enemyId: number; damage: number; weaponId: string; x: number; y: number },
): void {
  const procChance = getParam(def, 'procChancePercent', rs.level) / 100;
  const dischargeDmg = getParam(def, 'dischargeDamage', rs.level);
  const dischargeAoe = getParam(def, 'dischargeAoePx', rs.level);
  const chainCount = getParam(def, 'chainCount', rs.level);
  const chainRange = getParam(def, 'chainRangePx', rs.level);
  const chainDmgPct = getParam(def, 'chainDmgPercent', rs.level) / 100;
  const stunDuration = getParam(def, 'stunDurationS', rs.level);

  // Only proc on already-wounded enemies
  const enemy = world.enemies.find((e) => e.id === context.enemyId);
  if (!enemy || enemy.hp <= 0 || enemy.hp >= enemy.maxHp) return;

  if (Math.random() > procChance) return;

  // Primary AoE discharge
  const hitEnemies = new Set<number>();
  for (const e of world.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(context.x, context.y, e.x, e.y);
    if (d <= dischargeAoe) {
      e.hp -= dischargeDmg * stats.might;
      e.flashTimer = 0.15;
      hitEnemies.add(e.id);
      spawnDamageNumber(world, e.x, e.y, dischargeDmg * stats.might, '#FACC15');
    }
  }

  // Stun primary target at lv3
  if (stunDuration > 0 && enemy.hp > 0) {
    applyStun(enemy.statusEffects, stunDuration);
  }

  // Chain lightning
  if (chainCount > 0) {
    let chainX = context.x;
    let chainY = context.y;
    for (let c = 0; c < chainCount; c++) {
      const chainTarget = findNearestEnemy(world, chainX, chainY, chainRange, hitEnemies);
      if (!chainTarget) break;

      const chainDmg = dischargeDmg * chainDmgPct * stats.might;
      chainTarget.hp -= chainDmg;
      chainTarget.flashTimer = 0.1;
      hitEnemies.add(chainTarget.id);
      spawnDamageNumber(world, chainTarget.x, chainTarget.y, chainDmg, '#FACC15');
      spawnParticle(world, chainTarget.x, chainTarget.y, '#FACC15', 3);

      chainX = chainTarget.x;
      chainY = chainTarget.y;
    }
  }

  // Visual: electric spark
  spawnParticle(world, context.x, context.y, '#FACC15', 5);
}

// =============================================================================
// Event: On Kill
// =============================================================================

/** Called when a player kills an enemy. */
export function onCatalystKill(
  runtimeStates: CatalystRuntimeState[],
  world: GameWorld,
  stats: PlayerStats,
  context: { enemyId: number; x: number; y: number; wasPoisoned: boolean; enemyTier: number },
): void {
  for (const rs of runtimeStates) {
    const def = findCatalystDef(rs.catalystId);
    if (!def) continue;

    switch (rs.catalystId) {
      case 'blighted_venom':
        handleBlightedVenomKill(rs, def, world, stats, context);
        break;
      case 'phylactery_shard':
        handlePhylacteryShardKill(rs, def, world, stats, context);
        break;
      case 'moonpetal_wreath':
        handleMoonpetalWreathKill(rs, def, world, stats, context);
        break;
      case 'cinder_core':
        handleCinderCoreKill(rs, def, world, stats, context);
        break;
      default:
        break;
    }

    // Clean up hawk talon stacks for dead enemies
    if (rs.catalystId === 'hawk_talon') {
      delete rs.extraState[`enemy_${context.enemyId}`];
      delete rs.extraState[`enemy_${context.enemyId}_timer`];
    }
  }
}

// -- 4. Blighted Venom: spawn toxic corpse pool on poisoned kill -------------
function handleBlightedVenomKill(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  context: { enemyId: number; x: number; y: number; wasPoisoned: boolean; enemyTier: number },
): void {
  if (!context.wasPoisoned) return;

  const corpseDmg = getParam(def, 'corpseDamage', rs.level);
  const corpseDuration = getParam(def, 'corpseDurationS', rs.level);
  const poisonDps = getParam(def, 'poisonDps', rs.level);
  const poisonDuration = getParam(def, 'poisonDurationS', rs.level);
  const slowPct = getParam(def, 'slowPercent', rs.level);
  const eliteSizeBonus = getParam(def, 'eliteCorpseSizeBonus', rs.level);

  const baseRadius = 30;
  const isElite = context.enemyTier >= 4;
  const radius = isElite ? baseRadius * (1 + eliteSizeBonus / 100) : baseRadius;

  // Spawn toxic pool
  const pool: ProjectileEntity = {
    id: createId(world),
    x: context.x,
    y: context.y,
    radius: radius,
    vx: 0,
    vy: 0,
    damage: 0,
    pierceLeft: 999,
    hitEnemyIds: new Set(),
    lifetime: corpseDuration,
    isEnemy: false,
    weaponId: 'blighted_corpse',
    color: '#22C55E40',
    isPool: true,
    poolDamagePerTick: corpseDmg * stats.might,
    poolTickInterval: 0.5,
    poolTimer: 0,
    poolRadius: radius,
  };

  if (slowPct > 0) {
    pool.poolSlowPct = slowPct / 100;
  }

  world.pools.push(pool);

  // Enemies entering the pool get poisoned (handled by pool tick logic)
  // Skeletal: store poison params in pool for external handler
  // For now, apply poison to nearby enemies immediately
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) continue;
    const d = dist(context.x, context.y, enemy.x, enemy.y);
    if (d <= radius) {
      applyPoison(enemy.statusEffects, poisonDps, poisonDuration);
      if (slowPct > 0) {
        applySlow(enemy.statusEffects, slowPct / 100, 2);
      }
    }
  }

  // Visual feedback
  spawnParticle(world, context.x, context.y, '#22C55E', 5);
}

// -- 6. Phylactery Shard: chance to spawn soul wisp on kill ------------------
function handlePhylacteryShardKill(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  _stats: PlayerStats,
  context: { enemyId: number; x: number; y: number; wasPoisoned: boolean; enemyTier: number },
): void {
  const procChance = getParam(def, 'procChancePercent', rs.level) / 100;
  const wispDuration = getParam(def, 'wispDurationS', rs.level);
  const maxWisps = getParam(def, 'maxWisps', rs.level);
  const killProximity = getParam(def, 'killProximityPx', rs.level);

  // Check proximity
  const d = dist(world.player.x, world.player.y, context.x, context.y);
  if (d > killProximity) return;

  // Check max wisps
  if (rs.charges >= maxWisps) return;

  // Proc roll
  if (Math.random() > procChance) return;

  // Find a free wisp slot
  for (let i = 0; i < maxWisps; i++) {
    const key = `wisp_${i}_life`;
    if ((rs.extraState[key] ?? 0) <= 0) {
      rs.extraState[key] = wispDuration;
      rs.charges++;
      break;
    }
  }

  // Visual: soul wisp spawn
  spawnParticle(world, context.x, context.y, '#6B21A8', 4);
}

// -- 12. Moonpetal Wreath: spawn life mote on kill ---------------------------
function handleMoonpetalWreathKill(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  _stats: PlayerStats,
  context: { enemyId: number; x: number; y: number; wasPoisoned: boolean; enemyTier: number },
): void {
  const killProximity = getParam(def, 'killProximityPx', rs.level);
  const healHp = getParam(def, 'healHp', rs.level);
  const moteDuration = getParam(def, 'moteDurationS', rs.level);
  const maxMotes = getParam(def, 'maxMotes', rs.level);

  // Check proximity
  const d = dist(world.player.x, world.player.y, context.x, context.y);
  if (d > killProximity) return;

  // Count existing life motes on the field
  const existingMotes = world.pickups.filter(
    (p) => p.type === 'food' && (p as { _isMote?: boolean })._isMote,
  ).length;

  // Fallback: count using extraState
  const moteCount = rs.extraState['moteCount'] ?? 0;
  if (moteCount >= maxMotes) return;

  // Spawn life mote as food pickup
  world.pickups.push({
    id: createId(world),
    x: context.x,
    y: context.y,
    radius: 8,
    type: 'food',
    value: healHp,
    magnetized: false,
  });

  rs.extraState['moteCount'] = moteCount + 1;

  // Decrement mote count after duration (tracked approximately)
  // Skeletal: rely on pickup system to handle lifetime
  rs.extraState[`mote_${createId(world)}_timer`] = moteDuration;

  // Visual feedback
  spawnParticle(world, context.x, context.y, '#FDE68A', 3);
}

// -- 14. Cinder Core: chance to ignite on kill, spreading fire ---------------
function handleCinderCoreKill(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  context: { enemyId: number; x: number; y: number; wasPoisoned: boolean; enemyTier: number },
): void {
  const igniteChance = getParam(def, 'igniteChancePercent', rs.level) / 100;
  const burnDps = getParam(def, 'burnDps', rs.level);
  const burnDuration = getParam(def, 'burnDurationS', rs.level);
  const spreadRadius = getParam(def, 'spreadRadiusPx', rs.level);
  const armorReduction = getParam(def, 'armorReductionPercent', rs.level);

  if (Math.random() > igniteChance) return;

  // Spread fire to nearby enemies
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) continue;
    const d = dist(context.x, context.y, enemy.x, enemy.y);
    if (d <= spreadRadius) {
      // Apply burn as poison (fire damage over time)
      applyPoison(enemy.statusEffects, burnDps, burnDuration);

      // Lv3: armor reduction via mark (enemy takes more damage)
      if (armorReduction > 0) {
        applyMark(enemy.statusEffects, armorReduction / 100, burnDuration);
      }
    }
  }

  // Visual: fire burst at kill location
  spawnParticle(world, context.x, context.y, '#F97316', 6);
}

// =============================================================================
// Event: On Damage Taken
// =============================================================================

/** Called when the player takes damage. */
export function onCatalystDamageTaken(
  runtimeStates: CatalystRuntimeState[],
  world: GameWorld,
  stats: PlayerStats,
  context: { damage: number },
): void {
  for (const rs of runtimeStates) {
    const def = findCatalystDef(rs.catalystId);
    if (!def) continue;

    switch (rs.catalystId) {
      case 'wardens_crest':
        handleWardensCrestDamage(rs, def, world, stats, context);
        break;
      case 'berserkers_brand':
        handleBerserkersBrandDamage(rs, def, world, stats, context);
        break;
      default:
        break;
    }
  }
}

// -- 1. Warden's Crest: grant damage shield on damage taken ------------------
function handleWardensCrestDamage(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  _world: GameWorld,
  _stats: PlayerStats,
  context: { damage: number },
): void {
  const shieldPct = getParam(def, 'shieldPercent', rs.level) / 100;
  const shieldDuration = getParam(def, 'shieldDurationS', rs.level);
  const minShield = getParam(def, 'minShieldHp', rs.level);
  const meleeDmgBonus = getParam(def, 'meleeDmgBonusWhileShielded', rs.level);

  const shieldAmount = Math.max(minShield, context.damage * shieldPct);
  rs.charges = shieldAmount;
  rs.timer = shieldDuration;
  rs.active = true;

  // Lv3: track melee damage bonus availability
  if (meleeDmgBonus > 0) {
    rs.extraState['meleeBonusPct'] = meleeDmgBonus;
    rs.extraState['meleeBonusReady'] = 1;
  }
}

// -- 5. Berserker's Brand: activate damage buff on damage taken --------------
function handleBerserkersBrandDamage(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  context: { damage: number },
): void {
  const dmgBonus = getParam(def, 'dmgBonusPercent', rs.level);
  const buffWindow = getParam(def, 'buffWindowS', rs.level);
  const shockwave = getParam(def, 'shockwave', rs.level);
  const shockwaveRadius = getParam(def, 'shockwaveRadiusPx', rs.level);
  const shockwaveDmg = getParam(def, 'shockwaveDamage', rs.level);
  const shockwaveCd = getParam(def, 'shockwaveCooldownS', rs.level);

  // Set damage buff
  rs.active = true;
  rs.timer = buffWindow;
  rs.extraState['dmgBonusPct'] = dmgBonus;

  const areaBonus = getParam(def, 'areaBonusPercent', rs.level);
  if (areaBonus > 0) {
    rs.extraState['areaBonusPct'] = areaBonus;
  }

  // Lv3 shockwave
  if (shockwave > 0 && rs.cooldownTimer <= 0) {
    rs.cooldownTimer = shockwaveCd;

    // AoE shockwave damage around player
    for (const enemy of world.enemies) {
      if (enemy.hp <= 0) continue;
      const d = dist(world.player.x, world.player.y, enemy.x, enemy.y);
      if (d <= shockwaveRadius) {
        enemy.hp -= shockwaveDmg * stats.might;
        enemy.flashTimer = 0.15;
        spawnDamageNumber(world, enemy.x, enemy.y, shockwaveDmg * stats.might, '#B91C1C');
      }
    }

    // Visual: shockwave ring
    spawnParticle(world, world.player.x, world.player.y, '#B91C1C', 8);
  }
}

// =============================================================================
// Event: On Attack
// =============================================================================

/** Called when the player fires a weapon attack. */
export function onCatalystAttack(
  runtimeStates: CatalystRuntimeState[],
  world: GameWorld,
  stats: PlayerStats,
  context: { weaponId: string },
): void {
  for (const rs of runtimeStates) {
    const def = findCatalystDef(rs.catalystId);
    if (!def) continue;

    switch (rs.catalystId) {
      case 'astral_focus':
        handleAstralFocusAttack(rs, def, world, stats, context);
        break;
      default:
        break;
    }
  }
}

// -- 2. Astral Focus: count attacks, spawn homing spark every Nth attack -----
function handleAstralFocusAttack(
  rs: CatalystRuntimeState,
  def: CatalystDef,
  world: GameWorld,
  stats: PlayerStats,
  _context: { weaponId: string },
): void {
  const attacksPerSpark = getParam(def, 'attacksPerSpark', rs.level);
  const sparkDmg = getParam(def, 'sparkDamage', rs.level);
  const sparkPierce = getParam(def, 'sparkPierce', rs.level);
  const finalAoe = getParam(def, 'finalAoePx', rs.level);
  const homingRange = getParam(def, 'homingRangePx', rs.level);

  rs.accumulator++;

  if (rs.accumulator >= attacksPerSpark) {
    rs.accumulator = 0;

    // Find nearest enemy for homing
    const target = findNearestEnemy(
      world,
      world.player.x,
      world.player.y,
      homingRange,
    );
    if (!target) return;

    const dx = target.x - world.player.x;
    const dy = target.y - world.player.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 300;

    const spark: ProjectileEntity = {
      id: createId(world),
      x: world.player.x,
      y: world.player.y,
      radius: 6,
      vx: (dx / d) * speed,
      vy: (dy / d) * speed,
      damage: sparkDmg * stats.might,
      pierceLeft: sparkPierce,
      hitEnemyIds: new Set(),
      lifetime: 2.0,
      isEnemy: false,
      weaponId: 'arcane_spark',
      color: '#A855F7',
      homing: true,
      homingStrength: 5,
    };

    // Lv3: AoE explosion on final target
    if (finalAoe > 0) {
      spark.aoeRadius = finalAoe;
    }

    world.projectiles.push(spark);

    // Visual: spark spawn
    spawnParticle(world, world.player.x, world.player.y, '#A855F7', 3);
  }
}

// =============================================================================
// Event: On Projectile Miss (Whetstone ricochet -- called externally)
// =============================================================================

/**
 * Called when a projectile expires without hitting any enemy.
 * Returns a new ricochet projectile if whetstone procs, or null.
 */
export function onCatalystProjectileMiss(
  runtimeStates: CatalystRuntimeState[],
  world: GameWorld,
  stats: PlayerStats,
  expiredProjectile: ProjectileEntity,
): ProjectileEntity | null {
  for (const rs of runtimeStates) {
    if (rs.catalystId !== 'whetstone') continue;

    const def = findCatalystDef(rs.catalystId);
    if (!def) continue;

    const ricochetChance = getParam(def, 'ricochetChancePercent', rs.level) / 100;
    const ricochetDmgPct = getParam(def, 'ricochetDmgPercent', rs.level) / 100;
    const ricochetRange = getParam(def, 'ricochetRangePx', rs.level);
    const ricochetPierce = getParam(def, 'ricochetPierce', rs.level);

    if (Math.random() > ricochetChance) return null;

    // Find nearest enemy to ricochet toward
    const target = findNearestEnemy(
      world,
      expiredProjectile.x,
      expiredProjectile.y,
      ricochetRange,
    );
    if (!target) return null;

    const dx = target.x - expiredProjectile.x;
    const dy = target.y - expiredProjectile.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = Math.sqrt(
      expiredProjectile.vx * expiredProjectile.vx +
        expiredProjectile.vy * expiredProjectile.vy,
    ) || 200;

    const ricochet: ProjectileEntity = {
      id: createId(world),
      x: expiredProjectile.x,
      y: expiredProjectile.y,
      radius: expiredProjectile.radius,
      vx: (dx / d) * speed,
      vy: (dy / d) * speed,
      damage: expiredProjectile.damage * ricochetDmgPct,
      pierceLeft: ricochetPierce,
      hitEnemyIds: new Set(),
      lifetime: 1.5,
      isEnemy: false,
      weaponId: expiredProjectile.weaponId,
      color: '#9CA3AF',
    };

    // Visual: ricochet spark
    spawnParticle(world, expiredProjectile.x, expiredProjectile.y, '#9CA3AF', 3);

    return ricochet;
  }

  return null;
}
