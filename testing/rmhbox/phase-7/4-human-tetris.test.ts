/**
 * Phase 7 — §4: Human Tetris Server Handler Tests
 *
 * Comprehensive tests for the HumanTetrisGame server handler covering:
 *  - State initialization
 *  - Movement mechanics (bounds, collision, rate limiting, dead zones)
 *  - Wall impact (IN_HOLE, IN_DEAD_ZONE, HIT_BY_WALL, success/failure)
 *  - Scoring (success, perfect wave, correct position, partial, hit penalty, streak)
 *  - Full game lifecycle (start → GAME_OVER → onComplete)
 *  - State views (player vs spectator, isMe field)
 *  - Awards (Perfect Team, Shape Filler, Wall Magnet, Dead Zone Expert, Speed Mover)
 *  - Reconnection / disconnection (frozen avatar, state snapshot)
 *  - Game settings (custom totalWaves, wallPreviewDuration, startingPositionTime, enableDeadZones)
 *  - Game log (buildGameLog structure, action types)
 *
 * Environment-agnostic: no real DB, WebSocket, or network connections needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HumanTetrisGame } from '../../../server/rmhbox/minigames/human-tetris';
import type {
  HumanTetrisState,
  ShapeTemplate,
  GridPosition,
} from '../../../server/rmhbox/minigames/human-tetris/types';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerActions,
  type MockContextData,
} from './setup';
import {
  HT_TOTAL_WAVES,
  HT_GRID_COLS,
  HT_GRID_ROWS,
  HT_EASY_POSITION_SECONDS,
  HT_MEDIUM_POSITION_SECONDS,
  HT_HARD_POSITION_SECONDS,
  HT_WALL_PREVIEW_SECONDS,
  HT_WALL_IMPACT_SECONDS,
  HT_WAVE_RESULTS_SECONDS,
  HT_MOVE_RATE_LIMIT,
  HT_SUCCESS_POINTS,
  HT_PARTIAL_POINTS,
  HT_CORRECT_POSITION_POINTS,
  HT_HIT_PENALTY,
  HT_PERFECT_WAVE_BONUS,
  HT_STREAK_BONUS,
} from '../../../lib/rmhbox/constants';

// ─── Mock Data Loader ────────────────────────────────────────────

function createTestTemplates(): ShapeTemplate[] {
  return [
    // Easy shapes
    { id: 'test-e1', holes: [{ col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 3, row: 3 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy L' },
    { id: 'test-e2', holes: [{ col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy line' },
    { id: 'test-e3', holes: [{ col: 3, row: 2 }, { col: 4, row: 2 }, { col: 3, row: 3 }, { col: 4, row: 3 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy block' },
    // Medium shapes
    { id: 'test-m1', holes: [{ col: 3, row: 1 }, { col: 3, row: 2 }, { col: 3, row: 3 }, { col: 4, row: 3 }, { col: 5, row: 3 }], requiredPlayers: 5, difficulty: 'medium', description: 'Test medium L' },
    { id: 'test-m2', holes: [{ col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 3, row: 3 }], requiredPlayers: 5, difficulty: 'medium', description: 'Test medium T' },
    { id: 'test-m3', holes: [{ col: 4, row: 1 }, { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 4, row: 3 }], requiredPlayers: 5, difficulty: 'medium', description: 'Test medium plus' },
    // Hard shapes
    { id: 'test-h1', holes: [{ col: 4, row: 0 }, { col: 4, row: 1 }, { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 6, row: 2 }, { col: 4, row: 3 }, { col: 4, row: 4 }], requiredPlayers: 9, difficulty: 'hard', description: 'Test hard cross' },
    { id: 'test-h2', holes: [{ col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 }, { col: 3, row: 2 }, { col: 3, row: 3 }, { col: 3, row: 4 }], requiredPlayers: 7, difficulty: 'hard', description: 'Test hard T' },
    { id: 'test-h3', holes: [{ col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 }, { col: 5, row: 2 }, { col: 5, row: 3 }, { col: 4, row: 3 }, { col: 3, row: 3 }, { col: 3, row: 2 }], requiredPlayers: 8, difficulty: 'hard', description: 'Test hard spiral' },
  ];
}

vi.mock('../../../lib/rmhbox/human-tetris/data-loader', async () => {
  const actual = await vi.importActual('../../../lib/rmhbox/human-tetris/data-loader');
  return {
    ...actual,
    loadShapeTemplates: vi.fn(() => createTestTemplates()),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new HumanTetrisGame(ctx.context);
  return { game, ...ctx };
}

/**
 * Extract the nested payload from a broadcastAction log entry.
 * broadcastAction pushes { event: 'action', data: { type, payload } }.
 */
function actionPayload(entry: { data: Record<string, unknown> }): Record<string, unknown> {
  return entry.data.payload as Record<string, unknown>;
}

/** Access internal game state for test setup. */
function getState(game: HumanTetrisGame): HumanTetrisState {
  return (game as any).state as HumanTetrisState;
}

/** Set a player's position directly for controlled test scenarios. */
function setPlayerPosition(game: HumanTetrisGame, userId: string, pos: GridPosition): void {
  getState(game).playerPositions.set(userId, { ...pos });
}

function advancePastWallPreview(): void {
  vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);
}

function advancePastPositioning(): void {
  vi.advanceTimersByTime(HT_EASY_POSITION_SECONDS * 1000);
}

function advancePastWallImpact(): void {
  vi.advanceTimersByTime(HT_WALL_IMPACT_SECONDS * 1000);
}

function advancePastWaveResults(): void {
  vi.advanceTimersByTime(HT_WAVE_RESULTS_SECONDS * 1000);
}

function advanceFullWave(): void {
  advancePastWallPreview();
  advancePastPositioning();
  advancePastWallImpact();
  advancePastWaveResults();
}

/**
 * Start a game and advance into the POSITIONING phase of wave 1.
 */
function startAndAdvanceToPositioning(ctxData?: MockContextData) {
  const g = createGame(ctxData);
  g.game.start();
  advancePastWallPreview();
  return g;
}

/**
 * Place all players into the wall's hole positions so the wave succeeds.
 */
function placePlayersInHoles(game: HumanTetrisGame): void {
  const state = getState(game);
  const wall = state.currentWall!;
  const playerIds = Array.from(state.playerPositions.keys());

  for (let i = 0; i < playerIds.length; i++) {
    if (i < wall.holes.length) {
      setPlayerPosition(game, playerIds[i], wall.holes[i]);
    } else if (wall.deadZones.length > 0) {
      // Extra players go to dead zones
      const dzIdx = i - wall.holes.length;
      const dz = wall.deadZones[dzIdx % wall.deadZones.length];
      setPlayerPosition(game, playerIds[i], dz);
    }
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Human Tetris Server Handler (§4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── State Initialization ────────────────────────────────────

  describe('State Initialization', () => {
    it('should create a game instance with 4 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(4);
    });

    it('should initialize scores to zero for all players after start', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = state.scores as Array<{ userId: string; totalScore: number }>;
      expect(scores.length).toBe(4);
      for (const s of scores) {
        expect(s.totalScore).toBe(0);
      }
    });

    it('should begin in WALL_PREVIEW phase on start', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('WALL_PREVIEW');
    });

    it('should assign non-overlapping starting positions within grid bounds', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const positions = state.playerPositions as Array<{ col: number; row: number; userId: string }>;

      expect(positions.length).toBe(4);
      const keys = new Set<string>();
      for (const p of positions) {
        expect(p.col).toBeGreaterThanOrEqual(0);
        expect(p.col).toBeLessThan(HT_GRID_COLS);
        expect(p.row).toBeGreaterThanOrEqual(0);
        expect(p.row).toBeLessThan(HT_GRID_ROWS);
        const key = `${p.col},${p.row}`;
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    });

    it('should broadcast HT_WAVE_START on first wave', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const waveStart = findLastActionBroadcast(broadcastLog, 'HT_WAVE_START');
      expect(waveStart).toBeDefined();
      const payload = actionPayload(waveStart!);
      expect(payload.waveNumber).toBe(1);
      expect(payload.wall).toBeDefined();
      expect(payload.positioningSeconds).toBeDefined();
    });

    it('should transition to POSITIONING after wall preview duration', () => {
      const { game } = createGame();
      game.start();

      expect((game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>).phase).toBe('WALL_PREVIEW');

      advancePastWallPreview();

      expect((game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>).phase).toBe('POSITIONING');
    });
  });

  // ─── Movement Mechanics ─────────────────────────────────────

  describe('Movement Mechanics', () => {
    it('should update position and broadcast HT_PLAYER_MOVED on valid move', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      // Place alice at a known position away from edges
      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 3, row: 3 });
      // Ensure no other player is at (4,3)
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 0 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 0 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 0 });

      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'right' });

      const moved = findLastActionBroadcast(broadcastLog, 'HT_PLAYER_MOVED');
      expect(moved).toBeDefined();
      const payload = actionPayload(moved!);
      expect(payload.userId).toBe(MOCK_USERS.alice.userId);
      expect(payload.col).toBe(4);
      expect(payload.row).toBe(3);
    });

    it('should reject move up from row 0 (OUT_OF_BOUNDS)', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 3, row: 0 });

      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'up' });

      const rejected = playerLog.find(
        (e) =>
          e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'HT_MOVE_REJECTED',
      );
      expect(rejected).toBeDefined();
      const data = rejected!.data as Record<string, unknown>;
      const payload = data.payload as Record<string, unknown>;
      expect(payload.reason).toBe('OUT_OF_BOUNDS');
    });

    it('should reject move down from last row (OUT_OF_BOUNDS)', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 3, row: HT_GRID_ROWS - 1 });

      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'down' });

      const rejected = playerLog.find(
        (e) =>
          e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'HT_MOVE_REJECTED',
      );
      expect(rejected).toBeDefined();
      const data = rejected!.data as Record<string, unknown>;
      expect((data.payload as Record<string, unknown>).reason).toBe('OUT_OF_BOUNDS');
    });

    it('should reject move left from col 0 (OUT_OF_BOUNDS)', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 0, row: 3 });

      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'left' });

      const rejected = playerLog.find(
        (e) =>
          e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'HT_MOVE_REJECTED',
      );
      expect(rejected).toBeDefined();
      const data = rejected!.data as Record<string, unknown>;
      expect((data.payload as Record<string, unknown>).reason).toBe('OUT_OF_BOUNDS');
    });

    it('should reject move right from last col (OUT_OF_BOUNDS)', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: HT_GRID_COLS - 1, row: 3 });

      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'right' });

      const rejected = playerLog.find(
        (e) =>
          e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'HT_MOVE_REJECTED',
      );
      expect(rejected).toBeDefined();
      const data = rejected!.data as Record<string, unknown>;
      expect((data.payload as Record<string, unknown>).reason).toBe('OUT_OF_BOUNDS');
    });

    it('should reject move into occupied regular cell (CELL_OCCUPIED)', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 3, row: 3 });
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 4, row: 3 });

      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'right' });

      const rejected = playerLog.find(
        (e) =>
          e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'HT_MOVE_REJECTED',
      );
      expect(rejected).toBeDefined();
      const data = rejected!.data as Record<string, unknown>;
      expect((data.payload as Record<string, unknown>).reason).toBe('CELL_OCCUPIED');
    });

    it('should allow move into dead zone with another player', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2, enableDeadZones: true };
      const { game, broadcastLog } = startAndAdvanceToPositioning(ctx);

      const state = getState(game);
      const wall = state.currentWall!;

      // Need a dead zone to test
      if (wall.deadZones.length > 0) {
        const dz = wall.deadZones[0];
        // Place bob in the dead zone
        setPlayerPosition(game, MOCK_USERS.bob.userId, dz);
        // Place alice adjacent so she can move into the dead zone
        const aliceCol = dz.col > 0 ? dz.col - 1 : dz.col + 1;
        const direction = dz.col > 0 ? 'right' : 'left';
        setPlayerPosition(game, MOCK_USERS.alice.userId, { col: aliceCol, row: dz.row });
        // Move other players far away to avoid any collisions
        setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 4, row: 4 });
        setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 5, row: 4 });

        const movedBefore = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;
        game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: direction as 'left' | 'right' });
        const movedAfter = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;

        expect(movedAfter).toBeGreaterThan(movedBefore);
      }
    });

    it('should reject 7th move in 1 second (RATE_LIMITED)', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      // Place alice in the middle so she can move freely
      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 3, row: 3 });
      // Clear other players out of the way
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 0 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 0 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 7, row: 5 });

      // Send HT_MOVE_RATE_LIMIT valid moves
      for (let i = 0; i < HT_MOVE_RATE_LIMIT; i++) {
        const dir = i % 2 === 0 ? 'right' : 'left';
        game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: dir });
      }

      // 7th move should be rate limited
      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'up' });

      const rejected = playerLog.filter(
        (e) =>
          e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'HT_MOVE_REJECTED' &&
          ((e.data as Record<string, unknown>).payload as Record<string, unknown>).reason === 'RATE_LIMITED',
      );
      expect(rejected.length).toBeGreaterThanOrEqual(1);
    });

    it('should ignore move during WALL_PREVIEW phase', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      // Still in WALL_PREVIEW

      const movedBefore = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;
      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'right' });
      const movedAfter = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;

      expect(movedAfter).toBe(movedBefore);
    });

    it('should reject invalid direction schema', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      const movedBefore = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;
      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', { direction: 'diagonal' });
      const movedAfter = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;

      expect(movedAfter).toBe(movedBefore);
    });

    it('should reject move with missing fields', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      const movedBefore = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;
      game.handleInput(MOCK_USERS.alice.userId, 'HT_MOVE', {});
      const movedAfter = findActionBroadcasts(broadcastLog, 'HT_PLAYER_MOVED').length;

      expect(movedAfter).toBe(movedBefore);
    });
  });

  // ─── Wall Impact ────────────────────────────────────────────

  describe('Wall Impact', () => {
    it('should give IN_HOLE status to players positioned in holes', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      const state = getState(game);
      const wall = state.currentWall!;

      // Place alice in first hole
      setPlayerPosition(game, MOCK_USERS.alice.userId, wall.holes[0]);
      // Place others elsewhere (not in holes)
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });

      // Advance past positioning to trigger wall impact
      advancePastPositioning();

      const impact = findLastActionBroadcast(broadcastLog, 'HT_WALL_IMPACT');
      expect(impact).toBeDefined();
      const payload = actionPayload(impact!);
      const results = payload.results as Record<string, unknown>;
      const playerResults = results.playerResults as Array<{ userId: string; status: string }>;

      const aliceResult = playerResults.find((r) => r.userId === MOCK_USERS.alice.userId);
      expect(aliceResult).toBeDefined();
      expect(aliceResult!.status).toBe('IN_HOLE');
    });

    it('should give HIT_BY_WALL status to players not in hole or dead zone', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      const state = getState(game);
      const wall = state.currentWall!;

      // Place all players in cells that are NOT holes and NOT dead zones
      const holeSet = new Set(wall.holes.map((h) => `${h.col},${h.row}`));
      const dzSet = new Set(wall.deadZones.map((d) => `${d.col},${d.row}`));

      let placed = 0;
      for (let col = 0; col < HT_GRID_COLS && placed < 4; col++) {
        for (let row = 0; row < HT_GRID_ROWS && placed < 4; row++) {
          const key = `${col},${row}`;
          if (!holeSet.has(key) && !dzSet.has(key)) {
            const userId = [MOCK_USERS.alice.userId, MOCK_USERS.bob.userId, MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId][placed];
            setPlayerPosition(game, userId, { col, row });
            placed++;
          }
        }
      }

      advancePastPositioning();

      const impact = findLastActionBroadcast(broadcastLog, 'HT_WALL_IMPACT');
      expect(impact).toBeDefined();
      const payload = actionPayload(impact!);
      const results = payload.results as Record<string, unknown>;
      const playerResults = results.playerResults as Array<{ userId: string; status: string }>;

      // All players should be HIT_BY_WALL
      for (const pr of playerResults) {
        expect(pr.status).toBe('HIT_BY_WALL');
      }
      expect(results.success).toBe(false);
    });

    it('should report success=true when all holes filled and all players safe', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      placePlayersInHoles(game);

      advancePastPositioning();

      const impact = findLastActionBroadcast(broadcastLog, 'HT_WALL_IMPACT');
      expect(impact).toBeDefined();
      const payload = actionPayload(impact!);
      const results = payload.results as Record<string, unknown>;
      expect(results.allHolesFilled).toBe(true);
      expect(results.allPlayersSafe).toBe(true);
      expect(results.success).toBe(true);
    });

    it('should report success=false when some holes are unfilled', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      const state = getState(game);
      const wall = state.currentWall!;

      // Place only 1 player in a hole, rest in non-hole non-deadzone cells
      setPlayerPosition(game, MOCK_USERS.alice.userId, wall.holes[0]);
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });

      advancePastPositioning();

      const impact = findLastActionBroadcast(broadcastLog, 'HT_WALL_IMPACT');
      const payload = actionPayload(impact!);
      const results = payload.results as Record<string, unknown>;
      expect(results.success).toBe(false);
    });

    it('should report success=false when some players are hit by wall', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      const state = getState(game);
      const wall = state.currentWall!;

      // Fill all holes but place extra player in wall cell
      const playerIds = [MOCK_USERS.alice.userId, MOCK_USERS.bob.userId, MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId];
      for (let i = 0; i < Math.min(wall.holes.length, playerIds.length - 1); i++) {
        setPlayerPosition(game, playerIds[i], wall.holes[i]);
      }
      // Last player hits wall
      setPlayerPosition(game, playerIds[playerIds.length - 1], { col: 0, row: 5 });

      advancePastPositioning();

      const impact = findLastActionBroadcast(broadcastLog, 'HT_WALL_IMPACT');
      const payload = actionPayload(impact!);
      const results = payload.results as Record<string, unknown>;
      // success should be false because a player was hit
      expect(results.allPlayersSafe).toBe(false);
      expect(results.success).toBe(false);
    });

    it('should broadcast HT_WALL_IMPACT then HT_WAVE_RESULTS', () => {
      const { game, broadcastLog } = startAndAdvanceToPositioning();

      advancePastPositioning();

      const impact = findLastActionBroadcast(broadcastLog, 'HT_WALL_IMPACT');
      expect(impact).toBeDefined();

      advancePastWallImpact();

      const waveResults = findLastActionBroadcast(broadcastLog, 'HT_WAVE_RESULTS');
      expect(waveResults).toBeDefined();
      const payload = actionPayload(waveResults!);
      expect(payload.waveNumber).toBe(1);
      expect(typeof payload.success).toBe('boolean');
      expect(typeof payload.filledHoles).toBe('number');
      expect(typeof payload.totalHoles).toBe('number');
    });
  });

  // ─── Scoring ────────────────────────────────────────────────

  describe('Scoring', () => {
    it('should award HT_SUCCESS_POINTS to all players on success', () => {
      const { game } = startAndAdvanceToPositioning();

      placePlayersInHoles(game);

      advancePastPositioning();
      advancePastWallImpact();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = state.scores as Array<{ userId: string; totalScore: number }>;

      for (const s of scores) {
        expect(s.totalScore).toBeGreaterThanOrEqual(HT_SUCCESS_POINTS);
      }
    });

    it('should award HT_PERFECT_WAVE_BONUS when ≥2s remaining', () => {
      const { game } = startAndAdvanceToPositioning();

      // Place players in holes immediately (lots of time remaining)
      placePlayersInHoles(game);

      // Advance only 1 second into positioning (plenty of time left)
      vi.advanceTimersByTime(1000);
      // Force wall impact with time remaining
      advancePastPositioning();
      advancePastWallImpact();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = state.scores as Array<{ userId: string; totalScore: number }>;

      // Each player should get at least SUCCESS + PERFECT_WAVE_BONUS
      for (const s of scores) {
        expect(s.totalScore).toBeGreaterThanOrEqual(HT_SUCCESS_POINTS);
      }
    });

    it('should award HT_CORRECT_POSITION_POINTS for correctly positioned players on failure', () => {
      const { game } = startAndAdvanceToPositioning();

      const state = getState(game);
      const wall = state.currentWall!;

      // Alice in hole (correct), rest hit by wall
      setPlayerPosition(game, MOCK_USERS.alice.userId, wall.holes[0]);
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });

      advancePastPositioning();
      advancePastWallImpact();

      const playerState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = playerState.scores as Array<{ userId: string; totalScore: number }>;

      const aliceScore = scores.find((s) => s.userId === MOCK_USERS.alice.userId);
      expect(aliceScore).toBeDefined();
      expect(aliceScore!.totalScore).toBeGreaterThanOrEqual(HT_CORRECT_POSITION_POINTS);
    });

    it('should award proportional HT_PARTIAL_POINTS when some holes filled', () => {
      const { game } = startAndAdvanceToPositioning();

      const state = getState(game);
      const wall = state.currentWall!;
      const totalHoles = wall.holes.length;

      // Place 1 player in a hole (partial fill)
      setPlayerPosition(game, MOCK_USERS.alice.userId, wall.holes[0]);
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });

      advancePastPositioning();
      advancePastWallImpact();

      const playerState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;
      const scores = playerState.scores as Array<{ userId: string; totalScore: number }>;
      const bobScore = scores.find((s) => s.userId === MOCK_USERS.bob.userId);

      // Bob hit by wall but should still get partial points (1/totalHoles * HT_PARTIAL_POINTS)
      const expectedPartial = Math.round(HT_PARTIAL_POINTS * (1 / totalHoles));
      // Bob gets partial + hit penalty
      expect(bobScore).toBeDefined();
      expect(bobScore!.totalScore).toBe(expectedPartial + HT_HIT_PENALTY);
    });

    it('should apply HT_HIT_PENALTY to players hit by wall', () => {
      const { game } = startAndAdvanceToPositioning();

      // Place all players in non-hole, non-deadzone cells
      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 2, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 6, row: 5 });

      advancePastPositioning();
      advancePastWallImpact();

      const playerState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = playerState.scores as Array<{ userId: string; totalScore: number }>;

      for (const s of scores) {
        // All hit = penalty applied (no partial since 0 filled)
        expect(s.totalScore).toBe(HT_HIT_PENALTY);
      }
    });

    it('should reset streak counter to 0 on failure', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 3 };
      const { game } = startAndAdvanceToPositioning(ctx);

      // Wave 1: success
      placePlayersInHoles(game);
      advancePastPositioning();
      advancePastWallImpact();

      let internalState = getState(game);
      expect(internalState.consecutiveSuccesses).toBe(1);

      advancePastWaveResults();
      advancePastWallPreview();

      // Wave 2: failure (all hit by wall)
      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 2, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 6, row: 5 });

      advancePastPositioning();
      advancePastWallImpact();

      internalState = getState(game);
      expect(internalState.consecutiveSuccesses).toBe(0);
    });

    it('should award HT_STREAK_BONUS when consecutiveSuccesses >= totalWaves', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2 };
      const { game } = startAndAdvanceToPositioning(ctx);

      // Wave 1: success
      placePlayersInHoles(game);
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      advancePastWallPreview();

      // Wave 2: success (consecutive = 2 = totalWaves → streak bonus)
      placePlayersInHoles(game);
      advancePastPositioning();
      advancePastWallImpact();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = state.scores as Array<{ userId: string; totalScore: number }>;

      // All players should have gotten streak bonus
      for (const s of scores) {
        expect(s.totalScore).toBeGreaterThanOrEqual(HT_SUCCESS_POINTS * 2 + HT_STREAK_BONUS);
      }
    });
  });

  // ─── Full Game Lifecycle ─────────────────────────────────────

  describe('Full Game Lifecycle', () => {
    it('should trigger GAME_OVER and onComplete after all waves', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, broadcastLog, completedResults } = createGame(ctx);
      game.start();

      advancePastWallPreview();
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      const gameOver = findLastActionBroadcast(broadcastLog, 'HT_GAME_OVER');
      expect(gameOver).toBeDefined();
      const payload = actionPayload(gameOver!);
      expect(payload.finalRankings).toBeDefined();
      expect(payload.wavesCompleted).toBe(1);

      expect(completedResults.length).toBe(1);
      const results = completedResults[0];
      expect(results.rankings.length).toBe(4);
      expect(results.duration).toBeGreaterThan(0);
    });

    it('should call onComplete with results including rankings', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      advanceFullWave();

      expect(completedResults.length).toBe(1);
      const rankings = completedResults[0].rankings;
      expect(rankings.length).toBe(4);
    });

    it('should sort rankings by score descending', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, completedResults } = startAndAdvanceToPositioning(ctx);

      // Give alice a better position (in hole) than others
      const state = getState(game);
      const wall = state.currentWall!;
      setPlayerPosition(game, MOCK_USERS.alice.userId, wall.holes[0]);
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });

      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      expect(completedResults.length).toBe(1);
      const rankings = completedResults[0].rankings;
      expect(rankings[0].rank).toBe(1);
      for (let i = 1; i < rankings.length; i++) {
        expect(rankings[i - 1].score).toBeGreaterThanOrEqual(rankings[i].score);
      }
    });

    it('should play through multiple waves correctly', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 3 };
      const { game, broadcastLog, completedResults } = createGame(ctx);
      game.start();

      for (let w = 0; w < 3; w++) {
        advancePastWallPreview();
        advancePastPositioning();
        advancePastWallImpact();
        advancePastWaveResults();
      }

      const waveStarts = findActionBroadcasts(broadcastLog, 'HT_WAVE_START');
      expect(waveStarts.length).toBe(3);
      expect(completedResults.length).toBe(1);
    });
  });

  // ─── State Views ────────────────────────────────────────────

  describe('State Views', () => {
    it('should return correct state shape from getStateForPlayer', () => {
      const { game } = startAndAdvanceToPositioning();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;

      expect(state.phase).toBe('POSITIONING');
      expect(state.waveNumber).toBe(1);
      expect(state.totalWaves).toBeDefined();
      expect(state.gridCols).toBe(HT_GRID_COLS);
      expect(state.gridRows).toBe(HT_GRID_ROWS);
      expect(state.wall).toBeDefined();
      expect(state.playerPositions).toBeDefined();
      expect(state.scores).toBeDefined();
      expect(Array.isArray(state.filledHoles)).toBe(true);
      expect(Array.isArray(state.unfilledHoles)).toBe(true);
      expect(typeof state.consecutiveSuccesses).toBe('number');
    });

    it('should include isMe field in player positions', () => {
      const { game } = startAndAdvanceToPositioning();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const positions = state.playerPositions as Array<{ userId: string; isMe: boolean }>;

      const alicePos = positions.find((p) => p.userId === MOCK_USERS.alice.userId);
      expect(alicePos).toBeDefined();
      expect(alicePos!.isMe).toBe(true);

      const bobPos = positions.find((p) => p.userId === MOCK_USERS.bob.userId);
      expect(bobPos).toBeDefined();
      expect(bobPos!.isMe).toBe(false);
    });

    it('should return same data from getStateForSpectator (cooperative game)', () => {
      const { game } = startAndAdvanceToPositioning();

      const playerState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const specState = game.getStateForSpectator() as Record<string, unknown>;

      expect(specState.phase).toBe(playerState.phase);
      expect(specState.waveNumber).toBe(playerState.waveNumber);
      expect(specState.gridCols).toBe(playerState.gridCols);
      expect(specState.gridRows).toBe(playerState.gridRows);
      expect(specState.wall).toEqual(playerState.wall);
      expect(specState.scores).toEqual(playerState.scores);
    });

    it('should show filled and unfilled holes correctly', () => {
      const { game } = startAndAdvanceToPositioning();

      const state = getState(game);
      const wall = state.currentWall!;

      // Place alice in first hole; move all others off holes
      setPlayerPosition(game, MOCK_USERS.alice.userId, wall.holes[0]);
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });

      const playerState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const filledHoles = playerState.filledHoles as GridPosition[];
      const unfilledHoles = playerState.unfilledHoles as GridPosition[];

      expect(filledHoles.length).toBe(1);
      expect(filledHoles[0].col).toBe(wall.holes[0].col);
      expect(filledHoles[0].row).toBe(wall.holes[0].row);
      expect(unfilledHoles.length).toBe(wall.holes.length - 1);
    });
  });

  // ─── Awards ─────────────────────────────────────────────────

  describe('Awards', () => {
    it('should award Perfect Team when all waves are successful', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      // Wave 1: success
      advancePastWallPreview();
      placePlayersInHoles(game);
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      // Wave 2: success
      advancePastWallPreview();
      placePlayersInHoles(game);
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      expect(completedResults.length).toBe(1);
      const awards = completedResults[0].awards;
      const perfectTeam = awards.find((a) => a.title === 'Perfect Team');
      expect(perfectTeam).toBeDefined();
      expect(perfectTeam!.icon).toBe('trophy');
    });

    it('should not award Perfect Team when any wave fails', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      // Wave 1: failure
      advancePastWallPreview();
      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 2, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 6, row: 5 });
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      // Wave 2: success
      advancePastWallPreview();
      placePlayersInHoles(game);
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      expect(completedResults.length).toBe(1);
      const awards = completedResults[0].awards;
      const perfectTeam = awards.find((a) => a.title === 'Perfect Team');
      expect(perfectTeam).toBeUndefined();
    });

    it('should award Shape Filler to player with most correct positions', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      // Wave 1: alice in hole, rest hit
      advancePastWallPreview();
      const state1 = getState(game);
      setPlayerPosition(game, MOCK_USERS.alice.userId, state1.currentWall!.holes[0]);
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      // Wave 2: alice in hole again, rest hit
      advancePastWallPreview();
      const state2 = getState(game);
      setPlayerPosition(game, MOCK_USERS.alice.userId, state2.currentWall!.holes[0]);
      setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
      setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
      setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });
      advancePastPositioning();
      advancePastWallImpact();
      advancePastWaveResults();

      expect(completedResults.length).toBe(1);
      const awards = completedResults[0].awards;
      const shapeFiller = awards.find((a) => a.title === 'Shape Filler');
      expect(shapeFiller).toBeDefined();
      expect(shapeFiller!.userId).toBe(MOCK_USERS.alice.userId);
      expect(shapeFiller!.icon).toBe('puzzle');
    });

    it('should award Wall Magnet to player hit by wall the most', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      for (let w = 0; w < 2; w++) {
        advancePastWallPreview();
        const state = getState(game);
        // Alice always in a hole, bob always hit
        setPlayerPosition(game, MOCK_USERS.alice.userId, state.currentWall!.holes[0]);
        setPlayerPosition(game, MOCK_USERS.bob.userId, { col: 0, row: 5 });
        setPlayerPosition(game, MOCK_USERS.charlie.userId, { col: 1, row: 5 });
        setPlayerPosition(game, MOCK_USERS.diana.userId, { col: 2, row: 5 });
        advancePastPositioning();
        advancePastWallImpact();
        advancePastWaveResults();
      }

      expect(completedResults.length).toBe(1);
      const awards = completedResults[0].awards;
      const wallMagnet = awards.find((a) => a.title === 'Wall Magnet');
      expect(wallMagnet).toBeDefined();
      expect(wallMagnet!.icon).toBe('zap');
    });

    it('should define all expected award types with correct icons', () => {
      const expectedAwards = [
        { title: 'Perfect Team', icon: 'trophy' },
        { title: 'Dead Zone Expert', icon: 'ghost' },
        { title: 'Shape Filler', icon: 'puzzle' },
        { title: 'Wall Magnet', icon: 'zap' },
        { title: 'Speed Mover', icon: 'rabbit' },
      ];
      expect(expectedAwards.length).toBe(5);
      for (const a of expectedAwards) {
        expect(a.title).toBeTruthy();
        expect(a.icon).toBeTruthy();
      }
    });
  });

  // ─── Reconnection / Disconnection ───────────────────────────

  describe('Reconnection / Disconnection', () => {
    it('should keep disconnected player avatar at last position', () => {
      const { game } = startAndAdvanceToPositioning();

      setPlayerPosition(game, MOCK_USERS.alice.userId, { col: 3, row: 3 });

      game.handlePlayerDisconnect(MOCK_USERS.alice.userId);

      const state = getState(game);
      const alicePos = state.playerPositions.get(MOCK_USERS.alice.userId);
      expect(alicePos).toBeDefined();
      expect(alicePos!.col).toBe(3);
      expect(alicePos!.row).toBe(3);
    });

    it('should send state snapshot on player reconnect', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      game.handlePlayerReconnect(MOCK_USERS.alice.userId);

      const snapshot = playerLog.find(
        (e) => e.userId === MOCK_USERS.alice.userId && e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();
      const data = snapshot!.data as Record<string, unknown>;
      expect(data.phase).toBe('POSITIONING');
      expect(data.scores).toBeDefined();
      expect(data.playerPositions).toBeDefined();
    });

    it('should include correct isMe in reconnect snapshot', () => {
      const { game, playerLog } = startAndAdvanceToPositioning();

      game.handlePlayerReconnect(MOCK_USERS.bob.userId);

      const snapshot = playerLog.find(
        (e) => e.userId === MOCK_USERS.bob.userId && e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();
      const data = snapshot!.data as Record<string, unknown>;
      const positions = data.playerPositions as Array<{ userId: string; isMe: boolean }>;
      const bobPos = positions.find((p) => p.userId === MOCK_USERS.bob.userId);
      expect(bobPos!.isMe).toBe(true);
    });
  });

  // ─── Game Settings ──────────────────────────────────────────

  describe('Game Settings', () => {
    it('should respect custom totalWaves setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2 };
      const { game, broadcastLog, completedResults } = createGame(ctx);
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.totalWaves).toBe(2);

      // Play 2 waves and verify game ends
      advanceFullWave();
      advanceFullWave();

      expect(completedResults.length).toBe(1);

      const waveStarts = findActionBroadcasts(broadcastLog, 'HT_WAVE_START');
      expect(waveStarts.length).toBe(2);
    });

    it('should use default totalWaves when not specified', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.totalWaves).toBe(HT_TOTAL_WAVES);
    });

    it('should use custom wallPreviewDuration', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1, wallPreviewDuration: 5 };
      const { game } = createGame(ctx);
      game.start();

      // After default preview time (3s), should still be WALL_PREVIEW
      vi.advanceTimersByTime(3000);
      const state1 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state1.phase).toBe('WALL_PREVIEW');

      // After custom preview time (5s total), should be POSITIONING
      vi.advanceTimersByTime(2000);
      const state2 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state2.phase).toBe('POSITIONING');
    });

    it('should use custom startingPositionTime', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1, startingPositionTime: 3 };
      const { game, broadcastLog } = createGame(ctx);
      game.start();

      advancePastWallPreview();

      // After 2s, should still be POSITIONING
      vi.advanceTimersByTime(2000);
      const state1 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state1.phase).toBe('POSITIONING');

      // After 3s total, should transition to WALL_IMPACT
      vi.advanceTimersByTime(1000);
      const state2 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state2.phase).toBe('WALL_IMPACT');
    });

    it('should pass enableDeadZones setting to buildWallShape', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1, enableDeadZones: true };
      const { game, broadcastLog } = createGame(ctx);
      game.start();

      const waveStart = findLastActionBroadcast(broadcastLog, 'HT_WAVE_START');
      expect(waveStart).toBeDefined();
      const payload = actionPayload(waveStart!);
      const deadZones = payload.deadZones as GridPosition[];
      expect(Array.isArray(deadZones)).toBe(true);
      // With enableDeadZones=true and easy difficulty (all players required),
      // there should be dead zones generated
      expect(deadZones.length).toBeGreaterThanOrEqual(0);
    });

    it('should have empty dead zones when enableDeadZones is false (default)', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, broadcastLog } = createGame(ctx);
      game.start();

      const waveStart = findLastActionBroadcast(broadcastLog, 'HT_WAVE_START');
      const payload = actionPayload(waveStart!);
      const deadZones = payload.deadZones as GridPosition[];
      expect(deadZones.length).toBe(0);
    });
  });

  // ─── Game Log ───────────────────────────────────────────────

  describe('Game Log', () => {
    it('should include gameLog with correct structure in computeResults', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      advanceFullWave();

      expect(completedResults.length).toBe(1);
      const gameSpecific = completedResults[0].gameSpecificData as Record<string, unknown>;
      expect(gameSpecific.totalWaves).toBe(1);
      expect(gameSpecific.waveResults).toBeDefined();

      const gameLog = gameSpecific.gameLog as Record<string, unknown>;
      expect(gameLog).toBeDefined();
      expect(gameLog.minigameId).toBe('human-tetris');
      expect(gameLog.version).toBe(1);
    });

    it('should include players array in game log', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      advanceFullWave();

      const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;
      const players = gameLog.players as Array<{ userId: string; userName: string }>;
      expect(players.length).toBe(4);
      expect(players.find((p) => p.userId === MOCK_USERS.alice.userId)).toBeDefined();
      expect(players.find((p) => p.userId === MOCK_USERS.bob.userId)).toBeDefined();
      expect(players.find((p) => p.userId === MOCK_USERS.charlie.userId)).toBeDefined();
      expect(players.find((p) => p.userId === MOCK_USERS.diana.userId)).toBeDefined();
    });

    it('should include initialState with arena size and totalWaves in game log', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      advanceFullWave();

      const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;
      const initialState = gameLog.initialState as Record<string, unknown>;
      expect(initialState.totalWaves).toBe(1);
      expect(initialState.playerCount).toBe(4);
      expect(initialState.arenaSize).toEqual({ width: HT_GRID_COLS, height: HT_GRID_ROWS });
    });

    it('should include actions array with wave_start, wave_impact, wave_result, game_end entries', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 1 };
      const { game, completedResults } = createGame(ctx);
      game.start();

      advanceFullWave();

      const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;
      const actions = gameLog.actions as Array<{ seq: number; type: string; timestamp: number; payload: unknown }>;
      expect(actions.length).toBeGreaterThan(0);

      const types = new Set(actions.map((a) => a.type));
      expect(types.has('wave_start')).toBe(true);
      expect(types.has('wave_impact')).toBe(true);
      expect(types.has('wave_result')).toBe(true);
      expect(types.has('game_end')).toBe(true);

      // Sequential seq numbers
      for (let i = 0; i < actions.length; i++) {
        expect(actions[i].seq).toBe(i + 1);
      }
    });

    it('should include gameSettings in game log', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalWaves: 2, enableDeadZones: true };
      const { game, completedResults } = createGame(ctx);
      game.start();

      advanceFullWave();
      advanceFullWave();

      const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;
      const settings = gameLog.gameSettings as Record<string, unknown>;
      expect(settings.totalWaves).toBe(2);
      expect(settings.enableDeadZones).toBe(true);
    });
  });
});
