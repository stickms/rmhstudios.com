/**
 * Pixel Pushers — Type Definitions
 *
 * Server-side types for the Pixel Pushers cooperative physics game.
 * Defines phases, player pushers, ball state, and result structures.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §3.4
 */

import type { PPLevel } from '../../../../lib/rmhbox/pixel-pushers/schemas';

// ─── Phase ───────────────────────────────────────────────────────

export type PPPhase = 'LEVEL_PREVIEW' | 'ACTIVE' | 'LEVEL_COMPLETE' | 'GAME_OVER';

// ─── Ball ────────────────────────────────────────────────────────

export interface BallPhysics {
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  radius: number;
  friction: number;
  mass: number;
}

// ─── Pusher ──────────────────────────────────────────────────────

export interface PusherState {
  userId: string;
  position: { x: number; y: number };
  color: string;
  polarity: 'push' | 'attract';
  moveDirection: { x: number; y: number } | null;
  pushCount: number;
  isDisconnected: boolean;
  disconnectedAt: number | null;
  isGhost: boolean;
}

// ─── Waypoint ────────────────────────────────────────────────────

export interface PPWaypoint {
  x: number;
  y: number;
  order: number;
  reached: boolean;
}

// ─── Final Rankings ──────────────────────────────────────────────

export interface PPFinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  totalPushes: number;
  polarityFlipsHandled: number;
}

// ─── Game Log Action ─────────────────────────────────────────────

export interface GameLogAction {
  seq: number;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
}

// ─── Full Game State ─────────────────────────────────────────────

export interface PixelPushersState {
  currentLevel: number;
  totalLevels: number;
  phase: PPPhase;
  canvasWidth: number;
  canvasHeight: number;
  currentLevelData: PPLevel | null;
  walls: Array<{ x: number; y: number; width: number; height: number }>;
  goalZone: { x: number; y: number; width: number; height: number };
  waypoints: PPWaypoint[];
  nextWaypointIndex: number;
  ball: BallPhysics;
  pushers: Map<string, PusherState>;
  polarityFlippedUserId: string | null;
  nextPolarityFlipAt: number;
  polarityWarningEmitted: boolean;
  playerScores: Map<string, number>;
  polarityFlipsHandled: Map<string, number>;
  levelStartedAt: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  simulationInterval: NodeJS.Timeout | null;
  broadcastInterval: NodeJS.Timeout | null;
  /** Levels selected for this game instance */
  levels: PPLevel[];
  /** Last pusher to touch the ball before goal entry */
  lastBallTouchUserId: string | null;
  /** Per-level completion times for Speed Demon award */
  levelCompletionTimes: number[];
  /** Per-player wall proximity time accumulator for Wall Flower award */
  wallProximityTime: Map<string, number>;
  /** Action log for game history */
  actionLog: GameLogAction[];
  actionSeq: number;
}
