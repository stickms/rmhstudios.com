/**
 * Temple of Joy — Tick Engine
 * Called on every animation frame. Mutates state immutably.
 */
import type { GameState, SourceId } from './types';
import { computeTotalHPS, computeKarmaRate, computeSourceCost, computeMaxAffordable, computeSourcePrestigeReq } from './engine';
import { MILESTONES } from './data/milestones';
import { EVENTS } from './data/events';
import { SOURCES } from './data/sources';

// ACHIEVEMENTS is imported for completeness; individual IDs are hardcoded
// in the tick for performance.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ACHIEVEMENTS } from './data/achievements';

// ─── Pilgrimage Burst ─────────────────────────────────────────────────────────

export function computePilgrimageBurst(state: GameState): number {
  const pilgrimageRelicBonus = state.activeRelics.includes('stuffedPillow') ? 1.5 : 1;
  const nappingCatBonus = state.activeRelics.includes('nappingCat') ? 2 : 1;
  // pilgrimsStaff relic: burst ×3
  const staffBonus = state.activeRelics.includes('pilgrimsStaff') ? 3 : 1;
  // pilgrimsEnlightenment wheel: burst ×10
  const enlightenmentBonus = state.wheelPurchased.has('pilgrimsEnlightenment') ? 10 : 1;
  return 5 * 60 * computeTotalHPS(state) * pilgrimageRelicBonus * nappingCatBonus * staffBonus * enlightenmentBonus;
}

// ─── Main Tick ────────────────────────────────────────────────────────────────

/**
 * Advances the game state by `deltaMs` milliseconds.
 * Returns a new state object — never mutates the input.
 */
export function applyTick(state: GameState): GameState {
  // Wall-clock delta — accurate even when the tab is hidden / throttled
  const now = Date.now();
  const realDelta = (now - state.lastTickTime) / 1000;
  // Use full wall-clock delta for income so background time is never lost
  const deltaSeconds = realDelta;

  // ── 1 & 2. Rates ──────────────────────────────────────────────────────────
  const hps = computeTotalHPS(state);
  const karmaRate = computeKarmaRate(state);

  // ── 3–6. Happiness & peak ─────────────────────────────────────────────────
  let happinessGained = hps * deltaSeconds;

  // prestigeMomentum: ×3 HPS during first 3 minutes of a new run
  // perpetualMomentum: extends to 10 minutes
  const momentumDuration = state.wheelPurchased.has('perpetualMomentum') ? 600 : 180;
  if (state.wheelPurchased.has('prestigeMomentum') && state.totalPlaytime < momentumDuration) {
    happinessGained *= 3;
  }

  let newHappiness = state.happiness + happinessGained;
  let newLifetimeHappiness = state.lifetimeHappiness + happinessGained;
  const newRunHappiness = state.runHappiness + happinessGained;
  let newPeakHappiness = Math.max(state.peakHappiness, newHappiness);

  // ── 7. Karma ──────────────────────────────────────────────────────────────
  const newKarma = state.karma + karmaRate * deltaSeconds;
  const newPeakKarma = Math.max(state.peakKarma, newKarma);

  // ── 8. Total playtime ─────────────────────────────────────────────────────
  const newTotalPlaytime = state.totalPlaytime + deltaSeconds;

  // ── 9. Hedonic Treadmill ──────────────────────────────────────────────────
  // Baseline slowly drifts toward current happiness (~14 hours to fully catch up)
  const newBaseline =
    state.baselineHappiness +
    (state.happiness - state.baselineHappiness) * 0.00002 * deltaSeconds;

  // ── 10. Timed buffs ───────────────────────────────────────────────────────
  // temporalComfort relic: buffs tick down at 2/3 speed (last 50% longer)
  let buffTickRate = state.activeRelics.includes('temporalComfort') ? realDelta * (2 / 3) : realDelta;
  // temporalLoop wheel: buffs ×3 duration (tick down at 1/3 speed)
  if (state.wheelPurchased.has('temporalLoop')) buffTickRate /= 3;
  const newActiveBuffs = state.activeBuffs
    .map((b) => ({ ...b, remainingSeconds: b.remainingSeconds - buffTickRate }))
    .filter((b) => b.remainingSeconds > 0);

  // ── 11. Vibe buff ─────────────────────────────────────────────────────────
  let newVibeBuff = state.vibeBuff;
  if (newVibeBuff) {
    const remaining = newVibeBuff.remainingSeconds - buffTickRate;
    newVibeBuff = remaining > 0 ? { ...newVibeBuff, remainingSeconds: remaining } : null;
  }

  // ── 12. Timers (use realDelta for accurate catch-up after tab hidden) ────
  // crystalBall relic: vibe timer fills 30% faster
  const vibeTimerRate = state.activeRelics.includes('crystalBall') ? realDelta * 1.3 : realDelta;
  const newVibeCheckTimer = Math.max(0, state.vibeCheckTimer - vibeTimerRate);

  let newPilgrimageActive = state.pilgrimageActive;
  let newPilgrimageTimer = state.pilgrimageTimer;
  // pilgrimsStaff relic: pilgrimage duration −25% (tick rate ×4/3)
  const pilgrimageTickRate = state.activeRelics.includes('pilgrimsStaff') ? realDelta * (4 / 3) : realDelta;
  let newPilgrimageCooldown = Math.max(0, state.pilgrimageCooldown - realDelta);
  // celestialCompass relic: pilgrimage cooldown reduced 50%
  if (state.activeRelics.includes('celestialCompass')) {
    newPilgrimageCooldown = Math.max(0, state.pilgrimageCooldown - realDelta * 2);
  }
  // pilgrimsEnlightenment wheel: pilgrimage no cooldown
  if (state.wheelPurchased.has('pilgrimsEnlightenment')) newPilgrimageCooldown = 0;
  if (newPilgrimageActive) {
    newPilgrimageTimer = state.pilgrimageTimer - pilgrimageTickRate;
  }

  const newRitualCooldown = Math.max(0, state.ritualCooldown - realDelta);
  let newEventTimer = Math.max(0, state.eventTimer - realDelta);
  // temporalComfort relic: event frequency +25% (timer ticks 1.25× faster)
  if (state.activeRelics.includes('temporalComfort')) {
    newEventTimer = Math.max(0, state.eventTimer - realDelta * 1.25);
  }
  // temporalLoop wheel: events 2× faster
  if (state.wheelPurchased.has('temporalLoop')) {
    newEventTimer = Math.max(0, newEventTimer - realDelta);
  }

  // ── 13. Pending event ─────────────────────────────────────────────────────
  let newPendingEvent = state.pendingEvent;
  if (newEventTimer <= 0 && !newPendingEvent && EVENTS.length > 0) {
    const randomEvent = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    newPendingEvent = randomEvent.id;
    // Reset timer to 120–600 seconds (2–10 minutes)
    newEventTimer = Math.random() * 480 + 120;
  }

  // ── 14. Pilgrimage completion ─────────────────────────────────────────────
  let pilgrimeCompleted = false;
  let newPilgrimageStreak = state.pilgrimageStreak;

  if (newPilgrimageActive && newPilgrimageTimer <= 0) {
    const overshoot = -newPilgrimageTimer; // seconds past completion
    const burst = computePilgrimageBurst(state);
    newHappiness += burst;
    newLifetimeHappiness += burst;
    newPeakHappiness = Math.max(newPeakHappiness, newHappiness);
    newPilgrimageActive = false;
    newPilgrimageTimer = 0;
    newPilgrimageCooldown = Math.max(0, 900 - overshoot);
    pilgrimeCompleted = true;
    newPilgrimageStreak += 1;
  }

  // ── 15. Milestones ────────────────────────────────────────────────────────
  // astronomersLens relic: milestones unlock 1 tier earlier (threshold ÷10)
  const hasAstronomersLens = state.activeRelics.includes('astronomersLens');
  let newMilestones = state.milestones;
  for (const milestone of MILESTONES) {
    const effectiveThreshold = hasAstronomersLens ? milestone.threshold / 10 : milestone.threshold;
    if (newRunHappiness >= effectiveThreshold && !newMilestones.has(milestone.id)) {
      newMilestones = new Set(newMilestones);
      newMilestones.add(milestone.id);
    }
  }

  // ── 16. Achievements ─────────────────────────────────────────────────────
  let newAchievements = state.achievements;

  function grantAchievement(id: string): void {
    if (!newAchievements.has(id)) {
      newAchievements = new Set(newAchievements);
      newAchievements.add(id);
    }
  }

  // Playtime achievements
  if (newTotalPlaytime >= 3600) grantAchievement('oneHour');
  if (newTotalPlaytime >= 36_000) grantAchievement('tenHours');
  if (newTotalPlaytime >= 360_000) grantAchievement('hundredHours');
  if (newTotalPlaytime >= 720_000) grantAchievement('twoHundredHours');
  if (newTotalPlaytime >= 1_800_000) grantAchievement('fiveHundredHours');
  if (newTotalPlaytime >= 3_600_000) grantAchievement('thousandHours');

  // Lifetime happiness achievements
  if (newLifetimeHappiness >= 1_000) grantAchievement('firstThousand');
  if (newLifetimeHappiness >= 10_000) grantAchievement('tenThousandHappiness');
  if (newLifetimeHappiness >= 1e6) grantAchievement('millionaire');
  if (newLifetimeHappiness >= 1e9) grantAchievement('billionaire');
  if (newLifetimeHappiness >= 1e12) grantAchievement('trillionaire');
  if (newLifetimeHappiness >= 1e15) grantAchievement('philosopher');
  if (newLifetimeHappiness >= 1e18) grantAchievement('quintillion');
  if (newLifetimeHappiness >= 1e24) grantAchievement('septillion');
  if (newLifetimeHappiness >= 1e30) grantAchievement('nonillion');
  if (newLifetimeHappiness >= 1e48) grantAchievement('quindecillion');
  if (newLifetimeHappiness >= 1e66) grantAchievement('happiness1e66');
  if (newLifetimeHappiness >= 1e84) grantAchievement('happiness1e84');
  if (newLifetimeHappiness >= 1e99) grantAchievement('happiness1e99');
  if (newLifetimeHappiness >= 1e108) grantAchievement('happiness1e108');
  if (newLifetimeHappiness >= 1e120) grantAchievement('happiness1e120');
  if (newLifetimeHappiness >= 1e135) grantAchievement('happiness1e135');
  if (newLifetimeHappiness >= 1e150) grantAchievement('happiness1e150');
  if (newLifetimeHappiness >= 1e200) grantAchievement('happiness1e200');
  if (newLifetimeHappiness >= 1e300) grantAchievement('happiness1e300');

  // Karma achievements
  if (newKarma >= 0.1 && state.karma < 0.1) grantAchievement('firstKarma');
  if (newKarma >= 100) grantAchievement('hundredKarma');
  if (newKarma >= 500) grantAchievement('goodKarma');

  // Pilgrimage achievements
  if (pilgrimeCompleted) grantAchievement('pilgrimageFirst');
  if (pilgrimeCompleted && state.totalPilgrimages + 1 >= 10) grantAchievement('pilgrimageTen');
  if (newPilgrimageStreak >= 5) grantAchievement('pilgrimageStreak');

  // Hidden achievements
  // noUpgrades: reach 1B happiness with zero upgrades
  if (newLifetimeHappiness >= 1e9 && state.upgrades.size === 0) grantAchievement('noUpgrades');
  // idleForever: let game run 1 hour without clicking
  if (Date.now() - state.lastClickTime >= 3_600_000) grantAchievement('idleForever');

  // Prestige achievements are now tracked in actions.ts (doTriggerTranscendence)

  // ── 17. Auto-buy timer (autoBuyer wheel upgrades) ────────────────────────
  let newAutoBuyTimer = state.autoBuyTimer - deltaSeconds;
  let autoBuySources = state.sources;
  let autoBuyHappiness = newHappiness;

  // Prune recentClickTimes — remove entries > 10s old to keep state consistent
  const prunedClickTimes = state.recentClickTimes.filter(t => now - t <= 10_000);

  const hasAutoBuyer =
    state.wheelPurchased.has('autoBuyer1') ||
    state.wheelPurchased.has('autoBuyer2') ||
    state.wheelPurchased.has('autoBuyer3');

  if (hasAutoBuyer && state.autoBuyEnabled && newAutoBuyTimer <= 0) {
    // sacredAutomation wheel: auto-buyer every 10s; omegaAutomation: every 5s
    const autoBuyInterval = state.wheelPurchased.has('omegaAutomation') ? 5
      : state.wheelPurchased.has('sacredAutomation') ? 10
      : 30;
    newAutoBuyTimer = autoBuyInterval;
    // Work on mutable copies only when the timer fires
    let workSources = { ...state.sources };
    let workHappiness = newHappiness;

    // Helper: build an ephemeral state with latest happiness/sources
    const tempState = (): GameState => ({
      ...state,
      happiness: workHappiness,
      sources: workSources,
    });

    // Unlocked sources sorted by baseCost descending
    const unlocked = SOURCES.filter(
      (b) => {
        const req = computeSourcePrestigeReq(b.id as SourceId, state);
        return req <= state.prestigeCount;
      }
    ).sort((a, b) => b.baseCost - a.baseCost);

    if (state.wheelPurchased.has('autoBuyer3')) {
      // Cascade: buy max of most expensive, then next, etc.
      for (const source of unlocked) {
        const ts = tempState();
        const n = computeMaxAffordable(source.id as SourceId, ts);
        if (n <= 0) continue;
        let cost = 0;
        for (let i = 0; i < n; i++) {
          cost += computeSourceCost(
            source.id as SourceId,
            (workSources[source.id as SourceId] ?? 0) + i,
            ts
          );
        }
        workHappiness -= cost;
        workSources = {
          ...workSources,
          [source.id]: (workSources[source.id as SourceId] ?? 0) + n,
        };
      }
    } else if (state.wheelPurchased.has('autoBuyer2')) {
      // Buy max of the single most expensive affordable source
      for (const source of unlocked) {
        const ts = tempState();
        const n = computeMaxAffordable(source.id as SourceId, ts);
        if (n <= 0) continue;
        let cost = 0;
        for (let i = 0; i < n; i++) {
          cost += computeSourceCost(
            source.id as SourceId,
            (workSources[source.id as SourceId] ?? 0) + i,
            ts
          );
        }
        workHappiness -= cost;
        workSources = {
          ...workSources,
          [source.id]: (workSources[source.id as SourceId] ?? 0) + n,
        };
        break; // only most expensive
      }
    } else {
      // autoBuyer1: buy 1 of most expensive affordable source
      for (const source of unlocked) {
        const ts = tempState();
        const cost = computeSourceCost(
          source.id as SourceId,
          workSources[source.id as SourceId] ?? 0,
          ts
        );
        if (workHappiness < cost) continue;
        workHappiness -= cost;
        workSources = {
          ...workSources,
          [source.id]: (workSources[source.id as SourceId] ?? 0) + 1,
        };
        break; // only most expensive
      }
    }

    autoBuySources = workSources;
    autoBuyHappiness = workHappiness;
  }

  // ── 18. Return new state ──────────────────────────────────────────────────
  // Clear expired event effect summary
  let newLastEventEffect = state.lastEventEffect;
  if (newLastEventEffect && Date.now() >= newLastEventEffect.expiresAt) {
    newLastEventEffect = null;
  }

  return {
    ...state,
    lastTickTime: now,
    recentClickTimes: prunedClickTimes,
    happiness: autoBuySources !== state.sources ? autoBuyHappiness : newHappiness,
    sources: autoBuySources,
    lifetimeHappiness: newLifetimeHappiness,
    runHappiness: newRunHappiness,
    peakHappiness: newPeakHappiness,
    karma: newKarma,
    peakKarma: newPeakKarma,
    totalPlaytime: newTotalPlaytime,
    totalPilgrimages: state.totalPilgrimages + (pilgrimeCompleted ? 1 : 0),
    baselineHappiness: newBaseline,
    activeBuffs: newActiveBuffs,
    vibeBuff: newVibeBuff,
    vibeCheckTimer: newVibeCheckTimer,
    pilgrimageActive: newPilgrimageActive,
    pilgrimageTimer: newPilgrimageTimer,
    pilgrimageCooldown: newPilgrimageCooldown,
    pilgrimageStreak: newPilgrimageStreak,
    ritualCooldown: newRitualCooldown,
    eventTimer: newEventTimer,
    pendingEvent: newPendingEvent,
    lastEventEffect: newLastEventEffect,
    milestones: newMilestones,
    achievements: newAchievements,
    autoBuyTimer: newAutoBuyTimer,
  };
}
