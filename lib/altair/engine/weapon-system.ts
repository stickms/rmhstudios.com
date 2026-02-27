// =============================================================================
// ALTAIR ENGINE -- Weapon Behavior System
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
import { applyFreeze, applyPoison, applyStun } from './status-effects';

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

/** Calculate level-scaled damage. */
function levelDamage(baseDamage: number, level: number, might: number): number {
  return baseDamage * Math.pow(1.15, level - 1) * might;
}

/** Calculate effective cooldown. */
function effectiveCooldown(baseCooldown: number, stats: PlayerStats): number {
  return baseCooldown * stats.cdr / stats.attackSpeed;
}

/** Calculate bonus projectile/effect count from leveling (levels 2, 4, 6 each give +1). */
function levelBonusCount(level: number): number {
  let bonus = 0;
  if (level >= 2) bonus++;
  if (level >= 4) bonus++;
  if (level >= 6) bonus++;
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

function fireMeleeSweep(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const baseRadius = 80;
  const radius = baseRadius * stats.area;
  const angle = facingAngle(world);
  const arc = ws.evolved ? Math.PI : (2 * Math.PI) / 3; // 180° evolved, 120° base

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
        damage * 0.6,
        999, // infinite pierce
        1.5,
        def.color,
        ws.weaponId,
      );
      proj.aoeRadius = 60 * stats.area;
      world.projectiles.push(proj);
    }
  }
}

// ---- 2. Arcane Bolt / Arcane Barrage (homing) -------------------------------

function fireHoming(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 250 * stats.projSpeed;
  const lifetime = 3 * stats.duration;
  const boltCount = ws.evolved
    ? 3 + stats.projCount
    : 1 + stats.projCount + levelBonusCount(ws.level);

  for (let i = 0; i < boltCount; i++) {
    const target = findNearestEnemy(world.enemies, world.player.x, world.player.y);
    let vx: number, vy: number;
    if (target) {
      const dir = normalize(target.x - world.player.x, target.y - world.player.y);
      vx = dir.x * speed;
      vy = dir.y * speed;
    } else {
      // Random direction if no enemies
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
    proj.homingStrength = 3.0;

    // Evolved: AoE on impact
    if (ws.evolved) {
      proj.aoeRadius = 80 * stats.area;
    }

    world.projectiles.push(proj);
  }
}

// ---- 3. Iron Shortbow / Storm Bow (directional) ----------------------------

function fireDirectional(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 400 * stats.projSpeed;
  const baseAngle = facingAngle(world);
  const spreadAngle = (15 * Math.PI) / 180; // 15 degrees in radians

  let arrowCount = 1 + levelBonusCount(ws.level) + stats.projCount;
  const pierce = ws.evolved ? 999 : 1; // Storm Bow: infinite pierce

  // Evolved Storm Bow: double arrow count
  if (ws.evolved) {
    arrowCount *= 2;
  }

  for (let i = 0; i < arrowCount; i++) {
    // Spread arrows evenly around the base angle
    let angle: number;
    if (arrowCount === 1) {
      angle = baseAngle;
    } else {
      const offset = (i - (arrowCount - 1) / 2) * spreadAngle;
      angle = baseAngle + offset;
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
      pierce,
      2.0,
      def.color,
      ws.weaponId,
    );
    proj.radius = 5;
    world.projectiles.push(proj);
  }
}

// ---- 4. Toxic Flask / Plague Bomb (lobbed_aoe) -----------------------------

function fireLobbed(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const basePoolRadius = 60;
  const poolRadius = basePoolRadius * stats.area * (ws.evolved ? 2 : 1);
  const baseDuration = 2;
  const duration = baseDuration * stats.duration + levelBonusCount(ws.level) * 0.5;

  // Target: random enemy within 300px, or random offset if none
  let targetX: number, targetY: number;
  const target = findRandomEnemyInRange(
    world.enemies,
    world.player.x,
    world.player.y,
    300,
  );
  if (target) {
    targetX = target.x;
    targetY = target.y;
  } else {
    const a = Math.random() * Math.PI * 2;
    const r = 100 + Math.random() * 200;
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
  };
  world.projectiles.push(proj);
}

// ---- 5. War Axe / Cataclysm Axe (circular_cleave) -------------------------

function fireCircularCleave(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  let damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const baseRadius = 100;
  const radius = baseRadius * stats.area;

  // Evolved Cataclysm Axe: +80% damage
  if (ws.evolved) {
    damage *= 1.8;
  }

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
  };
  world.meleeHitboxes.push(hitbox);

  // Evolved: pull enemies inward 50px
  if (ws.evolved) {
    for (const enemy of world.enemies) {
      const d = dist(world.player.x, world.player.y, enemy.x, enemy.y);
      if (d <= radius && d > 0) {
        const pullDist = Math.min(50, d);
        const dir = normalize(
          world.player.x - enemy.x,
          world.player.y - enemy.y,
        );
        enemy.x += dir.x * pullDist;
        enemy.y += dir.y * pullDist;
      }
    }
  }
}

// ---- 6. Soul Siphon / Death Ray (beam) -------------------------------------

function updateBeam(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
  delta: number,
): void {
  const dps = levelDamage(def.baseDamage, ws.level, stats.might);
  const damageThisFrame = dps * delta;
  const baseRange = ws.evolved ? 250 : 100;
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

  // Evolved Death Ray: chain to 3 additional enemies, 15% lifesteal
  if (ws.evolved) {
    const chainTargets = findNearestEnemies(
      world.enemies,
      target.x,
      target.y,
      3,
      range,
      new Set([target.id]),
    );

    let totalDamageDealt = damageThisFrame;

    for (const chain of chainTargets) {
      chain.hp -= damageThisFrame * 0.6; // Chain damage is 60% of primary
      chain.flashTimer = Math.max(chain.flashTimer, 0.05);
      totalDamageDealt += damageThisFrame * 0.6;
    }

    // 15% lifesteal
    const healAmount = totalDamageDealt * 0.15;
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + healAmount);
  }
}

// ---- 7. Temporal Shard / Eternity Loop (boomerang) -------------------------

function fireBoomerang(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 200 * stats.projSpeed;
  const count = ws.evolved
    ? 3 + stats.projCount
    : 1 + stats.projCount + levelBonusCount(ws.level);

  for (let i = 0; i < count; i++) {
    // Spread shards evenly if multiple
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
    world.projectiles.push(proj);
  }
}

// ---- 8. Crimson Whip / Sanguine Scourge (lash) ----------------------------

function fireLash(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const baseRange = 150;
  const range = baseRange * stats.area;
  const arc = Math.PI / 3; // 60°

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
      // Evolved Divine Deluge: extra pools at random enemy cluster positions
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
      // Base: at player feet
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

function fireMultiProjectile(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const speed = 350 * stats.projSpeed;
  const spreadAngle = (30 * Math.PI) / 180; // ±30°

  let daggerCount = 2 + levelBonusCount(ws.level) + stats.projCount;
  const baseAngle = facingAngle(world);

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
        1,
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
        1,
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

    // Deal damage to primary target
    target.hp -= damage;
    target.flashTimer = Math.max(target.flashTimer, 0.1);
    hitTargets.add(target.id);

    // Spawn a visual particle for the lightning bolt
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

    // Evolved Thunderstorm: chain to 2 nearby enemies, 0.5s stun
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

        // Chain lightning visual
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

function updateAura(
  world: GameWorld,
  ws: WeaponState,
  def: WeaponDef | EvolvedWeaponDef,
  stats: PlayerStats,
): void {
  const damage = levelDamage(def.baseDamage, ws.level, stats.might);
  const baseRadius = ws.evolved ? 200 : 80;
  const radius = baseRadius * stats.area;
  const tickInterval = 0.5;

  // Find existing aura for this weapon, or create one
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
    };
    world.auras.push(aura);
  }

  // Update aura position and stats every frame
  aura.x = world.player.x;
  aura.y = world.player.y;
  aura.radius = radius;
  aura.damagePerTick = damage;

  // Evolved Soul Eater: -20% enemy damage in range
  if (ws.evolved) {
    for (const enemy of world.enemies) {
      const d = dist(aura.x, aura.y, enemy.x, enemy.y);
      if (d <= radius) {
        // Damage reduction is handled as a debuff on the enemy
        // We mark this via a weak "empower" effect with negative magnitude
        // but simpler: just reduce damage directly (applied per-frame is fine
        // since the collision system reads enemy.damage each frame)
        // The actual -20% is applied by the collision/damage system reading aura state.
        // For now, we track it on the aura effect — the damage system checks auras.
      }
    }
  }
}

// ---- 13. Runic Orbs / Celestial Guard (orbital) ----------------------------

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

  // Initialize orbit angle if needed
  if (ws.orbitAngle === undefined) {
    ws.orbitAngle = 0;
  }

  // Update orbit angle
  const baseOrbitSpeed = 2.0; // radians per second
  const orbitSpeed = ws.evolved ? baseOrbitSpeed * 2 : baseOrbitSpeed;
  ws.orbitAngle += orbitSpeed * delta;
  // Keep angle in [0, 2*PI)
  if (ws.orbitAngle >= Math.PI * 2) {
    ws.orbitAngle -= Math.PI * 2;
  }

  // Find existing orbital projectiles for this weapon
  const existingOrbs = world.projectiles.filter(
    (p) => p.weaponId === ws.weaponId && !p.isEnemy && !p.isPool,
  );

  // If we have the right count, update positions
  if (existingOrbs.length === orbCount) {
    for (let i = 0; i < orbCount; i++) {
      const angle = ws.orbitAngle + (Math.PI * 2 * i) / orbCount;
      existingOrbs[i].x = world.player.x + Math.cos(angle) * orbitRadius;
      existingOrbs[i].y = world.player.y + Math.sin(angle) * orbitRadius;
      existingOrbs[i].damage = damage;
      existingOrbs[i].lifetime = 999; // Keep alive
      // Reset hit tracking periodically so orbs can hit the same enemy again
      existingOrbs[i].hitEnemyIds.clear();
    }
  } else {
    // Remove old orbs and create new set
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
        999, // Infinite pierce — orbs persist
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
    // Random direction
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

    // Evolved Inferno Staff: explodes into 6 embers on impact, each leaves fire pool
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
  const baseDamage = 30; // Inferno Staff base
  const damage = levelDamage(baseDamage, level, stats.might) * 0.3;
  const emberCount = 6;

  for (let i = 0; i < emberCount; i++) {
    const angle = (Math.PI * 2 * i) / emberCount;
    const speed = 120 * stats.projSpeed;

    // Create a small fire pool for each ember
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
 */
export function fireWeapons(
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
): void {
  // If weapons are disabled (e.g., Banshee wail), skip all firing
  if (world.weaponsDisabled) return;

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

    // Decrement cooldown
    ws.cooldownTimer -= delta;

    if (ws.cooldownTimer > 0) continue;

    // Reset cooldown
    const cd = effectiveCooldown(def.baseCooldown, stats);
    ws.cooldownTimer = cd;

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
      case 'circular_cleave':
        fireCircularCleave(world, ws, def, stats);
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
 * When a boomerang travels 200px from origin, reverse its velocity to return
 * to the player. Once it reaches the player (within 20px), despawn it.
 */
export function updateBoomerangs(world: GameWorld, delta: number): void {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    if (p.originX === undefined || p.originY === undefined) continue;
    if (p.isEnemy) continue;

    const distFromOrigin = dist(p.x, p.y, p.originX, p.originY);

    if (!p.returning && distFromOrigin >= 200) {
      // Start returning
      p.returning = true;
    }

    if (p.returning) {
      // Redirect velocity toward player
      const dirToPlayer = normalize(
        world.player.x - p.x,
        world.player.y - p.y,
      );
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      p.vx = dirToPlayer.x * speed;
      p.vy = dirToPlayer.y * speed;

      // Despawn when close to player
      const distToPlayer = dist(p.x, p.y, world.player.x, world.player.y);
      if (distToPlayer < 20) {
        world.projectiles.splice(i, 1);
      }
    }

    // Evolved Eternity Loop: apply freeze on hit
    // (This is handled by the collision system checking weaponId)
  }
}

/**
 * Apply Eternity Loop freeze effect on projectile hit.
 * Called by the collision system when a boomerang projectile hits an enemy.
 */
export function applyEternityLoopFreeze(
  enemy: EnemyEntity,
  weaponId: string,
): void {
  if (weaponId === 'eternity_loop') {
    applyFreeze(enemy.statusEffects, 0.5);
  }
}

/**
 * Apply Plague Bomb poison on pool exit.
 * Called by the collision system when an enemy leaves a plague_bomb pool.
 */
export function applyPlagueBombPoison(
  enemy: EnemyEntity,
  weaponId: string,
  damage: number,
): void {
  if (weaponId === 'plague_bomb') {
    applyPoison(enemy.statusEffects, damage * 0.5, 4);
  }
}
