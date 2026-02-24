/**
 * Security State Masking — Tests
 *
 * Verifies that no information leaks through getStateForPlayer() for
 * both Identity Crisis and Ranking File minigames.
 *
 * CRITICAL: These tests ensure the core game mechanic — players must
 * never see their own identity (IC) or other players' rankings (RF)
 * through any state accessor before the reveal/results phase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdentityCrisisGame } from '../../../server/rmhbox/minigames/identity-crisis';
import { RankingFileGame } from '../../../server/rmhbox/minigames/ranking-file';
import {
  MOCK_USERS,
  MOCK_IDENTITIES,
  MOCK_CATEGORIES,
  createMockContext,
} from './setup';
import {
  RF_CATEGORY_REVEAL_SECONDS,
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

const USERS = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
const USER_IDS = USERS.map((u) => u.userId);

function createICGame(gameSettings: Record<string, unknown> = {}) {
  const ctx = createMockContext(USERS, { gameSettings } as never);
  const game = new IdentityCrisisGame(ctx.context);
  return { game, ...ctx };
}

function createRFGame(gameSettings: Record<string, unknown> = {}) {
  const ctx = createMockContext(USERS, { gameSettings } as never);
  const game = new RankingFileGame(ctx.context);
  return { game, ...ctx };
}

/**
 * Get the identity assignments from the spectator god-view.
 * Returns a Map of userId → identity name.
 */
function getIdentityAssignments(game: IdentityCrisisGame): Map<string, string> {
  const spectatorState = game.getStateForSpectator() as {
    allIdentities: Record<string, { name: string; category: string }>;
  };
  const assignments = new Map<string, string>();
  for (const [userId, identity] of Object.entries(spectatorState.allIdentities)) {
    assignments.set(userId, identity.name);
  }
  return assignments;
}

/** Find the current asker from player log IC_TURN_START_SELF events */
function findCurrentAsker(playerLog: Array<{ userId: string; data: unknown }>): string | null {
  const selfStarts = playerLog.filter((e) => {
    const d = e.data as Record<string, unknown>;
    return d.type === 'IC_TURN_START_SELF';
  });
  if (selfStarts.length === 0) return null;
  return selfStarts[selfStarts.length - 1].userId;
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Security State Masking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════
  // Identity Crisis — Information Masking (CRITICAL)
  // ═══════════════════════════════════════════════════════════════

  describe('Identity Crisis — Information Masking (CRITICAL)', () => {
    it('ASSIGNMENT_REVEAL: player state must NOT contain own identity name', () => {
      const { game } = createICGame();
      game.start();

      const assignments = getIdentityAssignments(game);

      for (const userId of USER_IDS) {
        const state = game.getStateForPlayer(userId);
        const stateStr = JSON.stringify(state);
        const ownIdentity = assignments.get(userId)!;

        // Own identity must NOT appear anywhere in the player's state
        expect(stateStr).not.toContain(ownIdentity);

        // But own identity SHOULD appear in at least one other player's state
        const otherUserIds = USER_IDS.filter((id) => id !== userId);
        const foundInOther = otherUserIds.some((otherId) => {
          const otherState = JSON.stringify(game.getStateForPlayer(otherId));
          return otherState.includes(ownIdentity);
        });
        expect(foundInOther).toBe(true);
      }
    });

    it('ASK phase: asker state must NOT contain askerIdentity', () => {
      const { game, playerLog } = createICGame();
      game.start();

      // Advance past ASSIGNMENT_REVEAL into ASK phase
      vi.advanceTimersByTime(5000);

      const assignments = getIdentityAssignments(game);
      const askerId = findCurrentAsker(playerLog)!;
      expect(askerId).toBeTruthy();

      // Asker's state must NOT contain askerIdentity field
      const askerState = game.getStateForPlayer(askerId);
      const askerStr = JSON.stringify(askerState);
      const askerIdentityName = assignments.get(askerId)!;
      expect(askerStr).not.toContain(askerIdentityName);

      // Non-asker states SHOULD contain askerIdentity
      for (const userId of USER_IDS) {
        if (userId === askerId) continue;
        const state = game.getStateForPlayer(userId);
        const stateStr = JSON.stringify(state);
        expect(stateStr).toContain(askerIdentityName);
      }
    });

    it('VOTE phase: asker state must NOT contain askerIdentity', () => {
      const { game, playerLog } = createICGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const assignments = getIdentityAssignments(game);
      const askerId = findCurrentAsker(playerLog)!;

      // Submit a question to transition to VOTE phase
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I a scientist?' });

      const askerState = game.getStateForPlayer(askerId);
      const askerStr = JSON.stringify(askerState);
      const askerIdentityName = assignments.get(askerId)!;
      expect(askerStr).not.toContain(askerIdentityName);

      // Non-askers SHOULD see askerIdentity
      for (const userId of USER_IDS) {
        if (userId === askerId) continue;
        const stateStr = JSON.stringify(game.getStateForPlayer(userId));
        expect(stateStr).toContain(askerIdentityName);
      }
    });

    it('VOTE_RESULTS phase: asker state must NOT contain askerIdentity', () => {
      const { game, playerLog } = createICGame();
      game.start();
      vi.advanceTimersByTime(5000);

      const assignments = getIdentityAssignments(game);
      const askerId = findCurrentAsker(playerLog)!;

      // Submit question → VOTE phase
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I a scientist?' });
      // All non-askers vote → VOTE_RESULTS phase
      for (const uid of USER_IDS) {
        if (uid !== askerId) {
          game.handleInput(uid, 'IC_VOTE', { vote: 'yes' });
        }
      }

      const askerState = game.getStateForPlayer(askerId);
      const askerStr = JSON.stringify(askerState);
      const askerIdentityName = assignments.get(askerId)!;
      expect(askerStr).not.toContain(askerIdentityName);

      for (const userId of USER_IDS) {
        if (userId === askerId) continue;
        const stateStr = JSON.stringify(game.getStateForPlayer(userId));
        expect(stateStr).toContain(askerIdentityName);
      }
    });

    it('FINAL_GUESS phase: each player state must NOT contain own identity name', () => {
      const { game } = createICGame({ questionsPerPlayer: 1 });
      game.start();

      const assignments = getIdentityAssignments(game);

      // Fast-forward through all question rounds to reach FINAL_GUESS
      // With questionsPerPlayer=1 and 4 players, we need 4 question turns
      // ASSIGNMENT_REVEAL (5s) → then cycle through 4 turns
      vi.advanceTimersByTime(5000);

      for (let turn = 0; turn < 4; turn++) {
        const state = game.getStateForPlayer(USER_IDS[0]) as { phase: string };
        if (state.phase === 'FINAL_GUESS') break;

        // Find current asker and submit question + votes
        const askerState = USER_IDS.find((uid) => {
          const s = game.getStateForPlayer(uid) as { currentQuestion?: { isAsker: boolean } };
          return s.currentQuestion?.isAsker === true;
        });
        if (!askerState) break;

        game.handleInput(askerState, 'IC_ASK_QUESTION', { question: 'Am I famous?' });
        for (const uid of USER_IDS) {
          if (uid !== askerState) {
            game.handleInput(uid, 'IC_VOTE', { vote: 'yes' });
          }
        }
        // Advance past VOTE_RESULTS
        vi.advanceTimersByTime(3000);
      }

      const checkState = game.getStateForPlayer(USER_IDS[0]) as { phase: string };
      expect(checkState.phase).toBe('FINAL_GUESS');

      for (const userId of USER_IDS) {
        const stateStr = JSON.stringify(game.getStateForPlayer(userId));
        const ownIdentity = assignments.get(userId)!;
        expect(stateStr).not.toContain(ownIdentity);
      }
    });

    it('RESULTS phase: should reveal own identity via myIdentity field', () => {
      const { game } = createICGame({ questionsPerPlayer: 1 });
      game.start();

      const assignments = getIdentityAssignments(game);

      // Fast-forward to FINAL_GUESS
      vi.advanceTimersByTime(5000);

      for (let turn = 0; turn < 4; turn++) {
        const state = game.getStateForPlayer(USER_IDS[0]) as { phase: string };
        if (state.phase === 'FINAL_GUESS') break;

        const askerUserId = USER_IDS.find((uid) => {
          const s = game.getStateForPlayer(uid) as { currentQuestion?: { isAsker: boolean } };
          return s.currentQuestion?.isAsker === true;
        });
        if (!askerUserId) break;

        game.handleInput(askerUserId, 'IC_ASK_QUESTION', { question: 'Am I famous?' });
        for (const uid of USER_IDS) {
          if (uid !== askerUserId) {
            game.handleInput(uid, 'IC_VOTE', { vote: 'yes' });
          }
        }
        vi.advanceTimersByTime(3000);
      }

      // Advance past FINAL_GUESS → RESULTS
      vi.advanceTimersByTime(30000);

      const checkState = game.getStateForPlayer(USER_IDS[0]) as { phase: string };
      expect(checkState.phase).toBe('RESULTS');

      for (const userId of USER_IDS) {
        const state = game.getStateForPlayer(userId) as { myIdentity: string; phase: string };
        const ownIdentity = assignments.get(userId)!;
        expect(state.myIdentity).toBe(ownIdentity);
      }
    });

    it('spectator always sees all identities via getStateForSpectator()', () => {
      const { game } = createICGame();
      game.start();

      const spectatorState = game.getStateForSpectator() as {
        allIdentities: Record<string, { name: string; category: string }>;
      };

      expect(spectatorState.allIdentities).toBeDefined();

      // Spectator should see all 4 identity names
      const identityNames = Object.values(spectatorState.allIdentities).map((i) => i.name);
      expect(identityNames).toHaveLength(4);

      // All assigned identity names should appear
      for (const name of identityNames) {
        const stateStr = JSON.stringify(spectatorState);
        expect(stateStr).toContain(name);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Ranking File — Ranking Privacy
  // ═══════════════════════════════════════════════════════════════

  describe('Ranking File — Ranking Privacy', () => {
    it('RANKING phase: player A must NOT see player B ranking', () => {
      const { game } = createRFGame();
      game.start();

      // Advance to RANKING phase
      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      const aliceId = MOCK_USERS.alice.userId;
      const bobId = MOCK_USERS.bob.userId;

      // Bob submits a ranking
      const bobRanking = [5, 4, 3, 2, 1];
      game.handleInput(bobId, 'RF_SUBMIT_RANKING', { ranking: bobRanking });

      // Alice's state should NOT contain Bob's ranking
      const aliceState = game.getStateForPlayer(aliceId);
      const aliceStr = JSON.stringify(aliceState);
      expect(aliceStr).not.toContain(JSON.stringify(bobRanking));

      // Also verify no other player's ranking leaks
      for (const userId of USER_IDS) {
        if (userId === bobId) continue;
        const state = game.getStateForPlayer(userId);
        const stateStr = JSON.stringify(state);
        // Should not contain Bob's distinctive ranking [5,4,3,2,1]
        expect(stateStr).not.toContain('"ranking":[5,4,3,2,1]');
        // Check allRankings not present
        expect(stateStr).not.toContain('"allRankings"');
      }
    });

    it('RANKING phase: spectator SHOULD see allRankings and allLiveRankings', () => {
      const { game } = createRFGame();
      game.start();

      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      // Submit a ranking and a live update
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_UPDATE_RANKING', { ranking: [5, 4, 3, 2, 1] });

      const spectatorState = game.getStateForSpectator() as {
        allRankings: Record<string, number[]>;
        allLiveRankings: Record<string, number[]>;
      };

      expect(spectatorState.allRankings).toBeDefined();
      expect(spectatorState.allLiveRankings).toBeDefined();

      // Alice's locked-in ranking should be in allRankings
      expect(spectatorState.allRankings[MOCK_USERS.alice.userId]).toEqual([1, 2, 3, 4, 5]);
      // Bob's live ranking should be in allLiveRankings
      expect(spectatorState.allLiveRankings[MOCK_USERS.bob.userId]).toEqual([5, 4, 3, 2, 1]);
    });

    it('lockedInCount is anonymous (a number, not attributable to specific players)', () => {
      const { game } = createRFGame();
      game.start();

      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      // Two players submit
      game.handleInput(MOCK_USERS.alice.userId, 'RF_SUBMIT_RANKING', { ranking: [1, 2, 3, 4, 5] });
      game.handleInput(MOCK_USERS.bob.userId, 'RF_SUBMIT_RANKING', { ranking: [2, 1, 3, 4, 5] });

      for (const userId of USER_IDS) {
        const state = game.getStateForPlayer(userId) as {
          lockedInCount: unknown;
        };
        expect(typeof state.lockedInCount).toBe('number');
        expect(state.lockedInCount).toBe(2);
      }

      // Player state should NOT contain a "lockedIn" map with userId keys
      for (const userId of USER_IDS) {
        const stateStr = JSON.stringify(game.getStateForPlayer(userId));
        // Should not contain the lockedIn map object with userId keys
        expect(stateStr).not.toContain('"lockedIn":{');
      }
    });

    it('RESULTS_REVEAL phase: all rankings should be visible to players', () => {
      const { game } = createRFGame();
      game.start();

      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      // All players submit different rankings
      const rankings: Record<string, number[]> = {
        [MOCK_USERS.alice.userId]: [1, 2, 3, 4, 5],
        [MOCK_USERS.bob.userId]: [5, 4, 3, 2, 1],
        [MOCK_USERS.charlie.userId]: [3, 1, 2, 5, 4],
        [MOCK_USERS.diana.userId]: [2, 3, 4, 1, 5],
      };

      for (const [uid, ranking] of Object.entries(rankings)) {
        game.handleInput(uid, 'RF_SUBMIT_RANKING', { ranking });
      }

      // Advance through RANKING → LOCK_IN → RESULTS_REVEAL
      vi.advanceTimersByTime(25000); // RF_RANKING_SECONDS
      vi.advanceTimersByTime(3000);  // RF_LOCK_IN_SECONDS

      // Verify we're in RESULTS_REVEAL
      const checkState = game.getStateForPlayer(USER_IDS[0]) as { phase: string };
      expect(checkState.phase).toBe('RESULTS_REVEAL');

      // Each player should see roundResults with all player rankings
      for (const userId of USER_IDS) {
        const state = game.getStateForPlayer(userId) as {
          roundResults: Array<{
            playerResults: Record<string, { ranking: number[] }>;
          }>;
        };
        expect(state.roundResults).toHaveLength(1);
        const roundResult = state.roundResults[0];
        // All players' rankings should be visible
        for (const [uid, ranking] of Object.entries(rankings)) {
          expect(roundResult.playerResults[uid].ranking).toEqual(ranking);
        }
      }
    });

    it('live ranking updates go only to spectators, not to broadcast', () => {
      const { game, spectatorLog, broadcastLog } = createRFGame();
      game.start();

      vi.advanceTimersByTime(RF_CATEGORY_REVEAL_SECONDS * 1000);

      // Clear logs from setup
      const broadcastLenBefore = broadcastLog.length;
      const spectatorLenBefore = spectatorLog.length;

      // Send RF_UPDATE_RANKING
      game.handleInput(MOCK_USERS.alice.userId, 'RF_UPDATE_RANKING', { ranking: [3, 1, 2, 5, 4] });

      // Spectator log should have the live update
      const newSpectatorEvents = spectatorLog.slice(spectatorLenBefore);
      const liveUpdates = newSpectatorEvents.filter((e) => {
        const d = e.data as Record<string, unknown>;
        return d.type === 'RF_LIVE_RANKING_UPDATE';
      });
      expect(liveUpdates.length).toBe(1);

      // Broadcast log should NOT have any RF_LIVE_RANKING_UPDATE
      const newBroadcastEvents = broadcastLog.slice(broadcastLenBefore);
      const broadcastLiveUpdates = newBroadcastEvents.filter((e) => {
        const d = e.data as Record<string, unknown>;
        return d.type === 'RF_LIVE_RANKING_UPDATE';
      });
      expect(broadcastLiveUpdates.length).toBe(0);
    });
  });
});
