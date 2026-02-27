// =============================================================================
// ALTAIR ENGINE -- Pickup System
// =============================================================================
// Handles pickup spawning from enemy deaths, collection behavior, magnet
// magnetization, and special pickups (rosary, chest, vacuum).
// =============================================================================

import { GameWorld, PickupEntity, EnemyEntity, createId } from './types';
import { PlayerStats } from '../stores/game-store';

// ---- Types ------------------------------------------------------------------

export interface PickupEvents {
  xpGained: number;
  coinsGained: number;
  healed: number;
  magnetActivated: boolean;
  vacuumActivated: boolean;
  rosaryActivated: boolean;
  chestOpened: boolean;
  clockActivated: boolean;
  shieldOrbCollected: boolean;
  bombActivated: boolean;
}

// ---- Constants --------------------------------------------------------------

const XP_SMALL_VALUE = 1;
const XP_MEDIUM_VALUE = 5;
const XP_LARGE_VALUE = 25;
const FOOD_HEAL_PERCENT = 0.2; // 20% of max HP
const MAGNET_SPEED = 400; // px/s when magnetized
const COIN_DROP_CHANCE = 0.03; // 3% base
const FOOD_DROP_CHANCE = 0.02; // 2% base from enemies
const MAGNET_DROP_CHANCE = 0.005;
const VACUUM_DROP_CHANCE = 0.002;
const ROSARY_DROP_CHANCE = 0.001;
const CHEST_DROP_CHANCE = 0.001;
const CLOCK_DROP_CHANCE = 0.003;
const SHIELD_ORB_DROP_CHANCE = 0.002;
const BOMB_DROP_CHANCE = 0.002;
const CLOCK_SLOW_DURATION = 5; // seconds
const SHIELD_ORB_AMOUNT = 30;
const BOMB_RADIUS = 200;
const BOMB_DAMAGE = 50;
const XP_MERGE_RADIUS = 25; // px — orbs within this distance merge
const XP_MERGE_INTERVAL = 0.5; // seconds between merge passes
let mergeTimer = 0;

// ---- Spawn Pickups ----------------------------------------------------------

/** Spawn XP gems from a killed enemy. */
export function spawnEnemyDrops(
  world: GameWorld,
  enemy: EnemyEntity,
  luck: number,
): void {
  const x = enemy.x;
  const y = enemy.y;
  const xpValue = enemy.xpDrop;

  // Spawn XP gems based on value
  if (xpValue >= 25) {
    spawnPickup(world, x, y, 'xp_large', XP_LARGE_VALUE);
    const remainder = xpValue - 25;
    if (remainder >= 5) {
      spawnPickup(world, x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, 'xp_medium', XP_MEDIUM_VALUE);
    }
  } else if (xpValue >= 5) {
    spawnPickup(world, x, y, 'xp_medium', XP_MEDIUM_VALUE);
    const remainder = xpValue - 5;
    for (let i = 0; i < Math.min(remainder, 4); i++) {
      spawnPickup(
        world,
        x + (Math.random() - 0.5) * 30,
        y + (Math.random() - 0.5) * 30,
        'xp_small',
        XP_SMALL_VALUE,
      );
    }
  } else {
    for (let i = 0; i < xpValue; i++) {
      spawnPickup(
        world,
        x + (Math.random() - 0.5) * 20,
        y + (Math.random() - 0.5) * 20,
        'xp_small',
        XP_SMALL_VALUE,
      );
    }
  }

  // Coin drop (3% × luck)
  if (Math.random() < COIN_DROP_CHANCE * luck) {
    spawnPickup(world, x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 15, 'coin', 1);
  }

  // Food drop (2% × luck)
  if (Math.random() < FOOD_DROP_CHANCE * luck) {
    spawnPickup(world, x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 15, 'food', 0);
  }

  // Special drops from specific enemies
  if (enemy.defId === 'death_knight') {
    // Death Knights always drop food
    spawnPickup(world, x, y + 15, 'food', 0);
  }

  // Rare special pickups
  if (Math.random() < MAGNET_DROP_CHANCE * luck) {
    spawnPickup(world, x, y, 'magnet', 0);
  }
  if (Math.random() < VACUUM_DROP_CHANCE * luck) {
    spawnPickup(world, x, y, 'vacuum', 0);
  }
  if (Math.random() < ROSARY_DROP_CHANCE * luck) {
    spawnPickup(world, x, y, 'rosary', 0);
  }
  if (Math.random() < CHEST_DROP_CHANCE * luck) {
    spawnPickup(world, x, y, 'chest', 0);
  }
  if (Math.random() < CLOCK_DROP_CHANCE * luck) {
    spawnPickup(world, x, y, 'clock', 0);
  }
  if (Math.random() < SHIELD_ORB_DROP_CHANCE * luck) {
    spawnPickup(world, x, y, 'shield_orb', 0);
  }
  if (Math.random() < BOMB_DROP_CHANCE * luck) {
    spawnPickup(world, x, y, 'bomb', 0);
  }
}

/** Spawn drops from a destroyed prop (1-2 XP gems + 15% coin chance). */
export function spawnPropDrops(world: GameWorld, x: number, y: number): void {
  // 1-2 small XP gems
  const gemCount = 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < gemCount; i++) {
    spawnPickup(
      world,
      x + (Math.random() - 0.5) * 16,
      y + (Math.random() - 0.5) * 16,
      'xp_small',
      XP_SMALL_VALUE,
    );
  }
  // 15% coin chance
  if (Math.random() < 0.15) {
    spawnPickup(world, x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, 'coin', 1);
  }
}

/** Spawn boss drops. */
export function spawnBossDrops(
  world: GameWorld,
  x: number,
  y: number,
  coinMin: number,
  coinMax: number,
): void {
  const coinCount = coinMin + Math.floor(Math.random() * (coinMax - coinMin + 1));
  for (let i = 0; i < coinCount; i++) {
    const angle = (i / coinCount) * Math.PI * 2;
    const dist = 30 + Math.random() * 40;
    spawnPickup(
      world,
      x + Math.cos(angle) * dist,
      y + Math.sin(angle) * dist,
      'coin',
      1,
    );
  }

  // Always drop a chest
  spawnPickup(world, x, y, 'chest', 0);

  // Large XP gem
  spawnPickup(world, x, y + 20, 'xp_large', XP_LARGE_VALUE);
}

export function spawnPickup(
  world: GameWorld,
  x: number,
  y: number,
  type: PickupEntity['type'],
  value: number,
): void {
  world.pickups.push({
    id: createId(world),
    x,
    y,
    radius: type === 'xp_small' ? 3 : type === 'xp_medium' ? 4 : type === 'xp_large' ? 6 : type === 'coin' ? 5 : 7,
    type,
    value,
    magnetized: false,
  });
}

// ---- XP Orb Merging ---------------------------------------------------------

function isXPOrb(p: PickupEntity): boolean {
  return p.type === 'xp_small' || p.type === 'xp_medium' || p.type === 'xp_large';
}

function getXPType(value: number): PickupEntity['type'] {
  if (value >= 25) return 'xp_large';
  if (value >= 5) return 'xp_medium';
  return 'xp_small';
}

function getXPRadius(value: number): number {
  if (value >= 25) return 6;
  if (value >= 5) return 4;
  return 3;
}

/** Merge nearby non-magnetized XP orbs into single higher-value orbs. */
function mergeNearbyXPOrbs(world: GameWorld): void {
  const pickups = world.pickups;
  const removed = new Set<number>();

  for (let i = 0; i < pickups.length; i++) {
    if (removed.has(i)) continue;
    const a = pickups[i];
    if (!isXPOrb(a) || a.magnetized) continue;

    for (let j = i + 1; j < pickups.length; j++) {
      if (removed.has(j)) continue;
      const b = pickups[j];
      if (!isXPOrb(b) || b.magnetized) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy <= XP_MERGE_RADIUS * XP_MERGE_RADIUS) {
        a.value += b.value;
        a.type = getXPType(a.value);
        a.radius = getXPRadius(a.value);
        removed.add(j);
      }
    }
  }

  if (removed.size > 0) {
    world.pickups = pickups.filter((_, i) => !removed.has(i));
  }
}

// ---- Update Pickups ---------------------------------------------------------

/** Process pickup collection and magnetization. */
export function updatePickups(
  world: GameWorld,
  stats: PlayerStats,
  delta: number,
): PickupEvents {
  const events: PickupEvents = {
    xpGained: 0,
    coinsGained: 0,
    healed: 0,
    magnetActivated: false,
    vacuumActivated: false,
    rosaryActivated: false,
    chestOpened: false,
    clockActivated: false,
    shieldOrbCollected: false,
    bombActivated: false,
  };

  // Periodically merge nearby XP orbs
  mergeTimer -= delta;
  if (mergeTimer <= 0) {
    mergeTimer = XP_MERGE_INTERVAL;
    mergeNearbyXPOrbs(world);
  }

  const pl = world.player;
  const pickupRange = stats.pickupRange;
  const collectRadius = pl.radius + 10; // Actual collection radius

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const pk = world.pickups[i];

    // Check if within magnetization range
    const dx = pl.x - pk.x;
    const dy = pl.y - pk.y;
    const distSq = dx * dx + dy * dy;

    if (!pk.magnetized && distSq <= pickupRange * pickupRange) {
      pk.magnetized = true;
    }

    // Magnetized pickups move toward player
    if (pk.magnetized) {
      const dist = Math.sqrt(distSq);
      if (dist > 1) {
        const speed = MAGNET_SPEED;
        pk.x += (dx / dist) * speed * delta;
        pk.y += (dy / dist) * speed * delta;
      }
    }

    // Check collection
    if (distSq <= collectRadius * collectRadius) {
      switch (pk.type) {
        case 'xp_small':
        case 'xp_medium':
        case 'xp_large':
          events.xpGained += pk.value;
          break;
        case 'coin':
          events.coinsGained += pk.value;
          break;
        case 'food': {
          const healAmount = Math.floor(pl.maxHp * FOOD_HEAL_PERCENT);
          pl.hp = Math.min(pl.maxHp, pl.hp + healAmount);
          events.healed += healAmount;
          break;
        }
        case 'magnet':
          // Magnetize all existing pickups
          for (const other of world.pickups) {
            other.magnetized = true;
          }
          events.magnetActivated = true;
          break;
        case 'vacuum':
          // Magnetize all with higher speed (handled by magnetized flag)
          for (const other of world.pickups) {
            other.magnetized = true;
          }
          events.vacuumActivated = true;
          break;
        case 'rosary':
          // Kill all non-boss enemies on screen
          for (const e of world.enemies) {
            if (!e.isBoss) {
              e.hp = 0;
            }
          }
          events.rosaryActivated = true;
          break;
        case 'chest':
          // Chest gives bonus coins and XP
          events.coinsGained += 10 + Math.floor(world.time / 60) * 2;
          events.xpGained += 25;
          events.chestOpened = true;
          break;
        case 'clock':
          // Slow all enemies for a duration
          for (const e of world.enemies) {
            e.statusEffects.push({
              type: 'slow',
              duration: CLOCK_SLOW_DURATION,
              magnitude: 0.5, // 50% slow
            });
          }
          events.clockActivated = true;
          break;
        case 'shield_orb':
          // Grant player a temporary shield
          pl.shieldHp = Math.max(pl.shieldHp, SHIELD_ORB_AMOUNT);
          events.shieldOrbCollected = true;
          break;
        case 'bomb': {
          // Damage all enemies in radius
          const bx = pl.x;
          const by = pl.y;
          for (const e of world.enemies) {
            const edx = e.x - bx;
            const edy = e.y - by;
            if (edx * edx + edy * edy <= BOMB_RADIUS * BOMB_RADIUS) {
              e.hp -= BOMB_DAMAGE;
            }
          }
          events.bombActivated = true;
          break;
        }
      }

      world.pickups.splice(i, 1);
    }
  }

  return events;
}
