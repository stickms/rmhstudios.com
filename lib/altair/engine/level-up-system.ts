// =============================================================================
// ALTAIR ENGINE -- Level-Up & Evolution System (v1.3)
// =============================================================================
// Generates upgrade choices on level-up and handles weapon evolution checks.
// v1.3: Catalysts replace evolution passives. Catalysts and passives share
// 6 total slots. Catalysts max at level 3 and are consumed on evolution.
// =============================================================================

import { WeaponState, PassiveState, CatalystState } from './types';
import { UpgradeChoice } from '../stores/game-store';
import { WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { CATALYSTS } from '../data/catalysts';

// ---- Constants --------------------------------------------------------------

const MAX_WEAPONS = 6;
const MAX_PASSIVE_SLOTS = 6; // shared between passives and catalysts
const MAX_WEAPON_LEVEL = 8;
const MAX_PASSIVE_LEVEL = 5;
const MAX_CATALYST_LEVEL = 3;
const GOLD_AMOUNT = 25;

// ---- Generate Upgrade Choices -----------------------------------------------

/**
 * Generate upgrade choices for the level-up screen.
 * Returns 3-4 choices from available weapons, passives, catalysts, and gold.
 */
export function generateUpgradeChoices(
  weapons: WeaponState[],
  passives: PassiveState[],
  catalysts: CatalystState[],
  banishedIds: Set<string>,
  extraChoice: boolean,
  catalystAffinityPct: number = 0,
): UpgradeChoice[] {
  const pool: UpgradeChoice[] = [];
  const totalPassiveSlots = passives.length + catalysts.length;

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

  // New passives (if shared slots available)
  if (totalPassiveSlots < MAX_PASSIVE_SLOTS) {
    for (const pDef of PASSIVES) {
      if (banishedIds.has(pDef.id)) continue;
      if (passives.some((p) => p.passiveId === pDef.id)) continue;
      pool.push({
        type: 'new_passive',
        passiveId: pDef.id,
      });
    }
  }

  // Catalyst upgrades (existing catalysts not at max level)
  for (const c of catalysts) {
    if (banishedIds.has(c.catalystId)) continue;
    if (c.level < MAX_CATALYST_LEVEL) {
      pool.push({
        type: 'upgrade_catalyst',
        catalystId: c.catalystId,
        newLevel: c.level + 1,
      });
    }
  }

  // New catalysts (if shared slots available)
  if (totalPassiveSlots < MAX_PASSIVE_SLOTS) {
    for (const cDef of CATALYSTS) {
      if (banishedIds.has(cDef.id)) continue;
      if (catalysts.some((c) => c.catalystId === cDef.id)) continue;
      pool.push({
        type: 'new_catalyst',
        catalystId: cDef.id,
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

  // Weight selection: prefer upgrades, catalysts matching held weapons
  const weighted = weightChoices(pool, weapons, passives, catalysts, catalystAffinityPct);

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
    case 'new_catalyst':
    case 'upgrade_catalyst':
      return `c:${choice.catalystId}`;
    case 'gold':
      return 'gold';
  }
}

/**
 * Weight choices to prioritize:
 * 1. Upgrade existing items (higher weight)
 * 2. Catalysts that match currently held weapons (higher weight)
 * 3. New weapons/passives/catalysts (normal weight)
 * 4. Gold (lower weight)
 */
function weightChoices(
  pool: UpgradeChoice[],
  weapons: WeaponState[],
  passives: PassiveState[],
  catalysts: CatalystState[],
  catalystAffinityPct: number,
): UpgradeChoice[] {
  const weighted: { choice: UpgradeChoice; weight: number }[] = [];

  const heldWeaponIds = new Set(weapons.map((w) => w.weaponId));
  const catalystAffinityMul = 1 + catalystAffinityPct / 100;

  for (const choice of pool) {
    let weight = 1;

    switch (choice.type) {
      case 'upgrade_weapon':
        weight = 3;
        // Extra weight if weapon is close to evolution (level 7)
        if (weapons.find((w) => w.weaponId === choice.weaponId)?.level === 7) {
          weight = 5;
        }
        break;
      case 'upgrade_passive':
        weight = 3;
        break;
      case 'upgrade_catalyst':
        weight = 3;
        // Extra weight if catalyst matches a held weapon
        {
          const cDef = CATALYSTS.find((c) => c.id === choice.catalystId);
          if (cDef && heldWeaponIds.has(cDef.evolvesWeaponId)) {
            weight = 4;
          }
        }
        break;
      case 'new_catalyst': {
        weight = 1.5 * catalystAffinityMul;
        // Higher weight if this catalyst evolves a weapon we have
        const cDef = CATALYSTS.find((c) => c.id === choice.catalystId);
        if (cDef && heldWeaponIds.has(cDef.evolvesWeaponId)) {
          weight = 4 * catalystAffinityMul; // Evolution synergy
        }
        break;
      }
      case 'new_passive':
        weight = 1.5;
        break;
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
 * v1.3: A weapon evolves when it reaches level 8 and the player holds
 * the matching catalyst at level 3.
 * Returns the evolution to perform (including consumed catalyst), or null.
 */
export function checkEvolution(
  weapons: WeaponState[],
  catalysts: CatalystState[],
): { weaponId: string; evolvedId: string; consumedCatalystId: string } | null {
  const catalystMap = new Map(catalysts.map((c) => [c.catalystId, c.level]));

  for (const w of weapons) {
    if (w.level >= MAX_WEAPON_LEVEL && !w.evolved) {
      const wDef = WEAPONS.find((d) => d.id === w.weaponId);
      if (wDef?.evolutionCatalystId && wDef.evolvedWeaponId) {
        const catalystLevel = catalystMap.get(wDef.evolutionCatalystId);
        if (catalystLevel !== undefined && catalystLevel >= MAX_CATALYST_LEVEL) {
          return {
            weaponId: w.weaponId,
            evolvedId: wDef.evolvedWeaponId,
            consumedCatalystId: wDef.evolutionCatalystId,
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
  catalysts: CatalystState[],
  banishedIds: Set<string>,
  extraChoice: boolean,
  catalystAffinityPct: number = 0,
): UpgradeChoice[] {
  return generateUpgradeChoices(weapons, passives, catalysts, banishedIds, extraChoice, catalystAffinityPct);
}
