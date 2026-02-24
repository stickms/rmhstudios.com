import type { Category } from '../../../../lib/rmhbox/category-crash/data-loader';

// ─── Phase Enum ──────────────────────────────────────────────────

export enum CategoryCrashPhase {
  REVEAL = 'REVEAL',
  INPUT = 'INPUT',
  PEER_REVIEW = 'PEER_REVIEW',
  CRASH_RESOLUTION = 'CRASH_RESOLUTION',
  ROUND_RESULTS = 'ROUND_RESULTS',
}

// ─── Type Definitions ────────────────────────────────────────────

/** An anonymized answer set shown during peer review. */
export interface AnonymizedAnswerSet {
  anonymousLabel: string;
  answers: (string | null)[];
}

/** A single crash vote targeting a player's answer for a specific category. */
export interface CrashRecord {
  crasherId: string;
  targetUserId: string;
  categoryIndex: number;
}

/** Per-player result for a single round. */
export interface CCPlayerResult {
  userId: string;
  userName: string;
  answers: (string | null)[];
  pointsPerCategory: number[];
  roundScore: number;
  crashedIndices: number[];
  duplicateIndices: number[];
  invalidIndices: number[];
  uniqueIndices: number[];
}

/** Full result payload for a single round. */
export interface CCRoundResults {
  roundNumber: number;
  letter: string;
  categories: Category[];
  playerResults: Record<string, CCPlayerResult>;
}

/** Action log entry for the game log. */
export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

/** Full internal state of the Category Crash minigame. */
export interface CategoryCrashState {
  phase: CategoryCrashPhase;
  currentRound: number;
  totalRounds: number;
  letter: string;
  categories: Category[];
  /** Player answers keyed by userId → array of CC_CATEGORIES_PER_ROUND answers. */
  answers: Record<string, (string | null)[]>;
  /** Whether a player's answers are locked (submitted). */
  locked: Record<string, boolean>;
  /** Crash votes for the current round. */
  crashes: CrashRecord[];
  /** Anonymization mapping: real userId → anonymous label (set during PEER_REVIEW). */
  anonymizationMap: Record<string, string>;
  /** Reverse map: anonymous label → real userId. */
  reverseAnonymizationMap: Record<string, string>;
  /** Cumulative scores keyed by userId. */
  scores: Record<string, number>;
  /** IDs of categories already used across rounds. */
  usedCategoryIds: string[];
  /** Letters already used across rounds. */
  usedLetters: string[];
  /** Round results history. */
  roundResults: CCRoundResults[];
  /** Game action log. */
  actionLog: ActionLogEntry[];
  /** Players pending promotion (joined mid-game). */
  pendingPlayers: Set<string>;
  /** Number of crashes each player has issued this round. */
  crashCounts: Record<string, number>;
  timeRemaining: number;
}
