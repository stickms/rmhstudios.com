// =============================================================================
// ALTAIR ENGINE -- Game Loop
// =============================================================================
// Sets up the game world, creates the fixed-timestep game loop, and
// orchestrates all systems each frame.
// =============================================================================

import {
  GameWorld,
  EnemyEntity,
  createId,
} from './types';
import { createCamera, updateCamera } from './camera';
import { createInputState } from './input';
import { TileGenerator } from './tile-generator';
import { updateParticles, spawnDamageNumber, spawnDeathBurst, spawnXPCollect, spawnLevelUp, spawnEvolution } from './particle-system';
import { renderFrame, updatePlayerAnimation, updateEnemyAnimation, updateSummonAnimation } from './renderer';
import { PlayerStats } from '../stores/game-store';
import { CLASSES } from '../data/classes';
import { initAllSpriteSheets } from './sprites/sprite-defs';

// System imports
import { updatePlayer, computeEffectiveStats, updateClassAbilities, createClassAbilityState, ClassAbilityState, tryRaiseDead, processSanguineFeast, getBerserkerBonuses, getKnightSpeedBonus, reportBloodNovaKill } from './player-system';
import { fireWeapons, updateBoomerangs } from './weapon-system';
import { tickStatusEffects, processEnemyStatusDamage, getMarkMultiplier } from './status-effects';
import { updatePickups as updatePickupSystem, spawnEnemyDrops, spawnBossDrops, spawnPropDrops } from './pickup-system';
import { updateWaveDirector as updateWaveDirectorSystem, createWaveDirectorState, spawnEnemyAt } from './wave-director';
import { updateEnemyAI as updateEnemyAISystem, setEnemyPropHash } from './enemy-system';
import { spawnBoss, updateBoss, BossState } from './boss-system';
import { SpatialHash } from './spatial-hash';
import { DestructibleProp, PROP_COLLISION_OFFSET_Y } from './tile-generator';

// ---- Callbacks --------------------------------------------------------------

export interface GameLoopCallbacks {
  onPlayerDamage: (amount: number) => void;
  onPlayerHeal: (amount: number) => void;
  onXPGain: (amount: number) => void;
  onCoinGain: (amount: number) => void;
  onKill: () => void;
  onLevelUp: () => void;
  onBossSpawn: (bossId: string) => void;
  onBossKill: (bossId: string) => void;
  onVictory: () => void;
  onWeaponDisable: (duration: number) => void;
}

// ---- Constants --------------------------------------------------------------

const PLAYER_RADIUS = 12;
const MAX_DELTA = 1 / 15; // cap to ~66ms

// ---- AABB-Circle collision helper -------------------------------------------

/**
 * Test circle vs AABB overlap and return push-out vector.
 * Returns null if no overlap. The AABB center is at (prop.x, prop.y + offsetY).
 */
function circleVsPropAABB(
  cx: number, cy: number, cr: number,
  prop: DestructibleProp,
): { pushX: number; pushY: number } | null {
  const boxCx = prop.x;
  const boxCy = prop.y + PROP_COLLISION_OFFSET_Y;

  // Closest point on AABB to circle center
  const closestX = Math.max(boxCx - prop.halfW, Math.min(cx, boxCx + prop.halfW));
  const closestY = Math.max(boxCy - prop.halfH, Math.min(cy, boxCy + prop.halfH));

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= cr * cr) return null;

  // If circle center is inside the AABB, push out along shortest axis
  const dist = Math.sqrt(distSq);
  if (dist < 0.01) {
    // Circle center exactly on closest point (inside box) — push along shortest axis
    const overlapX = prop.halfW + cr - Math.abs(cx - boxCx);
    const overlapY = prop.halfH + cr - Math.abs(cy - boxCy);
    if (overlapX < overlapY) {
      return { pushX: cx >= boxCx ? overlapX : -overlapX, pushY: 0 };
    } else {
      return { pushX: 0, pushY: cy >= boxCy ? overlapY : -overlapY };
    }
  }

  const overlap = cr - dist;
  return { pushX: (dx / dist) * overlap, pushY: (dy / dist) * overlap };
}

// ---- Factory functions ------------------------------------------------------

/**
 * Create the initial game world.
 */
export function createGameWorld(
  canvasWidth: number,
  canvasHeight: number,
  classId: string,
  doubleTime: boolean,
): GameWorld {
  // Initialize all sprite sheets (lazy load, cached globally)
  initAllSpriteSheets();

  const classDef = CLASSES.find((c) => c.id === classId) || CLASSES[0];
  const maxHp = (classDef.baseStats.maxHp as number) || 100;

  const world: GameWorld = {
    classId,
    player: {
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
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    particles: [],
    meleeHitboxes: [],
    auras: [],
    summons: [],
    pools: [],
    camera: createCamera(canvasWidth, canvasHeight),
    inputState: createInputState(),
    weapons: [
      {
        weaponId: classDef.startingWeaponId,
        level: 1,
        evolved: false,
        cooldownTimer: 0,
      },
    ],
    passives: [],
    time: 0,
    timeScale: doubleTime ? 2.0 : 1.0,
    nextId: 100,
    bossActive: false,
    bossWarning: null,
    weaponsDisabled: false,
    weaponsDisabledTimer: 0,
  };

  // Snap camera to player immediately
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;

  return world;
}

/**
 * Create a new tile generator instance.
 */
export function createTileGenerator(): TileGenerator {
  return new TileGenerator();
}

// ---- Collision System (inline) ----------------------------------------------

function handleCollisions(
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
  abilityState: ClassAbilityState,
  callbacks: GameLoopCallbacks,
  tileGen: TileGenerator,
  propHash: SpatialHash,
): number {
  const pl = world.player;
  let totalDamageDealt = 0;

  // -- Move & collide player projectiles vs enemies --
  for (let pi = world.projectiles.length - 1; pi >= 0; pi--) {
    const proj = world.projectiles[pi];
    if (proj.isEnemy || proj.isPool) continue;

    // Move projectile
    proj.x += proj.vx * delta;
    proj.y += proj.vy * delta;

    // Homing
    if (proj.homing) {
      let closest: { dist: number; e: EnemyEntity } | null = null;
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

    // Lifetime
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

        // Mark damage multiplier
        const markMul = getMarkMultiplier(e.statusEffects, e.isBoss);
        const effectiveDmg = Math.max(1, proj.damage * markMul - e.armor);
        e.hp -= effectiveDmg;
        e.flashTimer = 0.1;
        totalDamageDealt += effectiveDmg;

        // Damage number particle
        spawnDamageNumber(world, e.x, e.y - e.radius, effectiveDmg, false);

        // Pierce
        proj.pierceLeft--;
        if (proj.pierceLeft <= 0) {
          // AoE on impact
          if (proj.aoeRadius && proj.aoeRadius > 0) {
            for (const ae of world.enemies) {
              if (ae.id === e.id || ae.intangible) continue;
              const adx = ae.x - proj.x;
              const ady = ae.y - proj.y;
              if (adx * adx + ady * ady <= proj.aoeRadius * proj.aoeRadius) {
                const aoeDmg = Math.max(1, proj.damage * 0.6 - ae.armor);
                ae.hp -= aoeDmg;
                ae.flashTimer = 0.05;
                totalDamageDealt += aoeDmg;
              }
            }
          }
          world.projectiles.splice(pi, 1);
          break;
        }
      }
    }
  }

  // -- Player projectiles vs props (AABB) --
  for (let pi = world.projectiles.length - 1; pi >= 0; pi--) {
    const proj = world.projectiles[pi];
    if (proj.isEnemy || proj.isPool) continue;

    // Query nearby props
    const nearbyProps = propHash.query(proj.x, proj.y, proj.radius + 20);
    for (const propEntity of nearbyProps) {
      // Use negative IDs to avoid collision with enemy hit tracking
      const propHitId = -propEntity.id;
      if (proj.hitEnemyIds.has(propHitId)) continue;

      const prop = propEntity as unknown as DestructibleProp;
      const hit = circleVsPropAABB(proj.x, proj.y, proj.radius, prop);

      if (hit) {
        proj.hitEnemyIds.add(propHitId);

        // Damage the prop (1 damage per hit)
        const destroyed = tileGen.damageProp(prop.id, 1);
        if (destroyed) {
          spawnPropDrops(world, prop.x, prop.y);
        }

        // Consume pierce
        proj.pierceLeft--;
        if (proj.pierceLeft <= 0) {
          world.projectiles.splice(pi, 1);
          break;
        }
      }
    }
  }

  // -- Enemy projectiles vs player --
  for (let pi = world.projectiles.length - 1; pi >= 0; pi--) {
    const proj = world.projectiles[pi];
    if (!proj.isEnemy) continue;
    if (proj.isPool) {
      // Pool tick logic
      if (proj.poolTimer !== undefined && proj.poolTickInterval !== undefined) {
        proj.poolTimer -= delta;
        if (proj.poolTimer <= 0) {
          proj.poolTimer += proj.poolTickInterval;
          // Damage player if standing in enemy pool
          const pdx = pl.x - proj.x;
          const pdy = pl.y - proj.y;
          const poolR = proj.poolRadius || proj.radius;
          if (pdx * pdx + pdy * pdy <= (poolR + pl.radius) * (poolR + pl.radius)) {
            if (pl.iFrames <= 0) {
              const dmg = proj.poolDamagePerTick || proj.damage;
              pl.hp -= dmg;
              pl.iFrames = 0.2;
              callbacks.onPlayerDamage(dmg);
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

    // Hit player?
    if (pl.iFrames <= 0) {
      const dx = pl.x - proj.x;
      const dy = pl.y - proj.y;
      const distSq = dx * dx + dy * dy;
      const combinedR = pl.radius + proj.radius;

      if (distSq <= combinedR * combinedR) {
        let dmg = proj.damage;

        // Shield absorbs first
        if (pl.shieldHp > 0) {
          const absorbed = Math.min(pl.shieldHp, dmg);
          pl.shieldHp -= absorbed;
          dmg -= absorbed;
        }

        if (dmg > 0) {
          pl.hp -= dmg;
          pl.iFrames = 0.5;
          callbacks.onPlayerDamage(dmg);
        }

        world.projectiles.splice(pi, 1);
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
            totalDamageDealt += effectiveDmg;
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

  // -- Enemy body vs Player --
  if (pl.iFrames <= 0) {
    for (const e of world.enemies) {
      if (e.intangible) continue;

      const dx = pl.x - e.x;
      const dy = pl.y - e.y;
      const distSq = dx * dx + dy * dy;
      const combinedR = pl.radius + e.radius;

      if (distSq <= combinedR * combinedR) {
        let dmg = e.damage;

        if (pl.shieldHp > 0) {
          const absorbed = Math.min(pl.shieldHp, dmg);
          pl.shieldHp -= absorbed;
          dmg -= absorbed;
        }

        if (dmg > 0) {
          pl.hp -= dmg;
          pl.iFrames = 0.8;
          callbacks.onPlayerDamage(dmg);
        }
        break;
      }
    }
  }

  // -- Melee hitboxes vs Enemies --
  for (let hi = world.meleeHitboxes.length - 1; hi >= 0; hi--) {
    const hb = world.meleeHitboxes[hi];
    hb.lifetime -= delta;

    if (hb.lifetime <= 0) {
      world.meleeHitboxes.splice(hi, 1);
      continue;
    }

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
          hb.hitEnemyIds.add(e.id);
          const markMul = getMarkMultiplier(e.statusEffects, e.isBoss);
          const effectiveDmg = Math.max(1, hb.damage * markMul - e.armor);
          e.hp -= effectiveDmg;
          e.flashTimer = 0.1;
          totalDamageDealt += effectiveDmg;
          spawnDamageNumber(world, e.x, e.y - e.radius, effectiveDmg, false);
        }
      }
    }
  }

  // -- Melee hitboxes vs Props (arc-AABB) --
  for (const hb of world.meleeHitboxes) {
    if (hb.lifetime <= 0) continue;
    const nearbyProps = propHash.query(hb.x, hb.y, hb.radius + 20);
    for (const propEntity of nearbyProps) {
      const propHitId = -propEntity.id;
      if (hb.hitEnemyIds.has(propHitId)) continue;

      const prop = propEntity as unknown as DestructibleProp;
      const pdx = prop.x - hb.x;
      const pdy = (prop.y + PROP_COLLISION_OFFSET_Y) - hb.y;
      const dist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (dist <= hb.radius + prop.radius) {
        const angle = Math.atan2(pdy, pdx);
        let angleDiff = angle - hb.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) <= hb.arc / 2) {
          hb.hitEnemyIds.add(propHitId);
          const destroyed = tileGen.damageProp(prop.id, 1);
          if (destroyed) {
            spawnPropDrops(world, prop.x, prop.y);
          }
        }
      }
    }
  }

  // -- Aura damage ticks --
  for (const aura of world.auras) {
    aura.x = pl.x;
    aura.y = pl.y;
    aura.timer -= delta;
    if (aura.timer <= 0) {
      aura.timer += aura.tickInterval;
      aura.tickHitEnemyIds.clear();

      for (const e of world.enemies) {
        if (e.intangible) continue;
        const dx = e.x - aura.x;
        const dy = e.y - aura.y;
        if (dx * dx + dy * dy <= (aura.radius + e.radius) * (aura.radius + e.radius)) {
          const effectiveDmg = Math.max(1, aura.damagePerTick - e.armor);
          e.hp -= effectiveDmg;
          e.flashTimer = 0.05;
          aura.tickHitEnemyIds.add(e.id);
          totalDamageDealt += effectiveDmg;
        }
      }
    }
  }

  // -- Summon attacks --
  for (const s of world.summons) {
    s.lifetime -= delta;
    s.attackTimer -= delta;

    // Move toward nearest enemy
    let nearestEnemy: EnemyEntity | null = null;
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
        // Attack
        const effectiveDmg = Math.max(1, s.damage - nearestEnemy.armor);
        nearestEnemy.hp -= effectiveDmg;
        nearestEnemy.flashTimer = 0.1;
        totalDamageDealt += effectiveDmg;
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
      // Boss entities are managed by the boss system (step 6b), skip here
      if (e.isBoss) continue;

      callbacks.onKill();
      spawnDeathBurst(world, e.x, e.y, '#888');

      // Spawn pickups
      spawnEnemyDrops(world, e, stats.luck);

      // Necromancer raise dead
      if (world.classId === 'necromancer') {
        tryRaiseDead(world, e.x, e.y, stats, 1);
      }

      // Hemomancer blood nova kill healing
      if (world.classId === 'hemomancer') {
        reportBloodNovaKill(abilityState);
      }

      world.enemies.splice(i, 1);
    }
  }

  return totalDamageDealt;
}

// ---- Game Loop --------------------------------------------------------------

/**
 * Create and return the main game loop controller.
 */
export function createGameLoop(
  canvas: HTMLCanvasElement,
  world: GameWorld,
  tileGen: TileGenerator,
  callbacks: GameLoopCallbacks,
): {
  start: () => void;
  stop: () => void;
  getWorld: () => GameWorld;
} {
  let running = false;
  let rafId: number = 0;
  let lastTime: number = 0;

  const ctx = canvas.getContext('2d')!;

  // Per-run state
  let abilityState = createClassAbilityState();
  let waveState = createWaveDirectorState();
  let bossState: BossState | null = null;
  let effectiveStats: PlayerStats | null = null;
  let lastStatsLevel = 0;
  let lastStatsWeaponCount = 0;
  let lastStatsPassiveCount = 0;
  const propHash = new SpatialHash(100);

  function recomputeStats(): PlayerStats {
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
      stats.moveSpeed *= getKnightSpeedBonus(abilityState);
    }

    return stats;
  }

  function tick(now: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    // Delta in seconds, capped
    let delta = (now - lastTime) / 1000;
    if (delta > MAX_DELTA) delta = MAX_DELTA;
    if (delta <= 0) delta = 1 / 60;
    lastTime = now;

    // Apply time scale
    const scaledDelta = delta * world.timeScale;

    // Advance game clock
    world.time += scaledDelta;

    // Recompute stats when inventory changes or periodically
    const needsRecompute =
      !effectiveStats ||
      world.weapons.length !== lastStatsWeaponCount ||
      world.passives.length !== lastStatsPassiveCount;

    if (needsRecompute) {
      effectiveStats = recomputeStats();
      lastStatsWeaponCount = world.weapons.length;
      lastStatsPassiveCount = world.passives.length;

      // Update player max HP from stats
      const oldMaxHp = world.player.maxHp;
      world.player.maxHp = effectiveStats.maxHp;
      if (effectiveStats.maxHp > oldMaxHp) {
        world.player.hp += effectiveStats.maxHp - oldMaxHp;
      }
    }

    // Berserker stats change with HP
    if (world.classId === 'berserker') {
      effectiveStats = recomputeStats();
    }

    const stats = effectiveStats!;

    // --- Systems (in order) ---

    // 1. Weapon disable timer
    if (world.weaponsDisabled) {
      world.weaponsDisabledTimer -= scaledDelta;
      if (world.weaponsDisabledTimer <= 0) {
        world.weaponsDisabled = false;
        world.weaponsDisabledTimer = 0;
      }
    }

    // 1b. Build prop spatial hash for collision queries
    propHash.clear();
    const activeProps = tileGen.getProps();
    for (const prop of activeProps) {
      // Props satisfy Entity interface (id, x, y, radius)
      propHash.insert(prop as unknown as import('./types').Entity);
    }

    // 2. Player movement
    updatePlayer(world, world.classId, stats, scaledDelta);

    // 2b. Player vs prop collision (push-out using AABB)
    {
      const nearbyProps = propHash.query(world.player.x, world.player.y, world.player.radius + 20);
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
    abilityState = updateClassAbilities(world, world.classId, stats, 1, scaledDelta, abilityState);

    // 4. Weapons
    fireWeapons(world, stats, scaledDelta);
    updateBoomerangs(world, scaledDelta);

    // 5. Enemy AI (with obstacle avoidance)
    setEnemyPropHash(propHash);
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

    // 5b. Enemy vs prop collision (push-back using AABB, skip intangible)
    for (const enemy of world.enemies) {
      if (enemy.intangible) continue;
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
      world.bossWarning.timer -= scaledDelta;
      if (world.bossWarning.timer <= 0) {
        world.bossWarning = null;
      }
    }

    // 6b. Boss update
    if (bossState) {
      // Track boss position for animation direction
      const bossPrevX = bossState.entity.x;
      const bossPrevY = bossState.entity.y;
      const bossEvents = updateBoss(world, bossState, scaledDelta);

      // Boss projectiles
      if (bossEvents.bossProjectiles.length > 0) {
        world.projectiles.push(...bossEvents.bossProjectiles);
      }

      // Boss spawns minions
      for (const spawn of bossEvents.bossSpawnEnemies) {
        spawnEnemyAt(world, spawn.defId, spawn.x, spawn.y, spawn.hpMul);
      }

      // Screen shake
      if (bossEvents.screenShake) {
        world.camera.shakeIntensity = bossEvents.screenShake;
        world.camera.shakeDuration = 0.3;
      }

      // Boss disables weapons
      if (bossEvents.weaponsDisabled) {
        world.weaponsDisabled = true;
        world.weaponsDisabledTimer = bossEvents.weaponsDisabled;
        callbacks.onWeaponDisable(bossEvents.weaponsDisabled);
      }

      // Player pull (Terminus consume)
      if (bossEvents.playerPull) {
        world.player.x += bossEvents.playerPull.forceX * scaledDelta;
        world.player.y += bossEvents.playerPull.forceY * scaledDelta;
      }

      // Phase change
      if (bossEvents.bossPhaseChanged) {
        bossState.entity.bossPhase = bossEvents.bossPhaseChanged.phase;
      }

      // Compute boss movement velocity for animation
      if (scaledDelta > 0) {
        const bossVx = (bossState.entity.x - bossPrevX) / scaledDelta;
        const bossVy = (bossState.entity.y - bossPrevY) / scaledDelta;
        if (Math.abs(bossVx) > 0.1 || Math.abs(bossVy) > 0.1) {
          bossState.entity.lastMoveVx = bossVx;
          bossState.entity.lastMoveVy = bossVy;
        }
      }

      // Boss defeated
      if (bossEvents.bossDefeated) {
        callbacks.onKill();
        callbacks.onBossKill(bossEvents.bossDefeated);
        world.bossActive = false;
        spawnBossDrops(world, bossState.entity.x, bossState.entity.y, 15, 30);
        // Remove the boss entity from enemies
        const bossIdx = world.enemies.indexOf(bossState.entity);
        if (bossIdx >= 0) {
          spawnDeathBurst(world, bossState.entity.x, bossState.entity.y, '#ff4444');
          world.enemies.splice(bossIdx, 1);
        }
        bossState = null;
      }
    }

    // 7. Collisions + enemy death processing
    const damageDealt = handleCollisions(world, stats, scaledDelta, abilityState, callbacks, tileGen, propHash);

    // 8. Hemomancer lifesteal
    if (world.classId === 'hemomancer' && damageDealt > 0) {
      processSanguineFeast(abilityState, damageDealt, world.player.hp, world.player.maxHp);
    }
    // Apply accumulated lifesteal (capped at 8 HP/s)
    if (abilityState.lifestealAccum && abilityState.lifestealAccum > 0) {
      const maxHealPerFrame = 8 * scaledDelta;
      const heal = Math.min(abilityState.lifestealAccum, maxHealPerFrame);
      world.player.hp = Math.min(world.player.maxHp, world.player.hp + heal);
      abilityState.lifestealAccum -= heal;
    }
    // Apply blood nova kill healing
    if (abilityState.bloodNovaKillHealAccum && abilityState.bloodNovaKillHealAccum > 0) {
      world.player.hp = Math.min(world.player.maxHp, world.player.hp + abilityState.bloodNovaKillHealAccum);
      abilityState.bloodNovaKillHealAccum = 0;
    }

    // 9. Pickups
    const pickupEvents = updatePickupSystem(world, stats, scaledDelta);
    if (pickupEvents.xpGained > 0) callbacks.onXPGain(pickupEvents.xpGained);
    if (pickupEvents.coinsGained > 0) callbacks.onCoinGain(pickupEvents.coinsGained);
    if (pickupEvents.healed > 0) callbacks.onPlayerHeal(pickupEvents.healed);

    // 9b. Urn collection (urns are walkover pickups, not collidable obstacles)
    {
      const urns = tileGen.getUrns();
      const plR = world.player.radius;
      for (const urn of urns) {
        const dx = world.player.x - urn.x;
        const dy = world.player.y - (urn.y + PROP_COLLISION_OFFSET_Y);
        const distSq = dx * dx + dy * dy;
        const collectR = plR + 12; // generous pickup radius
        if (distSq <= collectR * collectR) {
          urn.destroyed = true;
          // Grant XP + chance of health
          spawnPropDrops(world, urn.x, urn.y);
          // 25% chance to also spawn food
          if (Math.random() < 0.25) {
            world.pickups.push({
              id: createId(world),
              x: urn.x + (Math.random() - 0.5) * 10,
              y: urn.y + (Math.random() - 0.5) * 10,
              radius: 7,
              type: 'food',
              value: 0,
              magnetized: true, // auto-collect since player is right there
            });
          }
        }
      }
    }

    // 10. Particles
    updateParticles(world.particles, scaledDelta);

    // 11. Wave director
    const waveEvents = updateWaveDirectorSystem(world, waveState, scaledDelta);
    if (waveEvents.bossSpawn) {
      callbacks.onBossSpawn(waveEvents.bossSpawn);
      world.bossActive = true;
      world.bossWarning = { bossId: waveEvents.bossSpawn, timer: 3 };

      // Actually spawn the boss entity
      const newBossState = spawnBoss(world, waveEvents.bossSpawn);
      if (newBossState) {
        bossState = newBossState;
        world.enemies.push(newBossState.entity);
      }
    }
    if (waveEvents.victory) {
      callbacks.onVictory();
    }

    // 12. Sprite animations
    updatePlayerAnimation(world, scaledDelta);
    for (const enemy of world.enemies) {
      updateEnemyAnimation(enemy, scaledDelta);
    }
    for (const summon of world.summons) {
      // Find nearest enemy direction for summon facing
      let svx = 0, svy = 0;
      let nearestDist = Infinity;
      for (const e of world.enemies) {
        const dx = e.x - summon.x;
        const dy = e.y - summon.y;
        const d = dx * dx + dy * dy;
        if (d < nearestDist) {
          nearestDist = d;
          svx = dx;
          svy = dy;
        }
      }
      updateSummonAnimation(summon, svx, svy, scaledDelta);
    }

    // 13. Camera
    updateCamera(world.camera, world.player, delta);
    tileGen.update(world.camera);

    // 14. Render
    renderFrame(ctx, world, tileGen);

    // 15. Check death
    if (world.player.hp <= 0) {
      // Death handled externally via the React component
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      abilityState = createClassAbilityState();
      waveState = createWaveDirectorState();
      effectiveStats = null;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    getWorld() {
      return world;
    },
  };
}
