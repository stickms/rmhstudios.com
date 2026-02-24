/**
 * RMHbox — Cursor Curling Type Definitions
 *
 * All types used by the Cursor Curling server handler.
 * Includes game phases, stone state, physics, sweep tracking,
 * end results, and the full game state.
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §3.4
 */

// ─── Phase Enum ──────────────────────────────────────────────────

export type CUPhase =
  | 'END_START'
  | 'AIM'
  | 'POWER'
  | 'SIMULATION'
  | 'END_RESULTS'
  | 'TRANSITION'
  | 'GAME_OVER';

// ─── Stone & Physics ─────────────────────────────────────────────

/** A curling stone on the rink. */
export interface CurlingStone {
  id: string;
  userId: string;
  position: { x: number; y: number };
  isInPlay: boolean;
  color: string;
}

/** Physics state for a moving stone in the simulation. */
export interface StonePhysics {
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  friction: number;
  isMoving: boolean;
}

// ─── Sweep Tracking ──────────────────────────────────────────────

/** Per-player sweep tracking state. */
export interface SweepState {
  userId: string;
  recentInputs: Array<{ x: number; y: number; timestamp: number }>;
  isSweeping: boolean;
}

// ─── End Results ─────────────────────────────────────────────────

/** Scoring result for a single stone in an end. */
export interface StoneResult {
  userId: string;
  userName: string;
  position: { x: number; y: number };
  distance: number;
  zone: string;
  points: number;
}

/** Full result payload for a single end. */
export interface EndResult {
  endNumber: number;
  stonePositions: StoneResult[];
  closestUserId: string | null;
}

// ─── Action Log Entry ────────────────────────────────────────────

export interface CUActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

// ─── Full Game State ─────────────────────────────────────────────

/** Complete internal state of the Cursor Curling minigame. */
export interface CursorCurlingState {
  currentEnd: number;
  totalEnds: number;
  phase: CUPhase;
  /** Throw order (userId array), randomized each end. */
  throwOrder: string[];
  currentThrowerIndex: number;
  /** All stones on the rink for the current end. */
  stones: CurlingStone[];
  /** Physics state for the active moving stone (null when none moving). */
  activeStoneSim: StonePhysics | null;
  /** Physics state for stones collided during this simulation (stoneId → physics). */
  collidedStones: Map<string, StonePhysics>;
  /** Per-player sweep state during simulation. */
  sweepStates: Map<string, SweepState>;
  /** Cumulative scores per player. */
  playerScores: Map<string, number>;
  /** Results from completed ends. */
  endResults: EndResult[];
  /** Timestamp when current phase started. */
  phaseStartedAt: number;
  /** Timestamp when current phase will end. */
  phaseEndsAt: number;
  /** Per-player sweep effectiveness tracking (total ms swept). */
  sweepEffectiveness: Map<string, number>;
  /** Per-player count of opponent stones knocked out of play. */
  knockOuts: Map<string, number>;
  /** Per-player count of times their stone went out of bounds. */
  outOfBounds: Map<string, number>;
  /** Best distance to bullseye per player (closest overall). */
  bestDistance: Map<string, number>;
  /** Game action log. */
  actionLog: CUActionLogEntry[];
}
