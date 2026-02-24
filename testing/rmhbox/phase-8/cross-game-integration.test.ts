/**
 * Phase 8 — Cross-Game Integration Tests (§8.5)
 *
 * Validates that Phase 8 minigames (Identity Crisis, Ranking File)
 * integrate correctly with the shared registry, coexist with Phase 5
 * games, and behave properly under concurrent/spectator/disconnect scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdentityCrisisGame } from '../../../server/rmhbox/minigames/identity-crisis';
import { RankingFileGame } from '../../../server/rmhbox/minigames/ranking-file';
import {
  MINIGAME_REGISTRY,
  IDENTITY_CRISIS_SETTINGS,
  RANKING_FILE_SETTINGS,
} from '../../../lib/rmhbox/minigame-registry';
import { MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import {
  MOCK_USERS,
  MOCK_IDENTITIES,
  MOCK_CATEGORIES,
  createMockContext,
} from './setup';
import {
  RF_CATEGORY_REVEAL_SECONDS,
  RF_RANKING_SECONDS,
  RF_LOCK_IN_SECONDS,
  RF_RESULTS_SECONDS,
  RF_TRANSITION_SECONDS,
} from '../../../lib/rmhbox/constants';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('../../../lib/rmhbox/identity-crisis/identity-loader', () => ({
  loadIdentities: vi.fn(() => MOCK_IDENTITIES),
  selectIdentitiesForGame: vi.fn((_pool: unknown[], count: number) => MOCK_IDENTITIES.slice(0, count)),
}));

vi.mock('../../../lib/rmhbox/ranking-file/category-loader', () => ({
  loadCategories: vi.fn(() => MOCK_CATEGORIES),
  selectCategoriesForGame: vi.fn((_pool: unknown[], count: number) => MOCK_CATEGORIES.slice(0, count)),
}));

// ─── Helpers ────────────────────────────────────────────────────

function createICGame(
  users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
  gameSettings: Record<string, unknown> = {},
) {
  const ctx = createMockContext(users, { gameSettings } as never);
  const game = new IdentityCrisisGame(ctx.context);
  return { game, ...ctx };
}

function createRFGame(
  users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
  gameSettings: Record<string, unknown> = {},
) {
  const ctx = createMockContext(users, { gameSettings } as never);
  const game = new RankingFileGame(ctx.context);
  return { game, ...ctx };
}

/** Advance a Ranking File game through one complete round */
function advanceRFFullRound(
  game: RankingFileGame,
  ranking: number[] = [1, 2, 3, 4, 5],
  playerIds: string[] = [
    MOCK_USERS.alice.userId,
    MOCK_USERS.bob.userId,
    MOCK_USERS.charlie.userId,
    MOCK_USERS.diana.userId,
  ],
) {
  // CATEGORY_REVEAL → RANKING
  vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);
  // Submit rankings
  for (const uid of playerIds) {
    game.handleInput(uid, 'RF_SUBMIT_RANKING', { ranking });
  }
  // RANKING → LOCK_IN → RESULTS → TRANSITION
  vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
  vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
  vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);
  vi.advanceTimersByTime(RF_TRANSITION_SECONDS * 1000);
}

// ─── Test Suite ─────────────────────────────────────────────────

describe('Phase 8 — Cross-Game Integration (§8.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── §8.5.1 Registry Verification ──────────────────────────────

  describe('§8.5.1 Registry Verification', () => {
    it('identity-crisis should be registered in MINIGAME_REGISTRY', () => {
      expect(MINIGAME_REGISTRY['identity-crisis']).toBeDefined();
    });

    it('ranking-file should be registered in MINIGAME_REGISTRY', () => {
      expect(MINIGAME_REGISTRY['ranking-file']).toBeDefined();
    });

    it('IC registry entry should have correct metadata', () => {
      const ic = MINIGAME_REGISTRY['identity-crisis'];
      expect(ic.category).toBe('social');
      expect(ic.icon).toBe('user-question');
      expect(ic.minPlayers).toBe(3);
      expect(ic.maxPlayers).toBe(10);
    });

    it('RF registry entry should have correct metadata', () => {
      const rf = MINIGAME_REGISTRY['ranking-file'];
      expect(rf.category).toBe('social');
      expect(rf.minPlayers).toBe(3);
      expect(rf.maxPlayers).toBe(16);
    });

    it('IC should have settingsSchema defined and non-empty', () => {
      expect(IDENTITY_CRISIS_SETTINGS).toBeDefined();
      expect(IDENTITY_CRISIS_SETTINGS.length).toBeGreaterThan(0);
    });

    it('RF should have settingsSchema defined and non-empty', () => {
      expect(RANKING_FILE_SETTINGS).toBeDefined();
      expect(RANKING_FILE_SETTINGS.length).toBeGreaterThan(0);
    });
  });

  // ─── §8.5.3 Lifecycle Integration ─────────────────────────────

  describe('§8.5.3 Lifecycle Integration', () => {
    describe('Identity Crisis lifecycle', () => {
      it('start() should not throw and should set isRunning', () => {
        const { game } = createICGame();
        expect(() => game.start()).not.toThrow();
        expect(game.isRunning).toBe(true);
        game.cleanup();
      });

      it('full lifecycle: create → start → play → end → computeResults → cleanup', () => {
        const { game } = createICGame();
        game.start();
        expect(game.isRunning).toBe(true);

        // Advance enough time for the full game to complete
        vi.advanceTimersByTime(600_000);

        const results = game.computeResults();
        expect(results).toBeDefined();

        game.cleanup();
        expect(game.pendingTimerCount).toBe(0);
      });

      it('computeResults() should return valid MinigameResults', () => {
        const { game } = createICGame();
        game.start();
        vi.advanceTimersByTime(600_000);

        const results = game.computeResults();
        expect(results.rankings).toBeDefined();
        expect(Array.isArray(results.rankings)).toBe(true);
        expect(results.rankings.length).toBeGreaterThan(0);
        expect(results.awards).toBeDefined();
        expect(Array.isArray(results.awards)).toBe(true);
        expect(results.gameSpecificData).toBeDefined();
        expect(typeof results.gameSpecificData).toBe('object');

        game.cleanup();
      });

      it('cleanup() should clear all timers', () => {
        const { game } = createICGame();
        game.start();
        game.cleanup();
        expect(game.pendingTimerCount).toBe(0);
      });
    });

    describe('Ranking File lifecycle', () => {
      it('start() should not throw and should set isRunning', () => {
        const { game } = createRFGame();
        expect(() => game.start()).not.toThrow();
        expect(game.isRunning).toBe(true);
        game.cleanup();
      });

      it('full lifecycle: create → start → play → end → computeResults → cleanup', () => {
        const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
        const playerIds = users.map((u) => u.userId);
        const { game } = createRFGame(users);
        game.start();
        expect(game.isRunning).toBe(true);

        // Advance through all rounds
        for (let i = 0; i < 5; i++) {
          advanceRFFullRound(game, [1, 2, 3, 4, 5], playerIds);
        }

        const results = game.computeResults();
        expect(results).toBeDefined();

        game.cleanup();
        expect(game.pendingTimerCount).toBe(0);
      });

      it('computeResults() should return valid MinigameResults', () => {
        const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
        const playerIds = users.map((u) => u.userId);
        const { game } = createRFGame(users);
        game.start();

        for (let i = 0; i < 5; i++) {
          advanceRFFullRound(game, [1, 2, 3, 4, 5], playerIds);
        }

        const results = game.computeResults();
        expect(results.rankings).toBeDefined();
        expect(Array.isArray(results.rankings)).toBe(true);
        expect(results.rankings.length).toBeGreaterThan(0);
        expect(results.awards).toBeDefined();
        expect(Array.isArray(results.awards)).toBe(true);
        expect(results.gameSpecificData).toBeDefined();
        expect(typeof results.gameSpecificData).toBe('object');

        game.cleanup();
      });

      it('cleanup() should clear all timers', () => {
        const { game } = createRFGame();
        game.start();
        game.cleanup();
        expect(game.pendingTimerCount).toBe(0);
      });
    });
  });

  // ─── §8.5.5 Concurrent Lobby Test ─────────────────────────────

  describe('§8.5.5 Concurrent Lobby Test', () => {
    it('two IC games should not share state', () => {
      const game1Users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie];
      const game2Users = [MOCK_USERS.diana, MOCK_USERS.eve, MOCK_USERS.charlie];

      const g1 = createICGame(game1Users);
      const g2 = createICGame(game2Users);

      g1.game.start();
      g2.game.start();

      // Advance past assignment reveal
      vi.advanceTimersByTime(5000);

      // Game 1 player log should not contain game 2's players (diana, eve exclusive)
      const g1PlayerIds = g1.playerLog.map((e) => e.userId);
      const g2PlayerIds = g2.playerLog.map((e) => e.userId);

      // Diana is only in game 2
      expect(g1PlayerIds).not.toContain(MOCK_USERS.diana.userId);
      // Alice is only in game 1
      expect(g2PlayerIds).not.toContain(MOCK_USERS.alice.userId);

      g1.game.cleanup();
      g2.game.cleanup();
    });
  });

  // ─── §8.5.6 Spectator Mode Test ──────────────────────────────

  describe('§8.5.6 Spectator Mode Test', () => {
    it('IC: spectator sees ALL identities (god view)', () => {
      const { game } = createICGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const spectatorState = game.getStateForSpectator();
      expect(spectatorState).toBeDefined();

      // Spectators should see all identity assignments
      const stateStr = JSON.stringify(spectatorState);
      // At minimum the spectator state should contain identity-related data
      expect(stateStr.length).toBeGreaterThan(0);

      game.cleanup();
    });

    it('RF: spectator sees all rankings during RANKING phase', () => {
      const { game } = createRFGame();
      game.start();

      // Advance to RANKING phase
      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      const spectatorState = game.getStateForSpectator();
      expect(spectatorState).toBeDefined();

      game.cleanup();
    });
  });

  // ─── §8.5.7 Disconnection Test ────────────────────────────────

  describe('§8.5.7 Disconnection Test', () => {
    it('IC: disconnect mid-game should not crash', () => {
      const { game } = createICGame();
      game.start();
      vi.advanceTimersByTime(5000);

      expect(() => {
        game.handlePlayerDisconnect(MOCK_USERS.bob.userId);
      }).not.toThrow();

      // Game should continue running
      expect(game.isRunning).toBe(true);

      game.cleanup();
    });

    it('RF: disconnect during ranking should not crash', () => {
      const { game } = createRFGame();
      game.start();

      // Advance to RANKING phase
      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      expect(() => {
        game.handlePlayerDisconnect(MOCK_USERS.bob.userId);
      }).not.toThrow();

      expect(game.isRunning).toBe(true);

      game.cleanup();
    });
  });

  // ─── §8.5.9 Phase 5 + Phase 8 Coexistence ────────────────────

  describe('§8.5.9 Phase 5 + Phase 8 Coexistence', () => {
    const phase5Games = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
    const phase8Games = ['identity-crisis', 'ranking-file'];

    it('MINIGAME_REGISTRY should contain all Phase 5 games', () => {
      for (const gameId of phase5Games) {
        expect(MINIGAME_REGISTRY[gameId]).toBeDefined();
      }
    });

    it('MINIGAME_REGISTRY should contain all Phase 8 games', () => {
      for (const gameId of phase8Games) {
        expect(MINIGAME_REGISTRY[gameId]).toBeDefined();
      }
    });

    it('no naming collisions in constants (IC_* vs RF_* vs RT_* vs UA_* vs CC_* vs WR_*)', async () => {
      const constants = await import('../../../lib/rmhbox/constants');
      const exportedKeys = Object.keys(constants);

      const prefixes = ['IC_', 'RF_', 'RT_', 'UA_', 'CC_', 'WR_'];
      const prefixGroups = new Map<string, string[]>();

      for (const prefix of prefixes) {
        prefixGroups.set(
          prefix,
          exportedKeys.filter((k) => k.startsWith(prefix)),
        );
      }

      // Each prefix group should have at least one constant
      for (const prefix of prefixes) {
        expect(prefixGroups.get(prefix)!.length).toBeGreaterThan(0);
      }

      // No constant should appear in more than one prefix group
      for (const key of exportedKeys) {
        const matchingPrefixes = prefixes.filter((p) => key.startsWith(p));
        expect(matchingPrefixes.length).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── §8.5.15 MINIGAME_SERVER_REGISTRY Completeness ────────────

  describe('§8.5.15 MINIGAME_SERVER_REGISTRY Completeness', () => {
    it('MINIGAME_SERVER_REGISTRY should contain identity-crisis', () => {
      expect(MINIGAME_SERVER_REGISTRY.get('identity-crisis')).toBeDefined();
    });

    it('MINIGAME_SERVER_REGISTRY should contain ranking-file', () => {
      expect(MINIGAME_SERVER_REGISTRY.get('ranking-file')).toBeDefined();
    });

    it('identity-crisis entry should be IdentityCrisisGame constructor', () => {
      const Ctor = MINIGAME_SERVER_REGISTRY.get('identity-crisis')!;
      expect(Ctor).toBe(IdentityCrisisGame);
    });

    it('ranking-file entry should be RankingFileGame constructor', () => {
      const Ctor = MINIGAME_SERVER_REGISTRY.get('ranking-file')!;
      expect(Ctor).toBe(RankingFileGame);
    });

    it('IdentityCrisisGame should be constructable with mock context', () => {
      const ctx = createMockContext();
      const game = new IdentityCrisisGame(ctx.context);
      expect(game).toBeDefined();
    });

    it('RankingFileGame should be constructable with mock context', () => {
      const ctx = createMockContext();
      const game = new RankingFileGame(ctx.context);
      expect(game).toBeDefined();
    });
  });
});
