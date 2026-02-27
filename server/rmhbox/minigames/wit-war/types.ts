// ─── Phase Enum ──────────────────────────────────────────────────

export enum WitWarPhase {
  PROMPT_REVEAL = 'PROMPT_REVEAL',
  WRITING = 'WRITING',
  VOTING = 'VOTING',
  MATCHUP_RESULTS = 'MATCHUP_RESULTS',
  ROUND_RESULTS = 'ROUND_RESULTS',
  GAME_OVER = 'GAME_OVER',
}

// ─── Type Definitions ────────────────────────────────────────────

/** A single head-to-head matchup between two players on one prompt. */
export interface WWMatchup {
  promptIndex: number;
  promptText: string;
  playerA: string;
  playerB: string;
  answerA: string | null;
  answerB: string | null;
  /** userId → votedForUserId */
  votes: Record<string, string>;
  /** Computed after voting: percentage of votes for player A (0-100). */
  votePercentA: number;
  /** Computed after voting: percentage of votes for player B (0-100). */
  votePercentB: number;
  winnerId: string | null;
  isWitWham: boolean;
}

/** Prompt assignment for a single player. */
export interface WWPromptAssignment {
  promptIndex: number;
  promptText: string;
  opponentId: string;
  matchupIndex: number;
}

/** Action log entry for the game log. */
export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

/** Full internal state of the Wit-War minigame. */
export interface WitWarState {
  phase: WitWarPhase;
  currentRound: number;
  totalRounds: number;
  /** All matchups for the current round. */
  matchups: WWMatchup[];
  /** Per-player prompt assignments for the current round. */
  assignments: Record<string, WWPromptAssignment[]>;
  /** Players who have submitted all their answers this round. */
  submitted: Set<string>;
  /** The index of the matchup currently being voted on. */
  currentMatchupIndex: number;
  /** Cumulative scores keyed by userId. */
  scores: Record<string, number>;
  /** Prompt indices already used across rounds. */
  usedPromptIndices: Set<number>;
  /** Per-round matchup results history. */
  roundMatchups: WWMatchup[][];
  /** Game action log. */
  actionLog: ActionLogEntry[];
  timeRemaining: number;
}
