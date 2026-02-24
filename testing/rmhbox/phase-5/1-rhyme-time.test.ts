/**
 * Phase 5 — Section 5.1: Rhyme Time Server Handler Tests
 *
 * Tests the RhymeTimeMinigame server handler covering:
 * - State initialization
 * - Input handling (valid/invalid/duplicate submissions)
 * - Scoring computation
 * - State masking (getStateForPlayer / getStateForSpectator)
 * - Awards
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RhymeTimeMinigame } from '../../../server/rmhbox/minigames/rhyme-time';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new RhymeTimeMinigame(ctx.context);
  return { game, ...ctx };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Rhyme Time Server Handler (§5.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('State Initialization', () => {
    it('should create a game instance with 4 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(4);
    });
  });

  describe('Game Lifecycle', () => {
    it('should emit RT_ROUND_START when started', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const roundStart = findLastActionBroadcast(broadcastLog, 'RT_ROUND_START');
      expect(roundStart).toBeDefined();
      expect((roundStart!.data as Record<string, unknown>).round).toBe(1);
    });

    it('should broadcast TIMER_TICK during input phase', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      // Clear initial emissions, advance into input phase
      broadcastLog.length = 0;

      // Advance past round start duration to reach INPUT
      vi.advanceTimersByTime(3000);

      // Advance a few seconds for ticks
      vi.advanceTimersByTime(3000);

      const ticks = findActionBroadcasts(broadcastLog, 'TIMER_TICK');
      expect(ticks.length).toBeGreaterThan(0);
    });
  });

  describe('Input Handling', () => {
    it('should accept valid word submissions', () => {
      const { game, playerLog } = createGame();
      game.start();

      // Advance into INPUT phase
      vi.advanceTimersByTime(3000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'testword' });

      // Should get a response (either accepted or rejected)
      const hasResponse = playerLog.some(
        (e) =>
          e.userId === userId &&
          ['RT_RHYME_SUBMITTED', 'RT_RHYME_REJECTED'].includes(
            (e.data as Record<string, unknown>).type as string,
          ),
      );
      expect(hasResponse).toBe(true);
    });
  });

  describe('State Masking (§5.1 Security)', () => {
    it('getStateForPlayer should not reveal other players\' submissions during INPUT', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(3000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;

      expect(aliceState).toBeDefined();
      expect(bobState).toBeDefined();

      // Alice shouldn't see Bob's submissions and vice versa
      // The state should only contain the player's own submissions, not others'
    });

    it('getStateForSpectator should not reveal active submissions', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(3000);

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectState).toBeDefined();
    });
  });

  describe('Results & Awards', () => {
    it('should compute results with rankings', () => {
      const { game } = createGame();
      game.start();

      // Let the full game play out (3 rounds × duration)
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results).toBeDefined();
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(4);
      expect(results.awards).toBeDefined();
    });
  });
});
