/**
 * Temple of Joy — Game Engine
 * Pure computation functions for deriving game state values.
 */
import type { GameState, SourceId, RelicId, TimedBuff } from './types';
import { SOURCES, SOURCE_MAP, INITIAL_SOURCES } from './data/sources';
import { UPGRADES, UPGRADE_MAP } from './data/upgrades';
import { SYNERGIES } from './data/synergies';
import { MILESTONES } from './data/milestones';
import { ASCENSION_UPGRADES } from './data/ascension';

// ─── Ascension (meta-prestige) ────────────────────────────────────────────────

/** Prestige count required for the player's next Ascension. */
export function computeAscensionPrestigeReq(state: GameState): number {
  let discount = 0;
  for (const up of ASCENSION_UPGRADES) {
    if (state.ascensionUpgrades.has(up.id) && up.ascensionDiscount) {
      discount = Math.min(0.75, discount + up.ascensionDiscount);
    }
  }
  const base = 15 + state.ascensionCount * 8;
  return Math.max(5, Math.ceil(base * (1 - discount)));
}

export function computeCanAscend(state: GameState): boolean {
  return state.prestigeCount >= computeAscensionPrestigeReq(state);
}

/** Radiance earned if the player Ascends right now. */
export function computeRadianceGain(state: GameState): number {
  if (!computeCanAscend(state)) return 0;
  const fromPrestige = Math.pow(Math.max(0, state.prestigeCount) / 12, 1.4);
  const fromLifetime = Math.max(0, Math.log10(Math.max(1, state.lifetimeHappiness)) - 13);
  let gain = 1 + fromPrestige + fromLifetime;
  for (const up of ASCENSION_UPGRADES) {
    if (state.ascensionUpgrades.has(up.id) && up.radianceGainMultiplier) gain *= up.radianceGainMultiplier;
  }
  return Math.max(1, Math.floor(gain));
}

/** Permanent global HPS multiplier from Radiance + ascension upgrades. */
export function computeAscensionMultiplier(state: GameState): number {
  // Each point of Radiance is a flat +3% (linear, predictable).
  let m = 1 + 0.03 * state.radiance;
  for (const up of ASCENSION_UPGRADES) {
    if (state.ascensionUpgrades.has(up.id) && up.globalHPSMultiplier) m *= up.globalHPSMultiplier;
  }
  return m;
}

export function computeAscensionHPCMultiplier(state: GameState): number {
  let m = 1;
  for (const up of ASCENSION_UPGRADES) {
    if (state.ascensionUpgrades.has(up.id) && up.hpcMultiplier) m *= up.hpcMultiplier;
  }
  return m;
}

export function computeAscensionOfflineBonus(state: GameState): number {
  let bonus = 0;
  for (const up of ASCENSION_UPGRADES) {
    if (state.ascensionUpgrades.has(up.id) && up.offlineEfficiencyBonus) bonus += up.offlineEfficiencyBonus;
  }
  return bonus;
}

export function computeAscensionBonusRelicSlots(state: GameState): number {
  let slots = 0;
  for (const up of ASCENSION_UPGRADES) {
    if (state.ascensionUpgrades.has(up.id) && up.bonusRelicSlots) slots += up.bonusRelicSlots;
  }
  return slots;
}

export function computeAscensionStartingShards(state: GameState): number {
  let shards = 0;
  for (const up of ASCENSION_UPGRADES) {
    if (state.ascensionUpgrades.has(up.id) && up.startingShards) shards = Math.max(shards, up.startingShards);
  }
  return shards;
}

// ─── Transcendence ────────────────────────────────────────────────────────────

export function computeTranscendenceThreshold(prestigeCount: number): number {
  return 1e13 * Math.pow(8, prestigeCount);
}

export function computeBlissShards(state: GameState): number {
  if (state.happiness <= 0 && state.prestigeCount === 0) return 0;

  // Base shards from number of times transcended
  // cosmicDividend wheel: +20 base per prestige instead of +10
  const perPrestige = state.wheelPurchased.has('cosmicDividend') ? 20 : 10;
  let shards = 10 + (state.prestigeCount * perPrestige);

  // Small bonus from current happiness balance
  shards += Math.floor(Math.log10(Math.max(1, state.happiness)));

  // infiniteWheel wheel: 15% bonus
  if (state.wheelPurchased.has('infiniteWheel')) {
    shards = Math.floor(shards * 1.15);
  }

  // eternalReturn wheel: ×1.25 shard yield
  if (state.wheelPurchased.has('eternalReturn')) {
    shards = Math.floor(shards * 1.25);
  }

  // infiniteWheel2 wheel: ×2.0 shard yield
  if (state.wheelPurchased.has('infiniteWheel2')) {
    shards = Math.floor(shards * 2.0);
  }

  // alchemistsFlask relic: +20% shard yield
  if (state.activeRelics.includes('alchemistsFlask')) {
    shards = Math.floor(shards * 1.2);
  }

  return Math.max(1, shards);
}

// ─── Source Costs ───────────────────────────────────────────────────────────

export function computeSourceCost(
  SourceId: SourceId,
  owned: number,
  state: GameState
): number {
  const def = SOURCE_MAP[SourceId];
  const multiplier = def.costMultiplier ?? 1.15;
  let cost = def.baseCost * Math.pow(multiplier, owned);
  if (state.wheelPurchased.has('earlyWarmth')) cost *= 0.95;
  if (state.wheelPurchased.has('heavensInfrastructure')) cost *= 0.9;
  // holyInfrastructure wheel: −25% source costs
  if (state.wheelPurchased.has('holyInfrastructure')) cost *= 0.75;
  // celestialArchitect wheel: −50% source costs
  if (state.wheelPurchased.has('celestialArchitect')) cost *= 0.5;
  return Math.floor(cost);
}

/** Total cost of buying n sources starting from currentOwned. */
export function computeSourceCostN(
  SourceId: SourceId,
  ownedNow: number,
  n: number,
  state: GameState,
): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += computeSourceCost(SourceId, ownedNow + i, state);
  }
  return total;
}

/** Max sources affordable with current happiness. */
export function computeMaxAffordable(
  SourceId: SourceId,
  state: GameState,
): number {
  let budget = state.happiness;
  const owned = state.sources[SourceId] ?? 0;
  let bought = 0;
  while (bought < 10_000) {
    const cost = computeSourceCost(SourceId, owned + bought, state);
    if (budget < cost) break;
    budget -= cost;
    bought++;
  }
  return bought;
}

// ─── Multipliers ──────────────────────────────────────────────────────────────

export function computeSynergyMultiplier(SourceId: SourceId, state: GameState): number {
  let product = 1.0;
  for (const synergy of SYNERGIES) {
    if (!synergy.targetSources.includes(SourceId)) continue;
    const requirementsMet = (
      Object.entries(synergy.requirements) as [SourceId, number][]
    ).every(([reqId, reqCount]) => (state.sources[reqId] ?? 0) >= reqCount);
    if (requirementsMet) product *= synergy.multiplier;
  }
  return product;
}

export function computeOfferingMultiplier(SourceId: SourceId, state: GameState): number {
  let multiplier = 1.0;
  for (const tier of [1, 2, 3] as const) {
    const upgradeId = `${SourceId}Offering${tier}`;
    if (state.upgrades.has(upgradeId)) {
      const def = UPGRADE_MAP[upgradeId];
      if (def?.sourceMultiplier) multiplier *= def.sourceMultiplier;
    }
  }
  return multiplier;
}

// ─── HPS ──────────────────────────────────────────────────────────────────────

export function computeSourceHPS(SourceId: SourceId, state: GameState): number {
  const owned = state.sources[SourceId] ?? 0;
  if (owned === 0) return 0;
  const def = SOURCE_MAP[SourceId];
  let hps = def.baseHPS * owned;
  // Apply upgrade multipliers (skip offerings — handled by computeOfferingMultiplier)
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.path === 'offering') continue;
    if (!upgrade.targetSources?.includes(SourceId)) continue;
    if (upgrade.sourceMultiplier) hps *= upgrade.sourceMultiplier;
  }
  hps *= computeSynergyMultiplier(SourceId, state);
  hps *= computeOfferingMultiplier(SourceId, state);
  // bubbleTeaCard relic: Sweet Treat HPS ×3
  if (SourceId === 'sweetTreat' && state.activeRelics.includes('bubbleTeaCard')) hps *= 3;
  // stuffedPillow relic: ×3 Nap Pod HPS
  if (SourceId === 'napPod' && state.activeRelics.includes('stuffedPillow')) hps *= 3;
  // goldenFork relic: ×4 Feast Hall HPS, ×2 Snack Bar HPS
  if (SourceId === 'feastHall' && state.activeRelics.includes('goldenFork')) hps *= 4;
  if (SourceId === 'snackBar' && state.activeRelics.includes('goldenFork')) hps *= 2;
  // lighthouseOfJoy relic: ×3 for post-prestige sources
  if (state.activeRelics.includes('lighthouseOfJoy')) {
    const def = SOURCE_MAP[SourceId];
    if (def.requiresPrestige && def.requiresPrestige >= 1) hps *= 3;
  }
  // perpetualTeapot relic: ×2 Snack Bar, Sweet Treat, Feast Hall
  if (state.activeRelics.includes('perpetualTeapot')) {
    if (['snackBar', 'feastHall', 'sweetTreat'].includes(SourceId)) hps *= 2;
  }
  // mirrorOfTruth relic: ×2 Therapy & Gratitude Journal
  if (state.activeRelics.includes('mirrorOfTruth')) {
    if (SourceId === 'therapy' || SourceId === 'gratitudeJournal') hps *= 2;
  }
  // gardenersGlove relic: ×5 Zen Garden, ×2 Echo Garden
  if (state.activeRelics.includes('gardenersGlove')) {
    if (SourceId === 'zenGarden') hps *= 5;
    if (SourceId === 'echoGarden') hps *= 2;
  }
  // dreamCatcher relic: ×4 Dream Weaver, ×2 Memory Palace
  if (state.activeRelics.includes('dreamCatcher')) {
    if (SourceId === 'dreamWeaver') hps *= 4;
    if (SourceId === 'memoryPalace') hps *= 2;
  }
  // cosmicTeaCup relic: ×3 Ambrosia Tap, Celestial Bath
  if (state.activeRelics.includes('cosmicTeaCup')) {
    if (SourceId === 'ambrosiaTap' || SourceId === 'celestialBath') hps *= 3;
  }
  return hps;
}

export function computeTotalHPS(state: GameState): number {
  let hps = 0;

  // 1. Sum per-source HPS
  for (const source of SOURCES) {
    hps += computeSourceHPS(source.id, state);
  }

  // 2. Apply global upgrade multipliers
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.globalHPSMultiplier) hps *= upgrade.globalHPSMultiplier;
  }

  // 3. Rest-mastery multipliers (always applied — clicking never reduces HPS)
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.idleHPSMultiplier) hps *= upgrade.idleHPSMultiplier;
  }
  // laurelCrown relic: ×2 HPS
  if (state.activeRelics.includes('laurelCrown')) hps *= 2;
  // silkRobe relic: ×2 rest-mastery bonus
  if (state.activeRelics.includes('silkRobe')) hps *= 2;
  // warmBlanket relic: ×1.25 global HPS
  if (state.activeRelics.includes('warmBlanket')) hps *= 1.25;

  // 4. Active timed buffs
  for (const buff of state.activeBuffs) {
    hps *= buff.hpsMultiplier;
  }

  // 5. Vibe buff
  if (state.vibeBuff) hps *= state.vibeBuff.hpsMultiplier;

  // 6. Permanent HPS bonus (additive %)
  hps *= 1 + state.permanentHPSBonus;

  // 7. Samsara's Gift: +5% per stack
  hps *= 1 + 0.05 * state.samsaraGiftStacks;

  // 8. Temple Eternal wheel upgrade
  if (state.wheelPurchased.has('templeEternal')) hps *= 10;

  // 9. Sacred Ledger relic: grows with time on page
  // ancientHourglass relic: doubles ramp speed (×0.2/min instead of ×0.1/min)
  if (state.activeRelics.includes('sacredLedger')) {
    const minutesOpen = (Date.now() - state.pageOpenTime) / 60_000;
    const rampRate = state.activeRelics.includes('ancientHourglass') ? 0.2 : 0.1;
    hps *= 1 + Math.min(minutesOpen * rampRate, 4.0);
  }

  // 10. Hymnal of Excess relic: each source adds bonus proportional to count
  if (state.activeRelics.includes('hymnalOfExcess')) {
    for (const source of SOURCES) {
      const owned = state.sources[source.id] ?? 0;
      if (owned === 0) continue;
      const rawHPS = computeSourceHPS(source.id, state);
      hps += rawHPS * (Math.pow(1.01, owned) - 1);
    }
  }

  // 11. Confession Booth relic: scales with bliss shards
  if (state.activeRelics.includes('confessionBooth')) {
    hps *= 1 + 0.05 * state.blissShards;
  }

  // 12. cozyPlaylist relic: +15% global HPS
  if (state.activeRelics.includes('cozyPlaylist')) hps *= 1.15;

  // 13. Milestone bonuses (flat hpsBonus + multiplicative hpsMultiplier)
  for (const milestone of MILESTONES) {
    if (!state.milestones.has(milestone.id)) continue;
    if (milestone.hpsBonus) hps += milestone.hpsBonus;
    if (milestone.hpsMultiplier) {
      let mult = milestone.hpsMultiplier;
      // karmaResonator relic: milestones grant ×1.5 bonus
      if (state.activeRelics.includes('karmaResonator')) mult = 1 + (mult - 1) * 1.5;
      hps *= mult;
    }
  }

  // 14. infiniteGratitude relic: +2% HPS per prestige count
  if (state.activeRelics.includes('infiniteGratitude') && state.prestigeCount > 0) {
    hps *= 1 + 0.02 * state.prestigeCount;
  }

  // 15. beginnersBliss wheel: +50 flat HPS
  if (state.wheelPurchased.has('beginnersBliss')) hps += 50;

  // 16. philosophersStone relic: ×2 all multipliers (skipped if omegaRelic is active)
  if (state.activeRelics.includes('philosophersStone') && !state.activeRelics.includes('omegaRelic')) hps *= 2;

  // 17. New wheel HPS multipliers
  if (state.wheelPurchased.has('singularityEngine')) hps *= 50;
  if (state.wheelPurchased.has('nirvanaEngine')) hps *= 500;
  if (state.wheelPurchased.has('dimensionalRift')) hps *= 5000;
  if (state.wheelPurchased.has('theGrandDesign')) hps *= 100000;
  if (state.wheelPurchased.has('theLastSmile')) hps *= 1000000;

  // 18. templeComplete wheel: +10% HPS per achievement
  if (state.wheelPurchased.has('templeComplete')) {
    hps *= 1 + 0.1 * state.achievements.size;
  }

  // 19. astronomersLens relic: milestones threshold ÷10 (handled in tick.ts milestone check)
  // No HPS effect here — the relic makes milestones unlock earlier.

  // 20. starChart relic: +3% HPS per prestige count
  if (state.activeRelics.includes('starChart') && state.prestigeCount > 0) {
    hps *= 1 + 0.03 * state.prestigeCount;
  }

  // 21. ancientHourglass relic: doubles sacredLedger ramp (handled in sacredLedger block above)
  // No separate HPS effect.

  // 22. soulLantern relic: +0.5% HPS per source copy owned
  if (state.activeRelics.includes('soulLantern')) {
    const totalOwned = Object.values(state.sources).reduce((sum, n) => sum + (n ?? 0), 0);
    hps *= 1 + 0.005 * totalOwned;
  }

  // 23. cosmicTeaCup relic: per-source ×3 handled in computeSourceHPS
  // No global HPS effect.

  // 24. infinityScarf relic: +5% HPS per equipped relic
  if (state.activeRelics.includes('infinityScarf')) {
    hps *= 1 + 0.05 * state.activeRelics.length;
  }

  // 25. omegaRelic: ×3 all HPS (replaces philosophersStone)
  if (state.activeRelics.includes('omegaRelic')) hps *= 3;

  // 26. goldenPen relic: +20% per event resolved, capped at +100%
  if (state.activeRelics.includes('goldenPen')) {
    hps *= 1 + Math.min(0.20 * state.totalEventsResolved, 1.0);
  }

  // 27. Ascension: permanent meta multiplier (Radiance + ascension upgrades)
  hps *= computeAscensionMultiplier(state);

  return hps;
}

/**
 * Computes the stable "Global Mult" for display.
 * Excludes volatile / temporary effects (timed buffs, vibe buff, Sacred Ledger)
 * so the displayed number doesn't randomly fluctuate.
 */
export function computeGlobalHPSMultiplier(state: GameState): number {
  let multiplier = 1.0;

  // Global upgrade multipliers
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.globalHPSMultiplier) multiplier *= upgrade.globalHPSMultiplier;
  }

  // Rest-mastery multipliers (always applied — clicking never reduces HPS)
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.idleHPSMultiplier) multiplier *= upgrade.idleHPSMultiplier;
  }
  if (state.activeRelics.includes('laurelCrown')) multiplier *= 2;
  if (state.activeRelics.includes('silkRobe')) multiplier *= 2;
  if (state.activeRelics.includes('warmBlanket')) multiplier *= 1.25;

  // NOTE: activeBuffs, vibeBuff, and sacredLedger are EXCLUDED from this
  // display multiplier. They are temporary / time-varying effects and
  // including them causes the "Global Mult" readout to fluctuate randomly.
  // They still affect actual HPS via computeTotalHPS().

  // Permanent HPS bonus
  multiplier *= 1 + state.permanentHPSBonus;

  // Samsara's Gift
  multiplier *= 1 + 0.05 * state.samsaraGiftStacks;

  // Temple Eternal wheel
  if (state.wheelPurchased.has('templeEternal')) multiplier *= 10;

  // cozyPlaylist relic: +15% global HPS
  if (state.activeRelics.includes('cozyPlaylist')) multiplier *= 1.15;

  // Milestone bonuses
  for (const milestone of MILESTONES) {
    if (!state.milestones.has(milestone.id)) continue;
    if (milestone.hpsMultiplier) {
      let mult = milestone.hpsMultiplier;
      if (state.activeRelics.includes('karmaResonator')) mult = 1 + (mult - 1) * 1.5;
      multiplier *= mult;
    }
  }

  // infiniteGratitude relic: +2% per prestige
  if (state.activeRelics.includes('infiniteGratitude') && state.prestigeCount > 0) {
    multiplier *= 1 + 0.02 * state.prestigeCount;
  }

  // philosophersStone (skipped if omegaRelic active)
  if (state.activeRelics.includes('philosophersStone') && !state.activeRelics.includes('omegaRelic')) multiplier *= 2;

  // Wheel HPS multipliers
  if (state.wheelPurchased.has('singularityEngine')) multiplier *= 50;
  if (state.wheelPurchased.has('nirvanaEngine')) multiplier *= 500;
  if (state.wheelPurchased.has('dimensionalRift')) multiplier *= 5000;
  if (state.wheelPurchased.has('theGrandDesign')) multiplier *= 100000;
  if (state.wheelPurchased.has('theLastSmile')) multiplier *= 1000000;

  // templeComplete: +10% HPS per achievement
  if (state.wheelPurchased.has('templeComplete')) {
    multiplier *= 1 + 0.1 * state.achievements.size;
  }

  // starChart relic: +3% per prestige
  if (state.activeRelics.includes('starChart') && state.prestigeCount > 0) {
    multiplier *= 1 + 0.03 * state.prestigeCount;
  }

  // soulLantern relic: +0.5% per source copy
  if (state.activeRelics.includes('soulLantern')) {
    const totalOwned = Object.values(state.sources).reduce((sum, n) => sum + (n ?? 0), 0);
    multiplier *= 1 + 0.005 * totalOwned;
  }

  // infinityScarf relic: +5% per equipped relic
  if (state.activeRelics.includes('infinityScarf')) {
    multiplier *= 1 + 0.05 * state.activeRelics.length;
  }

  // omegaRelic: ×3 all (replaces philosophersStone)
  if (state.activeRelics.includes('omegaRelic')) multiplier *= 3;

  // goldenPen relic: +20% per event resolved, capped at +100%
  if (state.activeRelics.includes('goldenPen')) {
    multiplier *= 1 + Math.min(0.20 * state.totalEventsResolved, 1.0);
  }

  // Ascension: permanent meta multiplier (Radiance + ascension upgrades)
  multiplier *= computeAscensionMultiplier(state);

  // Note: Hymnal of Excess and Confession Booth add flat HPS, not multiplicative
  // so we don't include them here

  return multiplier;
}

// ─── HPC ──────────────────────────────────────────────────────────────────────

export function computeHPC(state: GameState): number {
  let base = 1;
  let bonus = 0;
  let multiplier = 1;

  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.hpcBonus) bonus += upgrade.hpcBonus;
    if (upgrade.hpcMultiplier) multiplier *= upgrade.hpcMultiplier;
  }

  base = (base + bonus) * multiplier;

  // The Second Smile wheel
  if (state.wheelPurchased.has('theSecondSmile')) base *= 2;

  // Enlightened Clicker wheel (skipped if ascendedClicker purchased — ascended replaces it)
  if (state.wheelPurchased.has('enlightenedClicker') && !state.wheelPurchased.has('ascendedClicker')) {
    base *= 1 + 0.1 * state.prestigeCount;
  }

  // ascendedClicker wheel: replaces enlightenedClicker with ×(1 + 0.25 × prestige)
  if (state.wheelPurchased.has('ascendedClicker')) {
    base *= 1 + 0.25 * state.prestigeCount;
  }

  // Permanent HPC bonus
  base *= 1 + state.permanentHPCBonus;

  // philosophersStone relic: ×2 all multipliers (skipped if omegaRelic is active)
  if (state.activeRelics.includes('philosophersStone') && !state.activeRelics.includes('omegaRelic')) base *= 2;

  // Ascension: permanent click multiplier
  base *= computeAscensionHPCMultiplier(state);

  return Math.max(1, base);
}

// ─── Karma ────────────────────────────────────────────────────────────────────

export function computeKarmaRate(state: GameState): number {
  let rate = 0.01;
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.karmaRateMultiplier) rate *= upgrade.karmaRateMultiplier;
  }
  // Karma Dividend wheel: ×5 if prestigeCount >= 3
  if (state.wheelPurchased.has('karmicDividend') && state.prestigeCount >= 3) {
    rate *= 5;
  }
  // karmaTithe wheel: +0.001 per source owned
  if (state.wheelPurchased.has('karmaTithe')) {
    const totalOwned = Object.values(state.sources).reduce((sum, n) => sum + (n ?? 0), 0);
    rate += 0.001 * totalOwned;
  }
  // zenBell relic: +1 flat karma/s
  if (state.activeRelics.includes('zenBell')) rate += 1;
  // karmaResonator relic: ×2 karma gain rate
  if (state.activeRelics.includes('karmaResonator')) rate *= 2;
  // karmicOverflow wheel: ×10 karma rate
  if (state.wheelPurchased.has('karmicOverflow')) rate *= 10;
  // karmicResonance wheel: ×25 karma rate
  if (state.wheelPurchased.has('karmicResonance')) rate *= 25;
  // theThirdEye wheel: ×2 karma rate
  if (state.wheelPurchased.has('theThirdEye')) rate *= 2;
  // karmicAscension wheel: ×100 karma rate
  if (state.wheelPurchased.has('karmicAscension')) rate *= 100;
  return rate;
}

// ─── Source Availability ────────────────────────────────────────────────────

/** Returns effective prestige requirement for a source, accounting for eternalFoundation. */
export function computeSourcePrestigeReq(SourceId: SourceId, state: GameState): number {
  const def = SOURCE_MAP[SourceId];
  if (!def.requiresPrestige) return 0;
  let req = def.requiresPrestige;
  // eternalFoundation wheel: post-prestige sources unlock 1 prestige earlier
  if (state.wheelPurchased.has('eternalFoundation')) req = Math.max(1, req - 1);
  return req;
}

// ─── Derived States ───────────────────────────────────────────────────────────

export function computeEffectiveSatisfaction(state: GameState): number {
  return Math.max(0, state.happiness - state.baselineHappiness);
}

export function computeIsIdle(state: GameState): boolean {
  // Tolerant idle detection: occasional clicks don't break idle status.
  // Player is "active" only if they've clicked 5+ times in the last 10 seconds.
  const now = Date.now();
  const recentClicks = state.recentClickTimes.filter(t => now - t <= 10_000).length;
  return recentClicks < 5;
}

export function computeCanTranscend(state: GameState): boolean {
  return state.runHappiness >= computeTranscendenceThreshold(state.prestigeCount);
}

// ─── Upgrade Queries ──────────────────────────────────────────────────────────

export function computeUpgradeCost(upgradeId: string, state: GameState): number {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return Infinity;
  let cost = def.cost;
  if (def.path === 'philosophy' && state.activeRelics.includes('epicurusRing')) {
    cost *= 0.5;
  }
  // goldenPen relic: −15% upgrade costs globally
  if (state.activeRelics.includes('goldenPen')) cost *= 0.85;
  // karmicAscension wheel: relics cost 50% less (handled in actions, not here for upgrades)
  return cost;
}

export function computeIsUpgradeVisible(upgradeId: string, state: GameState): boolean {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return false;
  if (def.requiresPrestige !== undefined) {
    let req = def.requiresPrestige;
    // eternalFoundation wheel: post-prestige upgrades unlock 1 prestige earlier
    if (state.wheelPurchased.has('eternalFoundation')) req = Math.max(1, req - 1);
    if (state.prestigeCount < req) return false;
  }
  if (def.postPrestige && state.prestigeCount < 1) return false;
  if (def.requiresAscension !== undefined && state.ascensionCount < def.requiresAscension) return false;
  if (def.requiresUpgrade && !state.upgrades.has(def.requiresUpgrade)) return false;
  if (def.requiresSource) {
    const met = (Object.entries(def.requiresSource) as [SourceId, number][]).every(
      ([bid, count]) => (state.sources[bid] ?? 0) >= count
    );
    if (!met) return false;
  }
  // Only show once player has reached at least 1/10th of the cost (sticky — uses peak)
  const cost = computeUpgradeCost(upgradeId, state);
  if (state.peakHappiness < cost * 0.1) return false;
  return true;
}

export function computeIsUpgradeAffordable(upgradeId: string, state: GameState): boolean {
  return state.happiness >= computeUpgradeCost(upgradeId, state);
}

// ─── Wheel Starting Bonuses ───────────────────────────────────────────────────

/** The first 5 sources (by index) used for deepRoots calculation. */
const DEEP_ROOTS_SOURCE_IDS: SourceId[] = [
  'moodCandle',
  'napPod',
  'snackBar',
  'sweetTreat',
  'hotTub',
];

/**
 * Returns the total starting HPS bonus granted by prestige wheel upgrades.
 * Used when constructing initial state after transcendence.
 */
export function computeStartingHPSFromWheel(
  state: Pick<GameState, 'wheelPurchased' | 'prestigeCount' | 'sources' | 'upgrades'>
): number {
  let bonus = 0;

  if (state.wheelPurchased.has('beginnersBliss')) bonus += 50;

  if (state.wheelPurchased.has('deepRoots')) {
    // Simulate 5 copies of the first 5 sources
    const fakeSources: Record<SourceId, number> = {
      ...INITIAL_SOURCES,
      moodCandle: 5,
      napPod: 5,
      snackBar: 5,
      sweetTreat: 5,
      hotTub: 5,
    };
    const fakeState: GameState = {
      happiness: 0,
      lifetimeHappiness: 0,
      peakHappiness: Infinity,     // prevent unlock threshold from hiding upgrades in fake state
      peakKarma: Infinity,
      karma: 0,
      blissShards: 0,
      sources: fakeSources,
      upgrades: state.upgrades,
      activeRelics: [] as RelicId[],
      maxRelicSlots: 0,
      equippedRelicsHistory: [] as RelicId[],
      prestigeCount: state.prestigeCount,
      wheelPurchased: state.wheelPurchased,
      samsaraGiftStacks: 0,
      radiance: 0,
      lifetimeRadiance: 0,
      ascensionCount: 0,
      ascensionUpgrades: new Set<string>(),
      completedObjectives: new Set<string>(),
      lastSaved: 0,
      lastTickTime: 0,
      totalPlaytime: 0,
      runPlaytime: 0,
      totalClicks: 0,
      totalPilgrimages: 0,
      totalVibeChecks: 0,
      totalEventsResolved: 0,
      totalRituals: 0,
      totalOfferings: 0,
      achievements: new Set<string>(),
      milestones: new Set<string>(),
      pilgrimageStreak: 0,
      epicurusApprovedCount: 0,
      baselineHappiness: 0,
      vibeCheckTimer: 0,
      vibeBuff: null,
      pilgrimageActive: false,
      pilgrimageTimer: 0,
      pilgrimageCooldown: 0,
      ritualCooldown: 0,
      recentClickTimes: [],
      eventTimer: 0,
      pendingEvent: null,
      lastEventEffect: null,
      activeBuffs: [] as TimedBuff[],
      permanentHPSBonus: 0,
      permanentHPCBonus: 0,
      lastClickTime: 0,
      pageOpenTime: 0,
      offlineHappinessOnLoad: 0,
      offlineSecondsOnLoad: 0,
      runHappiness: 0,
      autoBuyTimer: 30,
      theme: 'light',
      numberFormat: 'abbreviated',
      sourceBuyQty: 1,
      soundEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.5,
      autoBuyEnabled: true,
      emberSelections: [],
      activeTab: 'temple',
      upgradePathFilter: 'all',
      showTranscendenceModal: false,
      showOfflineModal: false,
      showEventModal: false,
      gameInitialized: false,
    };
    for (const id of DEEP_ROOTS_SOURCE_IDS) {
      bonus += computeSourceHPS(id, fakeState);
    }
  }

  return bonus;
}
