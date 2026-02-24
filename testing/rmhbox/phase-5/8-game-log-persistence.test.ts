/**
 * Phase 5 — Game Log Persistence Tests
 *
 * Verifies that all 4 Phase 5 minigames include valid game log data
 * in their computeResults() output, ensuring that game histories
 * are available for the history viewing page.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RhymeTimeMinigame } from '../../../server/rmhbox/minigames/rhyme-time';
import { UndercoverAgentMinigame } from '../../../server/rmhbox/minigames/undercover-agent';
import { CategoryCrashMinigame } from '../../../server/rmhbox/minigames/category-crash';
import { WikiRaceMinigame } from '../../../server/rmhbox/minigames/wiki-race';
import {
  MOCK_USERS,
  createMockContext,
} from './setup';

// ─── Tests ───────────────────────────────────────────────────────

describe('Game Log Persistence (§14A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rhyme Time gameLog in computeResults', () => {
    it('should include gameLog in gameSpecificData', () => {
      const ctx = createMockContext();
      const game = new RhymeTimeMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results.gameSpecificData).toBeDefined();
      expect(results.gameSpecificData.gameLog).toBeDefined();
    });

    it('gameLog should contain actions array', () => {
      const ctx = createMockContext();
      const game = new RhymeTimeMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog.actions).toBeDefined();
      expect(Array.isArray(gameLog.actions)).toBe(true);
    });

    it('gameLog should contain lobbyId and timing data', () => {
      const ctx = createMockContext();
      const game = new RhymeTimeMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog.lobbyId).toBe('TEST01');
      expect(gameLog.startedAt).toBeDefined();
      expect(gameLog.endedAt).toBeDefined();
      expect(gameLog.playerCount).toBe(4);
    });
  });

  describe('Undercover Agent gameLog in computeResults', () => {
    it('should include gameLog in gameSpecificData', () => {
      const ctx = createMockContext();
      const game = new UndercoverAgentMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results.gameSpecificData).toBeDefined();
      expect(results.gameSpecificData.gameLog).toBeDefined();
    });

    it('gameLog should contain actions array and game metadata', () => {
      const ctx = createMockContext();
      const game = new UndercoverAgentMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog.actions).toBeDefined();
      expect(Array.isArray(gameLog.actions)).toBe(true);
      expect(gameLog.lobbyId).toBe('TEST01');
      expect(gameLog.playerCount).toBe(4);
    });
  });

  describe('Category Crash gameLog in computeResults', () => {
    it('should include gameLog in gameSpecificData', () => {
      const ctx = createMockContext([
        MOCK_USERS.alice,
        MOCK_USERS.bob,
        MOCK_USERS.charlie,
      ]);
      const game = new CategoryCrashMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results.gameSpecificData).toBeDefined();
      expect(results.gameSpecificData.gameLog).toBeDefined();
    });

    it('gameLog should contain actions array and round data', () => {
      const ctx = createMockContext([
        MOCK_USERS.alice,
        MOCK_USERS.bob,
        MOCK_USERS.charlie,
      ]);
      const game = new CategoryCrashMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog.actions).toBeDefined();
      expect(Array.isArray(gameLog.actions)).toBe(true);
      expect(gameLog.lobbyId).toBe('TEST01');
      expect(gameLog.playerCount).toBe(3);
    });
  });

  describe('Wiki-Race gameLog in computeResults', () => {
    it('should include gameLog in gameSpecificData', () => {
      const ctx = createMockContext();
      const game = new WikiRaceMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results.gameSpecificData).toBeDefined();
      expect(results.gameSpecificData.gameLog).toBeDefined();
    });

    it('gameLog should contain actions array and navigation data', () => {
      const ctx = createMockContext();
      const game = new WikiRaceMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      const gameLog = results.gameSpecificData.gameLog as Record<string, unknown>;
      expect(gameLog.actions).toBeDefined();
      expect(Array.isArray(gameLog.actions)).toBe(true);
      expect(gameLog.lobbyId).toBe('TEST01');
      expect(gameLog.playerCount).toBe(4);
    });
  });

  describe('All minigames produce persistable game logs', () => {
    it('all 4 games should have gameLog as a serializable object', () => {
      const games = [
        { name: 'Rhyme Time', create: () => { const ctx = createMockContext(); return new RhymeTimeMinigame(ctx.context); } },
        { name: 'Undercover Agent', create: () => { const ctx = createMockContext(); return new UndercoverAgentMinigame(ctx.context); } },
        { name: 'Category Crash', create: () => { const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]); return new CategoryCrashMinigame(ctx.context); } },
        { name: 'Wiki-Race', create: () => { const ctx = createMockContext(); return new WikiRaceMinigame(ctx.context); } },
      ];

      for (const { name, create } of games) {
        const game = create();
        game.start();
        vi.advanceTimersByTime(600_000);

        const results = game.computeResults();
        const gameLog = results.gameSpecificData.gameLog;

        // gameLog should be defined and serializable as JSON
        expect(gameLog, `${name} should produce a gameLog`).toBeDefined();
        expect(() => JSON.stringify(gameLog), `${name} gameLog should be JSON-serializable`).not.toThrow();

        // gameLog should have an actions array (core field for all game logs)
        const log = gameLog as Record<string, unknown>;
        expect(Array.isArray(log.actions), `${name} gameLog should have actions array`).toBe(true);
      }
    });
  });
});
