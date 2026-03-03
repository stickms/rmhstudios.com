// =============================================================================
// ALTAIR ENGINE -- Enemy AI State Machine System
// =============================================================================
// Drives per-frame AI for all 16 enemy types. Each enemy's `defId` maps to a
// behavior function that manages movement, ability cooldowns, and projectile
// spawning through a simple string-based state machine (`enemy.aiState`).
// =============================================================================

import {
  EnemyEntity,
  ProjectileEntity,
  GameWorld,
  MultiplayerGameWorld,
  createId,
} from './types';
import { ENEMIES } from '../data/enemies';
import {
  tickStatusEffects,
  processEnemyStatusDamage,
  isImmobilized,
  getSlowFactor,
  getEmpowerBonuses,
  applyCurse,
  applyEmpower,
} from './status-effects';
import { distToNearestPlayer, moveTowardNearestPlayer, maintainRangeFromNearestPlayer } from './multiplayer/player-helpers';
import { SpatialHash } from './spatial-hash';
import { avoidObstacles } from './obstacle-avoidance';

// -----------------------------------------------------------------------------
// Events returned each frame for the game loop to process
// -----------------------------------------------------------------------------

export interface EnemySystemEvents {
  enemyProjectiles: ProjectileEntity[];
  weaponsDisabled?: { duration: number };
  splitSpawns: EnemyEntity[];
}

// -----------------------------------------------------------------------------
// Lookup table: defId -> EnemyDef (built once)
// -----------------------------------------------------------------------------

const ENEMY_DEF_MAP = new Map(ENEMIES.map((def) => [def.id, def]));

// Module-level reference to the prop spatial hash for obstacle avoidance.
// Set each frame by the game loop before enemy AI runs.
let _propHash: SpatialHash | null = null;

/** Called by the game loop each frame to provide the current prop spatial hash. */
export function setEnemyPropHash(hash: SpatialHash | null): void {
  _propHash = hash;
}

// -----------------------------------------------------------------------------
// Main update entry point
// -----------------------------------------------------------------------------

export function updateEnemyAI(world: GameWorld, delta: number): EnemySystemEvents {
  const events: EnemySystemEvents = {
    enemyProjectiles: [],
    splitSpawns: [],
  };

  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const enemy = world.enemies[i];

    // --- Flash timer ---
    if (enemy.flashTimer > 0) {
      enemy.flashTimer -= delta;
      if (enemy.flashTimer < 0) enemy.flashTimer = 0;
    }

    // --- Tick status effects (durations, removal) ---
    tickStatusEffects(enemy.statusEffects, delta);

    // --- Poison / status damage ---
    processEnemyStatusDamage(enemy, delta);

    // --- Skip AI if dead (hp processed by caller, but guard here) ---
    if (enemy.hp <= 0) continue;

    // --- If stunned/frozen, skip movement and abilities ---
    if (isImmobilized(enemy.statusEffects)) continue;

    // --- Dispatch to the correct behavior ---
    const defId = enemy.defId;
    const projCountBefore = events.enemyProjectiles.length;
    switch (defId) {
      case 'shambler':
        updateShambler(enemy, world, delta, events);
        break;
      case 'bat':
        updateBat(enemy, world, delta, events);
        break;
      case 'skeleton_warrior':
        updateSkeletonWarrior(enemy, world, delta, events);
        break;
      case 'ghost':
        updateGhost(enemy, world, delta, events);
        break;
      case 'werewolf':
        updateWerewolf(enemy, world, delta, events);
        break;
      case 'cultist':
        updateCultist(enemy, world, delta, events);
        break;
      case 'swarm_rat':
        updateSwarmRat(enemy, world, delta, events);
        break;
      case 'witch':
        updateWitch(enemy, world, delta, events);
        break;
      case 'bone_golem':
        updateBoneGolem(enemy, world, delta, events);
        break;
      case 'shadow':
        updateShadow(enemy, world, delta, events);
        break;
      case 'vampire_noble':
        updateVampireNoble(enemy, world, delta, events);
        break;
      case 'arcane_construct':
        updateArcaneConstruct(enemy, world, delta, events);
        break;
      case 'plague_bearer':
        updatePlagueBearer(enemy, world, delta, events);
        break;
      case 'death_knight':
        updateDeathKnight(enemy, world, delta, events);
        break;
      case 'banshee':
        updateBanshee(enemy, world, delta, events);
        break;
      case 'lich':
        updateLich(enemy, world, delta, events);
        break;
      default:
        // Fallback: simple chase
        updateShambler(enemy, world, delta, events);
        break;
    }

    // Tag any projectiles spawned by this enemy with its defId for bestiary tracking
    for (let pi = projCountBefore; pi < events.enemyProjectiles.length; pi++) {
      events.enemyProjectiles[pi].sourceDefId = defId;
    }
  }

  return events;
}

// =============================================================================
// Shared Helpers
// =============================================================================

/** Effective movement speed after slow, empower, and any speed mod. */
function getEffectiveSpeed(enemy: EnemyEntity): number {
  const slowFactor = getSlowFactor(enemy.statusEffects);
  const { speedMul } = getEmpowerBonuses(enemy.statusEffects);
  const speedMod = enemy.aiParams.speedMod ?? 1;
  return enemy.speed * (1 - slowFactor) * speedMul * speedMod;
}

/** Distance from enemy to target player (nearest in multiplayer). Returns { dx, dy, dist }. */
function distToPlayer(
  enemy: EnemyEntity,
  world: GameWorld,
): { dx: number; dy: number; dist: number } {
  // In multiplayer, target nearest alive player
  if ((world as MultiplayerGameWorld).isMultiplayer && (world as MultiplayerGameWorld).players) {
    return distToNearestPlayer(enemy, world as MultiplayerGameWorld);
  }
  const dx = world.player.x - enemy.x;
  const dy = world.player.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1; // avoid /0
  return { dx, dy, dist };
}

/** Move enemy directly toward the target player at a given speed. */
function moveTowardPlayer(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  speed: number,
): void {
  if ((world as MultiplayerGameWorld).isMultiplayer && (world as MultiplayerGameWorld).players) {
    moveTowardNearestPlayer(enemy, world as MultiplayerGameWorld, delta, speed);
    return;
  }
  const { dx, dy, dist } = distToPlayer(enemy, world);
  let vx = (dx / dist) * speed;
  let vy = (dy / dist) * speed;

  // Apply obstacle avoidance (skip for intangible or flying enemies)
  if (_propHash && !enemy.intangible && !enemy.canFly) {
    const avoided = avoidObstacles(enemy.x, enemy.y, enemy.radius, vx, vy, speed, _propHash);
    vx = avoided.vx;
    vy = avoided.vy;
  }

  enemy.x += vx * delta;
  enemy.y += vy * delta;
  enemy.lastMoveVx = vx;
  enemy.lastMoveVy = vy;
}

/** Move enemy to maintain a preferred distance from the target player. */
function maintainRange(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  preferredRange: number,
  speed: number,
): void {
  if ((world as MultiplayerGameWorld).isMultiplayer && (world as MultiplayerGameWorld).players) {
    maintainRangeFromNearestPlayer(enemy, world as MultiplayerGameWorld, delta, preferredRange, speed);
    return;
  }
  const { dx, dy, dist } = distToPlayer(enemy, world);
  const margin = 20;
  let vx = 0;
  let vy = 0;
  if (dist < preferredRange - margin) {
    // Too close, move away
    vx = -(dx / dist) * speed;
    vy = -(dy / dist) * speed;
  } else if (dist > preferredRange + margin) {
    // Too far, move closer
    vx = (dx / dist) * speed;
    vy = (dy / dist) * speed;
  }

  if ((vx !== 0 || vy !== 0) && _propHash && !enemy.intangible && !enemy.canFly) {
    const avoided = avoidObstacles(enemy.x, enemy.y, enemy.radius, vx, vy, speed, _propHash);
    vx = avoided.vx;
    vy = avoided.vy;
  }

  enemy.x += vx * delta;
  enemy.y += vy * delta;
  if (vx !== 0 || vy !== 0) {
    enemy.lastMoveVx = vx;
    enemy.lastMoveVy = vy;
  }
}

/** Create a basic enemy projectile. */
function spawnEnemyProjectile(
  world: GameWorld,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  radius: number,
  lifetime: number,
  pierce: number,
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
    pierceLeft: pierce,
    hitEnemyIds: new Set(),
    isEnemy: true,
    color,
    ...extra,
  } as ProjectileEntity;
}

/** Spawn a new enemy entity (for summons, splits, resurrections). */
function spawnEnemyEntity(
  world: GameWorld,
  defId: string,
  x: number,
  y: number,
  hpOverride?: number,
): EnemyEntity {
  const def = ENEMY_DEF_MAP.get(defId);
  if (!def) {
    // Fallback: shambler
    return spawnEnemyEntity(world, 'shambler', x, y, hpOverride);
  }
  const hp = hpOverride ?? def.baseHp;
  return {
    id: createId(world),
    x,
    y,
    radius: def.radius,
    defId: def.id,
    hp,
    maxHp: hp,
    damage: def.baseDamage,
    speed: def.baseSpeed,
    xpDrop: def.xpDrop,
    flashTimer: 0,
    aiState: 'chase',
    aiTimer: 0,
    aiTimer2: 0,
    aiParams: {},
    statusEffects: [],
    isBoss: false,
    armor: (def.specialParams.armor as number) ?? 0,
    intangible: false,
    canFly: def.canFly,
    opacity: 1.0,
    dashVx: 0,
    dashVy: 0,
    lastMoveVx: 0,
    lastMoveVy: 0,
  };
}

// =============================================================================
// TIER 1 Behaviors
// =============================================================================

// -- 1. Shambler (direct_chase) -----------------------------------------------

function updateShambler(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  _events: EnemySystemEvents,
): void {
  const speed = getEffectiveSpeed(enemy);
  moveTowardPlayer(enemy, world, delta, speed);
}

// -- 2. Bat (sinusoidal) ------------------------------------------------------

function updateBat(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  _events: EnemySystemEvents,
): void {
  const speed = getEffectiveSpeed(enemy);
  const waveAmplitude = 30;
  const wavePeriod = 2.2;

  // Accumulate wave phase
  enemy.aiTimer += delta;

  const { dx, dy, dist } = distToPlayer(enemy, world);
  const ndx = dx / dist;
  const ndy = dy / dist;

  // Perpendicular direction
  const perpX = -ndy;
  const perpY = ndx;

  // Sinusoidal offset perpendicular to travel direction
  const waveOffset =
    Math.sin((enemy.aiTimer / wavePeriod) * Math.PI * 2) * waveAmplitude;
  const prevWaveOffset =
    Math.sin(((enemy.aiTimer - delta) / wavePeriod) * Math.PI * 2) *
    waveAmplitude;
  const waveDelta = waveOffset - prevWaveOffset;

  // Move toward player + wave component
  const mvx = ndx * speed + perpX * (waveDelta / delta);
  const mvy = ndy * speed + perpY * (waveDelta / delta);
  enemy.x += mvx * delta;
  enemy.y += mvy * delta;
  enemy.lastMoveVx = mvx;
  enemy.lastMoveVy = mvy;
}

// =============================================================================
// TIER 2 Behaviors
// =============================================================================

// -- 3. Skeleton Warrior (melee_lunger) ---------------------------------------

function updateSkeletonWarrior(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  _events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'chase';

  const speed = getEffectiveSpeed(enemy);
  const lungeRange = 50;
  const lungeWindup = 0.5;
  const lungeDuration = 0.3;
  const recoverDuration = 0.3;

  switch (enemy.aiState) {
    case 'chase': {
      moveTowardPlayer(enemy, world, delta, speed);
      const { dist } = distToPlayer(enemy, world);
      if (dist <= lungeRange) {
        enemy.aiState = 'windup';
        enemy.aiTimer = lungeWindup;
      }
      break;
    }
    case 'windup': {
      // Stand still
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        // Record dash direction toward player's current position
        const { dx, dy, dist } = distToPlayer(enemy, world);
        const lungeSpeed = 300;
        enemy.dashVx = (dx / dist) * lungeSpeed;
        enemy.dashVy = (dy / dist) * lungeSpeed;
        enemy.aiState = 'lunge';
        enemy.aiTimer = lungeDuration;
      }
      break;
    }
    case 'lunge': {
      enemy.aiTimer -= delta;
      enemy.x += enemy.dashVx * delta;
      enemy.y += enemy.dashVy * delta;
      enemy.lastMoveVx = enemy.dashVx;
      enemy.lastMoveVy = enemy.dashVy;
      if (enemy.aiTimer <= 0) {
        enemy.dashVx = 0;
        enemy.dashVy = 0;
        enemy.aiState = 'recover';
        enemy.aiTimer = recoverDuration;
      }
      break;
    }
    case 'recover': {
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'chase';
      }
      break;
    }
  }
}

// -- 4. Ghost (phaser) --------------------------------------------------------

function updateGhost(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  _events: EnemySystemEvents,
): void {
  const speed = getEffectiveSpeed(enemy);
  const phaseCooldown = 4;
  const phaseDuration = 1.5;

  // Initialize phase timer
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = phaseCooldown;
    enemy.aiState = 'tangible';
  }

  // Move toward player (passes through enemies by default - collision is handled externally)
  moveTowardPlayer(enemy, world, delta, speed);

  enemy.aiTimer -= delta;

  switch (enemy.aiState) {
    case 'tangible': {
      enemy.intangible = false;
      enemy.opacity = 1.0;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'intangible';
        enemy.aiTimer = phaseDuration;
      }
      break;
    }
    case 'intangible': {
      enemy.intangible = true;
      enemy.opacity = 0.4;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'tangible';
        enemy.aiTimer = phaseCooldown;
      }
      break;
    }
  }
}

// =============================================================================
// TIER 3 Behaviors
// =============================================================================

// -- 5. Werewolf (pouncer) ----------------------------------------------------

function updateWerewolf(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  _events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'chase';

  const speed = getEffectiveSpeed(enemy);
  const pounceRange = 200;
  const crouchDuration = 1.0;
  const pounceSpeed = 350;
  const pounceMaxDist = 250;
  const pounceDurationLimit = 0.8;
  const landingPause = 0.8;
  const pounceCooldown = 6;

  switch (enemy.aiState) {
    case 'chase': {
      moveTowardPlayer(enemy, world, delta, speed);
      if (enemy.aiTimer > 0) {
        enemy.aiTimer -= delta;
      }
      const { dist } = distToPlayer(enemy, world);
      if (dist <= pounceRange && enemy.aiTimer <= 0) {
        enemy.aiState = 'crouch';
        enemy.aiTimer = crouchDuration;
      }
      break;
    }
    case 'crouch': {
      // Stand still, preparing to pounce
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        // Set dash direction toward player
        const { dx, dy, dist } = distToPlayer(enemy, world);
        enemy.dashVx = (dx / dist) * pounceSpeed;
        enemy.dashVy = (dy / dist) * pounceSpeed;
        enemy.aiState = 'pounce';
        enemy.aiTimer = pounceDurationLimit;
        enemy.aiParams.pounceTraveled = 0;
      }
      break;
    }
    case 'pounce': {
      enemy.aiTimer -= delta;
      const moveX = enemy.dashVx * delta;
      const moveY = enemy.dashVy * delta;
      enemy.x += moveX;
      enemy.y += moveY;
      enemy.lastMoveVx = enemy.dashVx;
      enemy.lastMoveVy = enemy.dashVy;
      enemy.aiParams.pounceTraveled =
        (enemy.aiParams.pounceTraveled ?? 0) +
        Math.sqrt(moveX * moveX + moveY * moveY);

      if (
        enemy.aiParams.pounceTraveled >= pounceMaxDist ||
        enemy.aiTimer <= 0
      ) {
        enemy.dashVx = 0;
        enemy.dashVy = 0;
        enemy.aiState = 'landing';
        enemy.aiTimer = landingPause;
      }
      break;
    }
    case 'landing': {
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'chase';
        enemy.aiTimer = pounceCooldown;
      }
      break;
    }
  }
}

// -- 6. Cultist (ranged_kiter) ------------------------------------------------

function updateCultist(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  const speed = getEffectiveSpeed(enemy);
  const preferredRange = 200;
  const fireCooldown = 3;
  const projSpeed = 200;
  const projRadius = 12;
  const projLifetime = 3;

  // Maintain distance
  maintainRange(enemy, world, delta, preferredRange, speed);

  // Fire cooldown
  enemy.aiTimer -= delta;
  if (enemy.aiTimer <= 0) {
    enemy.aiTimer = fireCooldown;

    // Fire dark orb toward player
    const { dx, dy, dist } = distToPlayer(enemy, world);
    const vx = (dx / dist) * projSpeed;
    const vy = (dy / dist) * projSpeed;

    events.enemyProjectiles.push(
      spawnEnemyProjectile(
        world,
        enemy.x,
        enemy.y,
        vx,
        vy,
        enemy.damage,
        projRadius,
        projLifetime,
        999, // high pierce, passes through enemies
        '#800080',
      ),
    );
  }
}

// -- 7. Swarm Rat (swarm) -----------------------------------------------------

function updateSwarmRat(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  _events: EnemySystemEvents,
): void {
  // Speed variance is applied via aiParams.speedMod at spawn time
  if (enemy.aiParams.speedMod === undefined) {
    // Initialize with +/-20% variance if not set by spawner
    enemy.aiParams.speedMod = 0.8 + Math.random() * 0.4;
  }
  const speed = getEffectiveSpeed(enemy);
  moveTowardPlayer(enemy, world, delta, speed);
}

// =============================================================================
// TIER 4 Behaviors
// =============================================================================

// -- 8. Witch (support_caster) ------------------------------------------------

function updateWitch(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  const speed = getEffectiveSpeed(enemy);
  const preferredRange = 250;
  const curseCooldown = 8;
  const curseSlow = 0.15;
  const curseDuration = 4;
  const empowerCooldown = 12;
  const empowerRange = 200;
  const empowerSpeedBonus = 0.25;
  const empowerDuration = 5;

  // Initialize timers
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = curseCooldown;
    enemy.aiTimer2 = empowerCooldown;
  }

  // Maintain preferred distance
  maintainRange(enemy, world, delta, preferredRange, speed);

  // Curse ability
  enemy.aiTimer -= delta;
  if (enemy.aiTimer <= 0) {
    enemy.aiTimer = curseCooldown;
    // Apply curse to player
    // Player doesn't have statusEffects on PlayerEntity -- we apply the
    // curse as a slow on the player via a returned event or direct mutation.
    // For now, use the iFrames-free approach: push a very brief invisible
    // enemy projectile at the player that the collision system can interpret
    // as a curse application. Alternatively, the game loop can check
    // world.weaponsDisabled-style flags. We emit a projectile with 0 damage
    // that carries the curse semantics; the collision handler applies the
    // debuff.
    const { dx, dy, dist } = distToPlayer(enemy, world);
    events.enemyProjectiles.push(
      spawnEnemyProjectile(
        world,
        enemy.x,
        enemy.y,
        (dx / dist) * 400,
        (dy / dist) * 400,
        0, // no direct damage
        8,
        1.5,
        1,
        '#9400D3',
        // The collision system should check weaponId to apply curse
        { weaponId: `curse_${curseSlow}_${curseDuration}` },
      ),
    );
  }

  // Empower ability
  enemy.aiTimer2 -= delta;
  if (enemy.aiTimer2 <= 0) {
    enemy.aiTimer2 = empowerCooldown;
    // Empower all allies within range
    for (const ally of world.enemies) {
      if (ally.id === enemy.id) continue;
      if (ally.hp <= 0) continue;
      const adx = ally.x - enemy.x;
      const ady = ally.y - enemy.y;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist <= empowerRange) {
        applyEmpower(ally.statusEffects, empowerSpeedBonus, empowerDuration, enemy.id);
      }
    }
  }
}

// -- 9. Bone Golem (tank_slammer) ---------------------------------------------

function updateBoneGolem(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'chase';

  const speed = getEffectiveSpeed(enemy);
  const slamCooldown = 5;
  const slamWindup = 1.0;
  const slamRadius = 150;
  const slamDamage = 30;

  // Initialize timer
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = slamCooldown;
  }

  switch (enemy.aiState) {
    case 'chase': {
      moveTowardPlayer(enemy, world, delta, speed);
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'slam_windup';
        enemy.aiTimer = slamWindup;
        enemy.aiParams.damageReduction = 0.5;
      }
      break;
    }
    case 'slam_windup': {
      // Stand still with 50% damage reduction
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'slam';
        enemy.aiParams.damageReduction = 0;
      }
      break;
    }
    case 'slam': {
      // Spawn shockwave projectile as expanding pool-like AoE
      // Use a smaller collision radius than visual AoE for fairer gameplay
      events.enemyProjectiles.push(
        spawnEnemyProjectile(
          world,
          enemy.x,
          enemy.y,
          0,
          0,
          slamDamage,
          40,
          0.3, // brief lifetime for shockwave
          999,
          '#F5F5DC',
          { aoeRadius: slamRadius },
        ),
      );

      enemy.aiState = 'chase';
      enemy.aiTimer = slamCooldown;
      break;
    }
  }
}

/**
 * Called externally when a Bone Golem dies.
 * Queues 3 Skeleton Warriors as split spawns.
 */
export function onBoneGolemDeath(
  enemy: EnemyEntity,
  world: GameWorld,
  events: EnemySystemEvents,
): void {
  const splitCount = 3;
  for (let i = 0; i < splitCount; i++) {
    const angle = (Math.PI * 2 * i) / splitCount;
    const offsetX = Math.cos(angle) * 30;
    const offsetY = Math.sin(angle) * 30;
    events.splitSpawns.push(
      spawnEnemyEntity(world, 'skeleton_warrior', enemy.x + offsetX, enemy.y + offsetY),
    );
  }
}

// -- 10. Shadow (stealth) -----------------------------------------------------

function updateShadow(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  _events: EnemySystemEvents,
): void {
  if (!enemy.aiState) {
    enemy.aiState = 'invisible';
    enemy.opacity = 0.1;
    enemy.intangible = true;
  }

  const speed = getEffectiveSpeed(enemy);
  const revealRange = 150;
  const fadeInDuration = 0.3;
  const recloakCooldown = 10;
  const recloakMinRange = 200;

  const { dist } = distToPlayer(enemy, world);

  switch (enemy.aiState) {
    case 'invisible': {
      // Move toward player, nearly invisible
      moveTowardPlayer(enemy, world, delta, speed);
      enemy.intangible = true;
      enemy.opacity = 0.1;

      if (dist <= revealRange) {
        enemy.aiState = 'fading_in';
        enemy.aiTimer = fadeInDuration;
        enemy.aiParams.fadeProgress = 0;
      }
      break;
    }
    case 'fading_in': {
      moveTowardPlayer(enemy, world, delta, speed);
      enemy.aiTimer -= delta;
      enemy.aiParams.fadeProgress =
        1 - Math.max(0, enemy.aiTimer) / fadeInDuration;
      enemy.opacity = 0.1 + 0.9 * enemy.aiParams.fadeProgress;

      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'revealed';
        enemy.opacity = 1.0;
        enemy.intangible = false;
        enemy.aiTimer = 0;
      }
      break;
    }
    case 'revealed': {
      enemy.opacity = 1.0;
      enemy.intangible = false;
      moveTowardPlayer(enemy, world, delta, speed);

      // Track time spent far from player for re-cloaking
      if (dist > recloakMinRange) {
        enemy.aiTimer += delta;
        if (enemy.aiTimer >= recloakCooldown) {
          enemy.aiState = 'invisible';
          enemy.opacity = 0.1;
          enemy.intangible = true;
          enemy.aiTimer = 0;
        }
      } else {
        // Reset timer when near player
        enemy.aiTimer = 0;
      }
      break;
    }
  }
}

/**
 * Called externally when a Shadow takes damage while invisible.
 * Immediately reveals the shadow.
 */
export function onShadowDamaged(enemy: EnemyEntity): void {
  if (enemy.defId === 'shadow' && (enemy.aiState === 'invisible' || enemy.aiState === 'fading_in')) {
    enemy.aiState = 'revealed';
    enemy.opacity = 1.0;
    enemy.intangible = false;
    enemy.aiTimer = 0;
  }
}

// =============================================================================
// TIER 5 Behaviors
// =============================================================================

// -- 11. Vampire Noble (elite_melee) ------------------------------------------

function updateVampireNoble(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'chase';

  const speed = getEffectiveSpeed(enemy);
  const meleeRange = 100;
  const comboDamage = 22;
  const comboHits = 3;
  const comboInterval = 0.2;
  const batSummonCooldown = 8;
  const batSummonCount = 4;
  const passiveHealPerSecond = 5;

  // Initialize timers
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer2 = batSummonCooldown;
    enemy.aiParams.comboHit = 0;
  }

  // Passive: heal HP
  enemy.hp = Math.min(enemy.maxHp, enemy.hp + passiveHealPerSecond * delta);

  // Bat summon timer (independent of state)
  enemy.aiTimer2 -= delta;
  if (enemy.aiTimer2 <= 0) {
    enemy.aiTimer2 = batSummonCooldown;
    // Spawn 4 bats near this enemy
    for (let i = 0; i < batSummonCount; i++) {
      const angle = (Math.PI * 2 * i) / batSummonCount;
      const offsetX = Math.cos(angle) * 25;
      const offsetY = Math.sin(angle) * 25;
      events.splitSpawns.push(
        spawnEnemyEntity(world, 'bat', enemy.x + offsetX, enemy.y + offsetY),
      );
    }
  }

  switch (enemy.aiState) {
    case 'chase': {
      moveTowardPlayer(enemy, world, delta, speed);
      const { dist } = distToPlayer(enemy, world);
      if (dist <= meleeRange) {
        enemy.aiState = 'combo';
        enemy.aiParams.comboHit = 0;
        enemy.aiTimer = 0; // first hit immediately
      }
      break;
    }
    case 'combo': {
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        // Deal combo hit as a short-range projectile
        const { dx, dy, dist } = distToPlayer(enemy, world);
        if (dist <= meleeRange * 1.5) {
          events.enemyProjectiles.push(
            spawnEnemyProjectile(
              world,
              enemy.x + (dx / dist) * 20,
              enemy.y + (dy / dist) * 20,
              0,
              0,
              comboDamage,
              15,
              0.1, // very brief
              1,
              '#8B0000',
            ),
          );
        }
        enemy.aiParams.comboHit = (enemy.aiParams.comboHit ?? 0) + 1;
        if (enemy.aiParams.comboHit >= comboHits) {
          enemy.aiState = 'chase';
          enemy.aiParams.comboHit = 0;
        } else {
          enemy.aiTimer = comboInterval;
        }
      }
      break;
    }
  }
}

// -- 12. Arcane Construct (elite_ranged) --------------------------------------

function updateArcaneConstruct(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'hover';

  const speed = getEffectiveSpeed(enemy);
  const preferredRange = 300;
  const laserCooldown = 4;
  const laserTelegraph = 1.0;
  const laserWidth = 12;
  const laserDuration = 0.5;
  const laserDamage = 25;

  // Initialize timer
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = laserCooldown;
  }

  switch (enemy.aiState) {
    case 'hover': {
      maintainRange(enemy, world, delta, preferredRange, speed * 0.6);
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'telegraph';
        enemy.aiTimer = laserTelegraph;
      }
      break;
    }
    case 'telegraph': {
      // Stand still, telegraph the beam
      enemy.aiTimer -= delta;

      // Calculate leading shot: predict player position
      const { dx, dy, dist } = distToPlayer(enemy, world);
      // Use player's input direction to predict movement
      const playerVx = world.inputState.dx * 200; // approximate player speed
      const playerVy = world.inputState.dy * 200;
      const timeToHit = dist / 500; // approximate travel time
      const predictedX = world.player.x + playerVx * timeToHit;
      const predictedY = world.player.y + playerVy * timeToHit;
      const pdx = predictedX - enemy.x;
      const pdy = predictedY - enemy.y;
      enemy.aiParams.beamAngle = Math.atan2(pdy, pdx);

      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'fire_beam';
      }
      break;
    }
    case 'fire_beam': {
      // Spawn beam projectile
      const angle = enemy.aiParams.beamAngle ?? 0;
      const beamSpeed = 800;
      const vx = Math.cos(angle) * beamSpeed;
      const vy = Math.sin(angle) * beamSpeed;

      events.enemyProjectiles.push(
        spawnEnemyProjectile(
          world,
          enemy.x,
          enemy.y,
          vx,
          vy,
          laserDamage,
          laserWidth,
          laserDuration,
          999, // pierces everything
          '#00CED1',
        ),
      );

      enemy.aiState = 'hover';
      enemy.aiTimer = laserCooldown;
      break;
    }
  }
}

// -- 13. Plague Bearer (zone_denier) ------------------------------------------

function updatePlagueBearer(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  const speed = getEffectiveSpeed(enemy);
  const trailInterval = 0.5;
  const trailRadius = 40;
  const trailDuration = 3;
  const trailDamagePerTick = 4;
  const trailTicksPerSecond = 2;

  // Initialize
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = trailInterval;
  }

  // Chase player directly
  moveTowardPlayer(enemy, world, delta, speed);

  // Leave poison trail
  enemy.aiTimer -= delta;
  if (enemy.aiTimer <= 0) {
    enemy.aiTimer = trailInterval;

    events.enemyProjectiles.push(
      spawnEnemyProjectile(
        world,
        enemy.x,
        enemy.y,
        0,
        0,
        0, // pool damage is handled via poolDamagePerTick
        trailRadius,
        trailDuration,
        999,
        'rgba(46, 139, 87, 0.4)',
        {
          isPool: true,
          poolDamagePerTick: trailDamagePerTick,
          poolTickInterval: 1 / trailTicksPerSecond,
          poolTimer: 0,
          poolRadius: trailRadius,
        },
      ),
    );
  }
}

/**
 * Called externally when a Plague Bearer dies.
 * Spawns a large poison cloud at its death position.
 */
export function onPlagueBearerDeath(
  enemy: EnemyEntity,
  world: GameWorld,
  events: EnemySystemEvents,
): void {
  const deathRadius = 120;
  const deathDuration = 4;
  const trailDamagePerTick = 4;
  const trailTicksPerSecond = 2;

  events.enemyProjectiles.push(
    spawnEnemyProjectile(
      world,
      enemy.x,
      enemy.y,
      0,
      0,
      0,
      deathRadius,
      deathDuration,
      999,
      'rgba(46, 139, 87, 0.6)',
      {
        isPool: true,
        poolDamagePerTick: trailDamagePerTick,
        poolTickInterval: 1 / trailTicksPerSecond,
        poolTimer: 0,
        poolRadius: deathRadius,
      },
    ),
  );
}

// =============================================================================
// TIER 6 Behaviors
// =============================================================================

// -- 14. Death Knight (heavy_melee) -------------------------------------------

function updateDeathKnight(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'chase';

  const speed = getEffectiveSpeed(enemy);
  const meleeRange = 100;
  const meleeCooldown = 2;
  const meleeDamage = 35;
  const meleeArcDeg = 140;
  const shockwaveCooldown = 6;
  const shockwaveWidth = 14;
  const shockwaveRange = 300;
  const shockwaveDamage = 20;

  // Initialize
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = meleeCooldown;
    enemy.aiTimer2 = shockwaveCooldown;
    enemy.armor = 3;
  }

  // Shockwave timer (independent of state)
  enemy.aiTimer2 -= delta;
  if (enemy.aiTimer2 <= 0) {
    enemy.aiTimer2 = shockwaveCooldown;

    // Emit 4 directional shockwaves: N, S, E, W
    const directions = [
      { vx: 0, vy: -1 },  // N
      { vx: 0, vy: 1 },   // S
      { vx: 1, vy: 0 },   // E
      { vx: -1, vy: 0 },  // W
    ];
    const shockSpeed = shockwaveRange / 1.0; // travel 300px in 1 second

    for (const dir of directions) {
      events.enemyProjectiles.push(
        spawnEnemyProjectile(
          world,
          enemy.x,
          enemy.y,
          dir.vx * shockSpeed,
          dir.vy * shockSpeed,
          shockwaveDamage,
          shockwaveWidth,
          1.0, // 1 second lifetime to travel shockwaveRange
          999,
          '#4B0082',
        ),
      );
    }
  }

  switch (enemy.aiState) {
    case 'chase': {
      moveTowardPlayer(enemy, world, delta, speed);
      enemy.aiTimer -= delta;
      const { dist } = distToPlayer(enemy, world);
      if (dist <= meleeRange && enemy.aiTimer <= 0) {
        enemy.aiState = 'swing';
      }
      break;
    }
    case 'swing': {
      // Melee arc attack: spawn a short-lived projectile representing the swing
      const { dx, dy, dist } = distToPlayer(enemy, world);
      const angle = Math.atan2(dy, dx);
      // Create a melee projectile in the arc direction
      events.enemyProjectiles.push(
        spawnEnemyProjectile(
          world,
          enemy.x + Math.cos(angle) * 40,
          enemy.y + Math.sin(angle) * 40,
          0,
          0,
          meleeDamage,
          20,
          0.15,
          1,
          '#4B0082',
          { aoeRadius: 50 },
        ),
      );

      enemy.aiTimer = meleeCooldown;
      enemy.aiState = 'chase';
      break;
    }
  }
}

// -- 15. Banshee (disabler) ---------------------------------------------------

function updateBanshee(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'chase';

  const speed = getEffectiveSpeed(enemy);
  const screamCooldown = 7;
  const screamWindup = 1.5;
  const screamRange = 400;
  const screamDisableDuration = 2;

  // Banshee always phases through enemies
  enemy.intangible = false; // still takes damage, collision handled by game loop

  // Initialize
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = screamCooldown;
  }

  switch (enemy.aiState) {
    case 'chase': {
      moveTowardPlayer(enemy, world, delta, speed);
      enemy.aiTimer -= delta;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'scream_windup';
        enemy.aiTimer = screamWindup;
        enemy.aiParams.windupTimer = screamWindup;
      }
      break;
    }
    case 'scream_windup': {
      // Stand still during windup. If killed, scream is cancelled (handled
      // by the hp <= 0 guard at the top of updateEnemyAI).
      enemy.aiTimer -= delta;
      enemy.aiParams.windupTimer = enemy.aiTimer;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'scream';
      }
      break;
    }
    case 'scream': {
      // Check if player is within scream range
      const { dist } = distToPlayer(enemy, world);
      if (dist <= screamRange) {
        // Disable weapons
        events.weaponsDisabled = { duration: screamDisableDuration };
      }
      enemy.aiState = 'chase';
      enemy.aiTimer = screamCooldown;
      break;
    }
  }
}

// -- 16. Lich (necro_caster) --------------------------------------------------

function updateLich(
  enemy: EnemyEntity,
  world: GameWorld,
  delta: number,
  events: EnemySystemEvents,
): void {
  if (!enemy.aiState) enemy.aiState = 'hover';

  const speed = getEffectiveSpeed(enemy);
  const preferredRange = 350;
  const volleyCooldown = 5;
  const volleyProjectiles: number = 5;
  const volleyArcDeg = 60;
  const volleyProjectileSpeed = 180;
  const volleyDamage = 20;
  const resurrectCooldown = 15;
  const resurrectCount = 3;
  const phylacteryHpInit = 30;
  const regenRate = 0.005; // 0.5% maxHp per second

  // Initialize
  if (enemy.aiParams.initialized === undefined) {
    enemy.aiParams.initialized = 1;
    enemy.aiTimer = volleyCooldown;
    enemy.aiTimer2 = resurrectCooldown;
    enemy.aiParams.phylacteryHp = phylacteryHpInit;
  }

  // Phylactery regen: while phylactery alive, lich regenerates HP
  if (enemy.aiParams.phylacteryHp > 0) {
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * regenRate * delta);
  }

  // Maintain preferred distance
  maintainRange(enemy, world, delta, preferredRange, speed * 0.6);

  // Volley timer
  enemy.aiTimer -= delta;
  if (enemy.aiTimer <= 0) {
    enemy.aiTimer = volleyCooldown;

    // Fire fan of projectiles
    const { dx, dy, dist } = distToPlayer(enemy, world);
    const baseAngle = Math.atan2(dy, dx);
    const arcRad = (volleyArcDeg * Math.PI) / 180;
    const startAngle = baseAngle - arcRad / 2;

    for (let i = 0; i < volleyProjectiles; i++) {
      const angle =
        volleyProjectiles === 1
          ? baseAngle
          : startAngle + (arcRad * i) / (volleyProjectiles - 1);
      const vx = Math.cos(angle) * volleyProjectileSpeed;
      const vy = Math.sin(angle) * volleyProjectileSpeed;

      events.enemyProjectiles.push(
        spawnEnemyProjectile(
          world,
          enemy.x,
          enemy.y,
          vx,
          vy,
          volleyDamage,
          10,
          3,
          1,
          '#483D8B',
        ),
      );
    }
  }

  // Resurrect timer
  enemy.aiTimer2 -= delta;
  if (enemy.aiTimer2 <= 0) {
    enemy.aiTimer2 = resurrectCooldown;

    // Spawn shamblers near lich at 50% HP (simulated resurrection)
    for (let i = 0; i < resurrectCount; i++) {
      const angle = (Math.PI * 2 * i) / resurrectCount;
      const offsetX = Math.cos(angle) * 40;
      const offsetY = Math.sin(angle) * 40;
      const shamDef = ENEMY_DEF_MAP.get('shambler');
      const halfHp = shamDef ? Math.floor(shamDef.baseHp * 0.5) : 4;
      events.splitSpawns.push(
        spawnEnemyEntity(world, 'shambler', enemy.x + offsetX, enemy.y + offsetY, halfHp),
      );
    }
  }
}

/**
 * Called externally when a Lich takes damage.
 * Damage is first applied to the phylactery. Returns the actual HP damage to apply.
 */
export function processLichDamage(enemy: EnemyEntity, damage: number): number {
  if (enemy.defId !== 'lich') return damage;

  const phylHp = enemy.aiParams.phylacteryHp ?? 0;
  if (phylHp > 0) {
    const absorbed = Math.min(phylHp, damage);
    enemy.aiParams.phylacteryHp = phylHp - absorbed;
    return damage - absorbed; // remaining damage goes to lich HP
  }
  return damage;
}

/**
 * Called externally when a Bone Golem takes damage.
 * Applies damage reduction during slam windup.
 */
export function processBoneGolemDamage(enemy: EnemyEntity, damage: number): number {
  if (enemy.defId !== 'bone_golem') return damage;
  const reduction = enemy.aiParams.damageReduction ?? 0;
  return damage * (1 - reduction);
}
