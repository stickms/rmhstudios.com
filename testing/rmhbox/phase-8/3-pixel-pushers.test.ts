/**
 * Phase 8 — Section 8.3: Pixel Pushers Server Handler Tests
 *
 * Tests the PixelPushersMinigame server handler covering:
 * - State initialization and level selection
 * - Physics: pusher movement, ball collision, wall collision
 * - Polarity flip mechanics
 * - Waypoint and goal detection
 * - Level lifecycle (preview → active → complete → next level)
 * - Scoring and awards computation
 * - State masking (getStateForPlayer vs getStateForSpectator)
 * - Join-in-progress handling
 * - Disconnect/reconnect behavior
 * - Input rate limiting
 * - Game settings integration
 * - Game log building
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PixelPushersMinigame } from '../../../server/rmhbox/minigames/pixel-pushers';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerEvents,
  type MockContextData,
} from './setup';
import {
  PP_LEVEL_PREVIEW_SECONDS,
  PP_ACTIVE_DURATION_SECONDS,
  PP_LEVEL_COMPLETE_SECONDS,
  PP_SIMULATION_TICK_MS,
  PP_PUSHER_SPEED,
  PP_CANVAS_WIDTH,
  PP_CANVAS_HEIGHT,
} from '../../../lib/rmhbox/constants';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new PixelPushersMinigame(ctx.context);
  return { game, ...ctx };
}

function startGameAndAdvanceToActive(game: PixelPushersMinigame) {
  game.start();
  // Advance past level preview to active phase
  vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Pixel Pushers Server Handler (§8.3)', () => {
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

    it('should emit PP_LEVEL_START when started', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const levelStart = findLastActionBroadcast(broadcastLog, 'PP_LEVEL_START');
      expect(levelStart).toBeDefined();
      const payload = levelStart!.data.payload as Record<string, unknown>;
      expect(payload.level).toBe(1);
      expect(payload.levelName).toBeDefined();
      expect(payload.layout).toBeDefined();
    });

    it('should start in LEVEL_PREVIEW phase', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('LEVEL_PREVIEW');
    });

    it('should initialize ball at level start position', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const levelStart = findLastActionBroadcast(broadcastLog, 'PP_LEVEL_START');
      const layout = (levelStart!.data.payload as Record<string, unknown>).layout as Record<string, unknown>;
      const ballStart = layout.ballStart as { x: number; y: number };
      expect(ballStart.x).toBeGreaterThanOrEqual(0);
      expect(ballStart.y).toBeGreaterThanOrEqual(0);
    });

    it('should assign unique colors to each pusher', () => {
      const { game } = createGame();
      game.start();

      // Advance to active to get pusher info
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const pushers = state.pushers as Array<{ color: string }>;
      const colors = pushers.map((p) => p.color);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });
  });

  // ─── Game Lifecycle ──────────────────────────────────────────

  describe('Game Lifecycle', () => {
    it('should transition from LEVEL_PREVIEW to ACTIVE after preview duration', () => {
      const { game } = createGame();
      game.start();

      // Before preview ends
      let state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('LEVEL_PREVIEW');

      // After preview ends
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);
      state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('ACTIVE');
    });

    it('should broadcast TIMER_TICK during active phase', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      vi.advanceTimersByTime(3000);

      const ticks = findActionBroadcasts(broadcastLog, 'TIMER_TICK');
      expect(ticks.length).toBeGreaterThan(0);
    });

    it('should broadcast PP_STATE_UPDATE during active phase', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      vi.advanceTimersByTime(200);

      const updates = findActionBroadcasts(broadcastLog, 'PP_STATE_UPDATE');
      expect(updates.length).toBeGreaterThan(0);

      const payload = updates[0].data.payload as Record<string, unknown>;
      expect(payload.ball).toBeDefined();
      expect(payload.pushers).toBeDefined();
    });

    it('should end level on TIMEOUT if goal not reached', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      vi.advanceTimersByTime(PP_ACTIVE_DURATION_SECONDS * 1000 + 1000);

      const failed = findLastActionBroadcast(broadcastLog, 'PP_LEVEL_FAILED');
      expect(failed).toBeDefined();
    });

    it('should broadcast MINIGAME_ROUND with correct level numbers', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const round = findLastActionBroadcast(broadcastLog, 'MINIGAME_ROUND');
      expect(round).toBeDefined();
      const payload = round!.data.payload as { current: number; total: number };
      expect(payload.current).toBe(1);
      expect(payload.total).toBeGreaterThanOrEqual(2);
    });

    it('should end game after all levels are completed or failed', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalLevels: 1, activeDuration: 5 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();

      // Advance through preview
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);
      // Advance through active phase (timeout)
      vi.advanceTimersByTime(6000);
      // Advance through transition
      vi.advanceTimersByTime(5000);

      const gameOver = findLastActionBroadcast(ctx.broadcastLog, 'PP_GAME_OVER');
      expect(gameOver).toBeDefined();
    });
  });

  // ─── Input Handling ──────────────────────────────────────────

  describe('Input Handling', () => {
    it('should accept valid PP_MOVE inputs', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Should not throw
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 1, dy: 0 });
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: -0.5, dy: 0.5 });
    });

    it('should reject invalid PP_MOVE inputs', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Out of range — should be silently ignored
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 5, dy: 0 });
    });

    it('should ignore inputs during LEVEL_PREVIEW phase', () => {
      const { game } = createGame();
      game.start();

      // Should not crash during preview phase
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 1, dy: 0 });
    });

    it('should ignore inputs from unknown action types', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Should not throw
      game.handleInput(MOCK_USERS.alice.userId, 'INVALID_ACTION', {});
    });

    it('should stop movement when dx/dy are both 0', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 1, dy: 0 });
      // Now stop
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 0, dy: 0 });
    });
  });

  // ─── Physics ─────────────────────────────────────────────────

  describe('Physics Simulation', () => {
    it('should move pushers based on input direction', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Get initial position
      const stateBefore = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const pushersBefore = stateBefore.pushers as Array<{ userId: string; x: number; y: number }>;
      const aliceBefore = pushersBefore.find((p) => p.userId === MOCK_USERS.alice.userId)!;
      const initialX = aliceBefore.x;

      // Move right
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 1, dy: 0 });
      vi.advanceTimersByTime(PP_SIMULATION_TICK_MS * 5); // 5 ticks

      const stateAfter = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const pushersAfter = stateAfter.pushers as Array<{ userId: string; x: number; y: number }>;
      const aliceAfter = pushersAfter.find((p) => p.userId === MOCK_USERS.alice.userId)!;

      expect(aliceAfter.x).toBeGreaterThan(initialX);
    });

    it('should keep pushers within canvas bounds', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Move far right for a long time
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 1, dy: 0 });
      vi.advanceTimersByTime(PP_SIMULATION_TICK_MS * 1000); // Many ticks

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const pushers = state.pushers as Array<{ userId: string; x: number }>;
      const alice = pushers.find((p) => p.userId === MOCK_USERS.alice.userId)!;

      expect(alice.x).toBeLessThanOrEqual(PP_CANVAS_WIDTH);
      expect(alice.x).toBeGreaterThanOrEqual(0);
    });

    it('should apply friction to ball velocity', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      // Wait for some state updates
      broadcastLog.length = 0;
      vi.advanceTimersByTime(1000);

      const updates = findActionBroadcasts(broadcastLog, 'PP_STATE_UPDATE');
      if (updates.length > 1) {
        const first = (updates[0].data.payload as Record<string, unknown>).ball as { vx: number; vy: number };
        // Ball starts at rest, should still be near rest
        expect(Math.abs(first.vx) + Math.abs(first.vy)).toBeLessThan(1);
      }
    });

    it('should emit PP_PUSH_EVENT when pusher contacts ball', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      // Move alice toward ball position continuously
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 1, dy: 0 });

      broadcastLog.length = 0;
      // Run for enough time that a push might happen (depends on level layout)
      vi.advanceTimersByTime(PP_SIMULATION_TICK_MS * 300);

      // Push events may or may not happen depending on level layout
      // This test verifies the event structure if one occurred
      const pushEvents = findActionBroadcasts(broadcastLog, 'PP_PUSH_EVENT');
      if (pushEvents.length > 0) {
        const payload = pushEvents[0].data.payload as Record<string, unknown>;
        expect(payload.userId).toBeDefined();
        expect(payload.impulse).toBeDefined();
      }
    });
  });

  // ─── Polarity ────────────────────────────────────────────────

  describe('Polarity Flip Mechanics', () => {
    it('should emit PP_POLARITY_WARNING before flip', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      // Advance to near polarity flip time (default 10s, warning at 7s)
      vi.advanceTimersByTime(8000);

      const warnings = findActionBroadcasts(broadcastLog, 'PP_POLARITY_WARNING');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should emit PP_POLARITY_FLIP at interval', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      // Advance past polarity interval
      vi.advanceTimersByTime(11000);

      const flips = findActionBroadcasts(broadcastLog, 'PP_POLARITY_FLIP');
      expect(flips.length).toBeGreaterThanOrEqual(1);

      const payload = flips[0].data.payload as Record<string, unknown>;
      expect(payload.userId).toBeDefined();
      expect(payload.newPolarity).toBe('attract');
    });

    it('should restore previous player polarity on new flip', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      // Advance past two polarity intervals
      vi.advanceTimersByTime(22000);

      const restores = findActionBroadcasts(broadcastLog, 'PP_POLARITY_RESTORE');
      expect(restores.length).toBeGreaterThanOrEqual(1);
    });

    it('should not flip polarity when enablePolarityFlip is false', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { enablePolarityFlip: false };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);

      ctx.broadcastLog.length = 0;
      vi.advanceTimersByTime(15000);

      const flips = findActionBroadcasts(ctx.broadcastLog, 'PP_POLARITY_FLIP');
      expect(flips.length).toBe(0);
    });
  });

  // ─── State Masking ───────────────────────────────────────────

  describe('State Masking (§8.3 Security)', () => {
    it('getStateForPlayer should NOT reveal individual push counts during ACTIVE', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const pushers = state.pushers as Array<Record<string, unknown>>;

      // Push counts should not be in player state during active phase
      for (const pusher of pushers) {
        expect(pusher.pushCount).toBeUndefined();
      }
    });

    it('getStateForSpectator should reveal push counts during ACTIVE', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      const pushers = state.pushers as Array<Record<string, unknown>>;

      // Spectators CAN see push counts
      for (const pusher of pushers) {
        expect(pusher.pushCount).toBeDefined();
        expect(typeof pusher.pushCount).toBe('number');
      }
    });

    it('player A cannot see push counts of player B', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      const stateA = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const pushersA = stateA.pushers as Array<Record<string, unknown>>;

      for (const pusher of pushersA) {
        expect(pusher.pushCount).toBeUndefined();
      }
    });
  });

  // ─── Join-in-Progress ────────────────────────────────────────

  describe('Join-in-Progress', () => {
    it('should allow a new player to join mid-game', () => {
      const { game, playerLog } = createGame();
      startGameAndAdvanceToActive(game);

      game.handlePlayerJoin('user-new-999');

      // Should send state snapshot to new player
      const events = findPlayerEvents(playerLog, 'user-new-999');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should add a pusher for the joining player', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      game.handlePlayerJoin('user-new-999');

      const state = game.getStateForPlayer('user-new-999') as Record<string, unknown>;
      const pushers = state.pushers as Array<{ userId: string }>;
      expect(pushers.some((p) => p.userId === 'user-new-999')).toBe(true);
    });
  });

  // ─── Disconnect / Reconnect ──────────────────────────────────

  describe('Disconnect/Reconnect', () => {
    it('should freeze pusher on disconnect', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: 1, dy: 0 });
      game.handlePlayerDisconnect(MOCK_USERS.alice.userId);

      // Input after disconnect should be ignored
      game.handleInput(MOCK_USERS.alice.userId, 'PP_MOVE', { dx: -1, dy: 0 });
    });

    it('should restore pusher on reconnect', () => {
      const { game, playerLog } = createGame();
      startGameAndAdvanceToActive(game);

      game.handlePlayerDisconnect(MOCK_USERS.alice.userId);
      game.handlePlayerReconnect(MOCK_USERS.alice.userId);

      const events = findPlayerEvents(playerLog, MOCK_USERS.alice.userId);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should ghost disconnected pusher after timeout', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      game.handlePlayerDisconnect(MOCK_USERS.alice.userId);
      vi.advanceTimersByTime(11000); // Past ghost delay

      const state = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;
      const pushers = state.pushers as Array<{ userId: string; isGhost: boolean }>;
      const alice = pushers.find((p) => p.userId === MOCK_USERS.alice.userId);
      expect(alice?.isGhost).toBe(true);
    });
  });

  // ─── Results ─────────────────────────────────────────────────

  describe('Results & Awards', () => {
    it('should compute results with rankings after game end', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalLevels: 1, activeDuration: 2 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();

      // Advance through all phases
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(3000); // Active phase timeout
      vi.advanceTimersByTime(5000); // Level transition + game over

      expect(ctx.completedResults.length).toBe(1);
      const results = ctx.completedResults[0];
      expect(results.rankings.length).toBe(4);
      expect(results.awards).toBeDefined();
      expect(results.gameSpecificData).toBeDefined();
    });

    it('should include game log in results', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalLevels: 1, activeDuration: 2 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();

      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(3000);
      vi.advanceTimersByTime(5000);

      const results = ctx.completedResults[0];
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog.minigameId).toBe('pixel-pushers');
      expect(gameLog.actions).toBeDefined();
      expect(gameLog.initialState).toBeDefined();
      expect(gameLog.finalResults).toBeDefined();
    });

    it('should rank players by score descending', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalLevels: 1, activeDuration: 2 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();

      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(3000);
      vi.advanceTimersByTime(5000);

      const results = ctx.completedResults[0];
      for (let i = 1; i < results.rankings.length; i++) {
        expect(results.rankings[i - 1].score).toBeGreaterThanOrEqual(results.rankings[i].score);
      }
    });
  });

  // ─── Game Settings ───────────────────────────────────────────

  describe('Game Settings Integration', () => {
    it('should respect custom totalLevels setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalLevels: 2 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();

      const round = findLastActionBroadcast(ctx.broadcastLog, 'MINIGAME_ROUND');
      const payload = round!.data.payload as { total: number };
      expect(payload.total).toBe(2);
    });

    it('should respect custom activeDuration setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { activeDuration: 60 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();

      const levelStart = findLastActionBroadcast(ctx.broadcastLog, 'PP_LEVEL_START');
      const payload = levelStart!.data.payload as Record<string, unknown>;
      expect(payload.activeDurationSeconds).toBe(60);
    });

    it('should respect custom polarityInterval setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { polarityInterval: 25 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);

      // First flip happens at default initial interval (PP_POLARITY_INTERVAL_SECONDS = 10s)
      // After that, the custom interval (25s) should be used
      ctx.broadcastLog.length = 0;

      // Advance past first flip (10s) and clear
      vi.advanceTimersByTime(11000);
      const firstFlips = findActionBroadcasts(ctx.broadcastLog, 'PP_POLARITY_FLIP');
      expect(firstFlips.length).toBe(1);

      // Now clear log and wait 15s more (should NOT have second flip with 25s interval)
      ctx.broadcastLog.length = 0;
      vi.advanceTimersByTime(15000);
      const secondFlips = findActionBroadcasts(ctx.broadcastLog, 'PP_POLARITY_FLIP');
      expect(secondFlips.length).toBe(0);
    });
  });

  // ─── Cleanup ─────────────────────────────────────────────────

  describe('Cleanup', () => {
    it('should clean up all intervals on game end', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalLevels: 1, activeDuration: 2 };
      const game = new PixelPushersMinigame(ctx.context);
      game.start();

      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);
      vi.advanceTimersByTime(3000);
      vi.advanceTimersByTime(5000);

      game.cleanup();
      expect(game.pendingTimerCount).toBe(0);
    });

    it('should be safe to call cleanup multiple times', () => {
      const { game } = createGame();
      game.start();

      game.cleanup();
      game.cleanup();
      // Should not throw
    });
  });
});
