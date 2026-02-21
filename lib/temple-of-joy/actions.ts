/**
 * Temple of Joy — Action Handlers
 * Pure functions that take state + action params and return new state.
 */
import type { GameState, SourceId, RelicId, TimedBuff } from './types';
import {
  computeHPC,
  computeSourceCost,
  computeSourcePrestigeReq,
  computeCanTranscend,
  computeBlissShards,
  computeUpgradeCost,
  computeTotalHPS,
} from './engine';
import { SOURCE_MAP, INITIAL_SOURCES, SOURCES } from './data/sources';
import { UPGRADE_MAP, UPGRADES } from './data/upgrades';
import { RELIC_MAP, RELICS } from './data/relics';
import { WHEEL_MAP, WHEEL_UPGRADES } from './data/wheel';
import { EVENTS, EVENT_MAP } from './data/events';
import { SYNERGIES } from './data/synergies';

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function makeInitialState(
  overrides: Partial<GameState> = {}
): GameState {
  const now = Date.now();
  return {
    happiness: 0,
    lifetimeHappiness: 0,
    runHappiness: 0,
    peakHappiness: 0,
    peakKarma: 0,
    karma: 0,
    blissShards: 0,
    sources: { ...INITIAL_SOURCES },
    upgrades: new Set<string>(),
    activeRelics: [],
    maxRelicSlots: 3,
    equippedRelicsHistory: [],
    prestigeCount: 0,
    wheelPurchased: new Set<string>(),
    samsaraGiftStacks: 0,
    emberSelections: [],
    lastSaved: now,
    lastTickTime: now,
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
    sourceBuyQty: 1,
    soundEnabled: true,
    musicVolume: 0.5,
    sfxVolume: 0.5,
    autoBuyEnabled: true,
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

  // Update recent click times — keep 10s window (matches idle detection window).
  // Separate 3s count used for ritual detection.
  const updatedClickTimes = [...state.recentClickTimes, now].filter(
    (t) => now - t <= 10_000
  );
  const recentClicksIn3s = updatedClickTimes.filter(t => now - t <= 3_000).length;

  const ritualThreshold = state.wheelPurchased.has('ritualMastery') ? 5 : 7;

  let happinessGained: number;
  let newRitualCooldown = state.ritualCooldown;
  let finalClickTimes = updatedClickTimes;
  let ritualTriggered = false;

  if (recentClicksIn3s >= ritualThreshold && state.ritualCooldown <= 0) {
    // Ritual triggered: bonus burst
    const burstMultiplier = state.wheelPurchased.has('ritualAmplification') ? 14 : 7;
    // jestersCrown relic: ritual burst ×1.5
    const jesterBurst = state.activeRelics.includes('jestersCrown') ? 1.5 : 1;
    happinessGained = hpc * burstMultiplier * incenseBonus * jesterBurst;
    let cooldownBase = state.wheelPurchased.has('ritualMastery') ? 15 : 30;
    // incenseOfAncients relic: ritual cooldown halved
    if (state.activeRelics.includes('incenseOfAncients')) cooldownBase /= 2;
    newRitualCooldown = cooldownBase;
    finalClickTimes = [];
    ritualTriggered = true;
  } else {
    happinessGained = hpc;
  }

  // theLastSmile wheel: click generates 1 minute of HPS income
  if (state.wheelPurchased.has('theLastSmile')) {
    happinessGained += computeTotalHPS(state) * 60;
  }

  const newHappiness = state.happiness + happinessGained;
  const newLifetimeHappiness = state.lifetimeHappiness + happinessGained;
  const newRunHappiness = state.runHappiness + happinessGained;
  const newPeakHappiness = Math.max(state.peakHappiness, newHappiness);

  let newState: GameState = {
    ...state,
    happiness: newHappiness,
    lifetimeHappiness: newLifetimeHappiness,
    runHappiness: newRunHappiness,
    peakHappiness: newPeakHappiness,
    lastClickTime: now,
    recentClickTimes: finalClickTimes,
    ritualCooldown: newRitualCooldown,
    totalClicks: state.totalClicks + 1,
    pilgrimageStreak: 0, // Clicks reset the streak
  };

  // Achievement: first click (proxy: lifetime was 0 before this click)
  if (state.lifetimeHappiness === 0 && happinessGained > 0) {
    newState = grantAchievement(newState, 'firstClick');
  }

  // Click count achievements
  // jestersCrown relic: click achievements count ×2
  const clickCount = state.activeRelics.includes('jestersCrown')
    ? newState.totalClicks * 2
    : newState.totalClicks;
  if (clickCount >= 100) newState = grantAchievement(newState, 'hundredClicks');
  if (clickCount >= 1000) newState = grantAchievement(newState, 'thousandClicks');
  if (clickCount >= 10000) newState = grantAchievement(newState, 'tenThousandClicks');
  if (clickCount >= 50000) newState = grantAchievement(newState, 'fiftyThousandClicks');
  if (clickCount >= 100000) newState = grantAchievement(newState, 'hundredThousandClicks');
  if (clickCount >= 1000000) newState = grantAchievement(newState, 'millionClicks');

  // Ritual trigger achievement
  if (ritualTriggered) {
    newState = { ...newState, totalRituals: newState.totalRituals + 1 };
    if (!state.achievements.has('ritual')) {
      newState = grantAchievement(newState, 'ritual');
    }
  }

  // Ritual count achievement
  if (newState.totalRituals >= 100) newState = grantAchievement(newState, 'ritualHundred');

  // livingTemple wheel: +1 karma per click
  if (state.wheelPurchased.has('livingTemple')) {
    newState = { ...newState, karma: newState.karma + 1 };
  }

  return newState;
}

// ─── Buy Source ─────────────────────────────────────────────────────────────

export function doBuySource(state: GameState, sourceId: SourceId): GameState {  // Prestige gate: check if player has enough prestige to buy this source
  const prestigeReq = computeSourcePrestigeReq(sourceId, state);
  if (state.prestigeCount < prestigeReq) return state;
  const cost = computeSourceCost(sourceId, state.sources[sourceId], state);
  if (state.happiness < cost) return state;

  const newOwned = state.sources[sourceId] + 1;
  let newState: GameState = {
    ...state,
    happiness: state.happiness - cost,
    sources: { ...state.sources, [sourceId]: newOwned },
  };

  // Source-specific achievements
  if (sourceId === 'moodCandle' && newOwned === 1) newState = grantAchievement(newState, 'firstCandle');
  if (sourceId === 'moodCandle' && newOwned >= 1000) newState = grantAchievement(newState, 'candleObsession');
  if (sourceId === 'therapy' && newOwned >= 100) newState = grantAchievement(newState, 'therapyRich');
  if (sourceId === 'goonCave' && newOwned === 1) newState = grantAchievement(newState, 'caveDweller');
  if (sourceId === 'blissSingularity' && newOwned === 1) newState = grantAchievement(newState, 'singularity');
  if (sourceId === 'napPod' && newOwned >= 100) newState = grantAchievement(newState, 'napPodArmy');
  if (sourceId === 'zenGarden' && newOwned === 1) newState = grantAchievement(newState, 'zenGardenUnlock');
  if (sourceId === 'omniscientSpa' && newOwned === 1) newState = grantAchievement(newState, 'omniscientSpaUnlock');
  if (sourceId === 'sweetTreat' && newOwned === 1) newState = grantAchievement(newState, 'bobaAddiction');
  if (sourceId === 'sweetTreat' && newOwned >= 10) newState = grantAchievement(newState, 'tenSweetTreats');
  if (sourceId === 'retailTherapy' && newOwned >= 100) newState = grantAchievement(newState, 'studiousHaul');
  if (sourceId === 'soundBath' && newOwned === 1) newState = grantAchievement(newState, 'soundBathFirst');
  if (sourceId === 'artGallery' && newOwned === 1) newState = grantAchievement(newState, 'artGalleryFirst');
  if (sourceId === 'artGallery' && newOwned >= 100) newState = grantAchievement(newState, 'artCollector');
  if (sourceId === 'dreamWeaver' && newOwned === 1) newState = grantAchievement(newState, 'dreamWeaverUnlock');
  if (sourceId === 'infiniteBuffet' && newOwned === 1) newState = grantAchievement(newState, 'infiniteBuffetUnlock');
  if (sourceId === 'paradoxEngine' && newOwned === 1) newState = grantAchievement(newState, 'paradoxEngineUnlock');
  if (sourceId === 'joySatellite' && newOwned === 1) newState = grantAchievement(newState, 'joySatelliteUnlock');
  if (sourceId === 'omegaTemple' && newOwned === 1) newState = grantAchievement(newState, 'omegaTempleUnlock');

  // allSources: every source type owned >= 1
  const allSources = Object.values(newState.sources).every((count) => count >= 1);
  if (allSources) newState = grantAchievement(newState, 'allSources');

  // tenOfEach: every source type owned >= 10
  const tenOfEach = Object.values(newState.sources).every((count) => count >= 10);
  if (tenOfEach) newState = grantAchievement(newState, 'tenOfEach');

  // fiftyOfOne: any single source >= 50
  if (newOwned >= 50) newState = grantAchievement(newState, 'fiftyOfOne');

  // hundredOfOne: any single source >= 100
  if (newOwned >= 100) newState = grantAchievement(newState, 'hundredOfOne');

  // twoHundredOfOne: any single source >= 200
  if (newOwned >= 200) newState = grantAchievement(newState, 'twoHundredOfOne');

  // fiveHundredOfOne: any single source >= 500
  if (newOwned >= 500) newState = grantAchievement(newState, 'fiveHundredOfOne');

  // thousandOfOne: any single source >= 1000
  if (newOwned >= 1000) newState = grantAchievement(newState, 'thousandOfOne');

  // twoThousandOfOne: any single source >= 2000
  if (newOwned >= 2000) newState = grantAchievement(newState, 'twoThousandOfOne');

  // fiveThousandOfOne: any single source >= 5000
  if (newOwned >= 5000) newState = grantAchievement(newState, 'fiveThousandOfOne');

  // thousandOfFive: 5+ sources each >= 1000
  const sourcesAbove1000 = Object.values(newState.sources).filter(c => c >= 1000).length;
  if (sourcesAbove1000 >= 5) newState = grantAchievement(newState, 'thousandOfFive');

  // fiveHundredAllSources: every source type >= 500
  const allAbove500 = Object.values(newState.sources).every(c => c >= 500);
  if (allAbove500) newState = grantAchievement(newState, 'fiveHundredAllSources');

  // allNewSourcesOwned: every new (post-patch-2) source >= 1
  const newSourceIds: SourceId[] = [
    'dreamWeaver', 'laughterForge', 'cloudLounge', 'goldenHammock',
    'pleasureArchive', 'infiniteBuffet', 'echoGarden', 'blissConduit',
    'seraphStation', 'paradoxEngine', 'memoryPalace', 'auroraSpire',
    'gravitySpa', 'euterpeHall', 'ambrosiaTap', 'joySatellite',
    'elysiumGate', 'cosmicHamper', 'eternitySofa', 'nirvanaCore',
    'transcendenceLab', 'celestialBath', 'euphoriaReactor', 'pleasurePlanet',
    'karmaFountain', 'infiniteHug', 'joyNova', 'omegaTemple',
  ];
  const allNewOwned = newSourceIds.every(id => (newState.sources[id] ?? 0) >= 1);
  if (allNewOwned) newState = grantAchievement(newState, 'allNewSourcesOwned');

  // allPostPrestige: every post-prestige source owned >= 1 (only if prestigeCount >= 1)
  if (state.prestigeCount >= 1) {
    const postPrestigeSources: SourceId[] = [
      'zenGarden', 'euphoriaSprings', 'serenityEngine',
      'raptureCathedral', 'cosmicJacuzzi', 'omniscientSpa',
    ];
    const allPostPrestige = postPrestigeSources.every(
      (id) => (newState.sources[id] ?? 0) >= 1
    );
    if (allPostPrestige) newState = grantAchievement(newState, 'allPostPrestige');
  }

  return newState;
}
export function doBuySourceN(state: GameState, SourceId: SourceId, n: number): GameState {
  let current = state;
  for (let i = 0; i < n; i++) {
    const next = doBuySource(current, SourceId);
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
  let karmaCost = def.karmaCost;
  // karmicAscension wheel: relics cost 50% less
  if (state.wheelPurchased.has('karmicAscension')) karmaCost = Math.floor(karmaCost * 0.5);
  if (state.karma < karmaCost) return state;
  if (state.activeRelics.includes(relicId)) return state;
  if (state.activeRelics.length >= state.maxRelicSlots) return state;

  const newHistory = new Set(state.equippedRelicsHistory);
  newHistory.add(relicId);

  let newState: GameState = {
    ...state,
    karma: state.karma - karmaCost,
    activeRelics: [...state.activeRelics, relicId],
    equippedRelicsHistory: Array.from(newHistory),
  };

  newState = grantAchievement(newState, 'firstRelic');

  // Check if all relics have been equipped (dynamic count)
  if (newHistory.size >= RELICS.length) {
    newState = grantAchievement(newState, 'allRelics');
  }

  // Relic count milestones
  if (newHistory.size >= 5) newState = grantAchievement(newState, 'fiveRelics');
  if (newHistory.size >= 10) newState = grantAchievement(newState, 'tenRelics');
  if (newHistory.size >= 20) newState = grantAchievement(newState, 'twentyRelics');
  if (newHistory.size >= 30) newState = grantAchievement(newState, 'thirtyRelics');
  if (newHistory.size >= 40) newState = grantAchievement(newState, 'allRelicsNew');

  // Check if they have philosopher's stone
  if (relicId === 'philosophersStone') {
    newState = grantAchievement(newState, 'philosophersStone');
  }

  // Check if all slots are filled
  if (newState.activeRelics.length >= newState.maxRelicSlots) {
    newState = grantAchievement(newState, 'maxRelics');
  }

  // relicMastery wheel: grant +3 relic slots
  if (relicId === 'omegaRelic') {
    // omegaRelic: +2 relic slots (permanent via wheel-style grant)
    newState = { ...newState, maxRelicSlots: newState.maxRelicSlots + 2 };
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

  const newState: GameState = {
    ...state,
    pilgrimageActive: true,
    pilgrimageTimer: duration,
    lastClickTime: Date.now(), // prevent idle bonus triggering mid-pilgrimage
  };

  return newState;
}

/** Helper: returns whether a pilgrimage can currently be started. */
export function doMakePilgrimageReady(state: GameState): boolean {
  return !state.pilgrimageActive && state.pilgrimageCooldown <= 0;
}

// ─── Vibe Check ───────────────────────────────────────────────────────────────

export function doPassVibeCheck(state: GameState): GameState {
  const multiplier = state.activeRelics.includes('vibeCrystal') ? 2.3 : 1.15;
  // zenBell relic: vibe check buffs last 2× longer
  const vibeDuration = state.activeRelics.includes('zenBell') ? 120 : 60;
  const vibeBuff: TimedBuff = {
    id: 'vibe',
    hpsMultiplier: multiplier,
    remainingSeconds: vibeDuration,
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
  if (newState.totalVibeChecks >= 25) newState = grantAchievement(newState, 'vibeCheckTwentyFive');
  if (newState.totalVibeChecks >= 50) newState = grantAchievement(newState, 'vibeCheckFifty');
  return newState;
}

// ─── Transcendence ────────────────────────────────────────────────────────────

export function doTriggerTranscendence(state: GameState): GameState {
  if (!computeCanTranscend(state)) return state;

  const shardsEarned = computeBlissShards(state);
  const newBlissShards = state.blissShards + shardsEarned;
  const newPrestigeCount = state.prestigeCount + 1;
  const newSamsaraGiftStacks = Math.min(20, state.samsaraGiftStacks + 1);

  // Determine which upgrades to retain based on memory wheel upgrades
  let retainedUpgrades = new Set<string>();
  if (state.wheelPurchased.has('omegaMemory') || state.wheelPurchased.has('divineMemory') || state.wheelPurchased.has('prophecyComplete')) {
    retainedUpgrades = new Set(state.upgrades);
  } else if (state.wheelPurchased.has('prophetsMemory')) {
    const sorted = [...state.upgrades]
      .map((id) => ({ id, cost: UPGRADE_MAP[id]?.cost ?? 0 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 20)
      .map((u) => u.id);
    retainedUpgrades = new Set(sorted);
  } else if (state.wheelPurchased.has('emberOfMemory')) {
    // celestialMemory: keep top 10 instead of 5
    const keepCount = state.wheelPurchased.has('celestialMemory') ? 10 : 5;
    const validSelections = state.emberSelections.filter(id => state.upgrades.has(id)).slice(0, keepCount);
    retainedUpgrades = new Set(validSelections);
  }

  // Karmically retained resources
  const retainedKarma = state.wheelPurchased.has('omegaMemory')
    ? state.karma
    : state.wheelPurchased.has('karmicVessel')
      ? state.karma
      : 0;

  // Compute values from prior run needed for wheel effects
  const prevPeakHappiness = state.peakHappiness;
  const prevHPS = computeTotalHPS(state);

  // Build initial source overrides
  const startingSources = { ...INITIAL_SOURCES };

  // deepRoots: start with 5 copies of first 5 sources
  if (state.wheelPurchased.has('deepRoots')) {
    startingSources.moodCandle = Math.max(startingSources.moodCandle, 5);
    startingSources.napPod = Math.max(startingSources.napPod, 5);
    startingSources.snackBar = Math.max(startingSources.snackBar, 5);
    startingSources.sweetTreat = Math.max(startingSources.sweetTreat, 5);
    startingSources.hotTub = Math.max(startingSources.hotTub, 5);
  }

  // eternalFoundation: start with 5 of every source
  if (state.wheelPurchased.has('eternalFoundation')) {
    for (const id of Object.keys(startingSources) as SourceId[]) {
      startingSources[id] = Math.max(startingSources[id], 5);
    }
  }

  // celestialArchitect: all sources start at 25
  if (state.wheelPurchased.has('celestialArchitect')) {
    for (const id of Object.keys(startingSources) as SourceId[]) {
      startingSources[id] = Math.max(startingSources[id], 25);
    }
  }

  // omegaMemory: retain all sources from previous run
  if (state.wheelPurchased.has('omegaMemory')) {
    for (const id of Object.keys(state.sources) as SourceId[]) {
      startingSources[id] = Math.max(startingSources[id], state.sources[id]);
    }
  }

  // karmicOverflow: +2 max relic slots
  let bonusRelicSlots = state.wheelPurchased.has('karmicOverflow') ? 2 : 0;
  // relicMastery wheel: +3 relic slots
  if (state.wheelPurchased.has('relicMastery')) bonusRelicSlots += 3;

  // theRemembering or omegaMemory: milestones retained on prestige
  const retainedMilestones = (state.wheelPurchased.has('theRemembering') || state.wheelPurchased.has('omegaMemory'))
    ? new Set(state.milestones)
    : new Set<string>();

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

  // eternalFlame: start with 10% of peak happiness
  const eternalFlameBonus = state.wheelPurchased.has('eternalFlame')
    ? prevPeakHappiness * 0.1
    : 0;

  // blissInfinity: start with 50% of peak happiness
  const blissInfinityBonus = state.wheelPurchased.has('blissInfinity')
    ? prevPeakHappiness * 0.5
    : 0;

  const startingHappiness = wealthierBonus + nirvanaBlueprintBonus + eternalFlameBonus + blissInfinityBonus;

  let newState = makeInitialState({
    blissShards: newBlissShards,
    wheelPurchased: new Set(state.wheelPurchased),
    achievements: new Set(state.achievements),
    milestones: retainedMilestones,
    prestigeCount: newPrestigeCount,
    samsaraGiftStacks: newSamsaraGiftStacks,
    karma: retainedKarma,
    peakKarma: retainedKarma,
    upgrades: retainedUpgrades,
    sources: startingSources,
    happiness: startingHappiness,
    lifetimeHappiness: state.lifetimeHappiness, // all-time counter: never resets
    maxRelicSlots: 3 + bonusRelicSlots,
    activeBuffs: startingBuffs,
    emberSelections: state.emberSelections,     // preserve selections for next transcendence
    // Preserve user preferences
    theme: state.theme,
    numberFormat: state.numberFormat,
    sourceBuyQty: state.sourceBuyQty,
    soundEnabled: state.soundEnabled,
    musicVolume: state.musicVolume,
    sfxVolume: state.sfxVolume,
    autoBuyEnabled: state.autoBuyEnabled,
    // Bug #1 fix: Preserve lifetime counters
    totalPlaytime: state.totalPlaytime,
    totalClicks: state.totalClicks,
    totalPilgrimages: state.totalPilgrimages,
    totalVibeChecks: state.totalVibeChecks,
    totalEventsResolved: state.totalEventsResolved,
    totalRituals: state.totalRituals,
    totalOfferings: state.totalOfferings,
    epicurusApprovedCount: state.epicurusApprovedCount,
    equippedRelicsHistory: state.equippedRelicsHistory,
  });

  // Grant prestige achievements
  newState = grantAchievement(newState, 'firstPrestige');
  if (newPrestigeCount >= 5) newState = grantAchievement(newState, 'fivePrestige');
  if (newPrestigeCount >= 10) newState = grantAchievement(newState, 'tenPrestige');
  if (newPrestigeCount >= 20) newState = grantAchievement(newState, 'twentyPrestige');
  if (newPrestigeCount >= 30) newState = grantAchievement(newState, 'thirtyPrestige');
  if (newPrestigeCount >= 50) newState = grantAchievement(newState, 'fiftyPrestige');
  if (newPrestigeCount >= 75) newState = grantAchievement(newState, 'seventyFivePrestige');
  if (newPrestigeCount >= 100) newState = grantAchievement(newState, 'hundredPrestige');
  if (newPrestigeCount >= 200) newState = grantAchievement(newState, 'twoHundredPrestige');

  // speedPrestige: first prestige in under 30 minutes of run time
  if (newPrestigeCount === 1 && state.runPlaytime < 1800) {
    newState = grantAchievement(newState, 'speedPrestige');
  }
  // transcendUnderMinute: transcend in under 1 minute of run time
  if (state.runPlaytime < 60) {
    newState = grantAchievement(newState, 'transcendUnderMinute');
  }

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
  // relicMastery: immediately grant +3 relic slots
  if (upgradeId === 'relicMastery') {
    newState = { ...newState, maxRelicSlots: newState.maxRelicSlots + 3 };
  }

  // Check tier completion dynamically using WHEEL_UPGRADES data
  const maxTier = Math.max(...WHEEL_UPGRADES.map(u => u.tier));
  for (let t = 1; t <= maxTier; t++) {
    const tierUpgrades = WHEEL_UPGRADES.filter(u => u.tier === t);
    const allTierComplete = tierUpgrades.every(u => newWheelPurchased.has(u.id));
    if (allTierComplete) {
      if (t === 4) newState = grantAchievement(newState, 'fullWheel');
      if (t === 5) newState = grantAchievement(newState, 'wheelTier5');
      if (t === 6) newState = grantAchievement(newState, 'wheelTier6');
      if (t === 7) newState = grantAchievement(newState, 'wheelTier7');
      if (t === 8) newState = grantAchievement(newState, 'wheelTier8');
      if (t === 9) newState = grantAchievement(newState, 'wheelTier9');
      if (t === 10) newState = grantAchievement(newState, 'wheelTier10');
    }
  }

  // Shard spending achievements
  const totalShardsSpent = WHEEL_UPGRADES
    .filter(u => newWheelPurchased.has(u.id))
    .reduce((sum, u) => sum + u.shardCost, 0);
  if (totalShardsSpent >= 10000) newState = grantAchievement(newState, 'tenThousandShards');
  if (totalShardsSpent >= 100000) newState = grantAchievement(newState, 'hundredThousandShards');
  if (totalShardsSpent >= 1000000) newState = grantAchievement(newState, 'millionShards');

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

  // luckyCoin relic: event effects are 50% stronger
  const luckyMult = state.activeRelics.includes('luckyCoin') ? 1.5 : 1;

  // Build effect summary lines
  const effectSummary: string[] = [];

  let newState: GameState = {
    ...state,
    pendingEvent: null,
    showEventModal: false,
    totalEventsResolved: state.totalEventsResolved + 1,
  };

  // Track epicurusApproved
  if (eventDef.type === 'philosophical' && eventDef.choices) {
    const choice = eventDef.choices[choiceIndex];
    if (choice) {
      const isFrugal = [
        'Agree with him',
        'Rest instead',
        'I need it to be real.',
        'Yes. It is enough.',
        'I would change nothing.',
        'Waste no more.',
        'All three, together.',
        'Take the step.',
      ].includes(choice.label);

      if (isFrugal) {
        newState.epicurusApprovedCount += 1;
        if (newState.epicurusApprovedCount >= 5) {
          newState = grantAchievement(newState, 'epicurusApproved');
        }
        if (newState.epicurusApprovedCount >= 10) {
          newState = grantAchievement(newState, 'allPhilosFrugal');
        }
      }
    }
  }

  // Apply happiness bonus (always expressed as minutes of current HPS income)
  if (effect.happinessBonus !== undefined) {
    const bonusHP = computeTotalHPS(state) * effect.happinessBonus * 60 * luckyMult;
    effectSummary.push(`+${Math.floor(bonusHP)} happiness (${effect.happinessBonus} min of income)`);
    newState = {
      ...newState,
      happiness: newState.happiness + bonusHP,
      lifetimeHappiness: newState.lifetimeHappiness + bonusHP,
      runHappiness: newState.runHappiness + bonusHP,
      peakHappiness: Math.max(newState.peakHappiness, newState.happiness + bonusHP),
    };
  }

  // Apply timed HPS multiplier
  if (
    effect.hpsMultiplier !== undefined &&
    effect.hpsMultiplierDuration !== undefined
  ) {
    const scaledMultiplier = 1 + (effect.hpsMultiplier - 1) * luckyMult;
    const durationMinutes = Math.round(effect.hpsMultiplierDuration / 60);
    effectSummary.push(`×${scaledMultiplier.toFixed(2)} HPS for ${durationMinutes} min`);
    const buff: TimedBuff = {
      id: `event_${eventId}_${Date.now()}`,
      hpsMultiplier: scaledMultiplier,
      remainingSeconds: effect.hpsMultiplierDuration,
    };
    newState = { ...newState, activeBuffs: [...newState.activeBuffs, buff] };
  }

  // Apply karma bonus
  if (effect.karmaBonus !== undefined) {
    const scaledKarma = Math.floor(effect.karmaBonus * luckyMult);
    effectSummary.push(`+${scaledKarma} karma`);
    newState = { ...newState, karma: newState.karma + scaledKarma };
  }

  // Apply permanent HPS %
  if (effect.permanentHPSPercent !== undefined) {
    const scaledPermanent = effect.permanentHPSPercent * luckyMult;
    const percent = Math.round(scaledPermanent * 100);
    effectSummary.push(`+${percent}% permanent HPS`);
    newState = {
      ...newState,
      permanentHPSBonus: newState.permanentHPSBonus + scaledPermanent,
    };
  }

  // Apply permanent HPC %
  if (effect.permanentHPCPercent !== undefined) {
    const scaledPermanentHPC = effect.permanentHPCPercent * luckyMult;
    const percent = Math.round(scaledPermanentHPC * 100);
    effectSummary.push(`+${percent}% permanent HPC`);
    newState = {
      ...newState,
      permanentHPCBonus: newState.permanentHPCBonus + scaledPermanentHPC,
    };
  }

  newState = grantAchievement(newState, 'eventResolved');
  if (newState.totalEventsResolved >= 50) newState = grantAchievement(newState, 'eventsFifty');
  if (newState.totalEventsResolved >= 100) newState = grantAchievement(newState, 'eventsHundred');
  if (newState.totalEventsResolved >= 200) newState = grantAchievement(newState, 'eventsTwoHundred');

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

  // eternalQuill relic: offering buffs last 50% longer
  const durationMult = state.activeRelics.includes('eternalQuill') ? 1.5 : 1;

  const buff: TimedBuff = {
    id: `offering_${tier}_${Date.now()}`,
    hpsMultiplier: config.multiplier,
    remainingSeconds: Math.floor(config.duration * durationMult),
  };

  let newState: GameState = {
    ...state,
    karma: state.karma - config.karmaCost,
    activeBuffs: [...state.activeBuffs, buff],
    totalOfferings: state.totalOfferings + 1,
  };

  newState = grantAchievement(newState, 'dailyOffering');
  if (newState.totalOfferings >= 50) newState = grantAchievement(newState, 'offeringComplete');
  return newState;
}

// Suppress unused import warning — EVENTS used at runtime when EVENT_MAP is populated
void EVENTS;

// ─── Achievement Audit ────────────────────────────────────────────────────────

/**
 * Retroactively checks all statically determinable achievement conditions and
 * grants any that the player qualifies for but hasn't received yet.
 * Called once on game load so new achievements and load-time gaps are corrected.
 */
export function doAuditAchievements(state: GameState): GameState {
  let s = state;
  const grant = (id: string, condition: boolean) => {
    if (condition) s = grantAchievement(s, id);
  };

  // ── Sources ──
  const src = s.sources;
  const allSrcValues = Object.values(src);
  const maxOwned = Math.max(...allSrcValues);

  grant('firstCandle',       (src.moodCandle ?? 0) >= 1);
  grant('candleObsession',   (src.moodCandle ?? 0) >= 1000);
  grant('caveDweller',       (src.goonCave ?? 0) >= 1);
  grant('therapyRich',       (src.therapy ?? 0) >= 100);
  grant('singularity',       (src.blissSingularity ?? 0) >= 1);
  grant('napPodArmy',        (src.napPod ?? 0) >= 100);
  grant('allSources',        allSrcValues.every(n => n >= 1));
  grant('tenOfEach',         allSrcValues.every(n => n >= 10));
  grant('fiftyOfOne',        maxOwned >= 50);
  grant('hundredOfOne',      maxOwned >= 100);
  grant('twoHundredOfOne',   maxOwned >= 200);
  grant('fiveHundredOfOne',  maxOwned >= 500);
  grant('thousandOfOne',     maxOwned >= 1000);
  grant('twoThousandOfOne',  maxOwned >= 2000);
  grant('fiveThousandOfOne', maxOwned >= 5000);
  grant('zenGardenUnlock',   (src.zenGarden ?? 0) >= 1);
  grant('omniscientSpaUnlock',(src.omniscientSpa ?? 0) >= 1);
  grant('bobaAddiction',     (src.sweetTreat ?? 0) >= 1);
  grant('tenSweetTreats',    (src.sweetTreat ?? 0) >= 10);
  grant('studiousHaul',      (src.retailTherapy ?? 0) >= 100);
  grant('soundBathFirst',    (src.soundBath ?? 0) >= 1);
  grant('artGalleryFirst',   (src.artGallery ?? 0) >= 1);
  grant('artCollector',      (src.artGallery ?? 0) >= 100);
  // New source unlocks
  grant('dreamWeaverUnlock',   (src.dreamWeaver ?? 0) >= 1);
  grant('infiniteBuffetUnlock',(src.infiniteBuffet ?? 0) >= 1);
  grant('paradoxEngineUnlock', (src.paradoxEngine ?? 0) >= 1);
  grant('joySatelliteUnlock',  (src.joySatellite ?? 0) >= 1);
  grant('omegaTempleUnlock',   (src.omegaTemple ?? 0) >= 1);

  // Quantity milestones
  const sourcesAbove1000 = allSrcValues.filter(c => c >= 1000).length;
  grant('thousandOfFive',      sourcesAbove1000 >= 5);
  grant('fiveHundredAllSources', allSrcValues.every(c => c >= 500));
  const newSourceIds: SourceId[] = [
    'dreamWeaver', 'laughterForge', 'cloudLounge', 'goldenHammock',
    'pleasureArchive', 'infiniteBuffet', 'echoGarden', 'blissConduit',
    'seraphStation', 'paradoxEngine', 'memoryPalace', 'auroraSpire',
    'gravitySpa', 'euterpeHall', 'ambrosiaTap', 'joySatellite',
    'elysiumGate', 'cosmicHamper', 'eternitySofa', 'nirvanaCore',
    'transcendenceLab', 'celestialBath', 'euphoriaReactor', 'pleasurePlanet',
    'karmaFountain', 'infiniteHug', 'joyNova', 'omegaTemple',
  ];
  grant('allNewSourcesOwned', newSourceIds.every(id => (src[id] ?? 0) >= 1));

  if (s.prestigeCount >= 1) {
    const postPrestigeSources: SourceId[] = [
      'zenGarden', 'euphoriaSprings', 'serenityEngine',
      'raptureCathedral', 'cosmicJacuzzi', 'omniscientSpa',
    ];
    grant('allPostPrestige', postPrestigeSources.every(id => (src[id] ?? 0) >= 1));
  }

  // ── Clicking ──
  grant('firstClick',            s.lifetimeHappiness > 0 || s.totalClicks > 0);
  grant('hundredClicks',         s.totalClicks >= 100);
  grant('thousandClicks',        s.totalClicks >= 1_000);
  grant('tenThousandClicks',     s.totalClicks >= 10_000);
  grant('fiftyThousandClicks',   s.totalClicks >= 50_000);
  grant('hundredThousandClicks', s.totalClicks >= 100_000);

  // ── Rituals ──
  grant('ritualHundred', s.totalRituals >= 100);

  // ── Happiness (all-time) ──
  const lh = s.lifetimeHappiness;
  grant('firstThousand',      lh >= 1_000);
  grant('tenThousandHappiness',lh >= 10_000);
  grant('millionaire',        lh >= 1e6);
  grant('billionaire',        lh >= 1e9);
  grant('trillionaire',       lh >= 1e12);
  grant('philosopher',        lh >= 1e15);
  grant('quintillion',        lh >= 1e18);
  grant('septillion',         lh >= 1e24);
  grant('nonillion',          lh >= 1e30);
  grant('quindecillion',      lh >= 1e48);
  grant('happiness1e66',      lh >= 1e66);
  grant('happiness1e84',      lh >= 1e84);
  grant('happiness1e99',      lh >= 1e99);
  grant('happiness1e108',     lh >= 1e108);
  grant('happiness1e120',     lh >= 1e120);
  grant('happiness1e135',     lh >= 1e135);
  grant('happiness1e150',     lh >= 1e150);
  grant('happiness1e200',     lh >= 1e200);
  grant('happiness1e300',     lh >= 1e300);

  // ── Prestige ──
  grant('firstPrestige',        s.prestigeCount >= 1);
  grant('fivePrestige',         s.prestigeCount >= 5);
  grant('tenPrestige',          s.prestigeCount >= 10);
  grant('twentyPrestige',       s.prestigeCount >= 20);
  grant('thirtyPrestige',       s.prestigeCount >= 30);
  grant('fiftyPrestige',        s.prestigeCount >= 50);
  grant('seventyFivePrestige',  s.prestigeCount >= 75);
  grant('hundredPrestige',      s.prestigeCount >= 100);
  grant('twoHundredPrestige',   s.prestigeCount >= 200);

  // ── Pilgrimages ──
  grant('pilgrimageFirst',       s.totalPilgrimages >= 1);
  grant('pilgrimageTen',         s.totalPilgrimages >= 10);
  grant('pilgrimageTwentyFive',  s.totalPilgrimages >= 25);
  grant('pilgrimageFifty',       s.totalPilgrimages >= 50);
  grant('pilgrimageHundred',     s.totalPilgrimages >= 100);
  grant('pilgrimageStreak',      s.pilgrimageStreak >= 5);

  // ── Vibe Checks ──
  grant('vibeCheck',           s.totalVibeChecks >= 1);
  grant('vibeCheckTen',        s.totalVibeChecks >= 10);
  grant('vibeCheckTwentyFive', s.totalVibeChecks >= 25);
  grant('vibeCheckFifty',      s.totalVibeChecks >= 50);
  grant('vibeCheckHundred',    s.totalVibeChecks >= 100);

  // ── Events ──
  grant('eventResolved',    s.totalEventsResolved >= 1);
  grant('eventsFifty',      s.totalEventsResolved >= 50);
  grant('eventsHundred',    s.totalEventsResolved >= 100);
  grant('eventsTwoHundred', s.totalEventsResolved >= 200);

  // ── Karma ──
  grant('firstKarma',          s.peakKarma >= 0.1);
  grant('hundredKarma',        s.peakKarma >= 100);
  grant('goodKarma',           s.peakKarma >= 500);
  grant('thousandKarma',       s.karma >= 1_000);
  grant('fiveThousandKarma',   s.karma >= 5_000);
  grant('tenThousandKarma',    s.karma >= 10_000);
  grant('hundredThousandKarma',s.karma >= 100_000);

  // ── Relics ──
  const relicHistory = s.equippedRelicsHistory;
  grant('firstRelic',        relicHistory.length >= 1);
  grant('fiveRelics',        new Set(relicHistory).size >= 5);
  grant('tenRelics',         new Set(relicHistory).size >= 10);
  grant('twentyRelics',      new Set(relicHistory).size >= 20);
  grant('thirtyRelics',      new Set(relicHistory).size >= 30);
  grant('allRelics',         new Set(relicHistory).size >= RELICS.length);
  grant('allRelicsNew',      new Set(relicHistory).size >= 40);
  grant('philosophersStone', relicHistory.includes('philosophersStone'));
  grant('omegaRelicEquipped',s.activeRelics.includes('omegaRelic'));
  grant('maxRelics',         s.activeRelics.length >= s.maxRelicSlots && s.maxRelicSlots > 0);
  grant('noRelics',          lh >= 1e30 && s.activeRelics.length === 0);

  // ── Wheel ──
  const wp = s.wheelPurchased;
  grant('firstWheelUpgrade', wp.size >= 1);
  // Dynamic tier completion checks
  for (let t = 1; t <= 10; t++) {
    const tierUpgrades = WHEEL_UPGRADES.filter(u => u.tier === t);
    const allComplete = tierUpgrades.every(u => wp.has(u.id));
    if (allComplete && tierUpgrades.length > 0) {
      if (t === 4) grant('fullWheel', true);
      if (t === 5) grant('wheelTier5', true);
      if (t === 6) grant('wheelTier6', true);
      if (t === 7) grant('wheelTier7', true);
      if (t === 8) grant('wheelTier8', true);
      if (t === 9) grant('wheelTier9', true);
      if (t === 10) grant('wheelTier10', true);
    }
  }
  // Shard spending achievements
  const totalShardsSpent = WHEEL_UPGRADES
    .filter(u => wp.has(u.id))
    .reduce((sum, u) => sum + u.shardCost, 0);
  grant('hundredShards',        s.blissShards >= 100 || totalShardsSpent >= 100);
  grant('thousandShards',       s.blissShards >= 1_000 || totalShardsSpent >= 1_000);
  grant('tenThousandShards',    s.blissShards >= 10_000 || totalShardsSpent >= 10_000);
  grant('hundredThousandShards',s.blissShards >= 100_000 || totalShardsSpent >= 100_000);
  grant('millionShards',        s.blissShards >= 1_000_000 || totalShardsSpent >= 1_000_000);

  // ── Offerings ──
  grant('dailyOffering',    s.totalOfferings >= 1);
  grant('dailyOfferingTen', s.totalOfferings >= 10);
  grant('offeringComplete', s.totalOfferings >= 50);

  // ── Playtime ──
  const pt = s.totalPlaytime;
  grant('oneHour',          pt >= 3_600);
  grant('tenHours',         pt >= 36_000);
  grant('hundredHours',     pt >= 360_000);
  grant('twoHundredHours',  pt >= 720_000);
  grant('fiveHundredHours', pt >= 1_800_000);
  grant('thousandHours',    pt >= 3_600_000);
  grant('twoThousandHours', pt >= 7_200_000);
  grant('fiveThousandHours',pt >= 18_000_000);

  // ── Clicking (catch-up) ──
  grant('millionClicks',    s.totalClicks >= 1_000_000);

  // ── Sources ──
  const sourceValues = Object.values(src);
  const maxOfOne = Math.max(0, ...sourceValues.map(v => v ?? 0));
  grant('tenThousandOfOne', maxOfOne >= 10_000);
  // fiftyOfEach / hundredOfEach: every unlocked source at threshold
  const allSourceIds = SOURCES.map(b => b.id as SourceId);
  const ownedSourceIds = allSourceIds.filter(id => (src[id] ?? 0) >= 1);
  if (ownedSourceIds.length === allSourceIds.length) {
    grant('fiftyOfEach',    allSourceIds.every(id => (src[id] ?? 0) >= 50));
    grant('hundredOfEach',  allSourceIds.every(id => (src[id] ?? 0) >= 100));
  }

  // ── Synergies ──
  const allSynergiesMet = SYNERGIES.every(syn => {
    return (Object.entries(syn.requirements) as [SourceId, number][]).every(
      ([reqId, reqCount]) => (src[reqId] ?? 0) >= reqCount
    );
  });
  grant('allSynergies', allSynergiesMet);

  // ── Hidden ──
  grant('epicurusApproved', s.epicurusApprovedCount >= 5);
  grant('noUpgrades', lh >= 1e9 && s.upgrades.size === 0);
  // bankruptKarma: exactly 0 karma after having had 1000+
  grant('bankruptKarma', s.karma === 0 && s.peakKarma >= 1_000);
  // tenBuffsActive: 10+ active buffs
  const totalBuffs = s.activeBuffs.length + (s.vibeBuff ? 1 : 0);
  grant('tenBuffsActive', totalBuffs >= 10);
  // clickDuringPilgrimage
  grant('clickDuringPilgrimage', s.pilgrimageActive && s.totalClicks > 0 && s.pilgrimageStreak === 0);
  // speedPrestige10: prestige 10 in under 10 minutes of run time
  grant('speedPrestige10', s.prestigeCount >= 10 && s.runPlaytime < 600);
  // transcendUnderMinute: transcend in under 1 minute (checked in doTriggerTranscendence too)
  // allPhilosFrugal: choose frugal in 10 philosophical events
  grant('allPhilosFrugal', s.epicurusApprovedCount >= 10);
  // templeEternalAchievement: complex check, done below
  const allWheelComplete = WHEEL_UPGRADES.every(u => wp.has(u.id));
  const allSourcesOwned = allSourceIds.every(id => (src[id] ?? 0) >= 1);
  const allRelicsSeen = new Set(relicHistory).size >= RELICS.length;
  grant('templeEternalAchievement', allWheelComplete && allSourcesOwned && allRelicsSeen && s.upgrades.size >= UPGRADES.length);

  return s;
}
void SOURCE_MAP;
void SOURCES;
void UPGRADES;
