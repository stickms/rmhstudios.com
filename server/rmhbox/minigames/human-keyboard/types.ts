/**
 * RMHbox — Human Keyboard Minigame Types
 */

import type { Sentence } from '@/lib/rmhbox/human-keyboard/rules';

export type HKPhase = 'REVEAL' | 'TYPING' | 'ROUND_RESULT';

/** One player's result for one round, sent when the round ends and kept for history. */
export interface HKPlayerRoundResult {
  userId: string;
  userName: string;
  /** Presses that advanced the cursor. */
  correct: number;
  /** Held letters that were not the next one. */
  wrong: number;
  /** The round's points, after the team multiplier. */
  points: number;
  perfect: boolean;
  mvp: boolean;
  newTotalScore: number;
}

/** A finished round. */
export interface HKRoundResult {
  roundIndex: number;
  sentenceId: string;
  sentence: string;
  completed: boolean;
  /** Typing time used, in ms (the whole phase when the sentence was not completed). */
  elapsedMs: number;
  secondsLeft: number;
  multiplier: number;
  results: HKPlayerRoundResult[];
}

export interface HumanKeyboardState {
  /** The sentence of every round, drawn up front; only the current one is ever sent. */
  sentences: Sentence[];
  currentRound: number;
  totalRounds: number;
  phase: HKPhase;
  /** Everyone in the match (the lobby when it started). */
  participants: Set<string>;
  /** Index into the current sentence, spaces included. */
  cursor: number;
  complete: boolean;
  /** Who holds which letters right now. */
  deal: Map<string, string[]>;
  /** The sentence is locked for everyone until this time (ms); 0 when not. */
  lockedUntil: number;
  /** Each player's recent press times, for the rate limit. */
  pressTimes: Map<string, number[]>;
  /** This round's presses that advanced the cursor / were a wrong held letter, per player. */
  correct: Map<string, number>;
  wrong: Map<string, number>;
  scores: Map<string, number>;
  /** Totals across the match, for awards. */
  totalCorrect: Map<string, number>;
  totalWrong: Map<string, number>;
  /** Presses of a letter the presser did not hold, across the match (the Not My Job award). */
  totalNotYours: Map<string, number>;
  /** Rounds already finished. */
  results: HKRoundResult[];
  reshuffleSeconds: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** When the keys are next dealt out again (ms); 0 outside typing. */
  nextReshuffleAt: number;
}

export interface GameLogAction {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
