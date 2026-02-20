/**
 * Temple of Joy — Game Engine
 * Pure computation functions for deriving game state values.
 */
import type { GameState, BuildingId, RelicId, TimedBuff } from './types';
import { BUILDINGS, BUILDING_MAP, INITIAL_BUILDINGS } from './data/buildings';
import { UPGRADES, UPGRADE_MAP } from './data/upgrades';
import { SYNERGIES } from './data/synergies';

// ─── Transcendence ────────────────────────────────────────────────────────────

export function computeTranscendenceThreshold(prestigeCount: number): number {
  return 1e13 * Math.pow(8, prestigeCount);
}

export function computeBlissShards(lifetimeHP: number, wheelPurchased: Set<string>): number {
  if (lifetimeHP <= 0) return 0;
  let shards: number;
  if (wheelPurchased.has('infiniteWheel')) {
    shards = Math.floor(Math.pow(lifetimeHP / 1e11, 0.55));
  } else {
    shards = Math.floor(Math.sqrt(lifetimeHP / 1e11));
  }
  return Math.max(1, shards);
}

// ─── Building Costs ───────────────────────────────────────────────────────────

export function computeBuildingCost(
  buildingId: BuildingId,
  owned: number,
  state: GameState
): number {
  const def = BUILDING_MAP[buildingId];
  const multiplier = def.costMultiplier ?? 1.15;
  let cost = def.baseCost * Math.pow(multiplier, owned);
  if (state.wheelPurchased.has('earlyWarmth')) cost *= 0.95;
  if (state.wheelPurchased.has('heavensInfrastructure')) cost *= 0.9;
  return Math.floor(cost);
}

/** Total cost of buying n buildings starting from currentOwned. */
export function computeBuildingCostN(
  buildingId: BuildingId,
  ownedNow: number,
  n: number,
  state: GameState,
): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += computeBuildingCost(buildingId, ownedNow + i, state);
  }
  return total;
}

/** Max buildings affordable with current happiness. */
export function computeMaxAffordable(
  buildingId: BuildingId,
  state: GameState,
): number {
  let budget = state.happiness;
  const owned = state.buildings[buildingId] ?? 0;
  let bought = 0;
  while (bought < 10_000) {
    const cost = computeBuildingCost(buildingId, owned + bought, state);
    if (budget < cost) break;
    budget -= cost;
    bought++;
  }
  return bought;
}

// ─── Multipliers ──────────────────────────────────────────────────────────────

export function computeSynergyMultiplier(buildingId: BuildingId, state: GameState): number {
  let product = 1.0;
  for (const synergy of SYNERGIES) {
    if (!synergy.targetBuildings.includes(buildingId)) continue;
    const requirementsMet = (
      Object.entries(synergy.requirements) as [BuildingId, number][]
    ).every(([reqId, reqCount]) => (state.buildings[reqId] ?? 0) >= reqCount);
    if (requirementsMet) product *= synergy.multiplier;
  }
  return product;
}

export function computeOfferingMultiplier(buildingId: BuildingId, state: GameState): number {
  let multiplier = 1.0;
  for (const tier of [1, 2, 3] as const) {
    const upgradeId = `${buildingId}Offering${tier}`;
    if (state.upgrades.has(upgradeId)) {
      const def = UPGRADE_MAP[upgradeId];
      if (def?.buildingMultiplier) multiplier *= def.buildingMultiplier;
    }
  }
  return multiplier;
}

// ─── HPS ──────────────────────────────────────────────────────────────────────

export function computeBuildingHPS(buildingId: BuildingId, state: GameState): number {
  const owned = state.buildings[buildingId] ?? 0;
  if (owned === 0) return 0;
  const def = BUILDING_MAP[buildingId];
  let hps = def.baseHPS * owned;
  // Apply upgrade multipliers
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (!upgrade.targetBuildings?.includes(buildingId)) continue;
    if (upgrade.buildingMultiplier) hps *= upgrade.buildingMultiplier;
  }
  hps *= computeSynergyMultiplier(buildingId, state);
  hps *= computeOfferingMultiplier(buildingId, state);
  // bubbleTeaCard relic: Sweet Treat HPS ×3
  if (buildingId === 'sweetTreat' && state.activeRelics.includes('bubbleTeaCard')) hps *= 3;
  return hps;
}

export function computeTotalHPS(state: GameState): number {
  let hps = 0;

  // 1. Sum per-building HPS
  for (const building of BUILDINGS) {
    hps += computeBuildingHPS(building.id, state);
  }

  // 2. Apply global upgrade multipliers
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.globalHPSMultiplier) hps *= upgrade.globalHPSMultiplier;
  }

  // 3. Idle multiplier (no click in last 10 seconds)
  if (computeIsIdle(state)) {
    for (const upgrade of UPGRADES) {
      if (!state.upgrades.has(upgrade.id)) continue;
      if (upgrade.idleHPSMultiplier) hps *= upgrade.idleHPSMultiplier;
    }
    // laurelCrown relic: ×2 when idle
    if (state.activeRelics.includes('laurelCrown')) hps *= 2;
    // warmBlanket relic: removes idle penalty (no-op here — no negative idle modifiers applied)
  }

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
  if (state.activeRelics.includes('sacredLedger')) {
    const minutesOpen = (Date.now() - state.pageOpenTime) / 60_000;
    hps *= 1 + Math.min(minutesOpen * 0.1, 4.0);
  }

  // 10. Hymnal of Excess relic: each building adds bonus proportional to count
  if (state.activeRelics.includes('hymnalOfExcess')) {
    for (const building of BUILDINGS) {
      const owned = state.buildings[building.id] ?? 0;
      if (owned === 0) continue;
      const rawHPS = computeBuildingHPS(building.id, state);
      hps += rawHPS * (Math.pow(1.01, owned) - 1);
    }
  }

  // 11. Confession Booth relic: scales with bliss shards
  if (state.activeRelics.includes('confessionBooth')) {
    hps *= 1 + 0.05 * state.blissShards;
  }

  // 12. cozyPlaylist relic: +15% global HPS
  if (state.activeRelics.includes('cozyPlaylist')) hps *= 1.15;

  return hps;
}

export function computeGlobalHPSMultiplier(state: GameState): number {
  let multiplier = 1.0;

  // Global upgrade multipliers
  for (const upgrade of UPGRADES) {
    if (!state.upgrades.has(upgrade.id)) continue;
    if (upgrade.globalHPSMultiplier) multiplier *= upgrade.globalHPSMultiplier;
  }

  // Idle multiplier
  if (computeIsIdle(state)) {
    for (const upgrade of UPGRADES) {
      if (!state.upgrades.has(upgrade.id)) continue;
      if (upgrade.idleHPSMultiplier) multiplier *= upgrade.idleHPSMultiplier;
    }
    if (state.activeRelics.includes('laurelCrown')) multiplier *= 2;
  }

  // Active timed buffs
  for (const buff of state.activeBuffs) {
    multiplier *= buff.hpsMultiplier;
  }

  // Vibe buff
  if (state.vibeBuff) multiplier *= state.vibeBuff.hpsMultiplier;

  // Permanent HPS bonus
  multiplier *= 1 + state.permanentHPSBonus;

  // Samsara's Gift
  multiplier *= 1 + 0.05 * state.samsaraGiftStacks;

  // Temple Eternal wheel
  if (state.wheelPurchased.has('templeEternal')) multiplier *= 10;

  // Sacred Ledger relic
  if (state.activeRelics.includes('sacredLedger')) {
    const minutesOpen = (Date.now() - state.pageOpenTime) / 60_000;
    multiplier *= 1 + Math.min(minutesOpen * 0.1, 4.0);
  }

  // cozyPlaylist relic: +15% global HPS
  if (state.activeRelics.includes('cozyPlaylist')) multiplier *= 1.15;

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

  // Enlightened Clicker wheel
  if (state.wheelPurchased.has('enlightenedClicker')) {
    base *= 1 + 0.1 * state.prestigeCount;
  }

  // Permanent HPC bonus
  base *= 1 + state.permanentHPCBonus;

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
  // karmaTithe wheel: +0.001 per building owned
  if (state.wheelPurchased.has('karmaTithe')) {
    const totalOwned = Object.values(state.buildings).reduce((sum, n) => sum + (n ?? 0), 0);
    rate += 0.001 * totalOwned;
  }
  // zenBell relic: +1 flat karma/s
  if (state.activeRelics.includes('zenBell')) rate += 1;
  // karmicOverflow wheel: ×10 karma rate
  if (state.wheelPurchased.has('karmicOverflow')) rate *= 10;
  return rate;
}

// ─── Derived States ───────────────────────────────────────────────────────────

export function computeEffectiveSatisfaction(state: GameState): number {
  return Math.max(0, state.happiness - state.baselineHappiness);
}

export function computeIsIdle(state: GameState): boolean {
  return Date.now() - state.lastClickTime > 10_000;
}

export function computeCanTranscend(state: GameState): boolean {
  return state.lifetimeHappiness >= computeTranscendenceThreshold(state.prestigeCount);
}

// ─── Upgrade Queries ──────────────────────────────────────────────────────────

export function computeUpgradeCost(upgradeId: string, state: GameState): number {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return Infinity;
  let cost = def.cost;
  if (def.path === 'philosophy' && state.activeRelics.includes('epicurusRing')) {
    cost *= 0.5;
  }
  return cost;
}

export function computeIsUpgradeVisible(upgradeId: string, state: GameState): boolean {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return false;
  if (def.requiresPrestige !== undefined && state.prestigeCount < def.requiresPrestige) return false;
  if (def.postPrestige && state.prestigeCount < 1) return false;
  if (def.requiresUpgrade && !state.upgrades.has(def.requiresUpgrade)) return false;
  if (def.requiresBuilding) {
    const met = (Object.entries(def.requiresBuilding) as [BuildingId, number][]).every(
      ([bid, count]) => (state.buildings[bid] ?? 0) >= count
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

/** The first 5 buildings (by index) used for deepRoots calculation. */
const DEEP_ROOTS_BUILDING_IDS: BuildingId[] = [
  'moodCandle',
  'napPod',
  'snackBar',
  'hotTub',
  'massageStudio',
];

/**
 * Returns the total starting HPS bonus granted by prestige wheel upgrades.
 * Used when constructing initial state after transcendence.
 */
export function computeStartingHPSFromWheel(
  state: Pick<GameState, 'wheelPurchased' | 'prestigeCount' | 'buildings' | 'upgrades'>
): number {
  let bonus = 0;

  if (state.wheelPurchased.has('beginnersBliss')) bonus += 50;

  if (state.wheelPurchased.has('deepRoots')) {
    // Simulate 5 copies of the first 5 buildings
    const fakeBuildings: Record<BuildingId, number> = {
      ...INITIAL_BUILDINGS,
      moodCandle: 5,
      napPod: 5,
      snackBar: 5,
      hotTub: 5,
      massageStudio: 5,
    };
    const fakeState: GameState = {
      happiness: 0,
      lifetimeHappiness: 0,
      peakHappiness: Infinity,     // prevent unlock threshold from hiding upgrades in fake state
      peakKarma: Infinity,
      karma: 0,
      blissShards: 0,
      buildings: fakeBuildings,
      upgrades: state.upgrades,
      activeRelics: [] as RelicId[],
      maxRelicSlots: 0,
      prestigeCount: state.prestigeCount,
      wheelPurchased: state.wheelPurchased,
      samsaraGiftStacks: 0,
      lastSaved: 0,
      totalPlaytime: 0,
      totalClicks: 0,
      totalPilgrimages: 0,
      totalVibeChecks: 0,
      totalEventsResolved: 0,
      achievements: new Set<string>(),
      milestones: new Set<string>(),
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
      autoBuyTimer: 30,
      theme: 'light',
      numberFormat: 'abbreviated',
      buildingBuyQty: 1,
      soundEnabled: true,
      soundVolume: 1,
      activeTab: 'temple',
      upgradePathFilter: 'all',
      showTranscendenceModal: false,
      showOfflineModal: false,
      showEventModal: false,
      gameInitialized: false,
    };
    for (const id of DEEP_ROOTS_BUILDING_IDS) {
      bonus += computeBuildingHPS(id, fakeState);
    }
  }

  return bonus;
}
