/**
 * Scoring taps against the written onsets of a rhythm. Pure: every time is ms on the one
 * `performance.now()` clock (see `scoring/timing.ts`, whose constants and latency rule this builds on;
 * `tapScore` there is for evenly spaced beats and is unchanged).
 *
 * Each tap (after the repeat filter, and with the learner's latency taken off) is matched, in time
 * order, to the nearest written onset not yet answered, if one is within {@link ZERO_MS}: 100 up to
 * {@link PERFECT_MS}, then falling linearly to 0. A written onset no tap answered scores 0 and is
 * `missed`. A tap that answers nothing, or a second tap for an onset already answered, is an EXTRA
 * and costs {@link EXTRA_TAP_COST}; that is how a tap in a rest counts. Only taps inside the bar
 * (`window`, by default a little either side of the onsets) are part of the run: the count-in and
 * the tail cost nothing. The score is the mean over the written onsets.
 */
import { DEBOUNCE_MS, EXTRA_TAP_COST, MAX_LATENCY_MS, PERFECT_MS, ZERO_MS } from './timing';

export type OnsetState = 'on-time' | 'early' | 'late' | 'missed';

export interface OnsetNote {
  state: OnsetState;
  /** How far the answering tap was from the onset, ms: negative early, positive late; null if missed. */
  offsetMs: number | null;
  /** 0..100. */
  points: number;
}

export interface OnsetScore {
  /** 0..100, whole. */
  score: number;
  /** One per expected onset, in time order. */
  notes: OnsetNote[];
  /** Onsets answered within {@link PERFECT_MS}. */
  hits: number;
  early: number;
  late: number;
  missed: number;
  /** Taps that answered no onset, each as a time (ms, latency already taken off), in order. */
  extras: number[];
}

export interface OnsetWindow {
  fromMs: number;
  toMs: number;
}

const finiteSorted = (xs: readonly number[]) => xs.filter(Number.isFinite).sort((a, b) => a - b);

export function onsetScore(
  expectedMs: readonly number[],
  tapsMs: readonly number[],
  latencyMs: number,
  window?: OnsetWindow,
): OnsetScore {
  const expected = finiteSorted(expectedMs);
  const empty: OnsetScore = { score: 0, notes: [], hits: 0, early: 0, late: 0, missed: 0, extras: [] };
  if (expected.length === 0) return empty;
  const latency = Number.isFinite(latencyMs) ? Math.min(MAX_LATENCY_MS, Math.max(-MAX_LATENCY_MS, latencyMs)) : 0;

  // Key repeat and bounce: judged against the previous tap of any kind (as `tapScore` does).
  const kept: number[] = [];
  let previous = -Infinity;
  for (const tap of finiteSorted(tapsMs)) {
    if (tap - previous >= DEBOUNCE_MS) kept.push(tap - latency);
    previous = tap;
  }

  const from = window?.fromMs ?? expected[0]! - ZERO_MS;
  const to = window?.toMs ?? expected[expected.length - 1]! + ZERO_MS;
  const notes: OnsetNote[] = expected.map(() => ({ state: 'missed', offsetMs: null, points: 0 }));
  const answered = new Array<boolean>(expected.length).fill(false);
  const extras: number[] = [];
  for (const t of kept) {
    if (t < from || t > to) continue;
    let nearest = -1;
    for (let i = 0; i < expected.length; i++) {
      if (answered[i]) continue;
      if (nearest < 0 || Math.abs(t - expected[i]!) < Math.abs(t - expected[nearest]!)) nearest = i;
    }
    const off = nearest < 0 ? Infinity : t - expected[nearest]!;
    const distance = Math.abs(off);
    if (distance > ZERO_MS) {
      extras.push(t);
      continue;
    }
    answered[nearest] = true;
    notes[nearest] = {
      state: distance <= PERFECT_MS ? 'on-time' : off < 0 ? 'early' : 'late',
      offsetMs: off,
      points: distance <= PERFECT_MS ? 100 : (100 * (ZERO_MS - distance)) / (ZERO_MS - PERFECT_MS),
    };
  }

  const points = notes.reduce((sum, n) => sum + n.points, 0);
  const raw = (points - extras.length * EXTRA_TAP_COST * 100) / expected.length;
  return {
    score: Math.min(100, Math.max(0, Math.round(raw))),
    notes,
    hits: notes.filter((n) => n.state === 'on-time').length,
    early: notes.filter((n) => n.state === 'early').length,
    late: notes.filter((n) => n.state === 'late').length,
    missed: notes.filter((n) => n.state === 'missed').length,
    extras,
  };
}
