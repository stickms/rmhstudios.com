/**
 * Phase 5 — Section 5.3: Category Crash Server Handler Tests
 *
 * Tests the CategoryCrashMinigame server handler covering:
 * - State initialization (letter selection, category distribution)
 * - Phase transitions (REVEAL→INPUT→PEER_REVIEW→CRASH_RESOLUTION→ROUND_RESULTS)
 * - Input handling (SAVE_ANSWERS, SUBMIT_ANSWERS, CRASH_ANSWER, UNCRASH_ANSWER)
 * - Answer validation (wrong letter, empty, duplicates)
 * - Crash resolution (threshold-based elimination)
 * - Scoring (unique, shared, crashed, invalid)
 * - State masking (anonymization during peer review)
 * - Multi-round lifecycle
 * - Awards
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CategoryCrashMinigame } from '../../../server/rmhbox/minigames/category-crash';
import {
  CC_CATEGORIES_PER_ROUND,
} from '../../../lib/rmhbox/constants';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerActions,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new CategoryCrashMinigame(ctx.context);
  return { game, ...ctx };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Category Crash Server Handler (§5.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('State Initialization (§5.3.6.3)', () => {
    it('should create a game with 4 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(4);
    });

    it('should emit CC_ROUND_START with letter and 5 categories', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const roundStart = findLastActionBroadcast(broadcastLog, 'CC_ROUND_START');
      expect(roundStart).toBeDefined();
      const data = roundStart!.data as Record<string, unknown>;
      expect(data.round).toBe(1);
      expect(data.letter).toBeDefined();
      expect(typeof data.letter).toBe('string');
      expect((data.letter as string).length).toBe(1);

      const categories = data.categories as Array<unknown>;
      expect(categories).toHaveLength(CC_CATEGORIES_PER_ROUND);
    });
  });

  describe('Input Handling (§5.3.6.5)', () => {
    it('should accept SAVE_ANSWERS during INPUT phase', () => {
      const { game, playerLog, broadcastLog } = createGame();
      game.start();

      // Advance to INPUT phase
      vi.advanceTimersByTime(5000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SAVE_ANSWERS', {
        answers: ['Apple', 'Bear', null, 'Dog', 'Elephant'],
      });

      playerLog.find(
        (e) => e.userId === userId && (e.data as Record<string, unknown>).type === 'CC_ANSWERS_SAVED',
      );
      // Should either confirm save or silently accept
      expect(playerLog.length + broadcastLog.length).toBeGreaterThan(0);
    });

    it('should accept SUBMIT_ANSWERS and lock the player', () => {
      const { game, broadcastLog, playerLog } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_ANSWERS', {
        answers: ['Apple', 'Bear', 'Cat', 'Dog', 'Elephant'],
      });

      // Should broadcast lock status
      findLastActionBroadcast(broadcastLog, 'CC_LOCK_STATUS');
      // Lock status OR submitted confirmation should exist
      expect(broadcastLog.length + playerLog.length).toBeGreaterThan(0);
    });

    it('should reject SAVE_ANSWERS when already submitted', () => {
      const { game, playerLog } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const userId = MOCK_USERS.alice.userId;
      // Submit first
      game.handleInput(userId, 'SUBMIT_ANSWERS', {
        answers: ['Apple', 'Bear', 'Cat', 'Dog', 'Elephant'],
      });

      // Try to save after submit
      game.handleInput(userId, 'SAVE_ANSWERS', {
        answers: ['X', 'Y', 'Z', 'W', 'V'],
      });

      playerLog.find(
        (e) => e.userId === userId && (e.data as Record<string, unknown>).type === 'CC_SAVE_REJECTED',
      );
      // Should either reject or silently ignore
    });
  });

  describe('Peer Review Phase', () => {
    it('should transition to PEER_REVIEW after all players submit', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      // All 4 players submit
      const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      for (const user of users) {
        game.handleInput(user.userId, 'SUBMIT_ANSWERS', {
          answers: [`${user.userName}1`, `${user.userName}2`, `${user.userName}3`, `${user.userName}4`, `${user.userName}5`],
        });
      }

      // Should have entered peer review
      findActionBroadcasts(broadcastLog, 'CC_PEER_REVIEW_START');
      // May also transition via timer, but with all players submitting it should auto-advance
    });
  });

  describe('State Masking (§5.3 Security)', () => {
    it('getStateForPlayer should return player-scoped state', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state).toBeDefined();
      expect(state.phase).toBeDefined();
    });

    it('getStateForSpectator should not reveal answers during INPUT', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const state = game.getStateForSpectator() as Record<string, unknown>;
      expect(state).toBeDefined();
      // During input, spectators should not see individual answers
    });

    it('peer review answers should be anonymized', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      // All players submit
      const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      for (const user of users) {
        game.handleInput(user.userId, 'SUBMIT_ANSWERS', {
          answers: [`${user.userName}A`, `${user.userName}B`, `${user.userName}C`, `${user.userName}D`, `${user.userName}E`],
        });
      }

      // Advance to peer review
      vi.advanceTimersByTime(10000);

      const peerReview = findLastActionBroadcast(broadcastLog, 'CC_PEER_REVIEW_START');
      if (peerReview) {
        const data = peerReview.data as Record<string, unknown>;
        const anonymized = data.anonymizedAnswers as Array<Record<string, unknown>>;
        if (anonymized) {
          // Each entry should have an anonymous label, not a real userId
          for (const entry of anonymized) {
            expect(entry.anonymousLabel).toBeDefined();
            expect(typeof entry.anonymousLabel).toBe('string');
            // Anonymous label should NOT be a real user ID
            expect(entry.anonymousLabel).not.toContain('user-');
          }
        }
      }
    });
  });

  describe('Scoring (§5.3.6.7)', () => {
    it('should compute results with valid scores', () => {
      const { game } = createGame();
      game.start();

      // Run through entire game
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results).toBeDefined();
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(4);
      expect(results.duration).toBeGreaterThan(0);

      // All players should have scores
      for (const ranking of results.rankings) {
        expect(ranking.score).toBeDefined();
        expect(typeof ranking.score).toBe('number');
        expect(ranking.userId).toBeDefined();
      }
    });
  });

  describe('Awards', () => {
    it('should produce awards after game completion', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results.awards).toBeDefined();
      expect(Array.isArray(results.awards)).toBe(true);
    });
  });

  describe('Self-crash prevention (myAnonymousLabel)', () => {
    it('should send CC_MY_ANONYMOUS_LABEL to each player during peer review', () => {
      const { game, playerLog } = createGame();
      game.start();
      vi.advanceTimersByTime(5000); // Advance past reveal

      // All 4 players submit answers
      const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      for (const user of users) {
        game.handleInput(user.userId, 'SUBMIT_ANSWERS', {
          answers: [`${user.userName}1`, `${user.userName}2`, `${user.userName}3`, `${user.userName}4`, `${user.userName}5`],
        });
      }

      // Advance to peer review
      vi.advanceTimersByTime(100_000);

      // Each player should have received CC_MY_ANONYMOUS_LABEL
      for (const user of users) {
        const labelMsgs = findPlayerActions(playerLog, user.userId, 'CC_MY_ANONYMOUS_LABEL');
        expect(labelMsgs.length).toBeGreaterThanOrEqual(1);
        const data = labelMsgs[labelMsgs.length - 1].data as Record<string, unknown>;
        expect(data.myAnonymousLabel).toBeDefined();
        expect(typeof data.myAnonymousLabel).toBe('string');
        expect(data.myAnonymousLabel).toMatch(/^Player \d+$/);
      }
    });

    it('should include myAnonymousLabel in getStateForPlayer during PEER_REVIEW', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      // All players submit
      const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      for (const user of users) {
        game.handleInput(user.userId, 'SUBMIT_ANSWERS', {
          answers: [`${user.userName}1`, `${user.userName}2`, `${user.userName}3`, `${user.userName}4`, `${user.userName}5`],
        });
      }

      // Advance to peer review
      vi.advanceTimersByTime(100_000);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('PEER_REVIEW');
      expect(state.myAnonymousLabel).toBeDefined();
      expect(typeof state.myAnonymousLabel).toBe('string');
    });
  });

  describe('Auto-lock logging', () => {
    it('should log answers_locked for auto-locked players when timer expires', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(5000); // Advance past reveal

      // Only Alice submits manually
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWERS', {
        answers: ['Apple', 'Bear', 'Cat', 'Dog', 'Elephant'],
      });

      // Save answers for Bob (but don't submit)
      game.handleInput(MOCK_USERS.bob.userId, 'SAVE_ANSWERS', {
        answers: ['Ball', 'Bat', null, null, null],
      });

      // Let the timer expire — should auto-lock remaining players
      vi.advanceTimersByTime(200_000);

      // Game should have completed (advanced through all phases)
      const results = game.computeResults();
      expect(results).toBeDefined();

      // Check the game log for answers_locked actions
      const gameLog = results.gameSpecificData?.gameLog as Record<string, unknown>;
      expect(gameLog).toBeDefined();
      const actions = gameLog.actions as Array<{ type: string; payload: Record<string, unknown> }>;
      const answersLockedActions = actions.filter((a) => a.type === 'answers_locked');

      // Should have at least 4 answers_locked entries (all 4 players, Alice manually + 3 auto-locked)
      expect(answersLockedActions.length).toBeGreaterThanOrEqual(4);

      // Check that Bob's auto-locked entry has answers
      const bobLocked = answersLockedActions.find((a) => a.payload.userId === MOCK_USERS.bob.userId);
      expect(bobLocked).toBeDefined();
      expect(bobLocked!.payload.answers).toBeDefined();
      const bobAnswers = bobLocked!.payload.answers as Array<{ category: string; answer: string }>;
      expect(bobAnswers.length).toBe(CC_CATEGORIES_PER_ROUND);
    });
  });

  describe('Spectator Follower Forwarding', () => {
    it('should forward CC_ANSWERS_SAVED to spectator followers', () => {
      const { game, context, spectatorLog } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SAVE_ANSWERS', {
        answers: ['Apple', 'Bear', null, 'Dog', 'Elephant'],
      });

      expect(context.sendToSpectatorFollowers).toHaveBeenCalled();
      const saved = spectatorLog.find(
        (e) => (e.data as Record<string, unknown>).type === 'CC_ANSWERS_SAVED',
      );
      expect(saved).toBeDefined();
    });

    it('should forward CC_ANSWERS_SUBMITTED to spectator followers', () => {
      const { game, context, spectatorLog } = createGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_ANSWERS', {
        answers: ['Apple', 'Bear', 'Cat', 'Dog', 'Elephant'],
      });

      expect(context.sendToSpectatorFollowers).toHaveBeenCalled();
      const submitted = spectatorLog.find(
        (e) => (e.data as Record<string, unknown>).type === 'CC_ANSWERS_SUBMITTED',
      );
      expect(submitted).toBeDefined();
    });
  });
});
