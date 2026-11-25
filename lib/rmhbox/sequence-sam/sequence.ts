/**
 * RMHbox — Sequence Sam: the pure rules.
 *
 * Seeded generation (four pads, no pad three times in a row), judging a tap,
 * scoring with the speed bonus and the "out" rule. Nothing here touches the
 * clock, a socket or zod, so the server handler, the client and the tests all
 * read the same numbers.
 */

import { createSeededRng } from '../../lights-out/seed';

/** Pads in the grid. A tap is a number from 0 to PAD_COUNT - 1. */
export const SS_PAD_COUNT = 4;
/** The pads, by index: each has a name and a shape as well as a colour. */
export const SS_PAD_NAMES = ['circle', 'square', 'triangle', 'diamond'] as const;
export type SequenceSamPadName = (typeof SS_PAD_NAMES)[number];

/** Steps in round 1; each round adds one. */
export const SS_START_LENGTH = 3;
/** Points for each step of a correct full sequence. */
export const SS_POINTS_PER_STEP = 100;
/** Points for each correct step of a sequence that was not finished. */
export const SS_MISS_POINTS_PER_STEP = 60;
/** The most a speed bonus can add. */
export const SS_MAX_SPEED_BONUS = 50;
/** A player who misses this many times in a match is out for the rest of it. */
export const SS_MAX_MISSES = 2;
/** Share of a step's time the pad stays lit; it is dark for the rest. */
export const SS_LIT_SHARE = 0.7;

/** The sequence's length in a round (0-based round index). */
export function lengthForRound(roundIndex: number): number {
  return SS_START_LENGTH + Math.max(0, Math.floor(roundIndex));
}

/** How long a step's pad is lit, in ms, for a step of `stepMs`. */
export function litMsFor(stepMs: number): number {
  return Math.round(stepMs * SS_LIT_SHARE);
}

/**
 * The same seed and length always give the same sequence. No pad appears three
 * times in a row: when a draw would make a third, it is redrawn from the other
 * three pads.
 */
export function generateSequence(seed: number, length: number): number[] {
  const rng = createSeededRng(seed >>> 0);
  const steps: number[] = [];
  for (let i = 0; i < length; i++) {
    let pad = Math.floor(rng() * SS_PAD_COUNT);
    const a = steps[i - 1];
    const b = steps[i - 2];
    if (a !== undefined && a === b && pad === a) {
      // Pick among the three other pads, in order, so the result stays seeded
      const others = [0, 1, 2, 3].filter((p) => p !== a);
      pad = others[Math.floor(rng() * others.length)] ?? others[0]!;
    }
    steps.push(pad);
  }
  return steps;
}

/** True when `pad` is a pad of the grid. */
export function isPad(pad: unknown): pad is number {
  return typeof pad === 'number' && Number.isInteger(pad) && pad >= 0 && pad < SS_PAD_COUNT;
}

export interface TapJudgement {
  /** Whether the tap was the next step of the sequence. */
  correct: boolean;
  /** Correct steps so far, this tap included when it was right. */
  correctSteps: number;
  /** The player has played every step. */
  complete: boolean;
  /** The player's round is over: a wrong tap or the last step. */
  finished: boolean;
}

/**
 * Judge a tap against the sequence. `correctSoFar` is how many steps the player
 * has already played right. A tap past the end of the sequence is counted as a
 * wrong one only if the caller lets it through; the handler ignores it first.
 */
export function judgeTap(sequence: readonly number[], correctSoFar: number, pad: number): TapJudgement {
  const expected = sequence[correctSoFar];
  if (expected === undefined) {
    return { correct: false, correctSteps: correctSoFar, complete: correctSoFar >= sequence.length, finished: true };
  }
  if (pad !== expected) {
    return { correct: false, correctSteps: correctSoFar, complete: false, finished: true };
  }
  const correctSteps = correctSoFar + 1;
  const complete = correctSteps === sequence.length;
  return { correct: true, correctSteps, complete, finished: complete };
}

/** The speed bonus: up to 50, falling to 0 as the recall time runs out. */
export function speedBonus(elapsedMs: number, recallSeconds: number): number {
  const total = recallSeconds * 1000;
  if (total <= 0) return 0;
  const left = Math.max(0, 1 - Math.max(0, elapsedMs) / total);
  return Math.round(SS_MAX_SPEED_BONUS * left);
}

export interface RoundScoreInput {
  length: number;
  correctSteps: number;
  /** The whole sequence was played correctly. */
  completed: boolean;
  /** Server time from the recall opening to the last correct tap. */
  elapsedMs: number;
  recallSeconds: number;
}

export interface RoundScore {
  points: number;
  bonus: number;
}

/** 100 x length plus the bonus for a full sequence; 60 x correct steps for a miss. */
export function scoreRound(input: RoundScoreInput): RoundScore {
  if (input.completed) {
    const bonus = speedBonus(input.elapsedMs, input.recallSeconds);
    return { points: SS_POINTS_PER_STEP * input.length + bonus, bonus };
  }
  return { points: SS_MISS_POINTS_PER_STEP * Math.max(0, input.correctSteps), bonus: 0 };
}

/** The out rule: this many misses and the player watches the rest of the match. */
export function isOut(misses: number): boolean {
  return misses >= SS_MAX_MISSES;
}

/** The match ends after the last round, or once at most one player is still in. */
export function matchIsOver(roundsPlayed: number, totalRounds: number, playersIn: number): boolean {
  return roundsPlayed >= totalRounds || playersIn <= 1;
}
