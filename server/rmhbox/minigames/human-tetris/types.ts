/**
 * RMHbox — Human Tetris Type Definitions
 *
 * All types used by the Human Tetris server handler.
 * Includes game phases, grid positions, wall shapes,
 * wave results, and the full game state.
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §4.4
 */

// ─── Phase Enum ──────────────────────────────────────────────────

export type HTPhase =
  | 'WALL_PREVIEW'
  | 'POSITIONING'
  | 'WALL_IMPACT'
  | 'WAVE_RESULTS'
  | 'GAME_OVER';

// ─── Grid & Wall ─────────────────────────────────────────────────

/** A position on the grid. */
export interface GridPosition {
  col: number;
  row: number;
}

/** A wall shape with holes, dead zones, and metadata. */
export interface WallShape {
  holes: GridPosition[];
  requiredPlayers: number;
  deadZones: GridPosition[];
  difficulty: 'easy' | 'medium' | 'hard';
}

/** Client-facing wall shape view (holes + wall cells for rendering). */
export interface WallShapeView {
  holes: GridPosition[];
  wallCells: GridPosition[];
}

// ─── Wave Results ────────────────────────────────────────────────

/** Per-player result for a single wall impact. */
export interface PlayerImpactResult {
  userId: string;
  userName: string;
  position: GridPosition;
  status: 'IN_HOLE' | 'IN_DEAD_ZONE' | 'HIT_BY_WALL';
}

/** Full result payload for a single wave. */
export interface WaveResult {
  waveNumber: number;
  success: boolean;
  filledHoles: number;
  totalHoles: number;
  playersInCorrectPosition: string[];
  playersHitByWall: string[];
  teamScore: number;
}

/** Wall impact result broadcast to clients. */
export interface WallImpactResult {
  playerResults: PlayerImpactResult[];
  allHolesFilled: boolean;
  allPlayersSafe: boolean;
  success: boolean;
}

/** Final ranking entry for game over. */
export interface HTFinalRanking {
  userId: string;
  userName: string;
  totalScore: number;
  correctPositions: number;
  timesHitByWall: number;
  rank: number;
}

// ─── Shape Template (from shapes.json) ───────────────────────────

/** Shape template loaded from data file. */
export interface ShapeTemplate {
  id: string;
  holes: GridPosition[];
  requiredPlayers: number;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
}

// ─── Action Log Entry ────────────────────────────────────────────

export interface HTActionLogEntry {
  seq: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

// ─── Full Game State ─────────────────────────────────────────────

/** Complete internal state of the Human Tetris minigame. */
export interface HumanTetrisState {
  currentWave: number;
  totalWaves: number;
  phase: HTPhase;
  gridCols: number;
  gridRows: number;
  /** Current wall shape (null before first wave). */
  currentWall: WallShape | null;
  /** Player positions keyed by userId. */
  playerPositions: Map<string, GridPosition>;
  /** Results from completed waves. */
  waveResults: WaveResult[];
  /** Consecutive successful waves for streak bonus. */
  consecutiveSuccesses: number;
  /** Cumulative scores per player. */
  playerScores: Map<string, number>;
  /** Timestamp when current phase started. */
  phaseStartedAt: number;
  /** Timestamp when current phase will end. */
  phaseEndsAt: number;
  /** Per-player rate limiting: timestamp of last move. */
  lastMoveTimestamps: Map<string, number[]>;
  /** Per-player count of correct positions (for awards). */
  correctPositionCounts: Map<string, number>;
  /** Per-player count of wall hits (for awards). */
  wallHitCounts: Map<string, number>;
  /** Per-player count of dead zone hides (for awards). */
  deadZoneHideCounts: Map<string, number>;
  /** Per-player remaining time when positioned correctly (for speed award). */
  timeRemainingAccum: Map<string, number[]>;
  /** Game action log. */
  actionLog: HTActionLogEntry[];
}
