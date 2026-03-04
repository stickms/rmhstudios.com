// =============================================================================
// ALTAIR ENGINE -- Wave Director
// =============================================================================
// Controls enemy spawning based on the 20-minute wave timeline, spawn budgets,
// and difficulty scaling. Uses threat points to balance spawn composition.
// =============================================================================

import { GameWorld, EnemyEntity, createId } from './types';
import { ENEMIES, EnemyDef } from '../data/enemies';
import {
  WAVE_TIMELINE,
  ENEMY_THREAT_COSTS,
  MAX_ACTIVE_ENEMIES,
  HORDE_SURGES,
  HORDE_SURGE_MIN_RADIUS,
  HORDE_SURGE_MAX_RADIUS,
} from '../data/waves';
import { getHPScale, getDamageScale, getSpeedScale, getXPScale } from '../data/scaling';

// ---- Types ------------------------------------------------------------------

export interface WaveDirectorState {
  budgetAccumulator: number;
  lastSpawnTime: number;
  bossSpawned: Set<string>;
  surgeTimer: number;
  nextSurgeIndex: number;
}

export interface WaveDirectorEvents {
  bossSpawn?: string;
  calmBeforeStorm?: boolean;
  victory?: boolean;
  /** defIds of all enemies spawned this tick (for bestiary tracking). */
  spawned: string[];
}

// ---- Factory ----------------------------------------------------------------

export function createWaveDirectorState(): WaveDirectorState {
  return {
    budgetAccumulator: 0,
    lastSpawnTime: 0,
    bossSpawned: new Set(),
    surgeTimer: 0,
    nextSurgeIndex: 0,
  };
}

// ---- Helpers ----------------------------------------------------------------

const ENEMY_BY_ID = new Map<string, EnemyDef>();
for (const e of ENEMIES) {
  ENEMY_BY_ID.set(e.id, e);
}

function getRandomSpawnPosition(
  playerX: number,
  playerY: number,
  minDist: number,
  maxDist: number,
): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = minDist + Math.random() * (maxDist - minDist);
  return {
    x: playerX + Math.cos(angle) * dist,
    y: playerY + Math.sin(angle) * dist,
  };
}

function spawnEnemy(
  world: GameWorld,
  defId: string,
  x: number,
  y: number,
  hpMultiplier: number,
  spawnedOut?: string[],
): EnemyEntity | null {
  const def = ENEMY_BY_ID.get(defId);
  if (!def) return null;

  const timeMin = world.time / 60;
  const hpScale = getHPScale(timeMin);
  const dmgScale = getDamageScale(timeMin);
  const spdScale = getSpeedScale(timeMin);

  const baseHp = def.baseHp * hpScale * hpMultiplier;
  const baseDmg = def.baseDamage * dmgScale;
  const baseSpd = def.baseSpeed * spdScale;

  // Speed variance for swarm rats
  let speedMod = 1;
  if (def.behavior === 'swarm') {
    const variance = def.specialParams.speedVariance || 0.2;
    speedMod = 1 + (Math.random() * 2 - 1) * variance;
  }

  const enemy: EnemyEntity = {
    id: createId(world),
    x,
    y,
    radius: def.radius,
    defId: def.id,
    hp: baseHp,
    maxHp: baseHp,
    damage: baseDmg,
    speed: baseSpd * speedMod,
    xpDrop: Math.round(def.xpDrop * getXPScale(timeMin)),
    flashTimer: 0,
    aiState: 'chase',
    aiTimer: 0,
    aiTimer2: 0,
    aiParams: {},
    statusEffects: [],
    isBoss: false,
    armor: (def.specialParams.armor as number) || 0,
    intangible: false,
    canFly: def.canFly,
    opacity: 1,
    dashVx: 0,
    dashVy: 0,
    lastMoveVx: 0,
    lastMoveVy: 0,
  };

  // Set initial AI state based on behavior
  switch (def.behavior) {
    case 'stealth':
      enemy.aiState = 'invisible';
      enemy.opacity = 0.1;
      enemy.intangible = true;
      break;
    case 'phaser':
      enemy.aiTimer = def.specialParams.phaseCooldown || 4;
      break;
    case 'pouncer':
      enemy.aiTimer = 2; // Initial delay before first pounce
      break;
    case 'ranged_kiter':
    case 'support_caster':
    case 'elite_ranged':
    case 'necro_caster':
      enemy.aiTimer = (def.specialParams.fireCooldown || def.specialParams.laserCooldown || def.specialParams.volleyCooldown || 3) * 0.5;
      enemy.aiTimer2 = (def.specialParams.empowerCooldown || def.specialParams.resurrectCooldown || 10) * 0.5;
      break;
    case 'tank_slammer':
      enemy.aiTimer = def.specialParams.slamCooldown || 5;
      break;
    case 'heavy_melee':
      enemy.aiTimer = def.specialParams.meleeCooldown || 2;
      enemy.aiTimer2 = def.specialParams.shockwaveCooldown || 6;
      break;
    case 'disabler':
      enemy.aiTimer = (def.specialParams.screamCooldown || 7) * 0.5;
      break;
    case 'elite_melee':
      enemy.aiTimer2 = def.specialParams.batSummonCooldown || 8;
      break;
    case 'melee_lunger':
      enemy.aiTimer = def.specialParams.attackInterval || 1.5;
      break;
    case 'zone_denier':
      enemy.aiTimer = 0.5;
      break;
  }

  // Lich phylactery
  if (def.behavior === 'necro_caster') {
    enemy.aiParams.phylacteryHp = def.specialParams.phylacteryHp || 30;
  }

  if (spawnedOut) spawnedOut.push(defId);
  return enemy;
}

// ---- Despawn ----------------------------------------------------------------

/** Despawn farthest Tier 1 enemies to make room for higher tiers. */
function despawnExcess(world: GameWorld): void {
  if (world.enemies.length <= MAX_ACTIVE_ENEMIES) return;

  // Find Tier 1 enemies (shambler, bat) and sort by distance to player
  const tier1Indices: { index: number; distSq: number }[] = [];
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (e.defId === 'shambler' || e.defId === 'bat') {
      const dx = e.x - world.player.x;
      const dy = e.y - world.player.y;
      tier1Indices.push({ index: i, distSq: dx * dx + dy * dy });
    }
  }

  // Sort farthest first
  tier1Indices.sort((a, b) => b.distSq - a.distSq);

  // Remove until under cap
  const toRemove = world.enemies.length - MAX_ACTIVE_ENEMIES;
  const removeIndices = new Set<number>();
  for (let i = 0; i < Math.min(toRemove, tier1Indices.length); i++) {
    removeIndices.add(tier1Indices[i].index);
  }

  if (removeIndices.size > 0) {
    world.enemies = world.enemies.filter((_, i) => !removeIndices.has(i));
  }
}

// ---- Main Update ------------------------------------------------------------

export function updateWaveDirector(
  world: GameWorld,
  state: WaveDirectorState,
  delta: number,
): WaveDirectorEvents {
  const events: WaveDirectorEvents = { spawned: [] };
  const timeSeconds = world.time;
  const timeMinutes = timeSeconds / 60;

  // Find current wave event
  let currentWave = WAVE_TIMELINE[0];
  for (const wave of WAVE_TIMELINE) {
    if (timeSeconds >= wave.startTime && (timeSeconds < wave.endTime || wave.startTime === wave.endTime)) {
      currentWave = wave;
    }
  }

  // Handle special events
  if (currentWave.specialEvent === 'boss_spawn' && currentWave.bossId) {
    if (!state.bossSpawned.has(currentWave.bossId)) {
      state.bossSpawned.add(currentWave.bossId);
      events.bossSpawn = currentWave.bossId;
    }
  }

  if (currentWave.specialEvent === 'calm_before_storm') {
    events.calmBeforeStorm = true;
    return events; // No spawning during calm
  }

  // Check victory condition: all bosses dead and time > 20:00
  if (timeSeconds > 1200 && !world.bossActive && state.bossSpawned.has('terminus')) {
    events.victory = true;
    return events;
  }

  // Don't spawn if no enemies in composition or rate is 0
  if (currentWave.enemyComposition.length === 0 || currentWave.spawnRateMultiplier === 0) {
    return events;
  }

  // Calculate spawn budget
  const baseBudget = 2 + timeMinutes * 1.5 + timeMinutes * timeMinutes * 0.15;
  const effectiveBudget = baseBudget * currentWave.spawnRateMultiplier;

  // During boss fights, reduce spawn rate
  const bossModifier = world.bossActive ? 0.5 : 1.0;

  // Accumulate budget
  state.budgetAccumulator += effectiveBudget * bossModifier * delta;

  // Surge spawning
  if (currentWave.specialEvent === 'surge') {
    state.surgeTimer -= delta;
    if (state.surgeTimer <= 0) {
      state.surgeTimer = 10; // Surge every 10 seconds
      // Spawn a burst of 30 Tier 1 + 3-5 high tier enemies
      for (let i = 0; i < 30; i++) {
        if (world.enemies.length >= MAX_ACTIVE_ENEMIES) break;
        const pos = getRandomSpawnPosition(world.player.x, world.player.y, 400, 700);
        const type = Math.random() < 0.5 ? 'shambler' : 'bat';
        const enemy = spawnEnemy(world, type, pos.x, pos.y, 1, events.spawned);
        if (enemy) world.enemies.push(enemy);
      }
      const highTierTypes = ['vampire_noble', 'arcane_construct', 'death_knight', 'bone_golem', 'witch'];
      const highTierCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < highTierCount; i++) {
        if (world.enemies.length >= MAX_ACTIVE_ENEMIES) break;
        const pos = getRandomSpawnPosition(world.player.x, world.player.y, 400, 700);
        const type = highTierTypes[Math.floor(Math.random() * highTierTypes.length)];
        const enemy = spawnEnemy(world, type, pos.x, pos.y, 1, events.spawned);
        if (enemy) world.enemies.push(enemy);
      }
    }
  }

  // Spend budget on spawning enemies
  while (state.budgetAccumulator >= 1 && world.enemies.length < MAX_ACTIVE_ENEMIES) {
    // Pick a random enemy from the current composition
    const composition = currentWave.enemyComposition;
    const enemyId = composition[Math.floor(Math.random() * composition.length)];
    const cost = ENEMY_THREAT_COSTS[enemyId] || 1;

    if (state.budgetAccumulator < cost) {
      // Can't afford any more enemies in this composition
      // Try spawning cheaper ones
      const cheapId = composition.find((id) => (ENEMY_THREAT_COSTS[id] || 1) <= state.budgetAccumulator);
      if (!cheapId) break;
      const cheapCost = ENEMY_THREAT_COSTS[cheapId] || 1;
      state.budgetAccumulator -= cheapCost;

      const pos = getRandomSpawnPosition(world.player.x, world.player.y, 450, 750);

      // Swarm rats spawn in packs
      if (cheapId === 'swarm_rat') {
        const def = ENEMY_BY_ID.get('swarm_rat');
        const packMin = def?.specialParams.packSizeMin || 8;
        const packMax = def?.specialParams.packSizeMax || 12;
        const packSize = packMin + Math.floor(Math.random() * (packMax - packMin + 1));
        for (let j = 0; j < packSize; j++) {
          if (world.enemies.length >= MAX_ACTIVE_ENEMIES) break;
          const offset = { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 60 };
          const rat = spawnEnemy(world, 'swarm_rat', pos.x + offset.x, pos.y + offset.y, 1, events.spawned);
          if (rat) world.enemies.push(rat);
        }
      } else {
        const enemy = spawnEnemy(world, cheapId, pos.x, pos.y, 1, events.spawned);
        if (enemy) world.enemies.push(enemy);
      }
      continue;
    }

    state.budgetAccumulator -= cost;

    const pos = getRandomSpawnPosition(world.player.x, world.player.y, 450, 750);

    // Swarm rats spawn in packs
    if (enemyId === 'swarm_rat') {
      const def = ENEMY_BY_ID.get('swarm_rat');
      const packMin = def?.specialParams.packSizeMin || 8;
      const packMax = def?.specialParams.packSizeMax || 12;
      const packSize = packMin + Math.floor(Math.random() * (packMax - packMin + 1));
      for (let j = 0; j < packSize; j++) {
        if (world.enemies.length >= MAX_ACTIVE_ENEMIES) break;
        const offset = { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 60 };
        const rat = spawnEnemy(world, 'swarm_rat', pos.x + offset.x, pos.y + offset.y, 1, events.spawned);
        if (rat) world.enemies.push(rat);
      }
    } else {
      const enemy = spawnEnemy(world, enemyId, pos.x, pos.y, 1, events.spawned);
      if (enemy) world.enemies.push(enemy);
    }
  }

  // Cap budget accumulator so it doesn't endlessly grow
  state.budgetAccumulator = Math.min(state.budgetAccumulator, 50);

  // Horde surge spawning (v1.1) -- additive, respects MAX_ACTIVE_ENEMIES
  while (state.nextSurgeIndex < HORDE_SURGES.length) {
    const surge = HORDE_SURGES[state.nextSurgeIndex];
    if (timeSeconds < surge.time) break;

    // Spawn all enemies in the surge composition in a ring around the player
    for (const [enemyId, count] of Object.entries(surge.composition)) {
      for (let i = 0; i < count; i++) {
        if (world.enemies.length >= MAX_ACTIVE_ENEMIES) break;
        const pos = getRandomSpawnPosition(
          world.player.x,
          world.player.y,
          HORDE_SURGE_MIN_RADIUS,
          HORDE_SURGE_MAX_RADIUS,
        );
        const enemy = spawnEnemy(world, enemyId, pos.x, pos.y, 1, events.spawned);
        if (enemy) world.enemies.push(enemy);
      }
    }

    state.nextSurgeIndex++;
  }

  // Despawn excess Tier 1 enemies
  despawnExcess(world);

  return events;
}

// ---- Spawn a specific enemy at a position (for ability-based spawning) ------

export function spawnEnemyAt(
  world: GameWorld,
  defId: string,
  x: number,
  y: number,
  hpMultiplier: number = 1,
): EnemyEntity | null {
  if (world.enemies.length >= MAX_ACTIVE_ENEMIES) return null;
  const enemy = spawnEnemy(world, defId, x, y, hpMultiplier);
  if (enemy) {
    world.enemies.push(enemy);
  }
  return enemy;
}
