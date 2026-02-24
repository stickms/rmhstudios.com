/**
 * Ranking File — Server Handler Tests
 *
 * Tests the full lifecycle of the Ranking File minigame including
 * phase transitions, input handling, state masking, scoring, awards,
 * JIP, and disconnect/reconnect behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RankingFileGame } from '../../../server/rmhbox/minigames/ranking-file';
import {
  MOCK_USERS,
  MOCK_CATEGORIES,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerEvents,
  findLastPlayerEvent,
} from './setup';
import {
  RF_TOTAL_ROUNDS,
  RF_CATEGORY_REVEAL_SECONDS,
  RF_RANKING_SECONDS,
  RF_LOCK_IN_SECONDS,
  RF_RESULTS_SECONDS,
  RF_TRANSITION_SECONDS,
  RF_MAX_ROUND_POINTS,
  RF_EXACT_MATCH_BONUS,
  RF_OUTLIER_BONUS,
} from '../../../lib/rmhbox/constants';

// ─── Mock the category loader (reads from disk) ─────────────────

vi.mock('../../../lib/rmhbox/ranking-file/category-loader', () => ({
  loadCategories: vi.fn(() => MOCK_CATEGORIES),
  selectCategoriesForGame: vi.fn((_pool: unknown[], count: number) => MOCK_CATEGORIES.slice(0, count)),
}));

// ─── Helpers ────────────────────────────────────────────────────

function createGame(
  users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
  gameSettings: Record<string, unknown> = {},
) {
  const ctx = createMockContext(users, { gameSettings } as never);
  const game = new RankingFileGame(ctx.context);
  return { game, ...ctx };
}

/** Advance time to reach RANKING phase from the start of a round */
function advanceToRankingPhase() {
  vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Ranking File (§Phase 8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 1. State Initialization ────────────────────────────────

  describe('State Initialization', () => {
    it('should create a game instance with 4 players', () => {
      const { game } = createGame();
      expect(game).toBeInstanceOf(RankingFileGame);
    });

    it('should select correct number of categories based on totalRounds setting', () => {
      const { game, broadcastLog } = createGame(undefined, { totalRounds: 3 });
      game.start();

      // Should broadcast RF_CATEGORY_REVEAL for round 1 with a valid category
      const reveals = findActionBroadcasts(broadcastLog, 'RF_CATEGORY_REVEAL');
      expect(reveals.length).toBe(1);
      const payload = reveals[0].data.payload as { round: number; totalRounds: number };
      expect(payload.totalRounds).toBe(3);
    });

    it('should initialize all scores to 0', () => {
      const { game } = createGame();
      game.start();

      const userIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];
      for (const uid of userIds) {
        const state = game.getStateForPlayer(uid) as { scores: Record<string, number> };
        for (const score of Object.values(state.scores)) {
          expect(score).toBe(0);
        }
      }
    });
  });

  // ─── 2. Category Reveal Phase ──────────────────────────────

  describe('Category Reveal Phase', () => {
    it('should broadcast RF_CATEGORY_REVEAL on round start', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const reveals = findActionBroadcasts(broadcastLog, 'RF_CATEGORY_REVEAL');
      expect(reveals.length).toBe(1);
    });

    it('category should have name, items (5), emoji', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const reveal = findLastActionBroadcast(broadcastLog, 'RF_CATEGORY_REVEAL');
      expect(reveal).toBeDefined();
      const payload = reveal!.data.payload as {
        category: { name: string; items: string[]; emoji: string };
      };
      expect(payload.category.name).toBeTruthy();
      expect(payload.category.items).toHaveLength(5);
      expect(payload.category.emoji).toBeTruthy();
    });

    it('round counter should be correct', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const reveal = findLastActionBroadcast(broadcastLog, 'RF_CATEGORY_REVEAL');
      const payload = reveal!.data.payload as { round: number; totalRounds: number };
      expect(payload.round).toBe(1);
      expect(payload.totalRounds).toBe(RF_TOTAL_ROUNDS);
    });
  });

  // ─── 3. Ranking Phase ─────────────────────────────────────

  describe('Ranking Phase', () => {
    it('after 3s should transition to RANKING and broadcast RF_RANKING_START', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      const starts = findActionBroadcasts(broadcastLog, 'RF_RANKING_START');
      expect(starts.length).toBe(1);
      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as { phase: string };
      expect(state.phase).toBe('RANKING');
    });

    it('should accept valid ranking submission [3,1,5,2,4]', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [3, 1, 5, 2, 4],
      });

      const confirmed = findPlayerEvents(
        playerLog,
        MOCK_USERS.alice.userId,
        'rmhbox:game:action',
      ).filter((e) => (e.data as Record<string, unknown>).type === 'RF_RANKING_CONFIRMED');
      expect(confirmed.length).toBe(1);
    });

    it('should reject invalid ranking (wrong length)', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [1, 2, 3],
      });

      const rejected = findPlayerEvents(
        playerLog,
        MOCK_USERS.alice.userId,
        'rmhbox:game:action',
      ).filter((e) => (e.data as Record<string, unknown>).type === 'RF_RANKING_REJECTED');
      expect(rejected.length).toBe(1);
    });

    it('should reject invalid ranking (duplicate values)', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [1, 1, 3, 4, 5],
      });

      const rejected = findPlayerEvents(
        playerLog,
        MOCK_USERS.alice.userId,
        'rmhbox:game:action',
      ).filter((e) => (e.data as Record<string, unknown>).type === 'RF_RANKING_REJECTED');
      expect(rejected.length).toBe(1);
    });

    it('should reject invalid ranking (out of range)', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [0, 1, 2, 3, 6],
      });

      const rejected = findPlayerEvents(
        playerLog,
        MOCK_USERS.alice.userId,
        'rmhbox:game:action',
      ).filter((e) => (e.data as Record<string, unknown>).type === 'RF_RANKING_REJECTED');
      expect(rejected.length).toBe(1);
    });

    it('should send RF_RANKING_CONFIRMED to submitting player', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', {
        ranking: [2, 1, 3, 5, 4],
      });

      const confirmed = findPlayerEvents(
        playerLog,
        MOCK_USERS.bob.userId,
        'rmhbox:game:action',
      ).filter((e) => (e.data as Record<string, unknown>).type === 'RF_RANKING_CONFIRMED');
      expect(confirmed.length).toBe(1);
      const data = confirmed[0].data as { ranking: number[] };
      expect(data.ranking).toEqual([2, 1, 3, 5, 4]);
    });

    it('should broadcast RF_LOCK_IN_COUNT after submission', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [1, 2, 3, 4, 5],
      });

      const counts = findActionBroadcasts(broadcastLog, 'RF_LOCK_IN_COUNT');
      expect(counts.length).toBeGreaterThanOrEqual(1);
      const last = counts[counts.length - 1];
      const payload = last.data.payload as { lockedIn: number; total: number };
      expect(payload.lockedIn).toBe(1);
      expect(payload.total).toBe(4);
    });

    it('should reject submission from already-locked-in player', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // First submission succeeds
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [1, 2, 3, 4, 5],
      });
      // Second submission is ignored (no additional confirmed event)
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [5, 4, 3, 2, 1],
      });

      const confirmed = findPlayerEvents(
        playerLog,
        MOCK_USERS.alice.userId,
        'rmhbox:game:action',
      ).filter((e) => (e.data as Record<string, unknown>).type === 'RF_RANKING_CONFIRMED');
      expect(confirmed.length).toBe(1);
    });
  });

  // ─── 4. Lock-In Phase ─────────────────────────────────────

  describe('Lock-In Phase', () => {
    it('after ranking timeout should transition to LOCK_IN', () => {
      const { game } = createGame();
      game.start();
      advanceToRankingPhase();
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as { phase: string };
      expect(state.phase).toBe('LOCK_IN');
    });

    it('should still accept submissions during LOCK_IN', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [3, 1, 5, 2, 4],
      });

      const confirmed = findPlayerEvents(
        playerLog,
        MOCK_USERS.alice.userId,
        'rmhbox:game:action',
      ).filter((e) => (e.data as Record<string, unknown>).type === 'RF_RANKING_CONFIRMED');
      expect(confirmed.length).toBe(1);
    });
  });

  // ─── 5. Auto-Submit ───────────────────────────────────────

  describe('Auto-Submit', () => {
    it('player who didn\'t submit should get default [1,2,3,4,5] ranking', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // Only alice submits
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [3, 1, 5, 2, 4],
      });

      // Advance through RANKING → LOCK_IN → endRankingPhase
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      const results = findLastActionBroadcast(broadcastLog, 'RF_ROUND_RESULTS');
      expect(results).toBeDefined();
      const payload = results!.data.payload as {
        playerResults: Record<string, { ranking: number[] }>;
      };
      // Bob, Charlie, Diana didn't submit → default [1,2,3,4,5]
      expect(payload.playerResults[MOCK_USERS.bob.userId].ranking).toEqual([1, 2, 3, 4, 5]);
      expect(payload.playerResults[MOCK_USERS.charlie.userId].ranking).toEqual([1, 2, 3, 4, 5]);
      expect(payload.playerResults[MOCK_USERS.diana.userId].ranking).toEqual([1, 2, 3, 4, 5]);
    });

    it('player who sent live updates should use last update as ranking', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // Bob sends live updates but doesn't submit
      game.handleInput(MOCK_USERS.bob.userId, 'RF_UPDATE_RANKING', {
        ranking: [5, 4, 3, 2, 1],
      });

      // Advance through everything
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      const results = findLastActionBroadcast(broadcastLog, 'RF_ROUND_RESULTS');
      const payload = results!.data.payload as {
        playerResults: Record<string, { ranking: number[] }>;
      };
      expect(payload.playerResults[MOCK_USERS.bob.userId].ranking).toEqual([5, 4, 3, 2, 1]);
    });

    it('player who explicitly submitted should keep their ranking', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // Alice submits explicitly
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [3, 1, 5, 2, 4],
      });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      const results = findLastActionBroadcast(broadcastLog, 'RF_ROUND_RESULTS');
      const payload = results!.data.payload as {
        playerResults: Record<string, { ranking: number[] }>;
      };
      expect(payload.playerResults[MOCK_USERS.alice.userId].ranking).toEqual([3, 1, 5, 2, 4]);
    });
  });

  // ─── 6. Scoring Verification ──────────────────────────────

  describe('Scoring Verification', () => {
    it('all same ranking → distance 0 → max points for all', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      const results = findLastActionBroadcast(broadcastLog, 'RF_ROUND_RESULTS');
      const payload = results!.data.payload as {
        playerResults: Record<string, { distance: number; score: number; exactMatch: boolean }>;
      };

      const allIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];
      for (const uid of allIds) {
        expect(payload.playerResults[uid].distance).toBe(0);
        expect(payload.playerResults[uid].exactMatch).toBe(true);
        // All get base + exact match bonus; one also gets outlier bonus (all tied at distance 0)
        const baseWithBonus = RF_MAX_ROUND_POINTS + RF_EXACT_MATCH_BONUS;
        expect(payload.playerResults[uid].score).toBeGreaterThanOrEqual(baseWithBonus);
        expect(payload.playerResults[uid].score).toBeLessThanOrEqual(baseWithBonus + RF_OUTLIER_BONUS);
      }
    });

    it('different rankings → correct distance computation', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // Alice: [1,2,3,4,5], Bob: [5,4,3,2,1]
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      const results = findLastActionBroadcast(broadcastLog, 'RF_ROUND_RESULTS');
      const payload = results!.data.payload as {
        averageRanking: number[];
        playerResults: Record<string, { distance: number; score: number }>;
      };

      // Average: [(1+5+1+1)/4, (2+4+2+2)/4, (3+3+3+3)/4, (4+2+4+4)/4, (5+1+5+5)/4]
      //        = [2, 2.5, 3, 3.5, 4]
      expect(payload.averageRanking[0]).toBe(2);
      expect(payload.averageRanking[1]).toBe(2.5);
      expect(payload.averageRanking[2]).toBe(3);
      expect(payload.averageRanking[3]).toBe(3.5);
      expect(payload.averageRanking[4]).toBe(4);

      // Bob's distance = |5-2| + |4-2.5| + |3-3| + |2-3.5| + |1-4| = 3+1.5+0+1.5+3 = 9
      expect(payload.playerResults[MOCK_USERS.bob.userId].distance).toBe(9);

      // Alice's distance = |1-2| + |2-2.5| + |3-3| + |4-3.5| + |5-4| = 1+0.5+0+0.5+1 = 3
      expect(payload.playerResults[MOCK_USERS.alice.userId].distance).toBe(3);
    });

    it('exact match bonus applied when player matches consensus', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // All submit [1,2,3,4,5] so consensus = [0,1,2,3,4] and all match
      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      const results = findLastActionBroadcast(broadcastLog, 'RF_ROUND_RESULTS');
      const payload = results!.data.payload as {
        playerResults: Record<string, { score: number; exactMatch: boolean }>;
      };

      // All exact match → base 200 + bonus 100 = 300
      for (const uid of [MOCK_USERS.alice.userId, MOCK_USERS.bob.userId]) {
        expect(payload.playerResults[uid].exactMatch).toBe(true);
        expect(payload.playerResults[uid].score).toBeGreaterThanOrEqual(RF_MAX_ROUND_POINTS + RF_EXACT_MATCH_BONUS);
      }
    });

    it('outlier bonus applied to highest-distance player', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // Three players submit same, Bob is the outlier
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      const results = findLastActionBroadcast(broadcastLog, 'RF_ROUND_RESULTS');
      const payload = results!.data.payload as {
        playerResults: Record<string, { isOutlier: boolean; score: number; distance: number }>;
      };

      // Bob should be marked as outlier
      expect(payload.playerResults[MOCK_USERS.bob.userId].isOutlier).toBe(true);
      expect(payload.playerResults[MOCK_USERS.alice.userId].isOutlier).toBe(false);

      // Bob's score should include the outlier bonus
      // Bob distance = 9, score = 200 * (1 - 9/12) = 200*0.25 = 50, + outlier 25 = 75
      const bobScore = payload.playerResults[MOCK_USERS.bob.userId].score;
      const bobBaseScore = Math.round(RF_MAX_ROUND_POINTS * (1 - 9 / 12));
      expect(bobScore).toBe(bobBaseScore + RF_OUTLIER_BONUS);
    });
  });

  // ─── 7. State Masking ──────────────────────────────────────

  describe('State Masking', () => {
    it('during RANKING: player state should NOT contain other players\' rankings', () => {
      const { game } = createGame();
      game.start();
      advanceToRankingPhase();

      // Alice submits, Bob doesn't
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [1, 2, 3, 4, 5],
      });

      // Bob's state should not show Alice's ranking
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;
      expect(bobState).not.toHaveProperty('allRankings');
      expect(bobState).not.toHaveProperty('allLiveRankings');
    });

    it('during RANKING: spectator state SHOULD contain all rankings', () => {
      const { game } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [1, 2, 3, 4, 5],
      });

      const specState = game.getStateForSpectator() as {
        allRankings: Record<string, number[]>;
        allLiveRankings: Record<string, number[]>;
      };
      expect(specState.allRankings).toBeDefined();
      expect(specState.allRankings[MOCK_USERS.alice.userId]).toEqual([1, 2, 3, 4, 5]);
      expect(specState.allLiveRankings).toBeDefined();
    });

    it('lockedInCount should be a number, not individual attributions', () => {
      const { game } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', {
        ranking: [1, 2, 3, 4, 5],
      });

      const playerState = game.getStateForPlayer(MOCK_USERS.bob.userId) as {
        lockedInCount: unknown;
      };
      expect(typeof playerState.lockedInCount).toBe('number');
      expect(playerState.lockedInCount).toBe(1);
    });
  });

  // ─── 8. Round Transitions ─────────────────────────────────

  describe('Round Transitions', () => {
    it('after results should transition to next round', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToRankingPhase();

      // Submit for all
      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });

      // RANKING → LOCK_IN → RESULTS
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      // RESULTS → TRANSITION
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);

      const transitions = findActionBroadcasts(broadcastLog, 'RF_TRANSITION');
      expect(transitions.length).toBe(1);

      // TRANSITION → next round's CATEGORY_REVEAL
      vi.advanceTimersByTime(RF_TRANSITION_SECONDS * 1000);

      const reveals = findActionBroadcasts(broadcastLog, 'RF_CATEGORY_REVEAL');
      expect(reveals.length).toBe(2); // Round 1 + Round 2
      const round2 = reveals[1].data.payload as { round: number };
      expect(round2.round).toBe(2);
    });

    it('after last round should emit onComplete', () => {
      const { game, completedResults } = createGame(undefined, { totalRounds: 1 });
      game.start();
      advanceToRankingPhase();

      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });

      // RANKING → LOCK_IN → RESULTS → endGame
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);

      expect(completedResults.length).toBe(1);
    });
  });

  // ─── 9. Full Game Lifecycle ────────────────────────────────

  describe('Full Game Lifecycle (default 5 rounds)', () => {
    it('should complete full lifecycle through all rounds', () => {
      const { game, broadcastLog, completedResults } = createGame();
      game.start();

      const ranking = [1, 2, 3, 4, 5];
      const playerIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      for (let round = 0; round < RF_TOTAL_ROUNDS; round++) {
        advanceToRankingPhase();
        for (const uid of playerIds) {
          game.handleInput(uid, 'RF_SUBMIT_RANKING', { ranking });
        }
        vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
        vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
        vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);
        // For non-last rounds there's a TRANSITION that triggers the next CATEGORY_REVEAL
        if (round < RF_TOTAL_ROUNDS - 1) {
          vi.advanceTimersByTime(RF_TRANSITION_SECONDS * 1000);
        }
      }

      expect(completedResults.length).toBe(1);
      const reveals = findActionBroadcasts(broadcastLog, 'RF_CATEGORY_REVEAL');
      expect(reveals.length).toBe(RF_TOTAL_ROUNDS);
    });

    it('should call onComplete with valid MinigameResults', () => {
      const { game, completedResults } = createGame(undefined, { totalRounds: 1 });
      game.start();
      advanceToRankingPhase();

      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);

      const result = completedResults[0];
      expect(result).toBeDefined();
      expect(result.rankings).toBeDefined();
      expect(result.awards).toBeDefined();
      expect(result.gameSpecificData).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('results should have rankings for all 4 players', () => {
      const { game, completedResults } = createGame(undefined, { totalRounds: 1 });
      game.start();
      advanceToRankingPhase();

      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);

      const result = completedResults[0];
      expect(result.rankings.length).toBe(4);
      const userIds = result.rankings.map((r) => r.userId);
      expect(userIds).toContain(MOCK_USERS.alice.userId);
      expect(userIds).toContain(MOCK_USERS.bob.userId);
      expect(userIds).toContain(MOCK_USERS.charlie.userId);
      expect(userIds).toContain(MOCK_USERS.diana.userId);
    });
  });

  // ─── 10. Results & Awards ──────────────────────────────────

  describe('Results & Awards', () => {
    it('computeResults should return valid rankings', () => {
      const { game, completedResults } = createGame(undefined, { totalRounds: 1 });
      game.start();
      advanceToRankingPhase();

      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });

      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);

      const result = completedResults[0];
      for (const r of result.rankings) {
        expect(r.userId).toBeTruthy();
        expect(r.userName).toBeTruthy();
        expect(typeof r.score).toBe('number');
        expect(r.rank).toBeGreaterThanOrEqual(1);
      }
    });

    it('should assign relevant awards', () => {
      const { game, completedResults } = createGame(undefined, { totalRounds: 2 });
      game.start();

      // Round 1: varied rankings so we generate meaningful stats
      advanceToRankingPhase();
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);
      vi.advanceTimersByTime(RF_TRANSITION_SECONDS * 1000);

      // Round 2: same pattern
      advanceToRankingPhase();
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking: [5, 4, 3, 2, 1] });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);

      expect(completedResults.length).toBe(1);
      const awards = completedResults[0].awards;
      expect(awards.length).toBeGreaterThan(0);

      // Check award structure
      for (const award of awards) {
        expect(award.userId).toBeTruthy();
        expect(award.title).toBeTruthy();
        expect(award.description).toBeTruthy();
        expect(award.icon).toBeTruthy();
      }

      // With Bob consistently being the outlier, he should get Trendsetter
      const trendsetterAward = awards.find((a) => a.title === 'Trendsetter');
      expect(trendsetterAward).toBeDefined();
      expect(trendsetterAward!.userId).toBe(MOCK_USERS.bob.userId);

      // Alice, Charlie, or Diana should get Closest to Average
      const closestAward = awards.find((a) => a.title === 'Closest to Average');
      expect(closestAward).toBeDefined();
    });
  });

  // ─── 11. JIP (Join-in-Progress) ────────────────────────────

  describe('JIP (Join-in-Progress)', () => {
    it('handlePlayerJoin should add player to pending', () => {
      const { game, playerLog } = createGame();
      game.start();

      // Eve joins mid-game
      game.handlePlayerJoin(MOCK_USERS.eve.userId);

      // Eve should receive a state snapshot
      const eveEvents = findPlayerEvents(playerLog, MOCK_USERS.eve.userId);
      expect(eveEvents.length).toBeGreaterThanOrEqual(1);
      const snapshot = findLastPlayerEvent(playerLog, MOCK_USERS.eve.userId, 'rmhbox:game:state_snapshot');
      expect(snapshot).toBeDefined();
    });

    it('pending player should participate in next round', () => {
      const { game, broadcastLog, context } = createGame(undefined, { totalRounds: 2 });
      game.start();

      // Eve joins during round 1
      context.players.set(MOCK_USERS.eve.userId, {
        userId: MOCK_USERS.eve.userId,
        userName: MOCK_USERS.eve.userName,
        avatarUrl: MOCK_USERS.eve.avatarUrl,
        socketId: `socket-${MOCK_USERS.eve.userId}`,
        isConnected: true,
        isReady: false,
        score: 0,
        roundScore: 0,
        joinedAt: Date.now(),
        lastSeenAt: Date.now(),
        role: 'player',
      });
      game.handlePlayerJoin(MOCK_USERS.eve.userId);

      // Complete round 1
      advanceToRankingPhase();
      const ranking = [1, 2, 3, 4, 5];
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.charlie.userId, 'RF_SUBMIT_RANKING', { ranking });
      game.handleInput(MOCK_USERS.diana.userId, 'RF_SUBMIT_RANKING', { ranking });
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);
      vi.advanceTimersByTime(RF_RESULTS_SECONDS * 1000);
      vi.advanceTimersByTime(RF_TRANSITION_SECONDS * 1000);

      // Round 2 starts - Eve should be active
      advanceToRankingPhase();
      // Eve can now submit
      game.handleInput(MOCK_USERS.eve.userId, 'RF_SUBMIT_RANKING', { ranking: [2, 1, 3, 5, 4] });
      vi.advanceTimersByTime(RF_RANKING_SECONDS * 1000);
      vi.advanceTimersByTime(RF_LOCK_IN_SECONDS * 1000);

      // Check Eve is in round 2 results
      const results = findActionBroadcasts(broadcastLog, 'RF_ROUND_RESULTS');
      const round2Result = results[results.length - 1];
      const payload = round2Result.data.payload as {
        playerResults: Record<string, { userId: string }>;
      };
      expect(payload.playerResults[MOCK_USERS.eve.userId]).toBeDefined();
    });
  });

  // ─── 12. Disconnect/Reconnect ──────────────────────────────

  describe('Disconnect/Reconnect', () => {
    it('disconnect should not crash', () => {
      const { game } = createGame();
      game.start();
      advanceToRankingPhase();

      expect(() => {
        game.handlePlayerDisconnect(MOCK_USERS.alice.userId);
      }).not.toThrow();
    });

    it('reconnect should send state snapshot', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToRankingPhase();

      game.handlePlayerReconnect(MOCK_USERS.alice.userId);

      const snapshot = findLastPlayerEvent(
        playerLog,
        MOCK_USERS.alice.userId,
        'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();
      const data = snapshot!.data as { phase: string };
      expect(data.phase).toBe('RANKING');
    });
  });
});
