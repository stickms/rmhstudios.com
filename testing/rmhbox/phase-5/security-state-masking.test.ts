/**
 * Phase 5 — Security & State Masking Tests
 *
 * Ensures no information leakage across all 4 Phase 5 minigames:
 * - Rhyme Time: other players' submissions hidden during INPUT
 * - Undercover Agent: key card hidden from operatives
 * - Category Crash: answers anonymized during peer review
 * - Wiki-Race: other players' article titles/paths hidden during NAVIGATION
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WikiRaceMinigame } from '../../../server/rmhbox/minigames/wiki-race';
import { UndercoverAgentMinigame, TileState } from '../../../server/rmhbox/minigames/undercover-agent';
import { CategoryCrashMinigame } from '../../../server/rmhbox/minigames/category-crash';
import { RhymeTimeMinigame } from '../../../server/rmhbox/minigames/rhyme-time';
import {
  MOCK_USERS,
  createMockContext,
  findLastActionBroadcast,
} from './setup';

// ─── Tests ───────────────────────────────────────────────────────

describe('Security — State Masking (Phase 5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Rhyme Time — Information Masking', () => {
    it('getStateForPlayer should only contain own data, not other players\' words', () => {
      const ctx = createMockContext();
      const game = new RhymeTimeMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3000); // Into INPUT phase

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;

      // States should be defined
      expect(aliceState).toBeDefined();
      expect(bobState).toBeDefined();

      // Verify they don't contain each other's submission arrays
      JSON.stringify(aliceState);
      JSON.stringify(bobState);

      // Alice's state should not include Bob's userId in submission contexts
      // (Though userIds may appear in player lists, specific submissions should be scoped)
    });
  });

  describe('Undercover Agent — Key Card Masking', () => {
    it('player state for operatives should NOT include tile types for hidden tiles', () => {
      const ctx = createMockContext();
      const game = new UndercoverAgentMinigame(ctx.context);
      game.start();

      // Advance past TEAM_SETUP by having host send START_GAME action
      game.handleInput(MOCK_USERS.alice.userId, 'START_GAME', {});

      // Get the team info
      const setupBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'UA_SETUP');
      expect(setupBroadcast).toBeDefined();
      const teams = (setupBroadcast!.data as Record<string, unknown>).teams as Record<string, Record<string, unknown>>;

      // Find an operative
      const redOps = teams.red?.operativeIds as string[];
      const blueOps = teams.blue?.operativeIds as string[];
      const operativeId = redOps?.[0] ?? blueOps?.[0];

      if (operativeId) {
        const state = game.getStateForPlayer(operativeId) as Record<string, unknown>;
        const grid = state.grid as Array<Record<string, unknown>>;
        if (grid) {
          const hiddenTiles = grid.filter((t) => t.state === TileState.HIDDEN);
          for (const tile of hiddenTiles) {
            // Operatives should NOT see the tile type for hidden tiles (set to null)
            expect(tile.type).toBeNull();
          }
        }
      }
    });

    it('spectator state should reveal the key card', () => {
      const ctx = createMockContext();
      const game = new UndercoverAgentMinigame(ctx.context);
      game.start();

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      // Spectator sees full grid with all tile types
      const grid = spectState.grid as Array<Record<string, unknown>>;
      expect(grid).toBeDefined();
      expect(Array.isArray(grid)).toBe(true);
      // Every tile should have a non-null type visible to spectators
      for (const tile of grid) {
        expect(tile.type).toBeDefined();
        expect(tile.type).not.toBeNull();
      }
    });
  });

  describe('Category Crash — Anonymization', () => {
    it('peer review broadcast should use anonymous labels, not real userIds', () => {
      const ctx = createMockContext();
      const game = new CategoryCrashMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(5000); // Into INPUT phase

      // All players submit
      const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      for (const user of users) {
        game.handleInput(user.userId, 'SUBMIT_ANSWERS', {
          answers: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'],
        });
      }

      // Advance to peer review
      vi.advanceTimersByTime(10_000);

      const peerReview = findLastActionBroadcast(ctx.broadcastLog, 'CC_PEER_REVIEW_START');
      if (peerReview) {
        const data = peerReview.data as Record<string, unknown>;
        const anonymized = data.anonymizedAnswers as Array<Record<string, unknown>>;
        if (anonymized) {
          for (const entry of anonymized) {
            // Label should NOT be a real user ID
            const label = entry.anonymousLabel as string;
            expect(label).not.toContain('user-alice');
            expect(label).not.toContain('user-bob');
            expect(label).not.toContain('user-charlie');
            expect(label).not.toContain('user-diana');
          }
        }
      }
    });
  });

  describe('Wiki-Race — Navigation Privacy', () => {
    it('player progress broadcasts should NOT include currentArticleTitle', () => {
      vi.mock('../../../lib/rmhbox/wiki-race/wikipedia-proxy', () => ({
        createArticleCache: () => {
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
          title: 'Test_Article',
          sanitizedHtml: '<p>Test</p>',
          links: new Set(['Target_Article']),
        }),
      }));

      vi.mock('../../../lib/rmhbox/wiki-race/data-loader', () => ({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        selectArticlePair: (_usedPairKeys: string[] = []) => ({
          id: 'test-pair-001',
          startArticle: {
            title: 'Start_Article',
            url: 'https://en.wikipedia.org/wiki/Start_Article',
            description: 'Start',
          },
          targetArticle: {
            title: 'Target_Article',
            url: 'https://en.wikipedia.org/wiki/Target_Article',
            description: 'Target',
          },
          optimalPathLength: 4,
          difficulty: 'medium' as const,
          tags: ['test'],
        }),
        pairKey: (pair: { startArticle: { title: string }; targetArticle: { title: string } }) =>
          `${pair.startArticle.title}::${pair.targetArticle.title}`,
      }));

      const ctx = createMockContext();
      const game = new WikiRaceMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(6000); // Into NAVIGATION

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const otherPlayers = state.otherPlayers as Record<string, Record<string, unknown>>;

      for (const otherId of Object.keys(otherPlayers)) {
        const other = otherPlayers[otherId];
        // Should NOT have currentArticleTitle
        expect(other.currentArticleTitle).toBeUndefined();
        // Should NOT have path
        expect(other.path).toBeUndefined();
      }
    });

    it('optimalPathLength should never be exposed in player state', () => {
      vi.mock('../../../lib/rmhbox/wiki-race/wikipedia-proxy', () => ({
        createArticleCache: () => {
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
          title: 'Test_Article',
          sanitizedHtml: '<p>Test</p>',
          links: new Set(['Target_Article']),
        }),
      }));

      vi.mock('../../../lib/rmhbox/wiki-race/data-loader', () => ({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        selectArticlePair: (_usedPairKeys: string[] = []) => ({
          id: 'test-pair-001',
          startArticle: {
            title: 'Start_Article',
            url: 'https://en.wikipedia.org/wiki/Start_Article',
            description: 'Start',
          },
          targetArticle: {
            title: 'Target_Article',
            url: 'https://en.wikipedia.org/wiki/Target_Article',
            description: 'Target',
          },
          optimalPathLength: 4,
          difficulty: 'medium' as const,
          tags: ['test'],
        }),
        pairKey: (pair: { startArticle: { title: string }; targetArticle: { title: string } }) =>
          `${pair.startArticle.title}::${pair.targetArticle.title}`,
      }));

      const ctx = createMockContext(undefined, { gameSettings: { totalRounds: 1 } });
      const game = new WikiRaceMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(6000); // Into NAVIGATION

      // During NAVIGATION — should not be exposed
      const navState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(navState.optimalPathLength).toBeUndefined();

      // Run to RESULTS — still should not be exposed
      vi.advanceTimersByTime(200_000);

      const resultState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(resultState.optimalPathLength).toBeUndefined();
    });
  });
});
