// =============================================================================
// ALTAIR ENGINE -- Weapon Behavior System (Balance Patch v1.2)
// =============================================================================
// Implements firing behaviors for all 14 base weapons and their 14 evolved
// forms. Called each frame by the game loop to check cooldowns and spawn
// projectiles, melee hitboxes, auras, and other effects.
// =============================================================================

import {
  GameWorld,
  ProjectileEntity,
  MeleeHitbox,
  AuraEffect,
  WeaponState,
  EnemyEntity,
  createId,
} from './types';
import { WEAPONS, EVOLVED_WEAPONS, WeaponDef, EvolvedWeaponDef } from '../data/weapons';
import { PlayerStats } from '../stores/game-store';
import { applyFreeze, applyPoison, applySlow, applyStun } from './status-effects';

// =============================================================================
// Extended weapon state — extra per-weapon data not in the base WeaponState
// interface. Keyed by WeaponState reference identity.
// =============================================================================

interface ExtendedWeaponData {
  swingCount: number; // for Radiant Claymore shockwave tracking
}

const extendedData = new WeakMap<WeaponState, ExtendedWeaponData>();

function getExtended(ws: WeaponState): ExtendedWeaponData {
  let data = extendedData.get(ws);
  if (!data) {
    data = { swingCount: 0 };
    extendedData.set(ws, data);
  }
  return data;
}

// =============================================================================
// Helpers
// =============================================================================

/** Look up weapon definition by id (base or evolved). */
function findWeaponDef(
  weaponId: string,
  evolved: boolean,
): WeaponDef | EvolvedWeaponDef | undefined {
  if (evolved) {
    return EVOLVED_WEAPONS.find((w) => w.id === weaponId);
  }
  return WEAPONS.find((w) => w.id === weaponId);
}

/** Calculate level-scaled damage (v1.1: +10% per level, down from +15%). */
function levelDamage(baseDamage: number, level: number, might: number): number {
  return baseDamage * Math.pow(1.10, level - 1) * might;
}

/** Calculate effective cooldown. */
function effectiveCooldown(baseCooldown: number, stats: PlayerStats): number {
  return baseCooldown * stats.cdr / stats.attackSpeed;
}

/**
 * v1.2: Weapon-specific level bonus count.
 * By default levels 2 and 5 each give +1. Some weapons override this.
 */
function levelBonusCount(level: number): number {
  let bonus = 0;
  if (level >= 2) bonus++;
  if (level >= 5) bonus++;
  return bonus;
}

/** Distance between two points. */
function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Find nearest enemy to a point. */
function findNearestEnemy(
  enemies: EnemyEntity[],
  x: number,
  y: number,
  maxRange?: number,
): EnemyEntity | null {
  let best: EnemyEntity | null = null;
  let bestDist = maxRange ?? Infinity;
  for (const e of enemies) {
    const d = dist(x, y, e.x, e.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/** Find a random enemy within range. */
function findRandomEnemyInRange(
  enemies: EnemyEntity[],
  x: number,
  y: number,
  range: number,
): EnemyEntity | null {
  const inRange = enemies.filter((e) => dist(x, y, e.x, e.y) <= range);
  if (inRange.length === 0) return null;
  return inRange[Math.floor(Math.random() * inRange.length)];
}

/** Find N nearest enemies to a point (sorted by distance). */
function findNearestEnemies(
  enemies: EnemyEntity[],
  x: number,
  y: number,
  count: number,
  maxRange?: number,
  exclude?: Set<number>,
): EnemyEntity[] {
  const candidates = enemies
    .filter((e) => {
      if (exclude && exclude.has(e.id)) return false;
      if (maxRange && dist(x, y, e.x, e.y) > maxRange) return false;
      return true;
    })
    .map((e) => ({ enemy: e, d: dist(x, y, e.x, e.y) }))
    .sort((a, b) => a.d - b.d);
  return candidates.slice(0, count).map((c) => c.enemy);
}

/**
 * v1.2: Find densest enemy cluster within range.
 * Returns the position of the enemy with the most neighbors within clusterRadius.
 */
function findDensestCluster(
  enemies: EnemyEntity[],
  x: number,
  y: number,
  searchRange: number,
  clusterRadius: number,
): { x: number; y: number } | null {
  let bestX = 0;
  let bestY = 0;
  let bestCount = 0;

  for (const enemy of enemies) {
    const d = dist(x, y, enemy.x, enemy.y);
    if (d > searchRange) continue;

    let count = 0;
    for (const other of enemies) {
      if (dist(enemy.x, enemy.y, other.x, other.y) <= clusterRadius) {
        count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestX = enemy.x;
      bestY = enemy.y;
    }
  }

  return bestCount > 0 ? { x: bestX, y: bestY } : null;
}

/** Normalize a 2D vector. Returns {x:1,y:0} if zero length. */
function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return { x: 1, y: 0 };
  return { x: x / len, y: y / len };
}

/** Get player facing angle in radians. */
function facingAngle(world: GameWorld): number {
  return Math.atan2(world.player.facingY, world.player.facingX);
}

/** Create a base projectile entity with common defaults. */
function createProjectile(
  world: GameWorld,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  pierceLeft: number,
  lifetime: number,
  color: string,
  weaponId: string,
): ProjectileEntity {
  return {
    id: createId(world),
    x,
    y,
    radius: 6,
    vx,
    vy,
    damage,
    pierceLeft,
    hitEnemyIds: new Set(),
    lifetime,
    isEnemy: false,
    weaponId,
    color,
  };
}

// =============================================================================
// Weapon Behavior Functions
// =============================================================================

// ---- 1. Broad Sword / Radiant Claymore (melee_sweep) ------------------------
// v1.2: damage 19, cooldown 1.2s, 110° arc (95px), block 25% DR 0.1s on hit
// Evolved: 150° arc, +35% dmg, shockwave every 3rd swing (130px, 50% dmg)
// Level 2: Block 25%→30%. Level 5: Arc 110°→120°, +5px range.

function fireMeleeSweep(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);

  // v1.2: base range 95px, +5px at level 5
  let baseRadius = 95;
  if (!ws.evolved && ws.level >= 5) baseRadius = 100;
  const radius = baseRadius * stats.area;

  const angle = facingAngle(world);

  // v1.2: 110° base, 120° at level 5, 150° evolved
  let arcDeg = 110;
  if (ws.evolved) {
    arcDeg = 150;
  } else if (ws.level >= 5) {
    arcDeg = 120;
  }
  const arc = (arcDeg * Math.PI) / 180;

  // v1.2: Block DR — 25% base, 30% at level 2+, 30% evolved (0.15s evolved)
  let blockDR = 0.25;
  let blockDuration = 0.1;
  if (ws.evolved) {
    blockDR = 0.30;
    blockDuration = 0.15;
  } else if (ws.level >= 2) {
    blockDR = 0.30;
  }

  const hitbox: MeleeHitbox = {
    x: world.player.x,
    y: world.player.y,
    radius,
    angle,
    arc,
    damage,
    lifetime: 0.2,
    maxLifetime: 0.2,
    hitEnemyIds: new Set(),
    weaponId: ws.weaponId,
    blockDR,
    blockDuration,
  };
  world.meleeHitboxes.push(hitbox);

  // Evolved Radiant Claymore: every 3rd swing emits a shockwave projectile
  if (ws.evolved) {
    const ext = getExtended(ws);
    ext.swingCount++;
    if (ext.swingCount >= 3) {
      ext.swingCount = 0;
      const dir = normalize(world.player.facingX, world.player.facingY);
      const speed = 300 * stats.projSpeed;
      const proj = createProjectile(
        world,
        world.player.x,
        world.player.y,
        dir.x * speed,
        dir.y * speed,
        damage * 0.5, // v1.2: 50% of swing damage
        999, // infinite pierce
        1.5,
        def.color,
        ws.weaponId,
      );
      proj.aoeRadius = 130 * stats.area; // v1.2: 130px (was 60px evo, 120px from doc)
      world.projectiles.push(proj);
    }
  }
}

// ---- 2. Arcane Bolt / Arcane Barrage (homing) -------------------------------
// v1.2: damage 17, cooldown 1.05s, 350px tracking, 220°/s turn
// 40% splash on kill (40px), Level 2: splash +10px, Level 5: splash 55%, +1 bolt
// Evolved: 3 bolts, 55px AoE (4 enemy cap), splash inherited

function fireHoming(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 250 * stats.projSpeed;
  const lifetime = 3 * stats.duration;

  // v1.2: Level 5 gives +1 bolt for base. Evolved always 3.
  let boltCount: number;
  if (ws.evolved) {
    boltCount = 3 + stats.projCount;
  } else {
    boltCount = 1 + stats.projCount;
    if (ws.level >= 5) boltCount += 1; // Level 5: +1 bolt
  }

  // v1.2: splash on kill parameters
  let splashRadius = 40;
  let splashDamagePct = 0.40;
  if (ws.level >= 2) splashRadius = 50;
  if (ws.level >= 5) splashDamagePct = 0.55;

  const targets = findNearestEnemies(
    world.enemies,
    world.player.x,
    world.player.y,
    boltCount,
    350, // v1.2: 350px tracking radius
  );

  for (let i = 0; i < boltCount; i++) {
    const target = targets[i % Math.max(1, targets.length)];
    let vx: number, vy: number;
    if (target) {
      const dir = normalize(target.x - world.player.x, target.y - world.player.y);
      vx = dir.x * speed;
      vy = dir.y * speed;
    } else {
      const a = Math.random() * Math.PI * 2;
      vx = Math.cos(a) * speed;
      vy = Math.sin(a) * speed;
    }

    const proj = createProjectile(
      world,
      world.player.x,
      world.player.y,
      vx,
      vy,
      damage,
      1,
      lifetime,
      def.color,
      ws.weaponId,
    );
    proj.homing = true;
    proj.homingStrength = 3.85; // v1.2: 220°/s turn rate (≈3.85 rad/s)

    // v1.2: splash on kill
    proj.splashOnKillRadius = splashRadius * stats.area;
    proj.splashOnKillDamagePct = splashDamagePct;

    // Evolved: AoE on impact
    if (ws.evolved) {
      proj.aoeRadius = 55 * stats.area; // v1.2: 55px (was 80px)
    }

    world.projectiles.push(proj);
  }
}

// ---- 3. Iron Shortbow / Storm Bow (directional) ----------------------------
// v1.2: damage 12, cooldown 0.75s, pierce 2, speed 400, range 450px
// 8% crit (1.5x), Level 2: +1 pierce, Level 5: +2% crit, +1 proj
// Evolved: +50% arrows, pierce 5, trails (4 dmg/tick, 1.2s, 25px), 13% crit (1.75x)

function fireDirectional(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 400 * stats.projSpeed;
  const baseAngle = facingAngle(world);
  const spreadAngle = (15 * Math.PI) / 180;

  // v1.2: base pierce 2, +1 at level 2. Evolved: pierce 5
  let pierce: number;
  if (ws.evolved) {
    pierce = 5;
  } else {
    pierce = 2 + stats.pierce; // v1.2: base 2 (hits 3 enemies)
    if (ws.level >= 2) pierce += 1; // Level 2: +1 pierce
  }

  // v1.2: arrow count. Level 5 gives +1 proj (not level 2). Evolved: +50%
  let arrowCount = 1 + stats.projCount;
  if (!ws.evolved && ws.level >= 5) arrowCount += 1;
  if (ws.evolved) {
    arrowCount = Math.ceil(arrowCount * 1.5);
  }

  // v1.2: Crit system
  let critChance = 0.08; // 8% base
  let critMultiplier = 1.5;
  if (!ws.evolved && ws.level >= 5) critChance = 0.10; // Level 5: 10%
  if (ws.evolved) {
    critChance = 0.13; // 13% evolved
    critMultiplier = 1.75; // 1.75x evolved
  }
  // Crit chance scales with Luck
  critChance *= stats.luck;

  for (let i = 0; i < arrowCount; i++) {
    let angle: number;
    if (arrowCount === 1) {
      angle = baseAngle;
    } else {
      const offset = (i - (arrowCount - 1) / 2) * spreadAngle;
      angle = baseAngle + offset;
    }

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // v1.2: lifetime based on range/speed. 450px / 400px/s = 1.125s, give some extra
    const lifetime = 450 / (speed / stats.projSpeed) + 0.5;

    const proj = createProjectile(
      world,
      world.player.x,
      world.player.y,
      vx,
      vy,
      damage,
      pierce,
      lifetime,
      def.color,
      ws.weaponId,
    );
    proj.radius = 5;
    proj.critChance = critChance;
    proj.critMultiplier = critMultiplier;
    world.projectiles.push(proj);
  }
}

// ---- 4. Toxic Flask / Plague Bomb (lobbed_aoe) -----------------------------
// v1.2: damage 7/tick, cooldown 3.5s, 70px pool, 2.0s, 200px lob range
// Smart-target densest cluster. 20% slow in pool.
// Level 2: +1 flask. Level 5: pool radius +15px, slow 25%
// Evolved: pool +50%, carry-poison 3.0s (5 dmg/tick/0.5s, 15% slow)

function fireLobbed(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);

  // v1.2: base 70px pool, +15px at level 5. Evolved: +50%
  let basePoolRadius = 70;
  if (!ws.evolved && ws.level >= 5) basePoolRadius = 85;
  const poolRadius = basePoolRadius * stats.area * (ws.evolved ? 1.5 : 1);

  const baseDuration = 2.0;
  const duration = baseDuration * stats.duration;

  // v1.2: slow in pool
  let poolSlowPct = 0.20;
  if (!ws.evolved && ws.level >= 5) poolSlowPct = 0.25;

  // v1.2: flask count. Level 2: +1 flask
  let flaskCount = 1;
  if (!ws.evolved && ws.level >= 2) flaskCount = 2;
  if (ws.evolved) flaskCount = 1; // Evolved uses single large pool

  const lobRange = 200;

  for (let f = 0; f < flaskCount; f++) {
    // v1.2: Smart-targeting — aim at densest enemy cluster within range
    let targetX: number, targetY: number;
    const cluster = findDensestCluster(
      world.enemies,
      world.player.x,
      world.player.y,
      lobRange,
      poolRadius,
    );
    if (cluster) {
      targetX = cluster.x + (f > 0 ? (Math.random() - 0.5) * 60 : 0);
      targetY = cluster.y + (f > 0 ? (Math.random() - 0.5) * 60 : 0);
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 120;
      targetX = world.player.x + Math.cos(a) * r;
      targetY = world.player.y + Math.sin(a) * r;
    }

    const proj: ProjectileEntity = {
      id: createId(world),
      x: targetX,
      y: targetY,
      radius: poolRadius,
      vx: 0,
      vy: 0,
      damage: 0,
      pierceLeft: 999,
      hitEnemyIds: new Set(),
      lifetime: duration,
      isEnemy: false,
      weaponId: ws.weaponId,
      color: def.color,
      isPool: true,
      poolDamagePerTick: damage,
      poolTickInterval: 0.5,
      poolTimer: 0,
      poolRadius,
      poolSlowPct, // v1.2: slow enemies in pool
    };
    world.projectiles.push(proj);
  }
}

// ---- 5. War Axe / Cataclysm Axe (circular_cleave) -------------------------
// v1.2: damage 20, cooldown 2.3s, range 70px, max 6 targets
// 0.25s windup (60% move speed). Level 2: +10px range. Level 5: +10px, windup 0.2s
// Evolved: +30% dmg, 20px pull, fire trail 25px/1.5s/3dmg, 0.2s windup

function fireCircularCleave(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  let damage = levelDamage(def.baseDamage, ws.level, stats.might);

  // v1.2: base range 70px, +10px at level 2, +10px at level 5
  let baseRadius = 70;
  if (!ws.evolved) {
    if (ws.level >= 2) baseRadius = 80;
    if (ws.level >= 5) baseRadius = 90;
  } else {
    baseRadius = 70; // Evolved inherits base radius
    // Evolved gets same level scaling through the base weapon level
    if (ws.level >= 2) baseRadius = 80;
    if (ws.level >= 5) baseRadius = 90;
  }
  const radius = baseRadius * stats.area;

  const hitbox: MeleeHitbox = {
    x: world.player.x,
    y: world.player.y,
    radius,
    angle: 0,
    arc: Math.PI * 2, // Full 360°
    damage,
    lifetime: 0.25,
    maxLifetime: 0.25,
    hitEnemyIds: new Set(),
    weaponId: ws.weaponId,
    maxTargets: 6, // v1.2: max 6 targets (was 8)
  };
  world.meleeHitboxes.push(hitbox);

  // Evolved: pull enemies inward 20px (was 50px)
  if (ws.evolved) {
    for (const enemy of world.enemies) {
      const d = dist(world.player.x, world.player.y, enemy.x, enemy.y);
      if (d <= radius && d > 0) {
        const pullDist = Math.min(20, d); // v1.2: 20px pull (was 50px)
        const dir = normalize(
          world.player.x - enemy.x,
          world.player.y - enemy.y,
        );
        enemy.x += dir.x * pullDist;
        enemy.y += dir.y * pullDist;
      }
    }

    // v1.2: Fire trail at player position
    const trailDamage = 3; // 3 dmg/tick
    const trailPool: ProjectileEntity = {
      id: createId(world),
      x: world.player.x,
      y: world.player.y,
      radius: 25 * stats.area, // v1.2: 25px wide (was 30px)
      vx: 0,
      vy: 0,
      damage: 0,
      pierceLeft: 999,
      hitEnemyIds: new Set(),
      lifetime: 1.5,
      isEnemy: false,
      weaponId: ws.weaponId,
      color: '#EF4444',
      isPool: true,
      poolDamagePerTick: trailDamage * stats.might,
      poolTickInterval: 0.5,
      poolTimer: 0,
      poolRadius: 25 * stats.area,
    };
    world.projectiles.push(trailPool);
  }
}

// ---- 6. Soul Siphon / Death Ray (beam) -------------------------------------
// v1.2: damage 9/tick, range 100px, 5 ticks/s (45 DPS). 15% slow. +10% Raise Dead.
// Evolved: range 200px, chain 2 at -30%, 10% lifesteal, slow + Raise Dead inherited

function updateBeam(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
  delta: number,
): void {
  // v1.2: 5 ticks/s. The damage field is "per tick" so DPS = baseDamage * 5.
  // We apply damage as continuous (damage * tickRate * delta).
  const tickRate = 5; // v1.2: 5 ticks/s (was 4)
  const dps = levelDamage(def.baseDamage, ws.level, stats.might) * tickRate;
  const damageThisFrame = dps * delta;
  const baseRange = ws.evolved ? 200 : 100; // v1.2: 100px base (was 80), 200px evolved (was 250)
  const range = baseRange * stats.area;

  const target = findNearestEnemy(
    world.enemies,
    world.player.x,
    world.player.y,
    range,
  );

  if (!target) return;

  // Deal damage to primary target
  target.hp -= damageThisFrame;
  target.flashTimer = Math.max(target.flashTimer, 0.05);

  // v1.2: 15% slow while beam is active on target
  applySlow(target.statusEffects, 0.15, delta + 0.1);

  // Evolved Death Ray: chain to 2 additional enemies, 10% lifesteal
  if (ws.evolved) {
    const chainTargets = findNearestEnemies(
      world.enemies,
      target.x,
      target.y,
      2, // v1.2: chain to 2 (was 3)
      range,
      new Set([target.id]),
    );

    let totalDamageDealt = damageThisFrame;

    for (const chain of chainTargets) {
      const chainDmg = damageThisFrame * 0.7; // v1.2: -30% per bounce (was -40%, 0.6)
      chain.hp -= chainDmg;
      chain.flashTimer = Math.max(chain.flashTimer, 0.05);
      totalDamageDealt += chainDmg;

      // v1.2: slow inherited to chain targets
      applySlow(chain.statusEffects, 0.15, delta + 0.1);
    }

    // v1.2: 10% lifesteal (was 15%)
    const healAmount = totalDamageDealt * 0.10;
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + healAmount);
  }
}

// ---- 7. Temporal Shard / Eternity Loop (boomerang) -------------------------
// v1.2: damage 14x2, cooldown 2.0s, pierce 4, 280px range
// Return +25% damage. 10% slow 1.5s on hit.
// Level 2: +1 pierce each way. Level 5: return +40%, slow +0.5s
// Evolved: 3 shards, freeze 0.3s (1.5s CD), pierce 5, slow inherited

function fireBoomerang(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 200 * stats.projSpeed;
  const count = ws.evolved
    ? 3 + stats.projCount // v1.2: 3 shards evolved (was 2)
    : 1 + stats.projCount;

  // v1.2: slow on hit
  const slowPct = 0.10;
  let slowDuration = 1.5;
  if (!ws.evolved && ws.level >= 5) slowDuration = 2.0;

  // v1.2: return damage bonus
  let returnBonus = 0.25;
  if (!ws.evolved && ws.level >= 5) returnBonus = 0.40;

  for (let i = 0; i < count; i++) {
    let angle: number;
    if (count === 1) {
      angle = facingAngle(world);
    } else {
      angle = (Math.PI * 2 * i) / count;
    }

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const proj = createProjectile(
      world,
      world.player.x,
      world.player.y,
      vx,
      vy,
      damage,
      999, // Infinite pierce both ways
      4 * stats.duration,
      def.color,
      ws.weaponId,
    );
    proj.returning = false;
    proj.originX = world.player.x;
    proj.originY = world.player.y;
    // v1.2: slow on hit
    proj.slowOnHitPct = slowPct;
    proj.slowOnHitDuration = slowDuration;
    // v1.2: return damage bonus
    proj.returnDamageBonus = returnBonus;
    world.projectiles.push(proj);
  }
}

// ---- 8. Crimson Whip / Sanguine Scourge (lash) ----------------------------
// v1.2: damage 20, cooldown 1.35s, 140px range, 55px width, pierce 5
// 2% inherent lifesteal (3% evolved). Evolved: 4 cardinal, 60px width, pierce 6

function fireLash(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const baseRange = 140; // v1.2: 140px (was 150)
  const range = baseRange * stats.area;

  // v1.2: width as arc angle. 55px width at 140px range ≈ 22.5° half-angle
  // For evolved: 60px width. We use arc in radians.
  const baseWidth = ws.evolved ? 60 : 55; // v1.2: 55px base, 60px evolved
  const arc = 2 * Math.atan2(baseWidth / 2, range); // Convert width to arc angle

  // v1.2: lifesteal
  const lifestealPct = ws.evolved ? 0.03 : 0.02;

  if (ws.evolved) {
    // Sanguine Scourge: lash in all 4 cardinal directions
    const directions = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    for (const dir of directions) {
      const hitbox: MeleeHitbox = {
        x: world.player.x,
        y: world.player.y,
        radius: range,
        angle: dir,
        arc,
        damage,
        lifetime: 0.15,
        maxLifetime: 0.15,
        hitEnemyIds: new Set(),
        weaponId: ws.weaponId,
      };
      world.meleeHitboxes.push(hitbox);
    }
  } else {
    const hitbox: MeleeHitbox = {
      x: world.player.x,
      y: world.player.y,
      radius: range,
      angle: facingAngle(world),
      arc,
      damage,
      lifetime: 0.15,
      maxLifetime: 0.15,
      hitEnemyIds: new Set(),
      weaponId: ws.weaponId,
    };
    world.meleeHitboxes.push(hitbox);
  }

  // v1.2: Lifesteal is handled by the collision system checking weaponId
  // We store lifesteal info on the world for the collision system to use
  // (The collision system will check if weaponId is crimson_whip or sanguine_scourge)
}

/**
 * v1.2: Get Crimson Whip lifesteal percentage for a weapon hit.
 * Returns 0 if the weapon is not a whip variant.
 */
export function getWhipLifesteal(weaponId: string): number {
  if (weaponId === 'sanguine_scourge') return 0.03;
  if (weaponId === 'crimson_whip') return 0.02;
  return 0;
}

// ---- 9. Holy Water / Divine Deluge (ground_aoe) ----------------------------

function fireGroundAoe(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const baseRadius = 60;
  const poolRadius = baseRadius * stats.area;
  const baseDuration = 2.5;
  const duration = baseDuration * stats.duration + levelBonusCount(ws.level) * 0.5;

  const poolCount = ws.evolved ? 4 : 1;

  for (let i = 0; i < poolCount; i++) {
    let px: number, py: number;

    if (ws.evolved && i > 0) {
      const target = findRandomEnemyInRange(
        world.enemies,
        world.player.x,
        world.player.y,
        400,
      );
      if (target) {
        px = target.x;
        py = target.y;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = 80 + Math.random() * 200;
        px = world.player.x + Math.cos(a) * r;
        py = world.player.y + Math.sin(a) * r;
      }
    } else {
      px = world.player.x;
      py = world.player.y;
    }

    const pool: ProjectileEntity = {
      id: createId(world),
      x: px,
      y: py,
      radius: poolRadius,
      vx: 0,
      vy: 0,
      damage: 0,
      pierceLeft: 999,
      hitEnemyIds: new Set(),
      lifetime: duration,
      isEnemy: false,
      weaponId: ws.weaponId,
      color: def.color,
      isPool: true,
      poolDamagePerTick: damage,
      poolTickInterval: 0.5,
      poolTimer: 0,
      poolRadius,
    };
    world.projectiles.push(pool);
  }
}

// ---- 10. Throwing Daggers / Knife Storm (multi_projectile) -----------------
// v1.2: damage 7, cooldown 0.65s, 3 base proj, pierce 1 (hits 2)

function fireMultiProjectile(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 350 * stats.projSpeed;
  const spreadAngle = (30 * Math.PI) / 180; // ±30°

  // v1.2: 3 base daggers (was 2) + level bonuses
  let daggerCount = 3 + levelBonusCount(ws.level) + stats.projCount;
  const baseAngle = facingAngle(world);

  // v1.2: pierce 1 for base (hits 2 enemies)
  const pierce = ws.evolved ? 1 : 1 + stats.pierce;

  if (ws.evolved) {
    // Knife Storm: 360° burst
    for (let i = 0; i < daggerCount; i++) {
      const angle = (Math.PI * 2 * i) / daggerCount;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const proj = createProjectile(
        world,
        world.player.x,
        world.player.y,
        vx,
        vy,
        damage,
        pierce,
        1.5,
        def.color,
        ws.weaponId,
      );
      proj.radius = 4;
      world.projectiles.push(proj);
    }
  } else {
    // Base: random spread around facing direction
    for (let i = 0; i < daggerCount; i++) {
      const angleOffset = (Math.random() - 0.5) * 2 * spreadAngle;
      const angle = baseAngle + angleOffset;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const proj = createProjectile(
        world,
        world.player.x,
        world.player.y,
        vx,
        vy,
        damage,
        pierce,
        1.5,
        def.color,
        ws.weaponId,
      );
      proj.radius = 4;
      world.projectiles.push(proj);
    }
  }
}

// ---- 11. Lightning Ring / Thunderstorm (auto_strike) -----------------------
// v1.2: damage 22, cooldown 2.5s

function fireAutoStrike(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const range = 400 * stats.area;
  const boltCount = ws.evolved ? 3 : 1;

  const hitTargets = new Set<number>();

  for (let b = 0; b < boltCount; b++) {
    const target = findRandomEnemyInRange(
      world.enemies,
      world.player.x,
      world.player.y,
      range,
    );
    if (!target) continue;

    target.hp -= damage;
    target.flashTimer = Math.max(target.flashTimer, 0.1);
    hitTargets.add(target.id);

    // Visual particle
    world.particles.push({
      id: createId(world),
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      life: 0.3,
      maxLife: 0.3,
      color: def.color,
      radius: 20 * stats.area,
    });

    // Evolved Thunderstorm: chain to 2 nearby, 0.5s stun
    if (ws.evolved) {
      applyStun(target.statusEffects, 0.5);

      const chainTargets = findNearestEnemies(
        world.enemies,
        target.x,
        target.y,
        2,
        200,
        hitTargets,
      );

      for (const chain of chainTargets) {
        chain.hp -= damage * 0.7;
        chain.flashTimer = Math.max(chain.flashTimer, 0.1);
        applyStun(chain.statusEffects, 0.5);
        hitTargets.add(chain.id);

        world.particles.push({
          id: createId(world),
          x: chain.x,
          y: chain.y,
          vx: 0,
          vy: 0,
          life: 0.2,
          maxLife: 0.2,
          color: def.color,
          radius: 14 * stats.area,
        });
      }
    }
  }
}

// ---- 12. Garlic / Soul Eater (aura) ----------------------------------------
// v1.2: Garlic: 2/tick, 1.0s ticks, 60px, max 10, 8px knockback, 50% falloff outer
// Soul Eater: 4/tick, 1.0s ticks, 100px, max 15, 10px knockback, -8% enemy dmg, 0.3% lifesteal

function updateAura(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);

  // v1.2: base 60px, +15px at level 5 for base garlic. Evolved: 100px
  let baseRadius: number;
  if (ws.evolved) {
    baseRadius = 100; // v1.2: 100px (was 200)
  } else {
    baseRadius = 60;
    if (ws.level >= 5) baseRadius = 75; // Level 5: +15px
  }
  const radius = baseRadius * stats.area;

  const tickInterval = 1.0; // v1.2: 1.0s (was 0.5/0.75)

  // v1.2: max targets and knockback
  const maxTargets = ws.evolved ? 15 : 10;
  const knockback = ws.evolved ? 10 : 8; // px per tick

  // Inner radius for damage falloff (50% damage in outer ring)
  const innerRadius = ws.evolved ? radius * 0.5 : 30 * stats.area;

  // Find existing aura or create one
  let aura = world.auras.find((a) => a.weaponId === ws.weaponId);

  if (!aura) {
    aura = {
      x: world.player.x,
      y: world.player.y,
      radius,
      damagePerTick: damage,
      tickInterval,
      timer: 0,
      weaponId: ws.weaponId,
      hitEnemyIds: new Set(),
      tickHitEnemyIds: new Set(),
      maxTargets,
      knockback,
      innerRadius,
    };
    world.auras.push(aura);
  }

  // Update aura position and stats every frame
  aura.x = world.player.x;
  aura.y = world.player.y;
  aura.radius = radius;
  aura.damagePerTick = damage;
  aura.tickInterval = tickInterval;
  aura.maxTargets = maxTargets;
  aura.knockback = knockback;
  aura.innerRadius = innerRadius;
}

// ---- 13. Runic Orbs / Celestial Guard (orbital) ----------------------------
// v1.2: damage 11, 0.4s per-enemy hit CD

function updateOrbitals(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
  delta: number,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const baseOrbitRadius = 80;
  const orbitRadius = baseOrbitRadius * stats.area;

  let orbCount: number;
  if (ws.evolved) {
    orbCount = 5;
  } else {
    orbCount = 2 + levelBonusCount(ws.level);
  }

  if (ws.orbitAngle === undefined) {
    ws.orbitAngle = 0;
  }

  const baseOrbitSpeed = 2.0;
  const orbitSpeed = ws.evolved ? baseOrbitSpeed * 2 : baseOrbitSpeed;
  ws.orbitAngle += orbitSpeed * delta;
  if (ws.orbitAngle >= Math.PI * 2) {
    ws.orbitAngle -= Math.PI * 2;
  }

  const existingOrbs = world.projectiles.filter(
    (p) => p.weaponId === ws.weaponId && !p.isEnemy && !p.isPool,
  );

  if (existingOrbs.length === orbCount) {
    for (let i = 0; i < orbCount; i++) {
      const angle = ws.orbitAngle + (Math.PI * 2 * i) / orbCount;
      existingOrbs[i].x = world.player.x + Math.cos(angle) * orbitRadius;
      existingOrbs[i].y = world.player.y + Math.sin(angle) * orbitRadius;
      existingOrbs[i].damage = damage;
      existingOrbs[i].lifetime = 999;
      existingOrbs[i].hitEnemyIds.clear();
    }
  } else {
    for (let i = world.projectiles.length - 1; i >= 0; i--) {
      const p = world.projectiles[i];
      if (p.weaponId === ws.weaponId && !p.isEnemy && !p.isPool) {
        world.projectiles.splice(i, 1);
      }
    }

    for (let i = 0; i < orbCount; i++) {
      const angle = ws.orbitAngle + (Math.PI * 2 * i) / orbCount;
      const ox = world.player.x + Math.cos(angle) * orbitRadius;
      const oy = world.player.y + Math.sin(angle) * orbitRadius;

      const orb = createProjectile(
        world,
        ox,
        oy,
        0,
        0,
        damage,
        999,
        999,
        def.color,
        ws.weaponId,
      );
      orb.radius = 10;
      world.projectiles.push(orb);
    }
  }
}

// ---- 14. Fire Wand / Inferno Staff (direct_shot) ---------------------------

function fireDirectShot(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 200 * stats.projSpeed;
  const count = 1 + stats.projCount;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const proj = createProjectile(
      world,
      world.player.x,
      world.player.y,
      vx,
      vy,
      damage,
      1,
      3.0,
      def.color,
      ws.weaponId,
    );
    proj.radius = 8;

    if (ws.evolved) {
      proj.aoeRadius = 40 * stats.area;
    }

    world.projectiles.push(proj);
  }
}

/**
 * Spawn ember projectiles from an Inferno Staff fireball impact.
 * Called by the collision system when an inferno_staff projectile is destroyed.
 */
export function spawnInfernoEmbers(
  world: GameWorld,
  x: number,
  y: number,
  stats: PlayerStats,
  level: number,
): void {
  const baseDamage = 30;
  const damage = levelDamage(baseDamage, level, stats.might) * 0.3;
  const emberCount = 6;

  for (let i = 0; i < emberCount; i++) {
    const angle = (Math.PI * 2 * i) / emberCount;
    const speed = 120 * stats.projSpeed;

    const pool: ProjectileEntity = {
      id: createId(world),
      x: x + Math.cos(angle) * 20,
      y: y + Math.sin(angle) * 20,
      radius: 20 * stats.area,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: 0,
      pierceLeft: 999,
      hitEnemyIds: new Set(),
      lifetime: 1.5 * stats.duration,
      isEnemy: false,
      weaponId: 'inferno_staff',
      color: '#FB923C',
      isPool: true,
      poolDamagePerTick: damage,
      poolTickInterval: 0.3,
      poolTimer: 0,
      poolRadius: 20 * stats.area,
    };
    world.projectiles.push(pool);
  }
}

// =============================================================================
// Weapon type -> behavior dispatch
// =============================================================================

/** Resolve the weapon or evolved weapon definition for a given WeaponState. */
function resolveWeaponDef(ws: WeaponState): WeaponDef | EvolvedWeaponDef | undefined {
  return findWeaponDef(ws.weaponId, ws.evolved);
}

/** Get the weapon type for a weapon state. */
function getWeaponType(ws: WeaponState): string | undefined {
  const def = resolveWeaponDef(ws);
  return def?.type;
}

// =============================================================================
// Main export
// =============================================================================

/**
 * Main weapon system entry point. Called every frame by the game loop.
 * Decrements cooldowns, fires weapons when ready, and updates continuous
 * effects (auras, orbitals, beams).
 * v1.2: Handles War Axe windup system.
 */
export function fireWeapons(
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
): void {
  // If weapons are disabled (e.g., Banshee wail), skip all firing
  if (world.weaponsDisabled) return;

  // v1.2: Decrement player block timer
  if (world.player.blockTimer !== undefined && world.player.blockTimer > 0) {
    world.player.blockTimer -= delta;
    if (world.player.blockTimer <= 0) {
      world.player.blockTimer = 0;
      world.player.blockDR = 0;
    }
  }

  // v1.2: Decrement player windup slow timer
  if (world.player.windupSlowTimer !== undefined && world.player.windupSlowTimer > 0) {
    world.player.windupSlowTimer -= delta;
    if (world.player.windupSlowTimer <= 0) {
      world.player.windupSlowTimer = 0;
    }
  }

  for (const ws of world.weapons) {
    const def = resolveWeaponDef(ws);
    if (!def) continue;

    const weaponType = def.type;

    // --- Continuous weapons: beam, aura, orbital (update every frame) ---

    if (weaponType === 'beam') {
      updateBeam(world, ws, def, stats, delta);
      continue;
    }

    if (weaponType === 'aura') {
      updateAura(world, ws, def, stats);
      continue;
    }

    if (weaponType === 'orbital') {
      updateOrbitals(world, ws, def, stats, delta);
      continue;
    }

    // --- Cooldown-based weapons ---

    // v1.2: Handle windup for circular_cleave (War Axe)
    if (weaponType === 'circular_cleave' && ws.windupTimer !== undefined && ws.windupTimer > 0) {
      ws.windupTimer -= delta;
      if (ws.windupTimer <= 0) {
        ws.windupTimer = 0;
        // Fire the cleave now that windup is complete
        fireCircularCleave(world, ws, def, stats);
      }
      continue; // Skip normal cooldown logic during windup
    }

    // Decrement cooldown
    ws.cooldownTimer -= delta;

    if (ws.cooldownTimer > 0) continue;

    // Reset cooldown
    const cd = effectiveCooldown(def.baseCooldown, stats);
    ws.cooldownTimer = cd;

    // v1.2: War Axe windup — don't fire immediately, start windup
    if (weaponType === 'circular_cleave') {
      let windupTime = 0.25; // v1.2: 0.25s base windup
      if (ws.evolved) windupTime = 0.20; // Evolved: 0.2s
      else if (ws.level >= 5) windupTime = 0.20; // Level 5: 0.2s

      ws.windupTimer = windupTime;
      // Apply move speed slow during windup
      world.player.windupSlowTimer = windupTime;
      continue;
    }

    // Dispatch to weapon behavior
    switch (weaponType) {
      case 'melee_sweep':
        fireMeleeSweep(world, ws, def, stats);
        break;
      case 'homing':
        fireHoming(world, ws, def, stats);
        break;
      case 'directional':
        fireDirectional(world, ws, def, stats);
        break;
      case 'lobbed_aoe':
        fireLobbed(world, ws, def, stats);
        break;
      case 'boomerang':
        fireBoomerang(world, ws, def, stats);
        break;
      case 'lash':
        fireLash(world, ws, def, stats);
        break;
      case 'ground_aoe':
        fireGroundAoe(world, ws, def, stats);
        break;
      case 'multi_projectile':
        fireMultiProjectile(world, ws, def, stats);
        break;
      case 'auto_strike':
        fireAutoStrike(world, ws, def, stats);
        break;
      case 'direct_shot':
        fireDirectShot(world, ws, def, stats);
        break;
    }
  }
}

// =============================================================================
// Boomerang return logic — called by projectile update system
// =============================================================================

/**
 * Update boomerang projectiles. Call this each frame from the projectile
 * movement system to handle the return behavior.
 *
 * v1.2: Return distance increased to 280px. Return pass gets damage bonus.
 */
export function updateBoomerangs(world: GameWorld, delta: number): void {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    if (p.originX === undefined || p.originY === undefined) continue;
    if (p.isEnemy) continue;

    const distFromOrigin = dist(p.x, p.y, p.originX, p.originY);

    if (!p.returning && distFromOrigin >= 280) { // v1.2: 280px (was 200)
      // Start returning
      p.returning = true;
      // v1.2: Apply return damage bonus
      if (p.returnDamageBonus) {
        p.damage *= (1 + p.returnDamageBonus);
      }
      // Clear hit tracking so return pass can hit enemies again
      p.hitEnemyIds.clear();
    }

    if (p.returning) {
      const dirToPlayer = normalize(
        world.player.x - p.x,
        world.player.y - p.y,
      );
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      p.vx = dirToPlayer.x * speed;
      p.vy = dirToPlayer.y * speed;

      const distToPlayer = dist(p.x, p.y, world.player.x, world.player.y);
      if (distToPlayer < 20) {
        world.projectiles.splice(i, 1);
      }
    }
  }
}

/**
 * Apply Eternity Loop freeze effect on projectile hit.
 * Called by the collision system when a boomerang projectile hits an enemy.
 * v1.2: freeze 0.3s (unchanged), internal CD reduced to 1.5s (was 2s)
 */
export function applyEternityLoopFreeze(
  enemy: EnemyEntity,
  weaponId: string,
): void {
  if (weaponId === 'eternity_loop') {
    applyFreeze(enemy.statusEffects, 0.3); // v1.2: 0.3s unchanged
  }
}

/**
 * Apply Plague Bomb poison on pool exit.
 * Called by the collision system when an enemy leaves a plague_bomb pool.
 * v1.2: 3.0s duration (was 2.5), 5 dmg/tick (was 4), + 15% slow
 */
export function applyPlagueBombPoison(
  enemy: EnemyEntity,
  weaponId: string,
  damage: number,
): void {
  if (weaponId === 'plague_bomb') {
    applyPoison(enemy.statusEffects, damage * 0.5, 6); // v1.2: 3.0s = 6 ticks at 0.5s
    applySlow(enemy.statusEffects, 0.15, 3.0); // v1.2: 15% slow during carry-poison
  }
}

/**
 * v1.2: Check if player has War Axe windup active (for move speed reduction).
 * Returns the move speed multiplier (0.6 during windup, 1.0 otherwise).
 */
export function getWindupSpeedMultiplier(world: GameWorld): number {
  if (world.player.windupSlowTimer !== undefined && world.player.windupSlowTimer > 0) {
    return 0.6; // 60% move speed during windup
  }
  return 1.0;
}

/**
 * v1.2: Get player's block damage reduction.
 * Returns the DR multiplier (e.g. 0.75 for 25% DR, 1.0 for no block).
 */
export function getBlockDR(world: GameWorld): number {
  if (world.player.blockTimer !== undefined && world.player.blockTimer > 0 && world.player.blockDR) {
    return 1.0 - world.player.blockDR;
  }
  return 1.0;
}

/**
 * v1.2: Activate block after a Broad Sword hit.
 * Called by the collision system when a melee_sweep hitbox hits an enemy.
 */
export function activateBlock(world: GameWorld, hitbox: MeleeHitbox): void {
  if (hitbox.blockDR && hitbox.blockDuration) {
    world.player.blockTimer = hitbox.blockDuration;
    world.player.blockDR = hitbox.blockDR;
  }
}
