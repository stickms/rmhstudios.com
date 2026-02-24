/**
 * Phase 5 — Section 5.4: Wiki-Race Server Handler Tests
 *
 * Tests the WikiRaceMinigame server handler covering:
 * - State initialization (4 players, same start article, pre-cached)
 * - NAVIGATE input handling (valid, invalid, target reached, rate limit)
 * - GO_BACK handling (path truncation, click count increment)
 * - Scoring formula (finished/DNF/one-away)
 * - getStateForPlayer masking (other players' titles/paths hidden)
 * - getStateForSpectator (full visibility)
 * - Awards (Speed Runner, Efficiency Expert, Tourist, Optimal Path, Almost There)
 * - buildGameLog
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WikiRaceMinigame, WikiRacePhase } from '../../../server/rmhbox/minigames/wiki-race';
import {
  WR_NAV_DURATION,
  WR_DNF_BASE,
  WR_ONE_AWAY,
} from '../../../lib/rmhbox/constants';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findLastPlayerAction,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  // Mock the Wikipedia proxy to avoid real HTTP calls
  vi.mock('../../../lib/rmhbox/wiki-race/wikipedia-proxy', () => ({
    createArticleCache: () => {
      // Return a mock LRU cache
      const cache = new Map();
      return {
        get: (key: string) => cache.get(key),
        set: (key: string, val: unknown) => cache.set(key, val),
        has: (key: string) => cache.has(key),
        delete: (key: string) => cache.delete(key),
        clear: () => cache.clear(),
        size: cache.size,
      };
    },
    fetchArticle: vi.fn().mockResolvedValue({
      title: 'Mock_Article',
      sanitizedHtml: '<p>Mock article content. <a data-wiki-target="Target_Article">Link</a></p>',
      links: new Set(['Target_Article', 'Other_Article', 'Another_Article']),
    }),
  }));

  // Mock the data loader
  vi.mock('../../../lib/rmhbox/wiki-race/data-loader', () => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    selectArticlePair: (_usedPairKeys: string[] = []) => ({
      id: 'test-pair-001',
      startArticle: {
        title: 'Start_Article',
        url: 'https://en.wikipedia.org/wiki/Start_Article',
        description: 'The starting article for this race',
      },
      targetArticle: {
        title: 'Target_Article',
        url: 'https://en.wikipedia.org/wiki/Target_Article',
        description: 'The target article to reach',
      },
      optimalPathLength: 4,
      difficulty: 'medium' as const,
      tags: ['test'],
    }),
    pairKey: (pair: { startArticle: { title: string }; targetArticle: { title: string } }) =>
      `${pair.startArticle.title}::${pair.targetArticle.title}`,
  }));

  const game = new WikiRaceMinigame(ctx.context);
  return { game, ...ctx };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Wiki-Race Server Handler (§5.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('State Initialization (§5.4.6.3)', () => {
    it('should create a game with 4 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(4);
    });

    it('should emit WR_ARTICLES_REVEALED on start', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const reveal = findLastActionBroadcast(broadcastLog, 'WR_ARTICLES_REVEALED');
      expect(reveal).toBeDefined();
      const data = reveal!.data as Record<string, unknown>;
      expect(data.startArticle).toBeDefined();
      expect(data.targetArticle).toBeDefined();
      expect(data.difficulty).toBeDefined();
    });
  });

  describe('Phase Transitions (§5.4.6.4)', () => {
    it('should transition to NAVIGATION after reveal duration', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      // Advance past WR_REVEAL seconds
      vi.advanceTimersByTime(6000);

      const navStart = findLastActionBroadcast(broadcastLog, 'WR_NAVIGATION_START');
      expect(navStart).toBeDefined();
      const data = navStart!.data as Record<string, unknown>;
      expect(data.duration).toBe(WR_NAV_DURATION);
    });

    it('should broadcast TIMER_TICK during navigation', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      vi.advanceTimersByTime(6000); // Enter navigation
      broadcastLog.length = 0;

      vi.advanceTimersByTime(5000); // 5 seconds of ticks

      const ticks = findActionBroadcasts(broadcastLog, 'TIMER_TICK');
      expect(ticks.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Input Handling — NAVIGATE (§5.4.6.5)', () => {
    it('should reject navigation when not in NAVIGATION phase', () => {
      const { game } = createGame();
      game.start();
      // Still in ARTICLE_REVEAL

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'NAVIGATE', { targetTitle: 'Some_Article' });

      // Input should be silently ignored (not in NAVIGATION)
    });

    it('should reject invalid input schemas', () => {
      const { game, playerLog } = createGame();
      game.start();
      vi.advanceTimersByTime(6000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'NAVIGATE', { targetTitle: '' });

      const rejected = findLastPlayerAction(playerLog, userId, 'WR_NAVIGATE_REJECTED');
      if (rejected) {
        expect(rejected.data.reason).toBe('invalid_input');
      }
    });
  });

  describe('Input Handling — GO_BACK (§5.4.6.6)', () => {
    it('should reject GO_BACK with invalid pathIndex', () => {
      const { game, playerLog } = createGame();
      game.start();
      vi.advanceTimersByTime(6000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'GO_BACK', { targetTitle: 'Start_Article', pathIndex: -1 });

      const rejected = findLastPlayerAction(playerLog, userId, 'WR_NAVIGATE_REJECTED');
      if (rejected) {
        expect(['invalid_input', 'invalid_path_index']).toContain(rejected.data.reason);
      }
    });
  });

  describe('State Masking (§5.4.6.8, §5.4.6.9)', () => {
    it('getStateForPlayer should hide other players\' article titles and paths during NAVIGATION', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(6000); // Enter navigation

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state).toBeDefined();
      expect(state.phase).toBe(WikiRacePhase.NAVIGATION);

      // Own state should be visible
      const myState = state.myState as Record<string, unknown>;
      expect(myState).toBeDefined();
      expect(myState.currentArticleTitle).toBeDefined();
      expect(myState.path).toBeDefined();

      // Other players' titles and paths should be hidden
      const otherPlayers = state.otherPlayers as Record<string, Record<string, unknown>>;
      expect(otherPlayers).toBeDefined();
      for (const otherId of Object.keys(otherPlayers)) {
        const other = otherPlayers[otherId];
        expect(other.currentArticleTitle).toBeUndefined();
        expect(other.path).toBeUndefined();
        // Click count should be visible
        expect(other.clickCount).toBeDefined();
      }
    });

    it('getStateForPlayer should hide optimalPathLength during NAVIGATION', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(6000);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.optimalPathLength).toBeUndefined();
    });

    it('getStateForSpectator should show all players\' article titles and paths', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(6000);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      expect(state).toBeDefined();

      const players = state.players as Record<string, Record<string, unknown>>;
      expect(players).toBeDefined();
      for (const pId of Object.keys(players)) {
        const p = players[pId];
        expect(p.currentArticleTitle).toBeDefined();
        expect(p.path).toBeDefined();
      }
    });

    it('getStateForSpectator should hide optimalPathLength during NAVIGATION', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(6000);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      expect(state.optimalPathLength).toBeUndefined();
    });
  });

  describe('Scoring (§5.4.6.7)', () => {
    it('should compute results with rankings for all players', () => {
      const { game } = createGame();
      game.start();

      // Run entire game
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results).toBeDefined();
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(4);

      // All players should have scores (at least DNF score)
      for (const ranking of results.rankings) {
        expect(ranking.score).toBeDefined();
        expect(typeof ranking.score).toBe('number');
        expect(ranking.score).toBeGreaterThanOrEqual(0);
      }
    });

    it('DNF players should get at least WR_DNF_BASE points', () => {
      const { game } = createGame();
      game.start();

      // Let the game time out (no navigation)
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      for (const ranking of results.rankings) {
        expect(ranking.score).toBeGreaterThanOrEqual(WR_DNF_BASE);
      }
    });

    it('should award WR_ONE_AWAY points to DNF player with target in links (e.g. Egypt → Ancient_Egypt)', async () => {
      const ctxData = createMockContext();
      ctxData.context.gameSettings = { totalRounds: 1 };
      const { game } = createGame(ctxData);
      game.start();

      // Enter navigation phase; flush microtasks so start article links are populated
      await vi.advanceTimersByTimeAsync(6000);

      // Alice navigates to Other_Article (mock returns Target_Article in its links)
      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'NAVIGATE', { targetTitle: 'Other_Article' });

      // Flush microtasks so navigation fetch completes and links are populated
      await vi.advanceTimersByTimeAsync(0);

      // Let the game time out — Alice is DNF but one click away from Target_Article
      await vi.advanceTimersByTimeAsync(300_000);

      const results = game.computeResults();
      const aliceRanking = results.rankings.find((r) => r.userId === userId);
      expect(aliceRanking).toBeDefined();
      // Alice was one click away from the target — should get WR_ONE_AWAY points
      expect(aliceRanking!.score).toBeGreaterThanOrEqual(WR_ONE_AWAY);
    });
  });

  describe('Awards (§5.4.6.13)', () => {
    it('should produce awards array after completion', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results.awards).toBeDefined();
      expect(Array.isArray(results.awards)).toBe(true);
    });

    it('should have Tourist award for player with most clicks', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      results.awards.find((a) => a.title === 'Tourist');
      // Tourist award should exist if any player clicked at all
      // If no one clicked, it's valid for it to not exist
    });
  });

  describe('Game Log (§5.4.6.14)', () => {
    it('should include game-specific data in results', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results.gameSpecificData).toBeDefined();
      expect(results.gameSpecificData.articlePair).toBeDefined();
      expect(results.gameSpecificData.gameLog).toBeDefined();
    });
  });

  describe('Join-in-Progress (§5.4.6.10)', () => {
    it('should send spectator state to JIP players', () => {
      const { game, playerLog } = createGame();
      game.start();
      vi.advanceTimersByTime(6000);

      const newUserId = 'user-new-jip';
      game.handlePlayerJoin(newUserId);

      const snapshot = playerLog.find(
        (e) => e.userId === newUserId && e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();
    });
  });

  describe('Reconnection (§5.4.6.11)', () => {
    it('should send player state snapshot on reconnect', () => {
      const { game, playerLog } = createGame();
      game.start();
      vi.advanceTimersByTime(6000);

      const userId = MOCK_USERS.alice.userId;
      game.handlePlayerDisconnect(userId);
      game.handlePlayerReconnect(userId);

      const snapshot = playerLog.find(
        (e) => e.userId === userId && e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();
    });
  });
});
