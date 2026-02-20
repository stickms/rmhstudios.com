/**
 * Temple of Joy — Tick Engine
 * Called on every animation frame. Mutates state immutably.
 */
import type { GameState } from './types';
import { computeTotalHPS, computeKarmaRate } from './engine';
import { MILESTONES } from './data/milestones';
import { EVENTS } from './data/events';

// ACHIEVEMENTS is imported for completeness; individual IDs are hardcoded
// in the tick for performance.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ACHIEVEMENTS } from './data/achievements';

// ─── Pilgrimage Burst ─────────────────────────────────────────────────────────

export function computePilgrimageBurst(state: GameState): number {
  const pilgrimageRelicBonus = state.activeRelics.includes('stuffedPillow') ? 1.5 : 1;
  return 5 * 60 * computeTotalHPS(state) * pilgrimageRelicBonus;
}

// ─── Main Tick ────────────────────────────────────────────────────────────────

/**
 * Advances the game state by `deltaMs` milliseconds.
 * Returns a new state object — never mutates the input.
 */
export function applyTick(state: GameState, deltaMs: number): GameState {
  // Cap delta to 1 second to prevent runaway jumps on tab resume
  const deltaSeconds = Math.min(deltaMs / 1000, 1);

  // ── 1 & 2. Rates ──────────────────────────────────────────────────────────
  const hps = computeTotalHPS(state);
  const karmaRate = computeKarmaRate(state);

  // ── 3–6. Happiness & peak ─────────────────────────────────────────────────
  const happinessGained = hps * deltaSeconds;
  let newHappiness = state.happiness + happinessGained;
  let newLifetimeHappiness = state.lifetimeHappiness + happinessGained;
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
  const newActiveBuffs = state.activeBuffs
    .map((b) => ({ ...b, remainingSeconds: b.remainingSeconds - deltaSeconds }))
    .filter((b) => b.remainingSeconds > 0);

  // ── 11. Vibe buff ─────────────────────────────────────────────────────────
  let newVibeBuff = state.vibeBuff;
  if (newVibeBuff) {
    const remaining = newVibeBuff.remainingSeconds - deltaSeconds;
    newVibeBuff = remaining > 0 ? { ...newVibeBuff, remainingSeconds: remaining } : null;
  }

  // ── 12. Timers ────────────────────────────────────────────────────────────
  const newVibeCheckTimer = Math.max(0, state.vibeCheckTimer - deltaSeconds);

  let newPilgrimageActive = state.pilgrimageActive;
  let newPilgrimageTimer = state.pilgrimageTimer;
  let newPilgrimageCooldown = Math.max(0, state.pilgrimageCooldown - deltaSeconds);
  if (newPilgrimageActive) {
    newPilgrimageTimer = state.pilgrimageTimer - deltaSeconds;
  }

  const newRitualCooldown = Math.max(0, state.ritualCooldown - deltaSeconds);
  let newEventTimer = Math.max(0, state.eventTimer - deltaSeconds);

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
  if (newPilgrimageActive && newPilgrimageTimer <= 0) {
    const burst = computePilgrimageBurst(state);
    newHappiness += burst;
    newLifetimeHappiness += burst;
    newPeakHappiness = Math.max(newPeakHappiness, newHappiness);
    newPilgrimageActive = false;
    newPilgrimageCooldown = 900;
    pilgrimeCompleted = true;
  }

  // ── 15. Milestones ────────────────────────────────────────────────────────
  let newMilestones = state.milestones;
  for (const milestone of MILESTONES) {
    if (newLifetimeHappiness >= milestone.threshold && !newMilestones.has(milestone.id)) {
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

  // Karma achievements
  if (newKarma >= 0.1 && state.karma < 0.1) grantAchievement('firstKarma');
  if (newKarma >= 100) grantAchievement('hundredKarma');
  if (newKarma >= 500) grantAchievement('goodKarma');

  // Pilgrimage achievements
  if (pilgrimeCompleted && state.totalPilgrimages + 1 >= 10) grantAchievement('pilgrimageTen');

  // Prestige achievements are now tracked in actions.ts (doTriggerTranscendence)

  // ── 17. Return new state ──────────────────────────────────────────────────
  // Clear expired event effect summary
  let newLastEventEffect = state.lastEventEffect;
  if (newLastEventEffect && Date.now() >= newLastEventEffect.expiresAt) {
    newLastEventEffect = null;
  }

  return {
    ...state,
    happiness: newHappiness,
    lifetimeHappiness: newLifetimeHappiness,
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
    ritualCooldown: newRitualCooldown,
    eventTimer: newEventTimer,
    pendingEvent: newPendingEvent,
    lastEventEffect: newLastEventEffect,
    milestones: newMilestones,
    achievements: newAchievements,
  };
}
