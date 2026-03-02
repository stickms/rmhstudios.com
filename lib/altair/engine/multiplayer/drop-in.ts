// =============================================================================
// ALTAIR ENGINE -- Multiplayer Drop-In System
// =============================================================================
// Handles mid-run join: spawn position, level catch-up, auto-loadout.
// =============================================================================

import {
  MultiplayerGameWorld,
  MultiplayerPlayerEntity,
  WeaponState,
} from '../types';
import { WEAPONS } from '../../data/weapons';
import { PASSIVES } from '../../data/passives';
import { CLASSES } from '../../data/classes';
import { DROP_IN } from '../../data/multiplayer-scaling';
import { getAlivePlayers } from './player-helpers';
import { addPlayerToWorld } from './multiplayer-loop';
import { setScalingTarget } from './scaling-system';

/**
 * Calculate the starting level for a drop-in player.
 * Level = max(1, avgTeamLevel - 2)
 */
export function getDropInLevel(world: MultiplayerGameWorld): number {
  const alive = getAlivePlayers(world);
  if (alive.length === 0) return 1;

  // Note: actual player levels are tracked in the game store,
  // but for auto-loadout we estimate from weapons/passives
  // The actual level will be set by the caller from the store
  return 1; // Placeholder — level is supplied externally
}

/**
 * Generate auto-loadout for a drop-in player at a given level.
 * Simulates N level-ups, favoring the class starting weapon and
 * then mixing in random weapons/passives.
 */
export function generateAutoLoadout(
  classId: string,
  targetLevel: number,
): { weapons: WeaponState[]; passiveIds: string[] } {
  const classDef = CLASSES.find((c) => c.id === classId) || CLASSES[0];
  const startingWeaponId = classDef.startingWeaponId;

  const weapons: WeaponState[] = [
    {
      weaponId: startingWeaponId,
      level: 1,
      evolved: false,
      cooldownTimer: 0,
    },
  ];

  const passiveIds: string[] = [];
  const availableWeapons = WEAPONS.filter((w) => w.id !== startingWeaponId);
  const availablePassives = [...PASSIVES];

  // Simulate upgrades for each level above 1
  for (let i = 2; i <= targetLevel; i++) {
    const roll = Math.random();

    if (roll < 0.4 && weapons.length > 0) {
      // 40%: Upgrade starting weapon (up to level 8)
      const startWeapon = weapons.find((w) => w.weaponId === startingWeaponId);
      if (startWeapon && startWeapon.level < 8) {
        startWeapon.level++;
        continue;
      }
    }

    if (roll < 0.6 && weapons.length < 6 && availableWeapons.length > 0) {
      // 20%: New weapon
      const idx = Math.floor(Math.random() * availableWeapons.length);
      const newWep = availableWeapons.splice(idx, 1)[0];
      weapons.push({
        weaponId: newWep.id,
        level: 1,
        evolved: false,
        cooldownTimer: 0,
      });
      continue;
    }

    if (roll < 0.8 && passiveIds.length < 6 && availablePassives.length > 0) {
      // 20%: New passive
      const idx = Math.floor(Math.random() * availablePassives.length);
      const newPassive = availablePassives.splice(idx, 1)[0];
      passiveIds.push(newPassive.id);
      continue;
    }

    // 20%: Upgrade an existing weapon
    const upgradeable = weapons.filter((w) => w.level < 8);
    if (upgradeable.length > 0) {
      const target = upgradeable[Math.floor(Math.random() * upgradeable.length)];
      target.level++;
    }
  }

  return { weapons, passiveIds };
}

/**
 * Process a mid-run drop-in for a new player.
 * Returns the created player entity.
 */
export function processDropIn(
  world: MultiplayerGameWorld,
  playerId: string,
  classId: string,
  slot: number,
  level: number,
  canvasWidth: number,
  canvasHeight: number,
): MultiplayerPlayerEntity {
  // Spawn at host position
  const host = world.players.get(world.hostPlayerId);
  const spawnX = host?.x ?? 0;
  const spawnY = host?.y ?? 0;

  // Create player entity
  const player = addPlayerToWorld(
    world,
    playerId,
    classId,
    slot,
    spawnX,
    spawnY,
    level,
    canvasWidth,
    canvasHeight,
  );

  // Generate auto-loadout
  const loadout = generateAutoLoadout(classId, level);
  player.weapons = loadout.weapons;
  player.passives = loadout.passiveIds.map((id) => ({
    passiveId: id,
    level: 1,
  }));

  // Set invulnerability
  player.invulnTimer = DROP_IN.INVULN_DURATION;

  // Update scaling
  setScalingTarget(world.scalingState, world.alivePlayerCount);

  return player;
}
