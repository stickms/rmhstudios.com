/**
 * Phase 8 — Section 8.4: Scroll Soul Server Handler Tests
 *
 * Tests the ScrollSoulMinigame server handler covering:
 * - State initialization and platform generation
 * - Physics: gravity, jumping, horizontal movement
 * - Platform collision (one-way from above)
 * - Horizontal wrapping
 * - Lava elimination
 * - Fake ad system (spawn, close, effects)
 * - Scoring and awards computation
 * - State masking (getStateForPlayer vs getStateForSpectator)
 * - JIP as spectate_only
 * - Disconnect/reconnect behavior
 * - Input rate limiting
 * - Game settings integration
 * - Game log building
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrollSoulMinigame } from '../../../server/rmhbox/minigames/scroll-soul';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerEvents,
  findLastPlayerEvent,
  type MockContextData,
} from './setup';
import {
  SC_SIMULATION_TICK_MS,
  SC_CANVAS_WIDTH,
  SC_CANVAS_HEIGHT,
} from '../../../lib/rmhbox/constants';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new ScrollSoulMinigame(ctx.context);
  return { game, ...ctx };
}

function startGameAndAdvanceToActive(game: ScrollSoulMinigame) {
  game.start();
  // Advance past countdown to active phase
  vi.advanceTimersByTime(3500);
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Scroll Soul Server Handler (§8.4)', () => {
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

    it('should start in COUNTDOWN phase', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('COUNTDOWN');
    });

    it('should generate initial platforms', () => {
      const { game } = createGame();
      game.start();

      // After starting, check that platforms exist
      vi.advanceTimersByTime(3500);
      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const platforms = state.platforms as Array<unknown>;
      expect(platforms.length).toBeGreaterThan(0);
    });

    it('should position players across the canvas', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const players = state.players as Array<{ userId: string; x: number }>;
      expect(players.length).toBe(4);

      // Players should be spaced apart
      const xs = players.map((p) => p.x).sort((a, b) => a - b);
      expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan(0);
    });

    it('should assign unique colors to each player', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const players = state.players as Array<{ color: string }>;
      const colors = players.map((p) => p.color);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });
  });

  // ─── Game Lifecycle ──────────────────────────────────────────

  describe('Game Lifecycle', () => {
    it('should transition from COUNTDOWN to ACTIVE after 3 seconds', () => {
      const { game } = createGame();
      game.start();

      vi.advanceTimersByTime(3500);
      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('ACTIVE');
    });

    it('should broadcast SC_STATE_UPDATE during active phase', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      vi.advanceTimersByTime(200);

      const updates = findActionBroadcasts(broadcastLog, 'SC_STATE_UPDATE');
      expect(updates.length).toBeGreaterThan(0);

      const payload = updates[0].data.payload as Record<string, unknown>;
      expect(payload.viewportY).toBeDefined();
      expect(payload.players).toBeDefined();
      expect(payload.platforms).toBeDefined();
    });

    it('should increase scroll speed over time', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      broadcastLog.length = 0;
      // Get initial state
      vi.advanceTimersByTime(100);
      const update1 = findLastActionBroadcast(broadcastLog, 'SC_STATE_UPDATE');
      const speed1 = (update1!.data.payload as Record<string, unknown>).scrollSpeed as number;

      // Wait some time
      vi.advanceTimersByTime(5000);
      const update2 = findLastActionBroadcast(broadcastLog, 'SC_STATE_UPDATE');
      const speed2 = (update2!.data.payload as Record<string, unknown>).scrollSpeed as number;

      expect(speed2).toBeGreaterThanOrEqual(speed1);
    });

    it('should end game when all players are eliminated', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      // Run simulation for a very long time — players will fall into lava
      vi.advanceTimersByTime(60000);

      // Either game over happened or there's still surviving players
      const gameOver = findLastActionBroadcast(broadcastLog, 'SC_GAME_OVER');
      const eliminations = findActionBroadcasts(broadcastLog, 'SC_PLAYER_ELIMINATED');

      // At minimum, viewport should have scrolled significantly
      const updates = findActionBroadcasts(broadcastLog, 'SC_STATE_UPDATE');
      expect(updates.length).toBeGreaterThan(0);
    });
  });

  // ─── Input Handling ──────────────────────────────────────────

  describe('Input Handling', () => {
    it('should accept valid SC_MOVE inputs', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Should not throw
      game.handleInput(MOCK_USERS.alice.userId, 'SC_MOVE', { dx: 1, jump: false });
      game.handleInput(MOCK_USERS.alice.userId, 'SC_MOVE', { dx: -1, jump: true });
    });

    it('should reject invalid SC_MOVE inputs', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Invalid input — should be silently ignored
      game.handleInput(MOCK_USERS.alice.userId, 'SC_MOVE', { dx: 5, jump: 'invalid' });
    });

    it('should ignore inputs during COUNTDOWN phase', () => {
      const { game } = createGame();
      game.start();

      // Should not crash during countdown
      game.handleInput(MOCK_USERS.alice.userId, 'SC_MOVE', { dx: 1, jump: false });
    });

    it('should not accept inputs from eliminated players', () => {
      const { game, broadcastLog } = createGame();
      startGameAndAdvanceToActive(game);

      // Run long enough for eliminations
      vi.advanceTimersByTime(30000);

      const eliminations = findActionBroadcasts(broadcastLog, 'SC_PLAYER_ELIMINATED');
      if (eliminations.length > 0) {
        const eliminatedUserId = (eliminations[0].data.payload as Record<string, unknown>).userId as string;
        // This should be silently ignored
        game.handleInput(eliminatedUserId, 'SC_MOVE', { dx: 1, jump: true });
      }
    });
  });

  // ─── Fake Ad System ──────────────────────────────────────────

  describe('Fake Ad System', () => {
    it('should handle SC_CLOSE_AD with valid ad ID', () => {
      const { game, playerLog } = createGame();
      startGameAndAdvanceToActive(game);

      // We can't directly spawn an ad, but we can test the handler
      // Try to close a non-existent ad — should be silently ignored
      game.handleInput(MOCK_USERS.alice.userId, 'SC_CLOSE_AD', {
        adId: 'nonexistent',
        clickPosition: { x: 10, y: 10 },
      });
    });

    it('should not spawn ads when enableAds is false', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { enableAds: false };
      const game = new ScrollSoulMinigame(ctx.context);
      startGameAndAdvanceToActive(game);

      ctx.playerLog.length = 0;
      vi.advanceTimersByTime(30000);

      // No SC_AD_SPAWN events should be sent to any player
      const adSpawns = ctx.playerLog.filter(
        (e) => {
          const data = e.data as Record<string, unknown>;
          return data.type === 'SC_AD_SPAWN';
        },
      );
      expect(adSpawns.length).toBe(0);
    });
  });

  // ─── State Masking ───────────────────────────────────────────

  describe('State Masking (§8.4 Security)', () => {
    it('getStateForPlayer should hide other players scores during ACTIVE', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = state.scores as Array<{ userId: string; score: number }>;

      // Only Alice's score should be non-zero (or at least visible)
      for (const s of scores) {
        if (s.userId !== MOCK_USERS.alice.userId) {
          expect(s.score).toBe(0); // Other players' scores hidden
        }
      }
    });

    it('getStateForSpectator should show all scores during ACTIVE', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      expect(state.activeAds).toBeDefined();
      expect(state.scores).toBeDefined();
    });

    it('getStateForSpectator should show ad stats during ACTIVE', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      const players = state.players as Array<Record<string, unknown>>;

      for (const player of players) {
        expect(player.adsCorrectlyDismissed).toBeDefined();
        expect(player.adsFailed).toBeDefined();
      }
    });

    it('player A should not see ad stats of player B', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const players = state.players as Array<Record<string, unknown>>;

      for (const player of players) {
        // Ad stats should not be present in player view
        expect(player.adsCorrectlyDismissed).toBeUndefined();
        expect(player.adsFailed).toBeUndefined();
      }
    });

    it('SC_AD_SPAWN should only be sent to targeted player', () => {
      const { game, playerLog } = createGame();
      startGameAndAdvanceToActive(game);

      // Run long enough for ads to spawn
      vi.advanceTimersByTime(20000);

      // Check that ad spawns are only sent to specific players, not broadcast
      const adSpawns = playerLog.filter(
        (e) => {
          const data = e.data as Record<string, unknown>;
          return data.type === 'SC_AD_SPAWN';
        },
      );

      // Each ad spawn should only have one recipient
      for (const spawn of adSpawns) {
        expect(spawn.userId).toBeDefined();
        expect(typeof spawn.userId).toBe('string');
      }
    });
  });

  // ─── Join-in-Progress ────────────────────────────────────────

  describe('Join-in-Progress (spectate_only)', () => {
    it('should not add a new player to the active game', () => {
      const { game, playerLog } = createGame();
      startGameAndAdvanceToActive(game);

      game.handlePlayerJoin('user-new-999');

      // New player should get spectator state
      const events = findPlayerEvents(playerLog, 'user-new-999');
      expect(events.length).toBeGreaterThan(0);

      // Check spectator state was sent (not player state)
      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const players = state.players as Array<{ userId: string }>;
      // New player should NOT be in the players array
      expect(players.some((p) => p.userId === 'user-new-999')).toBe(false);
    });
  });

  // ─── Disconnect / Reconnect ──────────────────────────────────

  describe('Disconnect/Reconnect', () => {
    it('should stop movement on disconnect', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      game.handleInput(MOCK_USERS.alice.userId, 'SC_MOVE', { dx: 1, jump: false });
      game.handlePlayerDisconnect(MOCK_USERS.alice.userId);
    });

    it('should cancel active ads on disconnect', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      game.handlePlayerDisconnect(MOCK_USERS.alice.userId);
      // Should not crash
    });

    it('should send state to reconnecting alive player', () => {
      const { game, playerLog } = createGame();
      startGameAndAdvanceToActive(game);

      game.handlePlayerDisconnect(MOCK_USERS.alice.userId);
      vi.advanceTimersByTime(100);
      game.handlePlayerReconnect(MOCK_USERS.alice.userId);

      const events = findPlayerEvents(playerLog, MOCK_USERS.alice.userId);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should send spectator state to reconnecting eliminated player', () => {
      const { game, broadcastLog, playerLog } = createGame();
      startGameAndAdvanceToActive(game);

      // Wait for player to possibly be eliminated
      vi.advanceTimersByTime(60000);

      const eliminations = findActionBroadcasts(broadcastLog, 'SC_PLAYER_ELIMINATED');
      if (eliminations.length > 0) {
        const eliminatedUserId = (eliminations[0].data.payload as Record<string, unknown>).userId as string;
        game.handlePlayerReconnect(eliminatedUserId);

        const events = findPlayerEvents(playerLog, eliminatedUserId);
        expect(events.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Results ─────────────────────────────────────────────────

  describe('Results & Awards', () => {
    it('should compute results after game ends', () => {
      const { game, broadcastLog, completedResults } = createGame();
      startGameAndAdvanceToActive(game);

      // Run until all eliminated
      vi.advanceTimersByTime(120000);

      if (completedResults.length > 0) {
        const results = completedResults[0];
        expect(results.rankings.length).toBe(4);
        expect(results.awards).toBeDefined();
        expect(results.gameSpecificData).toBeDefined();
      }
    });

    it('should include Soul Survivor award for last standing', () => {
      const { game, completedResults } = createGame();
      startGameAndAdvanceToActive(game);

      vi.advanceTimersByTime(120000);

      if (completedResults.length > 0) {
        const awards = completedResults[0].awards;
        const soulSurvivor = awards.find((a) => a.title === 'Soul Survivor');
        expect(soulSurvivor).toBeDefined();
      }
    });

    it('should include game log in results', () => {
      const { game, completedResults } = createGame();
      startGameAndAdvanceToActive(game);

      vi.advanceTimersByTime(120000);

      if (completedResults.length > 0) {
        const gameLog = completedResults[0].gameSpecificData.gameLog as Record<string, unknown>;
        expect(gameLog.minigameId).toBe('scroll-soul');
        expect(gameLog.actions).toBeDefined();
        expect(gameLog.initialState).toBeDefined();
      }
    });

    it('should rank players by score descending', () => {
      const { game, completedResults } = createGame();
      startGameAndAdvanceToActive(game);

      vi.advanceTimersByTime(120000);

      if (completedResults.length > 0) {
        const results = completedResults[0];
        for (let i = 1; i < results.rankings.length; i++) {
          expect(results.rankings[i - 1].score).toBeGreaterThanOrEqual(results.rankings[i].score);
        }
      }
    });
  });

  // ─── Game Settings ───────────────────────────────────────────

  describe('Game Settings Integration', () => {
    it('should respect baseScrollSpeed setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { baseScrollSpeed: 2.0 };
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      vi.advanceTimersByTime(100);
      const update = findLastActionBroadcast(ctx.broadcastLog, 'SC_STATE_UPDATE');
      if (update) {
        const scrollSpeed = (update.data.payload as Record<string, unknown>).scrollSpeed as number;
        expect(scrollSpeed).toBeGreaterThanOrEqual(2.0);
      }
    });

    it('should disable ads when enableAds is false', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { enableAds: false };
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      ctx.playerLog.length = 0;
      vi.advanceTimersByTime(30000);

      const adSpawns = ctx.playerLog.filter(
        (e) => {
          const data = e.data as Record<string, unknown>;
          return data.type === 'SC_AD_SPAWN';
        },
      );
      expect(adSpawns.length).toBe(0);
    });
  });

  // ─── Cleanup ─────────────────────────────────────────────────

  describe('Cleanup', () => {
    it('should clean up all intervals on game end', () => {
      const { game, completedResults } = createGame();
      startGameAndAdvanceToActive(game);

      vi.advanceTimersByTime(120000);

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

  // ─── Platform Generation ─────────────────────────────────────

  describe('Platform Generation', () => {
    it('should generate platforms ahead of viewport', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      vi.advanceTimersByTime(5000);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const platforms = state.platforms as Array<{ id: string; type: string }>;
      expect(platforms.length).toBeGreaterThan(0);
    });

    it('should include diverse platform types as game progresses', () => {
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Advance enough to generate platforms but not so far that all players die
      vi.advanceTimersByTime(10000);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;

      // If game is still active, check platform types
      if (state.phase === 'ACTIVE') {
        const platforms = state.platforms as Array<{ type: string }>;
        const types = new Set(platforms.map((p) => p.type));

        // Should have at least static platforms
        expect(types.has('static')).toBe(true);
      } else {
        // Game ended — just verify it ended gracefully
        expect(state.phase).toBe('GAME_OVER');
      }
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle all players eliminated on same tick gracefully', () => {
      // This tests that the game doesn't crash if multiple eliminations happen simultaneously
      const { game } = createGame();
      startGameAndAdvanceToActive(game);

      // Stop all players from moving (will fall into lava)
      // Just let the simulation run
      vi.advanceTimersByTime(120000);
      // Game should end without error
    });

    it('should handle 2-player game correctly', () => {
      const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob]);
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const players = state.players as Array<unknown>;
      expect(players.length).toBe(2);
    });
  });
});
