// =============================================================================
// ALTAIR ENGINE -- Level-Up & Evolution System
// =============================================================================
// Generates upgrade choices on level-up and handles weapon evolution checks.
// =============================================================================

import { GameWorld, WeaponState, PassiveState } from './types';
import { UpgradeChoice } from '../stores/game-store';
import { WEAPONS, EVOLVED_WEAPONS, WeaponDef } from '../data/weapons';
import { PASSIVES, PassiveDef } from '../data/passives';

// ---- Constants --------------------------------------------------------------

const MAX_WEAPONS = 6;
const MAX_PASSIVES = 6;
const MAX_WEAPON_LEVEL = 8;
const MAX_PASSIVE_LEVEL = 5;
const GOLD_AMOUNT = 25;

// ---- Generate Upgrade Choices -----------------------------------------------

/**
 * Generate upgrade choices for the level-up screen.
 * Returns 3-4 choices from available weapons, passives, and gold.
 */
export function generateUpgradeChoices(
  weapons: WeaponState[],
  passives: PassiveState[],
  banishedIds: Set<string>,
  extraChoice: boolean,
): UpgradeChoice[] {
  const pool: UpgradeChoice[] = [];

  // Weapon upgrades (existing weapons not at max level)
  for (const w of weapons) {
    if (banishedIds.has(w.weaponId)) continue;
    if (w.level < MAX_WEAPON_LEVEL && !w.evolved) {
      pool.push({
        type: 'upgrade_weapon',
        weaponId: w.weaponId,
        newLevel: w.level + 1,
      });
    }
  }

  // New weapons (if slots available)
  if (weapons.length < MAX_WEAPONS) {
    for (const wDef of WEAPONS) {
      if (banishedIds.has(wDef.id)) continue;
      if (weapons.some((w) => w.weaponId === wDef.id)) continue;
      // Don't offer evolved weapons as new pickups
      pool.push({
        type: 'new_weapon',
        weaponId: wDef.id,
      });
    }
  }

  // Passive upgrades (existing passives not at max level)
  for (const p of passives) {
    if (banishedIds.has(p.passiveId)) continue;
    if (p.level < MAX_PASSIVE_LEVEL) {
      pool.push({
        type: 'upgrade_passive',
        passiveId: p.passiveId,
        newLevel: p.level + 1,
      });
    }
  }

  // New passives (if slots available)
  if (passives.length < MAX_PASSIVES) {
    for (const pDef of PASSIVES) {
      if (banishedIds.has(pDef.id)) continue;
      if (passives.some((p) => p.passiveId === pDef.id)) continue;
      pool.push({
        type: 'new_passive',
        passiveId: pDef.id,
      });
    }
  }

  // Gold is always an option
  pool.push({ type: 'gold', amount: GOLD_AMOUNT });

  // Shuffle the pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Weight selection: prefer upgrades over new items, prefer matching evolution passives
  const weighted = weightChoices(pool, weapons, passives);

  // Pick 3-4 unique choices
  const count = extraChoice ? 4 : 3;
  const choices: UpgradeChoice[] = [];
  const seen = new Set<string>();

  for (const choice of weighted) {
    if (choices.length >= count) break;
    const key = getChoiceKey(choice);
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push(choice);
  }

  // Ensure we have at least the gold option if pool is small
  if (choices.length < count) {
    const gold: UpgradeChoice = { type: 'gold', amount: GOLD_AMOUNT };
    if (!choices.some((c) => c.type === 'gold')) {
      choices.push(gold);
    }
  }

  return choices;
}

function getChoiceKey(choice: UpgradeChoice): string {
  switch (choice.type) {
    case 'new_weapon':
    case 'upgrade_weapon':
      return `w:${choice.weaponId}`;
    case 'new_passive':
    case 'upgrade_passive':
      return `p:${choice.passiveId}`;
    case 'gold':
      return 'gold';
  }
}

/**
 * Weight choices to prioritize:
 * 1. Upgrade existing items (higher weight)
 * 2. Passives that evolve currently held weapons (higher weight)
 * 3. New weapons/passives (normal weight)
 * 4. Gold (lower weight)
 */
function weightChoices(
  pool: UpgradeChoice[],
  weapons: WeaponState[],
  passives: PassiveState[],
): UpgradeChoice[] {
  const weighted: { choice: UpgradeChoice; weight: number }[] = [];

  const heldWeaponIds = new Set(weapons.map((w) => w.weaponId));

  for (const choice of pool) {
    let weight = 1;

    switch (choice.type) {
      case 'upgrade_weapon':
        weight = 3; // Prefer upgrading
        // Extra weight if weapon is close to evolution (level 7)
        if (weapons.find((w) => w.weaponId === choice.weaponId)?.level === 7) {
          weight = 5;
        }
        break;
      case 'upgrade_passive':
        weight = 3;
        break;
      case 'new_passive': {
        weight = 1.5;
        // Higher weight if this passive evolves a weapon we have
        const pDef = PASSIVES.find((p) => p.id === choice.passiveId);
        if (pDef?.evolvesWeaponId && heldWeaponIds.has(pDef.evolvesWeaponId)) {
          weight = 4; // Evolution synergy
        }
        break;
      }
      case 'new_weapon':
        weight = 2;
        break;
      case 'gold':
        weight = 0.5;
        break;
    }

    // Add random jitter
    weight *= 0.5 + Math.random();
    weighted.push({ choice, weight });
  }

  // Sort by weight descending
  weighted.sort((a, b) => b.weight - a.weight);

  return weighted.map((w) => w.choice);
}

// ---- Evolution Check --------------------------------------------------------

/**
 * Check if any weapons can evolve.
 * A weapon evolves when it reaches level 8 and the player holds the matching passive.
 * Returns the evolution to perform, or null.
 */
export function checkEvolution(
  weapons: WeaponState[],
  passives: PassiveState[],
): { weaponId: string; evolvedId: string } | null {
  const passiveIds = new Set(passives.map((p) => p.passiveId));

  for (const w of weapons) {
    if (w.level >= MAX_WEAPON_LEVEL && !w.evolved) {
      const wDef = WEAPONS.find((d) => d.id === w.weaponId);
      if (wDef?.evolutionPassiveId && wDef.evolvedWeaponId) {
        if (passiveIds.has(wDef.evolutionPassiveId)) {
          return {
            weaponId: w.weaponId,
            evolvedId: wDef.evolvedWeaponId,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Generate reroll choices (same algorithm but fresh random seed).
 */
export function generateRerollChoices(
  weapons: WeaponState[],
  passives: PassiveState[],
  banishedIds: Set<string>,
  extraChoice: boolean,
): UpgradeChoice[] {
  return generateUpgradeChoices(weapons, passives, banishedIds, extraChoice);
}
