/**
 * RMHbox — Sequence Sam Minigame Types
 *
 * Phase enum, interfaces, and type definitions for the Sequence Sam minigame.
 * Sequence Sam is a memory/pattern matching game where players repeat
 * growing tile sequences on a 3×3 grid, with chaos rounds that rotate the grid.
 *
 * Scoring: players earn points per correct tap, with a small bonus for the first
 * to finish each round. The game ends when at most one player completes the
 * current sequence correctly.
 */

// ─── Phase Enum ──────────────────────────────────────────────────

export type SSPhase = 'PATTERN_DISPLAY' | 'INPUT' | 'ROUND_RESULTS' | 'TRANSITION' | 'GAME_OVER';

// ─── Type Definitions ────────────────────────────────────────────

export interface SSPlayerState {
  userId: string;
  /** Total correct taps across all rounds. */
  correctTaps: number;
  /** Number of rounds this player was the first to finish. */
  firstFinishes: number;
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
  /** Rotation degrees applied in chaos round (for client display). */
  rotationDegrees: number;
  isChaosRound: boolean;
  phase: SSPhase;
  playerStates: Map<string, SSPlayerState>;
  activePlayers: string[];
  phaseStartedAt: number;
  phaseEndsAt: number;
  currentDisplayStep: number;
}

/** Per-player round result sent to clients in SS_ROUND_RESULTS. */
export interface SSRoundPlayerResult {
  userId: string;
  userName: string;
  completed: boolean;
  correctTaps: number;
  roundScore: number;
  totalScore: number;
}

export interface ActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}
