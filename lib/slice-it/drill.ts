/**
 * Slice It — failed-section drilling (`P2`) and the personal-best ghost (`P9`).
 *
 * Nothing records *where* in a chart you missed: `RunStats` keeps a judgement
 * histogram and totals, and the per-note timestamps the engine computes are
 * discarded when the run ends. So the one thing a player wants after a failed
 * run — "which bar did I lose it on" — is the one thing the game cannot say.
 *
 * Pure and browser-safe. The engine collects the log; everything here is
 * arithmetic over it.
 */

import type { Section } from './beatmap/sections';
import type { HitResult } from './constants';

/** One judged note, as the engine records it. */
export interface NoteLogEntry {
  /** Seconds into the chart. */
  time: number;
  result: HitResult;
  /** Signed hit offset in ms. Negative is early. */
  offset: number;
}

/**
 * What a judgement is worth when measuring a section.
 *
 * Deliberately NOT the scoring weights: this is "how well did you play this
 * bar", and a scoring curve tuned to make MARVELOUS worth chasing would say a
 * section of GREATs was a disaster. A flat-ish ramp answers the question being
 * asked.
 */
const RESULT_WEIGHT: Record<HitResult, number> = {
  MARVELOUS: 1,
  PERFECT: 0.95,
  GREAT: 0.8,
  GOOD: 0.6,
  BAD: 0.3,
  MISS: 0,
  NONE: 0,
};

export interface SectionAccuracy {
  notes: number;
  /** 0–1, or 0 when nothing was judged in the window. */
  value: number;
  misses: number;
}

export function accuracyIn(
  log: readonly NoteLogEntry[],
  from: number,
  to: number,
): SectionAccuracy {
  let notes = 0;
  let sum = 0;
  let misses = 0;
  for (const entry of log) {
    if (entry.time < from || entry.time >= to) continue;
    notes++;
    sum += RESULT_WEIGHT[entry.result] ?? 0;
    if (entry.result === 'MISS') misses++;
  }
  return { notes, value: notes === 0 ? 0 : sum / notes, misses };
}

/**
 * A section with fewer notes than this is not a drill target.
 *
 * Eight. A three-note section where you missed two reads as 33% accuracy and
 * would win every ranking, sending the player to loop four seconds of an intro.
 */
export const MIN_DRILL_NOTES = 8;

/** The section that went worst, or null when nothing qualifies. */
export function worstSection(
  log: readonly NoteLogEntry[],
  sections: readonly Section[],
): Section | null {
  const scored = sections
    .map((section) => ({ section, acc: accuracyIn(log, section.start, section.end) }))
    .filter((entry) => entry.acc.notes >= MIN_DRILL_NOTES)
    .sort((a, b) => a.acc.value - b.acc.value);
  return scored[0]?.section ?? null;
}

/** Every section ranked worst-first, for a results-screen breakdown. */
export function sectionBreakdown(
  log: readonly NoteLogEntry[],
  sections: readonly Section[],
): { section: Section; accuracy: SectionAccuracy }[] {
  return sections
    .map((section) => ({ section, accuracy: accuracyIn(log, section.start, section.end) }))
    .sort((a, b) => a.accuracy.value - b.accuracy.value);
}

/* ─── The ratchet ────────────────────────────────────────────────────────── */

export const DRILL_MIN_RATE = 0.5;
export const DRILL_MAX_RATE = 1.0;
/** Accuracy that counts as clearing a drill repetition. */
export const DRILL_CLEAR_ACCURACY = 0.9;

/**
 * Rocksmith's Riff Repeater ratchet: succeed, speed up; fail, slow down.
 *
 * Symmetric steps, unlike `P7`'s asymmetric session ladder — and for the
 * opposite reason. A session ladder is trying to find your level and should
 * fall faster than it climbs; a drill is trying to get you to full speed on one
 * bar, and a step that drops further than it rises makes the last 10% take
 * forever.
 *
 * Capped at 1.0: a drill is not a speed mod, and rehearsing a bar faster than
 * it will ever be played trains the wrong thing.
 */
export function nextRate(rate: number, cleared: boolean): number {
  const next = cleared ? rate + 0.1 : rate - 0.1;
  // Rounded, or floating-point accumulation walks 0.7 to 0.7000000000000001 and
  // the UI shows it.
  return Math.round(Math.max(DRILL_MIN_RATE, Math.min(DRILL_MAX_RATE, next)) * 100) / 100;
}

export interface DrillState {
  from: number;
  to: number;
  rate: number;
  /** Repetitions played. */
  reps: number;
  /** Consecutive clears at the current rate. */
  streak: number;
  /** True once a rep at full speed is cleared. */
  graduated: boolean;
}

export function startDrill(section: Section, rate = 0.7): DrillState {
  return {
    from: section.start,
    to: section.end,
    rate: Math.max(DRILL_MIN_RATE, Math.min(DRILL_MAX_RATE, rate)),
    reps: 0,
    streak: 0,
    graduated: false,
  };
}

/**
 * Advance a drill by one repetition.
 *
 * **Two consecutive clears to speed up, one failure to slow down.** One clear
 * is luck at the edge of your ability; requiring two is what makes the ratchet
 * a measurement rather than a coin flip, and it is what Rocksmith does.
 */
export function advanceDrill(state: DrillState, accuracy: number): DrillState {
  const cleared = accuracy >= DRILL_CLEAR_ACCURACY;
  const streak = cleared ? state.streak + 1 : 0;

  if (!cleared) {
    return { ...state, reps: state.reps + 1, streak: 0, rate: nextRate(state.rate, false) };
  }
  if (state.rate >= DRILL_MAX_RATE) {
    return { ...state, reps: state.reps + 1, streak, graduated: true };
  }
  if (streak >= 2) {
    return { ...state, reps: state.reps + 1, streak: 0, rate: nextRate(state.rate, true) };
  }
  return { ...state, reps: state.reps + 1, streak };
}

/* ─── P9 — the personal-best ghost ───────────────────────────────────────── */

/**
 * Sample a run's score into one value per second.
 *
 * A step function: score never decreases, so a second with no sample holds the
 * previous value. A 15-minute track is 900 integers — small enough to store on
 * the leaderboard row and load *with* it, which is what makes the ghost appear
 * instantly rather than after a second fetch.
 */
export function sampleCurve(
  log: readonly { time: number; score: number }[],
  duration: number,
): number[] {
  const length = Math.max(1, Math.ceil(duration));
  const out = new Array<number>(length).fill(0);
  let cursor = 0;
  let last = 0;
  // `log` is assumed time-ordered, which the engine's own append order
  // guarantees. Sorting here would be a defensive copy of up to 1200 entries on
  // every submit for a property the producer already holds.
  for (let second = 0; second < length; second++) {
    while (cursor < log.length && log[cursor].time <= second) last = log[cursor++].score;
    out[second] = last;
  }

  // The final score is pinned to the last bucket.
  //
  // Without this it falls off the end: a run whose last note lands at 4.9s in a
  // 5-second chart samples into indices 0–4, and 4.9 belongs to a second that
  // does not exist. A ghost that never reaches the personal best it is racing
  // is the one thing this feature must not do.
  const finalScore = log.length > 0 ? log[log.length - 1].score : 0;
  if (finalScore > out[length - 1]) out[length - 1] = finalScore;
  return out;
}

/**
 * How far ahead of (or behind) the ghost you are, right now.
 *
 * Returns null before the curve starts carrying information — at t=0 everyone
 * is level, and a "+0" that sits there for the first second reads as the
 * feature not working.
 */
export function paceAgainst(
  curve: readonly number[],
  seconds: number,
  score: number,
): number | null {
  if (curve.length === 0 || seconds < 1) return null;
  const index = Math.min(curve.length - 1, Math.floor(seconds));
  return score - curve[index];
}

/** Narrow a stored curve back to numbers, dropping anything malformed. */
export function readCurve(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: number[] = [];
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return null;
    out.push(entry);
  }
  return out;
}
