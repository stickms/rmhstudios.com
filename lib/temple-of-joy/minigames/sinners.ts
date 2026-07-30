/**
 * Sinners — the best reason in the game to close the tab.
 *
 * They arrive during the Rapture, latch onto the temple, and drink 5% of your
 * rate each. Twelve of them will take more than half your income, which looks
 * like a disaster. It is not: everything they drink is held, and striking one
 * hands it all back multiplied. Leaving a full house feeding overnight is worth
 * far more than the same night spent producing normally.
 *
 * These are Cookie Clicker's wrinklers, and the 5%-each / ×1.1-back numbers are
 * theirs, because they are the numbers that make the trade genuinely close
 * before upgrades and clearly correct after them.
 */
import type { Sinner } from '../types';

/** Share of joy-per-second each fully-latched Sinner drinks. */
export const SINNER_APPETITE = 0.05;

/** What a Sinner hands back, as a multiple of what it drank, before blessings. */
export const SINNER_BASE_YIELD = 1.1;

/** A penitent Sinner pays triple and does not count against your rate. */
export const PENITENT_YIELD = 3;
export const PENITENT_CHANCE = 0.04;

/** How many can feed at once, per Rapture stage. */
export const SINNER_CAP = [0, 4, 8, 12];

/** Seconds for a new one to arrive, per Rapture stage. Slower when calm. */
export const SINNER_SPAWN_SECONDS = [Infinity, 120, 75, 45];

/** Seconds a Sinner takes to fully latch on. It drinks nothing until it has. */
export const ARRIVAL_SECONDS = 15;

export interface SinnerAdvance {
  sinners: Sinner[];
  /** Joy diverted into Sinners this step — subtracted from income, not lost. */
  swallowed: number;
  /** Whether a new one arrived, for the sound. */
  arrived: boolean;
}

/**
 * Advance the congregation of Sinners. `jps` is the temple's rate *before* the
 * Sinner deduction, so the arithmetic stays honest whichever order the tick
 * runs in.
 */
export function advanceSinners(
  sinners: Sinner[],
  deltaSeconds: number,
  jps: number,
  rapture: number,
  appetiteMultiplier: number,
  nextId: () => number,
  random: () => number = Math.random,
): SinnerAdvance {
  if (rapture <= 0) {
    // Sinners already present keep feeding even after you close the window —
    // you invited them, and they are not obliged to leave.
    if (sinners.length === 0) return { sinners, swallowed: 0, arrived: false };
  }

  const cap = SINNER_CAP[Math.min(rapture, 3)] ?? 0;
  const out: Sinner[] = [];
  let swallowed = 0;

  for (const sinner of sinners) {
    const arrival = Math.min(1, sinner.arrival + deltaSeconds / ARRIVAL_SECONDS);
    const share = SINNER_APPETITE * appetiteMultiplier * arrival;
    const drank = jps * share * deltaSeconds;
    swallowed += sinner.penitent ? 0 : drank;
    out.push({ ...sinner, arrival, swallowed: sinner.swallowed + drank });
  }

  // Arrivals. One roll per second of elapsed time, capped so that a long
  // absence fills the house rather than spawning a thousand.
  let arrived = false;
  if (rapture > 0 && out.length < cap) {
    const perSecond = 1 / (SINNER_SPAWN_SECONDS[Math.min(rapture, 3)] ?? Infinity);
    const expected = perSecond * deltaSeconds;
    // Deterministic part plus a fractional roll: exact over long spans, still
    // surprising over short ones.
    let spawns = Math.floor(expected);
    if (random() < expected - spawns) spawns++;
    spawns = Math.min(spawns, cap - out.length);

    for (let i = 0; i < spawns; i++) {
      out.push({
        id: nextId(),
        swallowed: 0,
        arrival: 0,
        // Spread them around the temple rather than stacking them.
        angle: (out.length * 137.5) % 360,
        penitent: random() < PENITENT_CHANCE,
      });
      arrived = true;
    }
  }

  return { sinners: out, swallowed, arrived };
}

/** Joy returned by striking `sinner`. */
export function sinnerPayout(sinner: Sinner, yieldMultiplier: number): number {
  const base = sinner.penitent ? PENITENT_YIELD : SINNER_BASE_YIELD;
  return sinner.swallowed * base * yieldMultiplier;
}

/** The share of joy-per-second currently being diverted, 0..1. */
export function sinnerDrain(sinners: Sinner[], appetiteMultiplier: number): number {
  let drain = 0;
  for (const sinner of sinners) {
    if (sinner.penitent) continue;
    drain += SINNER_APPETITE * appetiteMultiplier * sinner.arrival;
  }
  return Math.min(0.95, drain);
}
