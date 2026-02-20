/**
 * Temple of Joy — Action Handlers
 * Pure functions that take state + action params and return new state.
 */
import type { GameState, BuildingId, RelicId, TimedBuff } from './types';
import {
  computeHPC,
  computeBuildingCost,
  computeCanTranscend,
  computeBlissShards,
  computeUpgradeCost,
  computeTotalHPS,
} from './engine';
import { BUILDING_MAP, INITIAL_BUILDINGS } from './data/buildings';
import { UPGRADE_MAP } from './data/upgrades';
import { RELIC_MAP } from './data/relics';
import { WHEEL_MAP } from './data/wheel';
import { EVENTS, EVENT_MAP } from './data/events';

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function makeInitialState(
  overrides: Partial<GameState> = {}
): GameState {
  const now = Date.now();
  return {
    happiness: 0,
    lifetimeHappiness: 0,
    peakHappiness: 0,
    peakKarma: 0,
    karma: 0,
    blissShards: 0,
    buildings: { ...INITIAL_BUILDINGS },
    upgrades: new Set<string>(),
    activeRelics: [],
    maxRelicSlots: 3,
    prestigeCount: 0,
    wheelPurchased: new Set<string>(),
    samsaraGiftStacks: 0,
    lastSaved: now,
    totalPlaytime: 0,
    achievements: new Set<string>(),
    milestones: new Set<string>(),
    baselineHappiness: 0,
    vibeCheckTimer: 300,
    vibeBuff: null,
    pilgrimageActive: false,
    pilgrimageTimer: 0,
    pilgrimageCooldown: 0,
    ritualCooldown: 0,
    recentClickTimes: [],
    eventTimer: Math.random() * 600 + 600,
    pendingEvent: null,
    activeBuffs: [],
    permanentHPSBonus: 0,
    permanentHPCBonus: 0,
    lastClickTime: now,
    pageOpenTime: now,
    offlineHappinessOnLoad: 0,
    offlineSecondsOnLoad: 0,
    theme: 'light',
    numberFormat: 'abbreviated',
    soundEnabled: true,
    soundVolume: 1,
    activeTab: 'temple',
    upgradePathFilter: 'all',
    showTranscendenceModal: false,
    showOfflineModal: false,
    showEventModal: false,
    gameInitialized: false,
    ...overrides,
  };
}

function grantAchievement(state: GameState, id: string): GameState {
  if (state.achievements.has(id)) return state;
  return { ...state, achievements: new Set([...state.achievements, id]) };
}

// ─── Click ────────────────────────────────────────────────────────────────────

export function doClick(state: GameState): GameState {
  const hpc = computeHPC(state);
  const incenseBonus = state.activeRelics.includes('incenseOfAncients') ? 2 : 1;
  const now = Date.now();

  // Update recent click times (filter to last 3 seconds)
  const updatedClickTimes = [...state.recentClickTimes, now].filter(
    (t) => now - t <= 3000
  );

  const ritualThreshold = state.wheelPurchased.has('ritualMastery') ? 5 : 7;

  let happinessGained: number;
  let newRitualCooldown = state.ritualCooldown;
  let finalClickTimes = updatedClickTimes;

  if (updatedClickTimes.length >= ritualThreshold && state.ritualCooldown <= 0) {
    // Ritual triggered: bonus burst
    happinessGained = hpc * 7 * incenseBonus;
    newRitualCooldown = state.wheelPurchased.has('ritualMastery') ? 15 : 30;
    finalClickTimes = [];
  } else {
    happinessGained = hpc * incenseBonus;
  }

  const newHappiness = state.happiness + happinessGained;
  const newLifetimeHappiness = state.lifetimeHappiness + happinessGained;
  const newPeakHappiness = Math.max(state.peakHappiness, newHappiness);

  let newState: GameState = {
    ...state,
    happiness: newHappiness,
    lifetimeHappiness: newLifetimeHappiness,
    peakHappiness: newPeakHappiness,
    lastClickTime: now,
    recentClickTimes: finalClickTimes,
    ritualCooldown: newRitualCooldown,
  };

  // Achievement: first click (proxy: lifetime was 0 before this click)
  if (state.lifetimeHappiness === 0 && happinessGained > 0) {
    newState = grantAchievement(newState, 'firstClick');
  }

  return newState;
}

// ─── Buy Building ─────────────────────────────────────────────────────────────

export function doBuyBuilding(state: GameState, buildingId: BuildingId): GameState {
  const cost = computeBuildingCost(buildingId, state.buildings[buildingId], state);
  if (state.happiness < cost) return state;

  const newOwned = state.buildings[buildingId] + 1;
  let newState: GameState = {
    ...state,
    happiness: state.happiness - cost,
    buildings: { ...state.buildings, [buildingId]: newOwned },
  };

  // Building-specific achievements
  if (buildingId === 'moodCandle' && newOwned === 1) newState = grantAchievement(newState, 'firstCandle');
  if (buildingId === 'goonCave' && newOwned === 1) newState = grantAchievement(newState, 'caveDweller');
  if (buildingId === 'blissSingularity' && newOwned === 1) newState = grantAchievement(newState, 'singularity');

  // allBuildings: every building type owned >= 1
  const allBuildings = Object.values(newState.buildings).every((count) => count >= 1);
  if (allBuildings) newState = grantAchievement(newState, 'allBuildings');

  // tenOfEach: every building type owned >= 10
  const tenOfEach = Object.values(newState.buildings).every((count) => count >= 10);
  if (tenOfEach) newState = grantAchievement(newState, 'tenOfEach');

  // fiftyOfOne: any single building >= 50
  if (newOwned >= 50) newState = grantAchievement(newState, 'fiftyOfOne');

  return newState;
}
export function doBuyBuildingN(state: GameState, buildingId: BuildingId, n: number): GameState {
  let current = state;
  for (let i = 0; i < n; i++) {
    const next = doBuyBuilding(current, buildingId);
    if (next === current) break; // can't afford more
    current = next;
  }
  return current;
}
// ─── Purchase Upgrade ─────────────────────────────────────────────────────────

export function doPurchaseUpgrade(state: GameState, upgradeId: string): GameState {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return state;
  if (state.upgrades.has(upgradeId)) return state;

  const cost = computeUpgradeCost(upgradeId, state);
  if (state.happiness < cost) return state;

  const newUpgrades = new Set(state.upgrades);
  newUpgrades.add(upgradeId);

  let newState: GameState = {
    ...state,
    happiness: state.happiness - cost,
    upgrades: newUpgrades,
  };

  // One-time karma bonus from upgrade
  if (def.karmaBonus) {
    newState = { ...newState, karma: newState.karma + def.karmaBonus };
  }

  return newState;
}

// ─── Relics ───────────────────────────────────────────────────────────────────

export function doEquipRelic(state: GameState, relicId: RelicId): GameState {
  const def = RELIC_MAP[relicId];
  if (!def) return state;
  if (state.karma < def.karmaCost) return state;
  if (state.activeRelics.includes(relicId)) return state;
  if (state.activeRelics.length >= state.maxRelicSlots) return state;

  let newState: GameState = {
    ...state,
    karma: state.karma - def.karmaCost,
    activeRelics: [...state.activeRelics, relicId],
  };

  newState = grantAchievement(newState, 'firstRelic');
  return newState;
}

export function doUnequipRelic(state: GameState, relicId: RelicId): GameState {
  if (!state.activeRelics.includes(relicId)) return state;
  const def = RELIC_MAP[relicId];
  const refund = def ? Math.floor(def.karmaCost / 2) : 0;
  return {
    ...state,
    karma: state.karma + refund,
    activeRelics: state.activeRelics.filter((id) => id !== relicId),
  };
}

// ─── Pilgrimage ───────────────────────────────────────────────────────────────

export function doTriggerPilgrimage(state: GameState): GameState {
  if (state.pilgrimageActive || state.pilgrimageCooldown > 0) return state;

  let newState: GameState = {
    ...state,
    pilgrimageActive: true,
    pilgrimageTimer: 120,
    lastClickTime: Date.now(), // prevent idle bonus triggering mid-pilgrimage
  };

  newState = grantAchievement(newState, 'pilgrimageFirst');
  return newState;
}

/** Helper: returns whether a pilgrimage can currently be started. */
export function doMakePilgrimageReady(state: GameState): boolean {
  return !state.pilgrimageActive && state.pilgrimageCooldown <= 0;
}

// ─── Vibe Check ───────────────────────────────────────────────────────────────

export function doPassVibeCheck(state: GameState): GameState {
  const multiplier = state.activeRelics.includes('vibeCrystal') ? 2.3 : 1.15;
  const vibeBuff: TimedBuff = {
    id: 'vibe',
    hpsMultiplier: multiplier,
    remainingSeconds: 60,
  };

  // Reset timer to 180–420 seconds
  const newVibeCheckTimer = Math.random() * 240 + 180;

  let newState: GameState = {
    ...state,
    vibeBuff,
    vibeCheckTimer: newVibeCheckTimer,
  };

  newState = grantAchievement(newState, 'vibeCheck');
  return newState;
}

// ─── Transcendence ────────────────────────────────────────────────────────────

export function doTriggerTranscendence(state: GameState): GameState {
  if (!computeCanTranscend(state)) return state;

  const shardsEarned = computeBlissShards(state.lifetimeHappiness, state.wheelPurchased);
  const newBlissShards = state.blissShards + shardsEarned;
  const newPrestigeCount = state.prestigeCount + 1;
  const newSamsaraGiftStacks = Math.min(20, state.samsaraGiftStacks + 1);

  // Determine which upgrades to retain based on memory wheel upgrades
  let retainedUpgrades = new Set<string>();
  if (state.wheelPurchased.has('divineMemory')) {
    retainedUpgrades = new Set(state.upgrades);
  } else if (state.wheelPurchased.has('prophetsMemory')) {
    const sorted = [...state.upgrades]
      .map((id) => ({ id, cost: UPGRADE_MAP[id]?.cost ?? 0 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 20)
      .map((u) => u.id);
    retainedUpgrades = new Set(sorted);
  } else if (state.wheelPurchased.has('emberOfMemory')) {
    const sorted = [...state.upgrades]
      .map((id) => ({ id, cost: UPGRADE_MAP[id]?.cost ?? 0 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map((u) => u.id);
    retainedUpgrades = new Set(sorted);
  }

  // Karmically retained resources
  const retainedKarma = state.wheelPurchased.has('karmicVessel') ? state.karma : 0;

  const newState = makeInitialState({
    blissShards: newBlissShards,
    wheelPurchased: new Set(state.wheelPurchased),
    achievements: new Set(state.achievements),
    milestones: new Set(state.milestones),
    prestigeCount: newPrestigeCount,
    samsaraGiftStacks: newSamsaraGiftStacks,
    karma: retainedKarma,
    peakKarma: retainedKarma,
    upgrades: retainedUpgrades,
    // Preserve user preferences
    theme: state.theme,
    numberFormat: state.numberFormat,
    soundEnabled: state.soundEnabled,
    soundVolume: state.soundVolume,
  });

  return newState;
}

// ─── Wheel ────────────────────────────────────────────────────────────────────

export function doPurchaseWheelUpgrade(state: GameState, upgradeId: string): GameState {
  const def = WHEEL_MAP[upgradeId];
  if (!def) return state;
  if (state.wheelPurchased.has(upgradeId)) return state;
  if (state.blissShards < def.shardCost) return state;

  // Check tier requirements are met
  if (def.requires) {
    const requirementsMet = def.requires.every((reqId) => state.wheelPurchased.has(reqId));
    if (!requirementsMet) return state;
  }

  return {
    ...state,
    blissShards: state.blissShards - def.shardCost,
    wheelPurchased: new Set([...state.wheelPurchased, upgradeId]),
  };
}

// ─── Events ───────────────────────────────────────────────────────────────────

export function doResolveEvent(
  state: GameState,
  eventId: string,
  choiceIndex: number
): GameState {
  const eventDef = EVENT_MAP[eventId];
  if (!eventDef) return state;

  // Determine effect
  let effect = eventDef.effect;
  if ((eventDef.type === 'choice' || eventDef.type === 'philosophical') && eventDef.choices) {
    const choice = eventDef.choices[choiceIndex];
    if (!choice) return state;
    effect = choice.effect;
  }
  if (!effect) {
    return { ...state, pendingEvent: null, showEventModal: false };
  }

  let newState: GameState = { ...state, pendingEvent: null, showEventModal: false };

  // Apply happiness bonus
  if (effect.happinessBonus !== undefined) {
    let bonusHP: number;
    if (effect.happinessBonus > 0 && effect.happinessBonus < 10) {
      // Treat as "minutes of HPS"
      bonusHP = computeTotalHPS(state) * effect.happinessBonus * 60;
    } else {
      bonusHP = effect.happinessBonus;
    }
    newState = {
      ...newState,
      happiness: newState.happiness + bonusHP,
      lifetimeHappiness: newState.lifetimeHappiness + bonusHP,
      peakHappiness: Math.max(newState.peakHappiness, newState.happiness + bonusHP),
    };
  }

  // Apply timed HPS multiplier
  if (
    effect.hpsMultiplier !== undefined &&
    effect.hpsMultiplierDuration !== undefined
  ) {
    const buff: TimedBuff = {
      id: `event_${eventId}_${Date.now()}`,
      hpsMultiplier: effect.hpsMultiplier,
      remainingSeconds: effect.hpsMultiplierDuration,
    };
    newState = { ...newState, activeBuffs: [...newState.activeBuffs, buff] };
  }

  // Apply karma bonus
  if (effect.karmaBonus !== undefined) {
    newState = { ...newState, karma: newState.karma + effect.karmaBonus };
  }

  // Apply permanent HPS %
  if (effect.permanentHPSPercent !== undefined) {
    newState = {
      ...newState,
      permanentHPSBonus: newState.permanentHPSBonus + effect.permanentHPSPercent,
    };
  }

  // Apply permanent HPC %
  if (effect.permanentHPCPercent !== undefined) {
    newState = {
      ...newState,
      permanentHPCBonus: newState.permanentHPCBonus + effect.permanentHPCPercent,
    };
  }

  newState = grantAchievement(newState, 'eventResolved');
  return newState;
}

// ─── Offerings ────────────────────────────────────────────────────────────────

const OFFERING_TIERS: Record<1 | 2 | 3, { karmaCost: number; multiplier: number; duration: number }> = {
  1: { karmaCost: 5, multiplier: 1.02, duration: 86400 },
  2: { karmaCost: 15, multiplier: 1.05, duration: 43200 },
  3: { karmaCost: 40, multiplier: 1.15, duration: 21600 },
};

export function doMakeOffering(state: GameState, tier: 1 | 2 | 3): GameState {
  const config = OFFERING_TIERS[tier];
  if (state.karma < config.karmaCost) return state;

  const buff: TimedBuff = {
    id: `offering_${tier}_${Date.now()}`,
    hpsMultiplier: config.multiplier,
    remainingSeconds: config.duration,
  };

  let newState: GameState = {
    ...state,
    karma: state.karma - config.karmaCost,
    activeBuffs: [...state.activeBuffs, buff],
  };

  newState = grantAchievement(newState, 'dailyOffering');
  return newState;
}

// Suppress unused import warning — EVENTS used at runtime when EVENT_MAP is populated
void EVENTS;
void BUILDING_MAP;
