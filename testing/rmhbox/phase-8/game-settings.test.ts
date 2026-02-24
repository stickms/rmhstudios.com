/**
 * RMHbox Phase 8 — Game Settings Integration Tests
 *
 * Tests game settings schema completeness, Identity Crisis settings integration,
 * Ranking File settings integration, and getSetting() fallback behavior.
 *
 * Reference: docs/rmhbox/implementation/phase-8.md §8.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDefaultSettings,
  validateGameSettings,
} from '../../../lib/rmhbox/game-settings';
import {
  IDENTITY_CRISIS_SETTINGS,
  RANKING_FILE_SETTINGS,
  MINIGAME_REGISTRY,
} from '../../../lib/rmhbox/minigame-registry';
import {
  IC_QUESTIONS_PER_PLAYER,
  IC_ASK_SECONDS,
  IC_VOTE_SECONDS,
  IC_FINAL_GUESS_SECONDS,
  RF_TOTAL_ROUNDS,
  RF_RANKING_SECONDS,
  RF_ITEMS_PER_CATEGORY,
  RF_OUTLIER_BONUS,
  RF_CATEGORY_REVEAL_SECONDS,
  RF_LOCK_IN_SECONDS,
  RF_RESULTS_SECONDS,
  RF_TRANSITION_SECONDS,
} from '../../../lib/rmhbox/constants';
import { IdentityCrisisGame } from '../../../server/rmhbox/minigames/identity-crisis';
import { RankingFileGame } from '../../../server/rmhbox/minigames/ranking-file';
import {
  MOCK_USERS,
  MOCK_IDENTITIES,
  MOCK_CATEGORIES,
  createMockContext,
  findActionBroadcasts,
  findPlayerActions,
} from './setup';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('../../../lib/rmhbox/identity-crisis/identity-loader', () => ({
  loadIdentities: vi.fn(() => MOCK_IDENTITIES),
  selectIdentitiesForGame: vi.fn((_pool: unknown[], count: number) => MOCK_IDENTITIES.slice(0, count)),
}));

vi.mock('../../../lib/rmhbox/ranking-file/category-loader', () => ({
  loadCategories: vi.fn(() => MOCK_CATEGORIES),
  selectCategoriesForGame: vi.fn((_pool: unknown[], count: number) => MOCK_CATEGORIES.slice(0, count)),
}));

// ─── IC Helper ──────────────────────────────────────────────────

function createICGame(gameSettings: Record<string, boolean | number | string> = {}) {
  const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana], { gameSettings });
  const game = new IdentityCrisisGame(ctx.context);
  return { game, ...ctx };
}

// ─── RF Helper ──────────────────────────────────────────────────

function createRFGame(gameSettings: Record<string, boolean | number | string> = {}) {
  const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana], { gameSettings });
  const game = new RankingFileGame(ctx.context);
  return { game, ...ctx };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Game Settings (§8.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── §8.6.1 Schema Completeness ─────────────────────────────

  describe('§8.6.1 Schema Completeness', () => {
    it('IC settings should have 5 entries', () => {
      expect(IDENTITY_CRISIS_SETTINGS).toHaveLength(5);
      const keys = IDENTITY_CRISIS_SETTINGS.map((s) => s.key);
      expect(keys).toContain('questionsPerPlayer');
      expect(keys).toContain('askDuration');
      expect(keys).toContain('voteDuration');
      expect(keys).toContain('finalGuessDuration');
      expect(keys).toContain('enableEarlyGuess');
    });

    it('RF settings should have 4 entries', () => {
      expect(RANKING_FILE_SETTINGS).toHaveLength(4);
      const keys = RANKING_FILE_SETTINGS.map((s) => s.key);
      expect(keys).toContain('totalRounds');
      expect(keys).toContain('rankingDuration');
      expect(keys).toContain('itemsPerCategory');
      expect(keys).toContain('enableOutlierBonus');
    });

    it('every setting should have key, type, label, default', () => {
      const allSettings = [...IDENTITY_CRISIS_SETTINGS, ...RANKING_FILE_SETTINGS];
      for (const setting of allSettings) {
        expect(setting.key).toBeDefined();
        expect(setting.type).toBeDefined();
        expect(setting.label).toBeDefined();
        expect(setting.default).toBeDefined();
      }
    });

    it('integer settings should have min, max, step', () => {
      const allSettings = [...IDENTITY_CRISIS_SETTINGS, ...RANKING_FILE_SETTINGS];
      const intSettings = allSettings.filter((s) => s.type === 'integer');
      expect(intSettings.length).toBeGreaterThan(0);
      for (const setting of intSettings) {
        expect(setting.min).toBeDefined();
        expect(setting.max).toBeDefined();
        expect(setting.step).toBeDefined();
      }
    });

    it('boolean settings should NOT have min/max/step', () => {
      const allSettings = [...IDENTITY_CRISIS_SETTINGS, ...RANKING_FILE_SETTINGS];
      const boolSettings = allSettings.filter((s) => s.type === 'boolean');
      expect(boolSettings.length).toBeGreaterThan(0);
      for (const setting of boolSettings) {
        expect(setting.min).toBeUndefined();
        expect(setting.max).toBeUndefined();
        expect(setting.step).toBeUndefined();
      }
    });

    it('default values should fall within constraints', () => {
      const allSettings = [...IDENTITY_CRISIS_SETTINGS, ...RANKING_FILE_SETTINGS];
      for (const setting of allSettings) {
        if (setting.type === 'integer' || setting.type === 'float') {
          const val = setting.default as number;
          expect(val).toBeGreaterThanOrEqual(setting.min!);
          expect(val).toBeLessThanOrEqual(setting.max!);
        }
      }
    });

    it('registry entries should have settingsSchema attached', () => {
      const icEntry = MINIGAME_REGISTRY['identity-crisis'];
      const rfEntry = MINIGAME_REGISTRY['ranking-file'];
      expect(icEntry.settingsSchema).toBe(IDENTITY_CRISIS_SETTINGS);
      expect(rfEntry.settingsSchema).toBe(RANKING_FILE_SETTINGS);
    });
  });

  // ─── §8.6.2 Identity Crisis Settings ─────────────────────────

  describe('§8.6.2 Identity Crisis Settings', () => {
    it('default questionsPerPlayer should use IC_QUESTIONS_PER_PLAYER', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { game, broadcastLog: _broadcastLog, playerLog } = createICGame();
      game.start();

      // Advance past ASSIGNMENT_REVEAL (5s)
      vi.advanceTimersByTime(5000);

      // Should be in ASK phase; find asker
      const selfStarts = playerLog.filter((e) => {
        const d = e.data as Record<string, unknown>;
        return d.type === 'IC_TURN_START_SELF';
      });
      expect(selfStarts.length).toBeGreaterThan(0);

      // The totalQuestions in IC_TURN_START_SELF payload = questionsPerPlayer * playerCount
      const lastSelf = selfStarts[selfStarts.length - 1];
      const payload = (lastSelf.data as Record<string, unknown>).payload as Record<string, unknown>;
      expect(payload.totalQuestions).toBe(IC_QUESTIONS_PER_PLAYER * 4);

      game.cleanup();
    });

    it('enableEarlyGuess = false should reject early guesses', () => {
      const { game, playerLog } = createICGame({ enableEarlyGuess: false });
      game.start();

      // Advance to ASK phase
      vi.advanceTimersByTime(5000);

      // Find asker
      const selfStarts = playerLog.filter((e) => {
        const d = e.data as Record<string, unknown>;
        return d.type === 'IC_TURN_START_SELF';
      });
      const askerId = selfStarts[selfStarts.length - 1].userId;

      // Asker submits question → transitions to VOTE
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I a scientist?' });

      // Find a non-asker to attempt early guess
      const allIds = [MOCK_USERS.alice.userId, MOCK_USERS.bob.userId, MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId];
      const nonAsker = allIds.find((id) => id !== askerId)!;

      // Try early guess
      game.handleInput(nonAsker, 'IC_EARLY_GUESS', { guess: 'Albert Einstein' });

      // Should be rejected — no IC_EARLY_GUESS_RESULT sent
      const guessResults = findPlayerActions(playerLog, nonAsker, 'IC_EARLY_GUESS_RESULT');
      expect(guessResults).toHaveLength(0);

      game.cleanup();
    });

    it('enableEarlyGuess = true (default) should allow early guesses', () => {
      const { game, playerLog } = createICGame();
      game.start();

      // Advance to ASK phase
      vi.advanceTimersByTime(5000);

      // Find asker
      const selfStarts = playerLog.filter((e) => {
        const d = e.data as Record<string, unknown>;
        return d.type === 'IC_TURN_START_SELF';
      });
      const askerId = selfStarts[selfStarts.length - 1].userId;

      // Asker submits question → transitions to VOTE
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I a scientist?' });

      // The subject (asker) tries to guess their own identity
      game.handleInput(askerId, 'IC_EARLY_GUESS', { guess: 'Albert Einstein' });

      // Should get IC_EARLY_GUESS_RESULT
      const guessResults = findPlayerActions(playerLog, askerId, 'IC_EARLY_GUESS_RESULT');
      expect(guessResults.length).toBeGreaterThanOrEqual(1);

      game.cleanup();
    });
  });

  // ─── §8.6.3 Ranking File Settings ────────────────────────────

  describe('§8.6.3 Ranking File Settings', () => {
    it('default totalRounds should use RF_TOTAL_ROUNDS', () => {
      const { game, broadcastLog } = createRFGame();
      game.start();

      // First RF_CATEGORY_REVEAL should have totalRounds = RF_TOTAL_ROUNDS
      const reveals = findActionBroadcasts(broadcastLog, 'RF_CATEGORY_REVEAL');
      expect(reveals.length).toBeGreaterThan(0);
      const payload = reveals[0].data.payload as Record<string, unknown>;
      expect(payload.totalRounds).toBe(RF_TOTAL_ROUNDS);

      game.cleanup();
    });

    it('custom totalRounds = 2 should play exactly 2 rounds', () => {
      const { game, broadcastLog } = createRFGame({ totalRounds: 2 });
      game.start();

      const roundMs =
        RF_CATEGORY_REVEAL_SECONDS * 1000 +
        RF_RANKING_SECONDS * 1000 +
        RF_LOCK_IN_SECONDS * 1000 +
        RF_RESULTS_SECONDS * 1000 +
        RF_TRANSITION_SECONDS * 1000;

      // Advance through round 1
      vi.advanceTimersByTime(roundMs);

      // Advance through round 2 (no TRANSITION after last round, but results + game over)
      vi.advanceTimersByTime(roundMs);

      // Should have exactly 2 RF_CATEGORY_REVEAL broadcasts
      const reveals = findActionBroadcasts(broadcastLog, 'RF_CATEGORY_REVEAL');
      expect(reveals).toHaveLength(2);

      // Game should have completed (GAME_OVER)
      const lastReveal = reveals[reveals.length - 1];
      const payload = lastReveal.data.payload as Record<string, unknown>;
      expect(payload.round).toBe(2);

      game.cleanup();
    });

    it('enableOutlierBonus = false should not award outlier bonus', () => {
      const { game, broadcastLog } = createRFGame({ enableOutlierBonus: false });
      game.start();

      // Advance to RANKING phase
      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      // Submit rankings: 3 players agree, 1 player has very different ranking
      const playerIds = [MOCK_USERS.alice.userId, MOCK_USERS.bob.userId, MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId];
      game.handleInput(playerIds[0], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(playerIds[1], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(playerIds[2], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      // Diana submits a very different ranking to be the outlier
      game.handleInput(playerIds[3], 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });

      // Advance through RANKING + LOCK_IN to trigger endRankingPhase
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      // Check RF_ROUND_RESULTS
      const results = findActionBroadcasts(broadcastLog, 'RF_ROUND_RESULTS');
      expect(results.length).toBeGreaterThan(0);
      const resultPayload = results[0].data.payload as Record<string, unknown>;
      const playerResults = resultPayload.playerResults as Record<string, { isOutlier: boolean; score: number; distance: number }>;

      // Find the outlier (Diana)
      const dianaResult = playerResults[MOCK_USERS.diana.userId];
      expect(dianaResult.isOutlier).toBe(true);

      // Run the same scenario with enableOutlierBonus = true to compare
      const { game: game2, broadcastLog: log2 } = createRFGame({ enableOutlierBonus: true });
      game2.start();
      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);
      game2.handleInput(playerIds[0], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game2.handleInput(playerIds[1], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game2.handleInput(playerIds[2], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game2.handleInput(playerIds[3], 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      const results2 = findActionBroadcasts(log2, 'RF_ROUND_RESULTS');
      const payload2 = results2[0].data.payload as Record<string, unknown>;
      const playerResults2 = payload2.playerResults as Record<string, { isOutlier: boolean; score: number }>;
      const dianaWithBonus = playerResults2[MOCK_USERS.diana.userId];

      // With bonus disabled, Diana's score should be exactly RF_OUTLIER_BONUS less
      expect(dianaWithBonus.score - dianaResult.score).toBe(RF_OUTLIER_BONUS);

      game.cleanup();
      game2.cleanup();
    });

    it('enableOutlierBonus = true (default) should award RF_OUTLIER_BONUS', () => {
      const { game, broadcastLog } = createRFGame();
      game.start();

      // Advance to RANKING phase
      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      // Submit rankings: 3 players agree, 1 has outlier ranking
      const playerIds = [MOCK_USERS.alice.userId, MOCK_USERS.bob.userId, MOCK_USERS.charlie.userId, MOCK_USERS.diana.userId];
      game.handleInput(playerIds[0], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(playerIds[1], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(playerIds[2], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(playerIds[3], 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });

      // Advance through RANKING + LOCK_IN to trigger endRankingPhase
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      // Check RF_ROUND_RESULTS
      const results = findActionBroadcasts(broadcastLog, 'RF_ROUND_RESULTS');
      expect(results.length).toBeGreaterThan(0);
      const resultPayload = results[0].data.payload as Record<string, unknown>;
      const playerResults = resultPayload.playerResults as Record<string, { isOutlier: boolean; score: number; distance: number }>;

      // Find the outlier (Diana)
      const dianaResult = playerResults[MOCK_USERS.diana.userId];
      expect(dianaResult.isOutlier).toBe(true);

      // Now run the same test with enableOutlierBonus = false to get the base score
      const { game: game2, broadcastLog: log2 } = createRFGame({ enableOutlierBonus: false });
      game2.start();
      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);
      game2.handleInput(playerIds[0], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game2.handleInput(playerIds[1], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game2.handleInput(playerIds[2], 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game2.handleInput(playerIds[3], 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      const results2 = findActionBroadcasts(log2, 'RF_ROUND_RESULTS');
      const resultPayload2 = results2[0].data.payload as Record<string, unknown>;
      const playerResults2 = resultPayload2.playerResults as Record<string, { isOutlier: boolean; score: number }>;
      const dianaNoBonus = playerResults2[MOCK_USERS.diana.userId];

      // With bonus enabled, score should be exactly RF_OUTLIER_BONUS more
      expect(dianaResult.score).toBe(dianaNoBonus.score + RF_OUTLIER_BONUS);

      game.cleanup();
      game2.cleanup();
    });
  });

  // ─── §8.6.6 getSetting() Fallback ────────────────────────────

  describe('§8.6.6 getSetting() Fallback', () => {
    it('empty gameSettings should use fallback defaults', () => {
      const defaults = getDefaultSettings(IDENTITY_CRISIS_SETTINGS);
      expect(defaults.questionsPerPlayer).toBe(IC_QUESTIONS_PER_PLAYER);
      expect(defaults.askDuration).toBe(IC_ASK_SECONDS);
      expect(defaults.voteDuration).toBe(IC_VOTE_SECONDS);
      expect(defaults.finalGuessDuration).toBe(IC_FINAL_GUESS_SECONDS);
      expect(defaults.enableEarlyGuess).toBe(true);

      const rfDefaults = getDefaultSettings(RANKING_FILE_SETTINGS);
      expect(rfDefaults.totalRounds).toBe(RF_TOTAL_ROUNDS);
      expect(rfDefaults.rankingDuration).toBe(RF_RANKING_SECONDS);
      expect(rfDefaults.itemsPerCategory).toBe(RF_ITEMS_PER_CATEGORY);
      expect(rfDefaults.enableOutlierBonus).toBe(true);
    });

    it('provided setting value should be used by handler', () => {
      const validated = validateGameSettings(IDENTITY_CRISIS_SETTINGS, {
        questionsPerPlayer: 4,
        enableEarlyGuess: false,
      });
      expect(validated.questionsPerPlayer).toBe(4);
      expect(validated.enableEarlyGuess).toBe(false);
      // Other settings should be defaults
      expect(validated.askDuration).toBe(IC_ASK_SECONDS);
    });

    it('unknown key should return fallback', () => {
      const validated = validateGameSettings(IDENTITY_CRISIS_SETTINGS, {
        unknownSetting: 42,
        questionsPerPlayer: 3,
      });
      // unknownSetting should not appear
      expect(validated.unknownSetting).toBeUndefined();
      // Known setting should be present
      expect(validated.questionsPerPlayer).toBe(3);
    });
  });
});
