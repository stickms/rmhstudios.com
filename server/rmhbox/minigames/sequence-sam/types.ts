/**
 * RMHbox — Sequence Sam Minigame Types
 */

export type SSPhase = 'SHOW' | 'RECALL' | 'RESULT';

/** One player's result for one round, sent when the round ends and kept for history. */
export interface SSPlayerRoundResult {
  userId: string;
  userName: string;
  /** Steps played right before the round ended. */
  correctSteps: number;
  /** The whole sequence was played. */
  completed: boolean;
  points: number;
  /** The speed bonus inside `points` (0 unless completed). */
  bonus: number;
  /** Server time from the recall opening to the last correct tap, or null if none. */
  elapsedMs: number | null;
  /** Misses so far in the match, this round included. */
  misses: number;
  /** The player is out for the rest of the match. */
  out: boolean;
  newTotalScore: number;
}

/** A finished round: the only place its whole sequence leaves the server. */
export interface SSRoundResult {
  roundIndex: number;
  length: number;
  sequence: number[];
  results: SSPlayerRoundResult[];
}

export interface SequenceSamState {
  /** Every round's sequence, drawn up front and kept on the server. */
  sequences: number[][];
  currentRound: number;
  totalRounds: number;
  phase: SSPhase;
  /** Everyone in the match (the lobby when it started). */
  participants: Set<string>;
  /** Misses so far in the match. */
  misses: Map<string, number>;
  /** Players who missed twice: they watch the rest of the match. */
  out: Set<string>;
  /** The players taking part in the current round. */
  inRound: Set<string>;
  /** How many steps of the current round have been sent to the players. */
  shown: number;
  /** Each player's taps this round, as played (the pad each tap was). */
  taps: Map<string, number[]>;
  /** Steps each player has right this round. */
  correct: Map<string, number>;
  /** Players whose round is over (wrong tap or the last step). */
  finished: Set<string>;
  /** Server ms from the recall opening to a player's last correct tap. */
  elapsed: Map<string, number>;
  scores: Map<string, number>;
  /** Rounds already finished (history and awards). */
  results: SSRoundResult[];
  /** When the recall opened (server clock); 0 before. */
  recallStartedAt: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  stepMs: number;
  recallSeconds: number;
}

export interface GameLogAction {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
