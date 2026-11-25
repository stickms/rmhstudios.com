/**
 * RMHbox — Identity Crisis Minigame Types
 */

import type { Identity, Plurality, VoteCounts } from '@/lib/rmhbox/identity-crisis/rules';
import type { Vote } from '@/lib/rmhbox/identity-crisis/schemas';

export type ICPhase = 'ASSIGN' | 'ASK' | 'VOTE' | 'RESULT' | 'FINAL' | 'REVEAL';

/**
 * asking:  still takes turns to ask.
 * solved:  guessed right; stops asking and keeps voting.
 * stopped: guessed wrong early; asks no more, keeps voting, and has the final guess.
 */
export type ICStatus = 'asking' | 'solved' | 'stopped';

export type ICGuessKind = 'early' | 'final';

export interface ICGuess {
  kind: ICGuessKind;
  /** The guess as typed (cleaned). Never sent to another player. */
  text: string;
  correct: boolean;
  /** Points this guess moved the score by, efficiency included. */
  points: number;
  /** The turn number (1-based) that was running when it was sent; 0 in the final phase. */
  turnNumber: number;
  /** Question slots the player had not used when they guessed. */
  slotsLeft: number;
}

/** What the server knows of one player. The identity never leaves except as `identityView`. */
export interface ICPlayerRecord {
  identity: Identity;
  status: ICStatus;
  /** Turns the player has finished: a question asked or a turn that ran out. */
  slotsUsed: number;
  guesses: ICGuess[];
}

export interface ICQuestion {
  /** 1-based number of the turn this question was asked on. */
  turnNumber: number;
  askerId: string;
  text: string;
  /** Who may vote: everyone but the asker. */
  voterIds: string[];
  /** Server only: who voted what. Never sent, never logged. */
  votes: Map<string, Vote>;
  /** Set when the vote closes. */
  counts: VoteCounts | null;
  plurality: Plurality | null;
}

export interface IdentityCrisisState {
  phase: ICPhase;
  questionsPerPlayer: number;
  askSeconds: number;
  hardIdentities: boolean;
  gameNumber: number;
  participants: string[];
  order: string[];
  players: Map<string, ICPlayerRecord>;
  /** Next turn slot to look at: round `floor(cursor / n)`, seat `cursor % n`. */
  cursor: number;
  totalSlots: number;
  /** Turns started so far (1-based number of the running or last turn). */
  turnNumber: number;
  askerId: string | null;
  /** The question being voted on, or just voted on. */
  current: ICQuestion | null;
  /** Questions whose vote has closed, in order. */
  questions: ICQuestion[];
  /** Turns that ran out without a question. */
  timedOutTurns: Array<{ turnNumber: number; askerId: string }>;
  finalists: Set<string>;
  finalGuessed: Set<string>;
  /** Users in the order they guessed right. */
  solvedOrder: string[];
  scores: Map<string, number>;
  phaseStartedAt: number;
  phaseEndsAt: number;
}

export interface GameLogAction {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
