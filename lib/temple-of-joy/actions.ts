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
import { SOURCE_MAP, INITIAL_SOURCES } from './data/sources';
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
    totalClicks: 0,
    totalPilgrimages: 0,
    totalVibeChecks: 0,
    totalEventsResolved: 0,
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
    happinessGained = hpc * burstMultiplier * incenseBonus;
    let cooldownBase = state.wheelPurchased.has('ritualMastery') ? 15 : 30;
    // incenseOfAncients relic: ritual cooldown halved
    if (state.activeRelics.includes('incenseOfAncients')) cooldownBase /= 2;
    newRitualCooldown = cooldownBase;
    finalClickTimes = [];
    ritualTriggered = true;
  } else {
    happinessGained = hpc;
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
  if (state.karma < def.karmaCost) return state;
  if (state.activeRelics.includes(relicId)) return state;
  if (state.activeRelics.length >= state.maxRelicSlots) return state;

  const newHistory = new Set(state.equippedRelicsHistory);
  newHistory.add(relicId);

  let newState: GameState = {
    ...state,
    karma: state.karma - def.karmaCost,
    activeRelics: [...state.activeRelics, relicId],
    equippedRelicsHistory: Array.from(newHistory),
  };

  newState = grantAchievement(newState, 'firstRelic');

  // Check if all 20 relics have been equipped
  if (newHistory.size >= 20) {
    newState = grantAchievement(newState, 'allRelics');
  }

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
    // Use player's hand-picked selections, filtered to upgrades still owned this run
    const validSelections = state.emberSelections.filter(id => state.upgrades.has(id)).slice(0, 5);
    retainedUpgrades = new Set(validSelections);
  }

  // Karmically retained resources
  const retainedKarma = state.wheelPurchased.has('karmicVessel') ? state.karma : 0;

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

  // karmicOverflow: +2 max relic slots
  const bonusRelicSlots = state.wheelPurchased.has('karmicOverflow') ? 2 : 0;

  // theRemembering: if NOT purchased, milestones reset on prestige
  const retainedMilestones = state.wheelPurchased.has('theRemembering')
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

  const startingHappiness = wealthierBonus + nirvanaBlueprintBonus;

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
  });

  // Grant prestige achievements
  newState = grantAchievement(newState, 'firstPrestige');
  if (newPrestigeCount >= 5) newState = grantAchievement(newState, 'fivePrestige');
  if (newPrestigeCount >= 10) newState = grantAchievement(newState, 'tenPrestige');
  if (newPrestigeCount >= 20) newState = grantAchievement(newState, 'twentyPrestige');
  if (newPrestigeCount >= 30) newState = grantAchievement(newState, 'thirtyPrestige');
  if (newPrestigeCount >= 50) newState = grantAchievement(newState, 'fiftyPrestige');

  // speedPrestige: first prestige in under 30 minutes
  if (newPrestigeCount === 1 && state.totalPlaytime < 1800) {
    newState = grantAchievement(newState, 'speedPrestige');
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

  // Check if all tier 4 upgrades are purchased (fullWheel)
  const tier4Upgrades = [
    'templeEternal',
    'infiniteWheel',
    'nirvanaBlueprint',
    'divineMemory',
    'autoBuyer2',
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

  // Track epicurusApproved
  if (eventDef.type === 'philosophical' && eventDef.choices) {
    const choice = eventDef.choices[choiceIndex];
    if (choice) {
      const isFrugal = [
        'Agree with him',
        'Rest instead',
        'I need it to be real.',
        'Yes. It is enough.'
      ].includes(choice.label);

      if (isFrugal) {
        newState.epicurusApprovedCount += 1;
        if (newState.epicurusApprovedCount >= 5) {
          newState = grantAchievement(newState, 'epicurusApproved');
        }
      }
    }
  }

  // Apply happiness bonus (always expressed as minutes of current HPS income)
  if (effect.happinessBonus !== undefined) {
    const bonusHP = computeTotalHPS(state) * effect.happinessBonus * 60;
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
  grant('zenGardenUnlock',   (src.zenGarden ?? 0) >= 1);
  grant('omniscientSpaUnlock',(src.omniscientSpa ?? 0) >= 1);
  grant('bobaAddiction',     (src.sweetTreat ?? 0) >= 1);
  grant('tenSweetTreats',    (src.sweetTreat ?? 0) >= 10);
  grant('studiousHaul',      (src.retailTherapy ?? 0) >= 100);
  grant('soundBathFirst',    (src.soundBath ?? 0) >= 1);
  grant('artGalleryFirst',   (src.artGallery ?? 0) >= 1);
  grant('artCollector',      (src.artGallery ?? 0) >= 100);

  if (s.prestigeCount >= 1) {
    const postPrestigeSources: SourceId[] = [
      'zenGarden', 'euphoriaSprings', 'serenityEngine',
      'raptureCathedral', 'cosmicJacuzzi', 'omniscientSpa',
    ];
    grant('allPostPrestige', postPrestigeSources.every(id => (src[id] ?? 0) >= 1));
  }

  // ── Clicking ──
  grant('firstClick',        s.lifetimeHappiness > 0 || s.totalClicks > 0);
  grant('hundredClicks',     s.totalClicks >= 100);
  grant('thousandClicks',    s.totalClicks >= 1_000);
  grant('tenThousandClicks', s.totalClicks >= 10_000);

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

  // ── Prestige ──
  grant('firstPrestige',  s.prestigeCount >= 1);
  grant('fivePrestige',   s.prestigeCount >= 5);
  grant('tenPrestige',    s.prestigeCount >= 10);
  grant('twentyPrestige', s.prestigeCount >= 20);
  grant('thirtyPrestige', s.prestigeCount >= 30);
  grant('fiftyPrestige',  s.prestigeCount >= 50);

  // ── Pilgrimages ──
  grant('pilgrimageFirst', s.totalPilgrimages >= 1);
  grant('pilgrimageTen',   s.totalPilgrimages >= 10);
  grant('pilgrimageStreak',s.pilgrimageStreak >= 5);

  // ── Vibe Checks ──
  grant('vibeCheck',    s.totalVibeChecks >= 1);
  grant('vibeCheckTen', s.totalVibeChecks >= 10);

  // ── Events ──
  grant('eventResolved', s.totalEventsResolved >= 1);
  grant('eventsFifty',   s.totalEventsResolved >= 50);

  // ── Karma ──
  grant('firstKarma',   s.peakKarma >= 0.1);
  grant('hundredKarma', s.peakKarma >= 100);
  grant('goodKarma',    s.peakKarma >= 500);

  // ── Relics ──
  const relicHistory = s.equippedRelicsHistory;
  grant('firstRelic',        relicHistory.length >= 1);
  grant('allRelics',         relicHistory.length >= 20);
  grant('philosophersStone', relicHistory.includes('philosophersStone'));
  grant('maxRelics',         s.activeRelics.length >= s.maxRelicSlots && s.maxRelicSlots > 0);

  // ── Wheel ──
  const wp = s.wheelPurchased;
  grant('firstWheelUpgrade', wp.size >= 1);
  const tier4Ids = ['templeEternal', 'infiniteWheel', 'nirvanaBlueprint', 'divineMemory', 'autoBuyer2'];
  grant('fullWheel', tier4Ids.every(id => wp.has(id)));

  // ── Playtime ──
  const pt = s.totalPlaytime;
  grant('oneHour',        pt >= 3_600);
  grant('tenHours',       pt >= 36_000);
  grant('hundredHours',   pt >= 360_000);
  grant('twoHundredHours',pt >= 720_000);
  grant('fiveHundredHours',pt >= 1_800_000);
  grant('thousandHours',  pt >= 3_600_000);

  // ── Hidden ──
  grant('epicurusApproved', s.epicurusApprovedCount >= 5);
  // noUpgrades: deterministic — had 1B+ happiness with nothing purchased
  grant('noUpgrades', lh >= 1e9 && s.upgrades.size === 0);

  return s;
}
void SOURCE_MAP;
