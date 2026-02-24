/**
 * RMHbox — Sequence Sam Minigame Types
 *
 * Phase enum, interfaces, and type definitions for the Sequence Sam minigame.
 * Sequence Sam is a memory/pattern matching game where players repeat
 * growing tile sequences on a 3×3 grid, with chaos rounds that rotate the grid.
 */

// ─── Phase Enum ──────────────────────────────────────────────────

export type SSPhase = 'PATTERN_DISPLAY' | 'INPUT' | 'ROUND_RESULTS' | 'TRANSITION' | 'GAME_OVER';

// ─── Type Definitions ────────────────────────────────────────────

export interface SSPlayerState {
  userId: string;
  strikesRemaining: number;
  isEliminated: boolean;
  eliminatedOnRound: number | null;
  currentInputIndex: number;
  hasCompletedSequence: boolean;
  hasFailed: boolean;
  failedAtIndex: number | null;
  inputStartedAt: number | null;
  completedAt: number | null;
  totalScore: number;
  roundScore: number;
}

export interface SequenceSamState {
  currentRound: number;
  maxRounds: number;
  sequence: number[];
  rotatedSequence: number[] | null;
  isChaosRound: boolean;
  phase: SSPhase;
  playerStates: Map<string, SSPlayerState>;
  eliminatedPlayers: string[];
  activePlayers: string[];
  phaseStartedAt: number;
  phaseEndsAt: number;
  currentDisplayStep: number;
}

export interface SSRoundSurvivor {
  userId: string;
  userName: string;
  roundScore: number;
  strikesRemaining: number;
  isPerfect: boolean;
  completionTimeMs: number | null;
}

export interface SSRoundEliminated {
  userId: string;
  userName: string;
  finalRank: number;
  placementPoints: number;
}

export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}
