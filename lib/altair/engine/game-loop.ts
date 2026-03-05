// =============================================================================
// ALTAIR ENGINE -- Game Loop
// =============================================================================
// Sets up the game world, creates the fixed-timestep game loop, and
// orchestrates all systems each frame.
// =============================================================================

import {
  GameWorld,
  EnemyEntity,
  PickupEntity,
} from './types';
import { createCamera, updateCamera } from './camera';
import { createInputState } from './input';
import { TileGenerator } from './tile-generator';
import { updateParticles, spawnDamageNumber, spawnDeathBurst, spawnXPCollect, spawnLevelUp, spawnEvolution } from './particle-system';
import { renderFrame, updatePlayerAnimation, updateEnemyAnimation, updateSummonAnimation, type WebGLRenderer } from './renderer';
import { PlayerStats } from '../stores/game-store';
import { CLASSES } from '../data/classes';
import { initAllSpriteSheets } from './sprites/sprite-defs';
import { initWebGL } from './webgl/webgl-context';
import { SpriteBatch } from './webgl/webgl-sprite-batch';
import { ShapeBatch } from './webgl/webgl-shapes';
import { setGLContext } from './webgl/webgl-textures';

// System imports
import { updatePlayer, computeEffectiveStats, updateClassAbilities, createClassAbilityState, ClassAbilityState, tryRaiseDead, processSanguineFeast, getBerserkerBonuses, getKnightSpeedBonus, reportBloodNovaKill, tryTransferHuntersMark } from './player-system';
import { fireWeapons, updateBoomerangs, activateBlock, getBlockDR, getWhipLifesteal } from './weapon-system';
import { tickStatusEffects, processEnemyStatusDamage, getMarkMultiplier, applySlow, hasEffect } from './status-effects';
import { updatePickups as updatePickupSystem, spawnEnemyDrops, spawnBossDrops, spawnPropDrops, spawnPickup } from './pickup-system';
import { updateWaveDirector as updateWaveDirectorSystem, createWaveDirectorState, spawnEnemyAt } from './wave-director';
import { updateEnemyAI as updateEnemyAISystem, setEnemyPropHash } from './enemy-system';
import { spawnBoss, updateBoss, snapshotBossHp, enforceBossDpsCap, BossState } from './boss-system';
import { CatalystRuntimeState, createCatalystRuntimeStates, updateCatalysts, onCatalystHit, onCatalystKill, onCatalystDamageTaken, onCatalystAttack } from './catalyst-system';
import { SpatialHash } from './spatial-hash';
import { DestructibleProp, PROP_COLLISION_OFFSET_Y } from './tile-generator';

// ---- Callbacks --------------------------------------------------------------

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

// ---- Constants --------------------------------------------------------------

const PLAYER_RADIUS = 12;
const MAX_DELTA = 1 / 15; // cap to ~66ms
const MAX_PARTICLES = 300;
const MAX_PROJECTILES = 500;
const CORPSE_DURATION = 1.5; // seconds to display grayed-out corpse

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
    catalysts: [],
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

/** v1.1: AoE diminishing returns. When hitting >12 enemies, damage is reduced. */
const AOE_DR_THRESHOLD = 12;
function aoeDiminishingFactor(enemiesHit: number): number {
  if (enemiesHit <= AOE_DR_THRESHOLD) return 1;
  return AOE_DR_THRESHOLD / enemiesHit;
}

function handleCollisions(
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
  abilityState: ClassAbilityState,
  callbacks: GameLoopCallbacks,
  tileGen: TileGenerator,
  propHash: SpatialHash,
  damageablePropHash: SpatialHash,
  catalystStates: CatalystRuntimeState[],
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
        if (e.intangible || e.isDead || e.hp <= 0) continue;
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
      if (e.intangible || e.hp <= 0) continue;
      if (proj.hitEnemyIds.has(e.id)) continue;

      const dx = e.x - proj.x;
      const dy = e.y - proj.y;
      const distSq = dx * dx + dy * dy;
      const combinedR = e.radius + proj.radius;

      if (distSq <= combinedR * combinedR) {
        proj.hitEnemyIds.add(e.id);

        // Mark damage multiplier
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
        totalDamageDealt += effectiveDmg;

        // Damage number particle (show crit with special flag)
        spawnDamageNumber(world, e.x, e.y - e.radius, effectiveDmg, false);

        // v1.2: Slow on hit (Temporal Shard)
        if (proj.slowOnHitPct && proj.slowOnHitDuration) {
          applySlow(e.statusEffects, proj.slowOnHitPct, proj.slowOnHitDuration);
        }

        // v1.2: Lifesteal on hit (Crimson Whip)
        if (proj.lifestealPct && proj.lifestealPct > 0) {
          const heal = effectiveDmg * proj.lifestealPct;
          if (heal > 0) {
            pl.hp = Math.min(pl.hp + heal, pl.maxHp);
          }
        }

        // Catalyst on-hit hooks
        onCatalystHit(catalystStates, world, stats, { enemyId: e.id, damage: effectiveDmg, weaponId: proj.weaponId || '', x: e.x, y: e.y });

        // v1.2: Splash on kill (Arcane Bolt) — check if this hit killed the enemy
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
              totalDamageDealt += splashDmg;
            }
          }
        }

        // Pierce
        proj.pierceLeft--;
        if (proj.pierceLeft <= 0) {
          // AoE on impact
          if (proj.aoeRadius && proj.aoeRadius > 0) {
            // v1.1: Two-pass AoE diminishing returns
            const aoeTargets: EnemyEntity[] = [];
            for (const ae of world.enemies) {
              if (ae.id === e.id || ae.intangible || ae.hp <= 0) continue;
              const adx = ae.x - proj.x;
              const ady = ae.y - proj.y;
              if (adx * adx + ady * ady <= proj.aoeRadius * proj.aoeRadius) {
                aoeTargets.push(ae);
              }
            }
            const aoeDrFactor = aoeDiminishingFactor(aoeTargets.length);
            for (const ae of aoeTargets) {
              const aoeDmg = Math.max(1, proj.damage * 0.6 * aoeDrFactor - ae.armor);
              ae.hp -= aoeDmg;
              ae.flashTimer = 0.05;
              totalDamageDealt += aoeDmg;
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
    const nearbyProps = damageablePropHash.query(proj.x, proj.y, proj.radius + 20);
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
              let dmg = proj.poolDamagePerTick || proj.damage;
              // v1.2: Block damage reduction
              dmg = Math.round(dmg * getBlockDR(world));
              pl.hp -= dmg;
              pl.iFrames = 0.2;
              callbacks.onPlayerDamage(dmg, proj.sourceDefId);
              onCatalystDamageTaken(catalystStates, world, stats, { damage: dmg });
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

        // v1.2: Block damage reduction (Broad Sword)
        dmg = Math.round(dmg * getBlockDR(world));

        // Shield absorbs first
        if (pl.shieldHp > 0) {
          const absorbed = Math.min(pl.shieldHp, dmg);
          pl.shieldHp -= absorbed;
          dmg -= absorbed;
        }

        if (dmg > 0) {
          pl.hp -= dmg;
          pl.iFrames = 0.5;
          callbacks.onPlayerDamage(dmg, proj.sourceDefId);
          onCatalystDamageTaken(catalystStates, world, stats, { damage: dmg });
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

        // v1.1: Two-pass AoE diminishing returns for pool ticks
        const poolTargets: EnemyEntity[] = [];
        for (const e of world.enemies) {
          if (e.intangible || e.isDead || e.hp <= 0) continue;
          const dx = e.x - proj.x;
          const dy = e.y - proj.y;
          if (dx * dx + dy * dy <= (poolR + e.radius) * (poolR + e.radius)) {
            poolTargets.push(e);
          }
        }
        const poolDrFactor = aoeDiminishingFactor(poolTargets.length);
        for (const e of poolTargets) {
          const dmg = proj.poolDamagePerTick || proj.damage;
          const effectiveDmg = Math.max(1, dmg * poolDrFactor - e.armor);
          e.hp -= effectiveDmg;
          e.flashTimer = 0.05;
          totalDamageDealt += effectiveDmg;

          // v1.2: Pool slow effect (Toxic Flask)
          if (proj.poolSlowPct && proj.poolSlowPct > 0) {
            applySlow(e.statusEffects, proj.poolSlowPct, proj.poolTickInterval! * 1.5);
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
      if (e.intangible || e.hp <= 0) continue;

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
          callbacks.onPlayerDamage(dmg, e.defId);
          onCatalystDamageTaken(catalystStates, world, stats, { damage: dmg });
        }
        break;
      }
    }
  }

  // -- Melee hitboxes vs Enemies --
  for (let hi = world.meleeHitboxes.length - 1; hi >= 0; hi--) {
    const hb = world.meleeHitboxes[hi];
    hb.lifetime -= delta;

    // Track player position so the hitbox moves with the player
    hb.x = world.player.x;
    hb.y = world.player.y;

    if (hb.lifetime <= 0) {
      world.meleeHitboxes.splice(hi, 1);
      continue;
    }

    // v1.1: Two-pass AoE diminishing returns for melee hitboxes
    // Pass 1: Collect all new enemies in range and within arc
    const meleeTargets: EnemyEntity[] = [];
    for (const e of world.enemies) {
      if (e.intangible || e.hp <= 0) continue;
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
      // Prioritize closest enemies
      finalMeleeTargets = meleeTargets
        .sort((a, b) => {
          const da = (a.x - hb.x) ** 2 + (a.y - hb.y) ** 2;
          const db = (b.x - hb.x) ** 2 + (b.y - hb.y) ** 2;
          return da - db;
        })
        .slice(0, hb.maxTargets);
    }

    // Pass 2: Apply damage with DR factor based on how many new enemies are hit
    const meleeDrFactor = aoeDiminishingFactor(finalMeleeTargets.length);
    let meleeHitAny = false;
    for (const e of finalMeleeTargets) {
      hb.hitEnemyIds.add(e.id);
      const markMul = getMarkMultiplier(e.statusEffects, e.isBoss);
      const effectiveDmg = Math.max(1, hb.damage * markMul * meleeDrFactor - e.armor);
      e.hp -= effectiveDmg;
      e.flashTimer = 0.1;
      totalDamageDealt += effectiveDmg;
      meleeHitAny = true;
      spawnDamageNumber(world, e.x, e.y - e.radius, effectiveDmg, false);

      // v1.2: Whip lifesteal (Crimson Whip / Sanguine Scourge)
      const whipLS = getWhipLifesteal(hb.weaponId);
      if (whipLS > 0) {
        const heal = effectiveDmg * whipLS;
        if (heal > 0) {
          pl.hp = Math.min(pl.hp + heal, pl.maxHp);
        }
      }
    }

    // v1.2: Activate block on melee hit (Broad Sword)
    if (meleeHitAny) {
      activateBlock(world, hb);
    }
  }

  // -- Melee hitboxes vs Props (arc-AABB) --
  for (const hb of world.meleeHitboxes) {
    if (hb.lifetime <= 0) continue;
    const nearbyProps = damageablePropHash.query(hb.x, hb.y, hb.radius + 20);
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

      // v1.1: Two-pass AoE diminishing returns for aura ticks
      const auraTargets: EnemyEntity[] = [];
      for (const e of world.enemies) {
        if (e.intangible || e.hp <= 0) continue;
        const dx = e.x - aura.x;
        const dy = e.y - aura.y;
        if (dx * dx + dy * dy <= (aura.radius + e.radius) * (aura.radius + e.radius)) {
          auraTargets.push(e);
        }
      }
      // v1.2: maxTargets limiting (Garlic)
      let finalAuraTargets = auraTargets;
      if (aura.maxTargets && auraTargets.length > aura.maxTargets) {
        // Prioritize closest enemies
        finalAuraTargets = auraTargets
          .sort((a, b) => {
            const da = (a.x - aura.x) ** 2 + (a.y - aura.y) ** 2;
            const db = (b.x - aura.x) ** 2 + (b.y - aura.y) ** 2;
            return da - db;
          })
          .slice(0, aura.maxTargets);
      }

      const auraDrFactor = aoeDiminishingFactor(finalAuraTargets.length);
      for (const e of finalAuraTargets) {
        // v1.2: Inner radius damage falloff (Garlic: outer ring does 50% damage)
        let falloff = 1;
        if (aura.innerRadius) {
          const eDist = Math.sqrt((e.x - aura.x) ** 2 + (e.y - aura.y) ** 2);
          if (eDist > aura.innerRadius) {
            falloff = 0.5;
          }
        }

        const effectiveDmg = Math.max(1, aura.damagePerTick * auraDrFactor * falloff - e.armor);
        e.hp -= effectiveDmg;
        e.flashTimer = 0.05;
        aura.tickHitEnemyIds.add(e.id);
        totalDamageDealt += effectiveDmg;

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

    // Move toward nearest enemy
    let nearestEnemy: EnemyEntity | null = null;
    let nearestDist = Infinity;
    for (const e of world.enemies) {
      if (e.intangible || e.hp <= 0) continue;
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

  // -- Process newly dead enemies (mark as corpse, spawn drops) --
  for (const e of world.enemies) {
    if (e.hp <= 0 && !e.isDead) {
      // Boss entities are managed by the boss system (step 6b), skip here
      if (e.isBoss) continue;

      e.isDead = true;
      // Enemies with no active effects fade out instantly (quick flash)
      e.corpseTimer = e.statusEffects.length > 0 ? CORPSE_DURATION : 0.15;

      callbacks.onKill(e.defId);
      spawnDeathBurst(world, e.x, e.y, '#888');

      // Spawn pickups
      spawnEnemyDrops(world, e, stats.luck);

      // v1.2: Hunter's Mark transfer on kill (Ranger)
      if (world.classId === 'ranger') {
        tryTransferHuntersMark(world, e);
      }

      // Necromancer raise dead
      if (world.classId === 'necromancer') {
        tryRaiseDead(world, e.x, e.y, stats, 1);
      }

      // Hemomancer blood nova kill healing
      if (world.classId === 'hemomancer') {
        reportBloodNovaKill(abilityState);
      }

      // Catalyst on-kill hooks
      onCatalystKill(catalystStates, world, stats, { enemyId: e.id, x: e.x, y: e.y, wasPoisoned: hasEffect(e.statusEffects, 'poison'), enemyTier: 1 });
    }
  }

  // -- Tick corpse timers and remove expired corpses --
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (e.isDead) {
      e.corpseTimer -= delta;
      if (e.corpseTimer <= 0) {
        world.enemies.splice(i, 1);
      }
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
  pause: () => void;
  resume: () => void;
  stop: () => void;
  destroy: () => void;
  getWorld: () => GameWorld;
} {
  let running = false;
  let paused = false;
  let rafId: number = 0;
  let lastTime: number = 0;
  let accumulator: number = 0;
  const FIXED_DT = 1 / 60; // 60 Hz physics

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

  // Per-run state
  let abilityState = createClassAbilityState();
  let waveState = createWaveDirectorState();
  let bossState: BossState | null = null;
  let catalystStates: CatalystRuntimeState[] = createCatalystRuntimeStates(world.catalysts);
  let effectiveStats: PlayerStats | null = null;
  let lastStatsLevel = 0;
  let lastStatsWeaponCount = 0;
  let lastStatsPassiveCount = 0;
  let lastStatsCatalystCount = 0;
  const propHash = new SpatialHash(100);
  const damageablePropHash = new SpatialHash(100);

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

    // Frame delta in seconds, capped to prevent spiral of death
    let frameDelta = (now - lastTime) / 1000;
    if (frameDelta > MAX_DELTA) frameDelta = MAX_DELTA;
    if (frameDelta <= 0) frameDelta = 1 / 60;
    lastTime = now;

    // Keep overlay resolution aligned with the render canvas.
    if (overlayCanvas.width !== canvas.width || overlayCanvas.height !== canvas.height) {
      overlayCanvas.width = canvas.width;
      overlayCanvas.height = canvas.height;
    }

    // While paused, keep rendering the current frame but skip simulation.
    if (paused) {
      accumulator = 0;
      renderFrame(renderer, world, tileGen);
      return;
    }

    // Recompute stats when inventory changes (once per frame, not per step)
    const needsRecompute =
      !effectiveStats ||
      world.weapons.length !== lastStatsWeaponCount ||
      world.passives.length !== lastStatsPassiveCount;

    // Re-sync catalyst runtime states when catalysts change (e.g. after upgrade screen)
    if (world.catalysts.length !== lastStatsCatalystCount) {
      catalystStates = createCatalystRuntimeStates(world.catalysts);
      lastStatsCatalystCount = world.catalysts.length;
    }

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

    // ---- Fixed-timestep simulation loop ----
    // All physics/game logic runs at a consistent 60 Hz regardless of display
    // frame rate. This ensures identical movement speed at 30, 60, or 144 FPS.
    accumulator += frameDelta;
    while (accumulator >= FIXED_DT) {
      // Berserker stats change with HP (recompute each step since combat changes HP)
      if (world.classId === 'berserker') {
        effectiveStats = recomputeStats();
      }
      const stats = effectiveStats!;
      const scaledDt = FIXED_DT * world.timeScale;

      // Advance game clock
      world.time += scaledDt;

      // --- Systems (in order) ---

      // 1. Weapon disable timer
      if (world.weaponsDisabled) {
        world.weaponsDisabledTimer -= scaledDt;
        if (world.weaponsDisabledTimer <= 0) {
          world.weaponsDisabled = false;
          world.weaponsDisabledTimer = 0;
        }
      }

      // 1b. Build prop spatial hash for collision queries
      propHash.clear();
      damageablePropHash.clear();
      const activeProps = tileGen.getProps();
      for (const prop of activeProps) {
        propHash.insert(prop as unknown as import('./types').Entity);
      }
      const damageableProps = tileGen.getDamageableProps();
      for (const prop of damageableProps) {
        damageablePropHash.insert(prop as unknown as import('./types').Entity);
      }

      // 2. Player movement
      updatePlayer(world, world.classId, stats, scaledDt);

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
      abilityState = updateClassAbilities(world, world.classId, stats, 1, scaledDt, abilityState);

      // 3b. Catalyst per-frame update
      updateCatalysts(world, stats, catalystStates, scaledDt);

      // 4. Weapons
      const prevCooldowns = world.weapons.map(ws => ws.cooldownTimer);
      fireWeapons(world, stats, scaledDt);
      for (let wi = 0; wi < world.weapons.length; wi++) {
        const ws = world.weapons[wi];
        if (prevCooldowns[wi] <= scaledDt && ws.cooldownTimer > prevCooldowns[wi]) {
          onCatalystAttack(catalystStates, world, stats, { weaponId: ws.weaponId });
        }
      }
      updateBoomerangs(world, scaledDt);

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
          bossState = null;
        }
      }

      // 6c. Snapshot boss HP before collisions (for DPS cap enforcement)
      if (bossState) snapshotBossHp(bossState);

      // 7. Collisions + enemy death processing
      const damageDealt = handleCollisions(
        world,
        stats,
        scaledDt,
        abilityState,
        callbacks,
        tileGen,
        propHash,
        damageablePropHash,
        catalystStates,
      );

      // 7b. Enforce boss DPS cap after collisions
      if (bossState) enforceBossDpsCap(bossState, scaledDt);

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

      // 10. Particles
      updateParticles(world.particles, scaledDt);
      if (world.particles.length > MAX_PARTICLES) {
        world.particles.splice(0, world.particles.length - MAX_PARTICLES);
      }

      // 11. Wave director
      const waveEvents = updateWaveDirectorSystem(world, waveState, scaledDt);
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
      if (waveEvents.spawned.length > 0) {
        callbacks.onEnemySpawns(waveEvents.spawned);
      }
      if (waveEvents.victory) {
        callbacks.onVictory();
      }

      // 12. Sprite animations
      updatePlayerAnimation(world, scaledDt);
      for (const enemy of world.enemies) {
        if (enemy.isDead) continue;
        updateEnemyAnimation(enemy, scaledDt);
      }
      for (const summon of world.summons) {
        let svx = 0, svy = 0;
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

      accumulator -= FIXED_DT;
    }

    // ---- Per-frame updates (outside fixed timestep) ----

    // 13. Camera follows at frame rate for smooth visual tracking
    updateCamera(world.camera, world.player, frameDelta);
    tileGen.update(world.camera);

    // 13b. Spawn structure pickups queued by tile generator
    for (const pp of tileGen.drainPendingPickups()) {
      spawnPickup(world, pp.x, pp.y, pp.type as PickupEntity['type'], pp.value);
    }

    // 14. Render
    renderFrame(renderer, world, tileGen);

    // 15. Check death
    if (world.player.hp <= 0) {
      // Death handled externally via the React component
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      lastTime = performance.now();
      accumulator = 0;
      abilityState = createClassAbilityState();
      waveState = createWaveDirectorState();
      catalystStates = createCatalystRuntimeStates(world.catalysts);
      effectiveStats = null;
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      lastTime = performance.now();
      accumulator = 0;
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    destroy() {
      running = false;
      paused = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      // Clean up overlay canvas
      overlayCanvas.parentElement?.removeChild(overlayCanvas);
    },
    getWorld() {
      return world;
    },
  };
}
