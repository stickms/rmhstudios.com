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
    totalClicks: 0,
    totalPilgrimages: 0,
    totalVibeChecks: 0,
    totalEventsResolved: 0,
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
    eventTimer: Math.random() * 480 + 120,
    pendingEvent: null,
    lastEventEffect: null,
    activeBuffs: [],
    permanentHPSBonus: 0,
    permanentHPCBonus: 0,
    lastClickTime: now,
    pageOpenTime: now,
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
  let ritualTriggered = false;

  if (updatedClickTimes.length >= ritualThreshold && state.ritualCooldown <= 0) {
    // Ritual triggered: bonus burst
    const burstMultiplier = state.wheelPurchased.has('ritualAmplification') ? 14 : 7;
    happinessGained = hpc * burstMultiplier * incenseBonus;
    newRitualCooldown = state.wheelPurchased.has('ritualMastery') ? 15 : 30;
    finalClickTimes = [];
    ritualTriggered = true;
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
    totalClicks: state.totalClicks + 1,
  };

  // Achievement: first click (proxy: lifetime was 0 before this click)
  if (state.lifetimeHappiness === 0 && happinessGained > 0) {
    newState = grantAchievement(newState, 'firstClick');
  }

  // Click count achievements
  if (newState.totalClicks >= 100) newState = grantAchievement(newState, 'hundredClicks');
  if (newState.totalClicks >= 1000) newState = grantAchievement(newState, 'thousandClicks');
  if (newState.totalClicks >= 10000) newState = grantAchievement(newState, 'tenThousandClicks');

  // Ritual trigger achievement
  if (ritualTriggered && !state.achievements.has('ritual')) {
    newState = grantAchievement(newState, 'ritual');
  }

  // livingTemple wheel: +1 karma per click
  if (state.wheelPurchased.has('livingTemple')) {
    newState = { ...newState, karma: newState.karma + 1 };
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
  if (buildingId === 'moodCandle' && newOwned >= 1000) newState = grantAchievement(newState, 'candleObsession');
  if (buildingId === 'therapy' && newOwned >= 100) newState = grantAchievement(newState, 'therapyRich');
  if (buildingId === 'goonCave' && newOwned === 1) newState = grantAchievement(newState, 'caveDweller');
  if (buildingId === 'blissSingularity' && newOwned === 1) newState = grantAchievement(newState, 'singularity');
  if (buildingId === 'napPod' && newOwned >= 100) newState = grantAchievement(newState, 'napPodArmy');
  if (buildingId === 'zenGarden' && newOwned === 1) newState = grantAchievement(newState, 'zenGardenUnlock');
  if (buildingId === 'omniscientSpa' && newOwned === 1) newState = grantAchievement(newState, 'omniscientSpaUnlock');
  if (buildingId === 'sweetTreat' && newOwned === 1) newState = grantAchievement(newState, 'bobaAddiction');
  if (buildingId === 'sweetTreat' && newOwned >= 10) newState = grantAchievement(newState, 'tenSweetTreats');
  if (buildingId === 'retailTherapy' && newOwned >= 100) newState = grantAchievement(newState, 'studiousHaul');
  if (buildingId === 'soundBath' && newOwned === 1) newState = grantAchievement(newState, 'soundBathFirst');
  if (buildingId === 'artGallery' && newOwned === 1) newState = grantAchievement(newState, 'artGalleryFirst');
  if (buildingId === 'artGallery' && newOwned >= 100) newState = grantAchievement(newState, 'artCollector');

  // allBuildings: every building type owned >= 1
  const allBuildings = Object.values(newState.buildings).every((count) => count >= 1);
  if (allBuildings) newState = grantAchievement(newState, 'allBuildings');

  // tenOfEach: every building type owned >= 10
  const tenOfEach = Object.values(newState.buildings).every((count) => count >= 10);
  if (tenOfEach) newState = grantAchievement(newState, 'tenOfEach');

  // fiftyOfOne: any single building >= 50
  if (newOwned >= 50) newState = grantAchievement(newState, 'fiftyOfOne');

  // hundredOfOne: any single building >= 100
  if (newOwned >= 100) newState = grantAchievement(newState, 'hundredOfOne');

  // twoHundredOfOne: any single building >= 200
  if (newOwned >= 200) newState = grantAchievement(newState, 'twoHundredOfOne');

  // fiveHundredOfOne: any single building >= 500
  if (newOwned >= 500) newState = grantAchievement(newState, 'fiveHundredOfOne');

  // thousandOfOne: any single building >= 1000
  if (newOwned >= 1000) newState = grantAchievement(newState, 'thousandOfOne');

  // allPostPrestige: every post-prestige building owned >= 1 (only if prestigeCount >= 1)
  if (state.prestigeCount >= 1) {
    const postPrestigeBuildings: BuildingId[] = [
      'zenGarden', 'euphoriaSprings', 'serenityEngine',
      'raptureCathedral', 'cosmicJacuzzi', 'omniscientSpa',
    ];
    const allPostPrestige = postPrestigeBuildings.every(
      (id) => (newState.buildings[id] ?? 0) >= 1
    );
    if (allPostPrestige) newState = grantAchievement(newState, 'allPostPrestige');
  }

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

  // Check if they have philosopher's stone
  if (relicId === 'philosophersStone') {
    newState = grantAchievement(newState, 'philosophersStone');
  }

  // Check if all slots are filled
  if (newState.activeRelics.length >= newState.maxRelicSlots) {
    newState = grantAchievement(newState, 'maxRelics');
  }

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

  const duration = state.activeRelics.includes('nappingCat') ? 60 : 120;

  let newState: GameState = {
    ...state,
    pilgrimageActive: true,
    pilgrimageTimer: duration,
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
    totalVibeChecks: state.totalVibeChecks + 1,
  };

  newState = grantAchievement(newState, 'vibeCheck');
  if (newState.totalVibeChecks >= 10) newState = grantAchievement(newState, 'vibeCheckTen');
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

  // Compute values from prior run needed for wheel effects
  const prevPeakHappiness = state.peakHappiness;
  const prevHPS = computeTotalHPS(state);

  // Build initial building overrides
  const startingBuildings = { ...INITIAL_BUILDINGS };

  // deepRoots: start with 5 copies of first 5 buildings
  if (state.wheelPurchased.has('deepRoots')) {
    startingBuildings.moodCandle = Math.max(startingBuildings.moodCandle, 5);
    startingBuildings.napPod = Math.max(startingBuildings.napPod, 5);
    startingBuildings.snackBar = Math.max(startingBuildings.snackBar, 5);
    startingBuildings.hotTub = Math.max(startingBuildings.hotTub, 5);
    startingBuildings.massageStudio = Math.max(startingBuildings.massageStudio, 5);
  }

  // eternalFoundation: start with 5 of every building
  if (state.wheelPurchased.has('eternalFoundation')) {
    for (const id of Object.keys(startingBuildings) as BuildingId[]) {
      startingBuildings[id] = Math.max(startingBuildings[id], 5);
    }
  }

  // karmicOverflow: +2 max relic slots
  const bonusRelicSlots = state.wheelPurchased.has('karmicOverflow') ? 2 : 0;

  // Build starting timed buffs
  const startingBuffs: TimedBuff[] = [];
  if (state.wheelPurchased.has('rememberedJoy')) {
    startingBuffs.push({ id: 'rememberedJoy', hpsMultiplier: 5, remainingSeconds: 60 });
  }
  if (state.wheelPurchased.has('theSecondComing')) {
    startingBuffs.push({ id: 'theSecondComing', hpsMultiplier: 10, remainingSeconds: 600 });
  }
  if (state.wheelPurchased.has('blissOverdrive')) {
    startingBuffs.push({ id: 'blissOverdrive', hpsMultiplier: 100, remainingSeconds: 300 });
  }

  // reincarnatedWealthier: start with 1% of previous peak happiness
  const wealthierBonus = state.wheelPurchased.has('reincarnatedWealthier')
    ? prevPeakHappiness * 0.01
    : 0;

  // nirvanaBlueprint: start with happiness = 50% of 1 minute of peak HPS
  const nirvanaBlueprintBonus = state.wheelPurchased.has('nirvanaBlueprint')
    ? prevHPS * 60 * 0.5
    : 0;

  const startingHappiness = wealthierBonus + nirvanaBlueprintBonus;

  let newState = makeInitialState({
    blissShards: newBlissShards,
    wheelPurchased: new Set(state.wheelPurchased),
    achievements: new Set(state.achievements),
    milestones: new Set(state.milestones),
    prestigeCount: newPrestigeCount,
    samsaraGiftStacks: newSamsaraGiftStacks,
    karma: retainedKarma,
    peakKarma: retainedKarma,
    upgrades: retainedUpgrades,
    buildings: startingBuildings,
    happiness: startingHappiness,
    maxRelicSlots: 3 + bonusRelicSlots,
    activeBuffs: startingBuffs,
    // Preserve user preferences
    theme: state.theme,
    numberFormat: state.numberFormat,
    soundEnabled: state.soundEnabled,
    soundVolume: state.soundVolume,
  });

  // Grant prestige achievements
  newState = grantAchievement(newState, 'firstPrestige');
  if (newPrestigeCount >= 5) newState = grantAchievement(newState, 'fivePrestige');
  if (newPrestigeCount >= 10) newState = grantAchievement(newState, 'tenPrestige');
  if (newPrestigeCount >= 20) newState = grantAchievement(newState, 'twentyPrestige');
  if (newPrestigeCount >= 30) newState = grantAchievement(newState, 'thirtyPrestige');
  if (newPrestigeCount >= 50) newState = grantAchievement(newState, 'fiftyPrestige');

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

  const newWheelPurchased = new Set([...state.wheelPurchased, upgradeId]);
  
  let newState: GameState = {
    ...state,
    blissShards: state.blissShards - def.shardCost,
    wheelPurchased: newWheelPurchased,
  };

  // Wheel achievements
  newState = grantAchievement(newState, 'firstWheelUpgrade');

  // karmicOverflow: immediately grant +2 relic slots
  if (upgradeId === 'karmicOverflow') {
    newState = { ...newState, maxRelicSlots: newState.maxRelicSlots + 2 };
  }

  // Check if all tier 4 upgrades are purchased (fullWheel)
  const tier4Upgrades = [
    'templeEternal',
    'infiniteWheel',
    'enlightenedClicker',
    'karmicDividend',
  ];
  const hasAllTier4 = tier4Upgrades.every((id) => newWheelPurchased.has(id));
  if (hasAllTier4) newState = grantAchievement(newState, 'fullWheel');

  return newState;
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

  // Build effect summary lines
  const effectSummary: string[] = [];

  let newState: GameState = { 
    ...state, 
    pendingEvent: null, 
    showEventModal: false,
    totalEventsResolved: state.totalEventsResolved + 1,
  };

  // Apply happiness bonus
  if (effect.happinessBonus !== undefined) {
    let bonusHP: number;
    if (effect.happinessBonus > 0 && effect.happinessBonus < 10) {
      // Treat as "minutes of HPS"
      bonusHP = computeTotalHPS(state) * effect.happinessBonus * 60;
      effectSummary.push(`+${Math.floor(bonusHP)} happiness (${effect.happinessBonus} min of income)`);
    } else {
      bonusHP = effect.happinessBonus;
      effectSummary.push(`+${Math.floor(bonusHP)} happiness`);
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
    const durationMinutes = Math.round(effect.hpsMultiplierDuration / 60);
    effectSummary.push(`×${effect.hpsMultiplier} HPS for ${durationMinutes} min`);
    const buff: TimedBuff = {
      id: `event_${eventId}_${Date.now()}`,
      hpsMultiplier: effect.hpsMultiplier,
      remainingSeconds: effect.hpsMultiplierDuration,
    };
    newState = { ...newState, activeBuffs: [...newState.activeBuffs, buff] };
  }

  // Apply karma bonus
  if (effect.karmaBonus !== undefined) {
    effectSummary.push(`+${effect.karmaBonus} karma`);
    newState = { ...newState, karma: newState.karma + effect.karmaBonus };
  }

  // Apply permanent HPS %
  if (effect.permanentHPSPercent !== undefined) {
    const percent = Math.round(effect.permanentHPSPercent * 100);
    effectSummary.push(`+${percent}% permanent HPS`);
    newState = {
      ...newState,
      permanentHPSBonus: newState.permanentHPSBonus + effect.permanentHPSPercent,
    };
  }

  // Apply permanent HPC %
  if (effect.permanentHPCPercent !== undefined) {
    const percent = Math.round(effect.permanentHPCPercent * 100);
    effectSummary.push(`+${percent}% permanent HPC`);
    newState = {
      ...newState,
      permanentHPCBonus: newState.permanentHPCBonus + effect.permanentHPCPercent,
    };
  }

  newState = grantAchievement(newState, 'eventResolved');
  if (newState.totalEventsResolved >= 50) newState = grantAchievement(newState, 'eventsFifty');

  // Store event effect for display (show for 5 seconds)
  newState.lastEventEffect = {
    title: eventDef.title,
    summary: effectSummary,
    expiresAt: Date.now() + 5000,
  };

  return newState;
}

// ─── Offerings ────────────────────────────────────────────────────────────────

const OFFERING_TIERS: Record<1 | 2 | 3, { karmaCost: number; multiplier: number; duration: number }> = {
  1: { karmaCost: 10, multiplier: 1.02, duration: 86400 },
  2: { karmaCost: 30, multiplier: 1.05, duration: 43200 },
  3: { karmaCost: 75, multiplier: 1.15, duration: 21600 },
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
