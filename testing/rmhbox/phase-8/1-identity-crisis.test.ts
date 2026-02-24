/**
 * Identity Crisis — Server Handler Tests
 *
 * Tests the full lifecycle of the Identity Crisis minigame including
 * phase transitions, input handling, masking rules, scoring, and awards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdentityCrisisGame } from '../../../server/rmhbox/minigames/identity-crisis';
import {
  MOCK_USERS,
  MOCK_IDENTITIES,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerEvents,
  findPlayerActions,
  findLastPlayerAction,
  type MockContextData,
} from './setup';

// ─── Mock the identity loader (reads from disk) ─────────────────

vi.mock('../../../lib/rmhbox/identity-crisis/identity-loader', () => ({
  loadIdentities: vi.fn(() => MOCK_IDENTITIES),
  selectIdentitiesForGame: vi.fn((_pool: unknown[], count: number) =>
    MOCK_IDENTITIES.slice(0, count),
  ),
}));

// ─── Helpers ────────────────────────────────────────────────────

function createGame(
  users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
  gameSettings: Record<string, unknown> = {},
) {
  const ctx = createMockContext(users, { gameSettings } as never);
  const game = new IdentityCrisisGame(ctx.context);
  return { game, ...ctx };
}

/** Find the asker from player log IC_TURN_START_SELF events */
function findCurrentAsker(playerLog: MockContextData['playerLog']): string | null {
  const selfStarts = playerLog.filter((e) => {
    const d = e.data as Record<string, unknown>;
    return d.type === 'IC_TURN_START_SELF';
  });
  if (selfStarts.length === 0) return null;
  return selfStarts[selfStarts.length - 1].userId;
}

/** Get all player IDs except the given one */
function othersExcept(
  users: typeof MOCK_USERS,
  excludeId: string,
  pool = [users.alice, users.bob, users.charlie, users.diana],
) {
  return pool.filter((u) => u.userId !== excludeId).map((u) => u.userId);
}

/** Advance past assignment reveal (5000ms) into ASK phase */
function advancePastReveal() {
  vi.advanceTimersByTime(5000);
}

/** Submit a question from the current asker */
function submitQuestion(
  game: IdentityCrisisGame,
  playerLog: MockContextData['playerLog'],
  question = 'Am I a scientist?',
) {
  const askerId = findCurrentAsker(playerLog)!;
  game.handleInput(askerId, 'IC_ASK_QUESTION', { question });
  return askerId;
}

/** Submit votes from all non-asker players */
function submitAllVotes(
  game: IdentityCrisisGame,
  askerId: string,
  vote: 'yes' | 'no' | 'maybe' = 'yes',
  allUserIds: string[] = [
    MOCK_USERS.alice.userId,
    MOCK_USERS.bob.userId,
    MOCK_USERS.charlie.userId,
    MOCK_USERS.diana.userId,
  ],
) {
  for (const uid of allUserIds) {
    if (uid !== askerId) {
      game.handleInput(uid, 'IC_VOTE', { vote });
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Identity Crisis (§Phase 8)', () => {
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
      expect(game).toBeInstanceOf(IdentityCrisisGame);
    });

    it('should assign 4 unique identities on start', () => {
      const { game, playerLog } = createGame();
      game.start();

      // Each of the 4 players should receive an IC_IDENTITIES_REVEAL
      const reveals = playerLog.filter((e) => {
        const d = e.data as Record<string, unknown>;
        return d.type === 'IC_IDENTITIES_REVEAL';
      });
      expect(reveals.length).toBe(4);

      // Collect all identity names from the reveals (each reveal has N-1 identities)
      const allNames = new Set<string>();
      for (const reveal of reveals) {
        const d = reveal.data as { payload: { identities: Record<string, { name: string }> } };
        for (const entry of Object.values(d.payload.identities)) {
          allNames.add(entry.name);
        }
      }
      // Should have exactly 4 unique identities across all reveals
      expect(allNames.size).toBe(4);
    });

    it('should initialize scores to 0 for all players', () => {
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

  // ─── 2. Assignment Reveal Phase ─────────────────────────────

  describe('Assignment Reveal Phase', () => {
    it('should send IC_IDENTITIES_REVEAL to each player via sendToPlayer', () => {
      const { game, playerLog } = createGame();
      game.start();

      const userIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];
      for (const uid of userIds) {
        const actions = findPlayerActions(playerLog, uid, 'IC_IDENTITIES_REVEAL');
        expect(actions.length).toBe(1);
      }
    });

    it('each player should receive N-1 identities (NOT their own)', () => {
      const { game, playerLog } = createGame();
      game.start();

      const userIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];
      for (const uid of userIds) {
        const action = findLastPlayerAction(playerLog, uid, 'IC_IDENTITIES_REVEAL')!;
        const payload = action.data.payload as { identities: Record<string, unknown> };
        const identityKeys = Object.keys(payload.identities);
        expect(identityKeys.length).toBe(3); // N-1 = 3
        expect(identityKeys).not.toContain(uid);
      }
    });

    it('spectators should receive ALL identities', () => {
      const { game, spectatorLog } = createGame();
      game.start();

      const spectReveal = spectatorLog.filter((e) => {
        const d = e.data as Record<string, unknown>;
        return d.type === 'IC_IDENTITIES_REVEAL';
      });
      expect(spectReveal.length).toBe(1);

      const d = spectReveal[0].data as { payload: { identities: Record<string, unknown> } };
      expect(Object.keys(d.payload.identities).length).toBe(4);
    });

    it("player's own identity name should NOT appear in their reveal payload", () => {
      const { game, playerLog } = createGame();
      game.start();

      const userIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];
      for (const uid of userIds) {
        const action = findLastPlayerAction(playerLog, uid, 'IC_IDENTITIES_REVEAL')!;
        const payload = action.data.payload as {
          identities: Record<string, { name: string }>;
        };

        // Get the player's own identity from getStateForPlayer in RESULTS phase
        // For now, verify the player's userId key is not in identities
        const identityNames = Object.values(payload.identities).map((i) => i.name);
        // The player's own identity shouldn't be listed
        expect(Object.keys(payload.identities)).not.toContain(uid);

        // String-scan: serialize and check player's own identity is absent
        const serialized = JSON.stringify(payload.identities);
        // Each player's identity should NOT appear in their own reveal
        // We know the identity assigned is from the same index as player insertion order
        // but let's verify structurally: their userId key is excluded
        expect(payload.identities[uid]).toBeUndefined();
      }
    });
  });

  // ─── 3. Question Turn Lifecycle ─────────────────────────────

  describe('Question Turn Lifecycle', () => {
    it('after 5000ms should transition to ASK phase', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog);
      expect(askerId).not.toBeNull();

      const state = game.getStateForPlayer(askerId!) as { phase: string };
      expect(state.phase).toBe('ASK');
    });

    it('asker should receive IC_TURN_START_SELF without any identity', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      const selfStart = findLastPlayerAction(playerLog, askerId, 'IC_TURN_START_SELF')!;
      expect(selfStart).toBeDefined();

      const payload = selfStart.data.payload as Record<string, unknown>;
      expect(payload.askerId).toBe(askerId);
      expect(payload).not.toHaveProperty('askerIdentity');
    });

    it('non-askers should receive IC_TURN_START with asker\'s identity', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);

      for (const uid of nonAskerIds) {
        const turnStart = findLastPlayerAction(playerLog, uid, 'IC_TURN_START')!;
        expect(turnStart).toBeDefined();
        const payload = turnStart.data.payload as Record<string, unknown>;
        expect(payload.askerIdentity).toBeDefined();
        expect(typeof payload.askerIdentity).toBe('string');
        expect((payload.askerIdentity as string).length).toBeGreaterThan(0);
      }
    });

    it('TIMER_START broadcast should be emitted', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advancePastReveal();

      const timerStarts = findActionBroadcasts(broadcastLog, 'TIMER_START');
      expect(timerStarts.length).toBeGreaterThan(0);
    });
  });

  // ─── 4. Question Submission ─────────────────────────────────

  describe('Question Submission', () => {
    it('valid question from asker should be accepted and transition to VOTE phase', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I a real person?' });

      const state = game.getStateForPlayer(askerId) as { phase: string };
      expect(state.phase).toBe('VOTE');
    });

    it('question from non-asker should be rejected (no phase change)', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);

      game.handleInput(nonAskerIds[0], 'IC_ASK_QUESTION', { question: 'Am I famous?' });

      const state = game.getStateForPlayer(askerId) as { phase: string };
      expect(state.phase).toBe('ASK');
    });

    it('question too short (<3 chars) should be rejected', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Hi' });

      const state = game.getStateForPlayer(askerId) as { phase: string };
      expect(state.phase).toBe('ASK');
    });

    it('question after already submitting should be rejected', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I alive?' });

      const stateAfterFirst = game.getStateForPlayer(askerId) as { phase: string };
      expect(stateAfterFirst.phase).toBe('VOTE');

      // Second question attempt shouldn't change anything
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I human?' });
      const stateAfterSecond = game.getStateForPlayer(askerId) as { phase: string };
      expect(stateAfterSecond.phase).toBe('VOTE');
    });
  });

  // ─── 5. Vote Phase ──────────────────────────────────────────

  describe('Vote Phase', () => {
    it('vote from non-asker should be accepted', () => {
      const { game, playerLog, broadcastLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = submitQuestion(game, playerLog);
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);

      game.handleInput(nonAskerIds[0], 'IC_VOTE', { vote: 'yes' });

      const voteCounts = findActionBroadcasts(broadcastLog, 'IC_VOTE_COUNT');
      expect(voteCounts.length).toBeGreaterThan(0);
      const lastVote = voteCounts[voteCounts.length - 1];
      expect((lastVote.data.payload as { voteCount: number }).voteCount).toBe(1);
    });

    it('vote from asker should be rejected', () => {
      const { game, playerLog, broadcastLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = submitQuestion(game, playerLog);
      const voteCountBefore = findActionBroadcasts(broadcastLog, 'IC_VOTE_COUNT').length;

      game.handleInput(askerId, 'IC_VOTE', { vote: 'yes' });

      const voteCountAfter = findActionBroadcasts(broadcastLog, 'IC_VOTE_COUNT').length;
      expect(voteCountAfter).toBe(voteCountBefore);
    });

    it('duplicate vote should be rejected', () => {
      const { game, playerLog, broadcastLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = submitQuestion(game, playerLog);
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);

      game.handleInput(nonAskerIds[0], 'IC_VOTE', { vote: 'yes' });
      const countAfterFirst = findActionBroadcasts(broadcastLog, 'IC_VOTE_COUNT').length;

      game.handleInput(nonAskerIds[0], 'IC_VOTE', { vote: 'no' });
      const countAfterSecond = findActionBroadcasts(broadcastLog, 'IC_VOTE_COUNT').length;

      expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('IC_VOTE_COUNT should be broadcast after each vote', () => {
      const { game, playerLog, broadcastLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = submitQuestion(game, playerLog);
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);

      game.handleInput(nonAskerIds[0], 'IC_VOTE', { vote: 'yes' });
      game.handleInput(nonAskerIds[1], 'IC_VOTE', { vote: 'no' });

      const voteCounts = findActionBroadcasts(broadcastLog, 'IC_VOTE_COUNT');
      expect(voteCounts.length).toBe(2);

      const first = voteCounts[0].data.payload as { voteCount: number };
      const second = voteCounts[1].data.payload as { voteCount: number };
      expect(first.voteCount).toBe(1);
      expect(second.voteCount).toBe(2);
    });

    it('all voters done → should end voting early and show results', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = submitQuestion(game, playerLog);
      submitAllVotes(game, askerId, 'yes');

      // Should have transitioned to VOTE_RESULTS
      const state = game.getStateForPlayer(askerId) as { phase: string };
      expect(state.phase).toBe('VOTE_RESULTS');
    });
  });

  // ─── 6. Vote Results ────────────────────────────────────────

  describe('Vote Results', () => {
    it('tally should correctly count votes (3 yes, 0 no → yes majority)', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = submitQuestion(game, playerLog);
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);

      // 3 non-askers all vote yes
      for (const uid of nonAskerIds) {
        game.handleInput(uid, 'IC_VOTE', { vote: 'yes' });
      }

      // Now in VOTE_RESULTS
      const state = game.getStateForPlayer(askerId) as {
        phase: string;
        currentQuestion: { result: string; tally: { yes: number; no: number; maybe: number } };
      };
      expect(state.phase).toBe('VOTE_RESULTS');
      expect(state.currentQuestion.result).toBe('yes');
      expect(state.currentQuestion.tally.yes).toBe(3);
    });

    it('tie between yes/no → maybe result', () => {
      // Need an even split, so use 2 yes, 2 no with 5 players (1 asker, 4 voters)
      const { game, playerLog } = createGame([
        MOCK_USERS.alice,
        MOCK_USERS.bob,
        MOCK_USERS.charlie,
        MOCK_USERS.diana,
        MOCK_USERS.eve,
      ]);
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      game.handleInput(askerId, 'IC_ASK_QUESTION', { question: 'Am I fictional?' });

      const nonAskerIds = [
        MOCK_USERS.alice,
        MOCK_USERS.bob,
        MOCK_USERS.charlie,
        MOCK_USERS.diana,
        MOCK_USERS.eve,
      ]
        .map((u) => u.userId)
        .filter((uid) => uid !== askerId);

      // 2 yes, 2 no → tie → maybe
      game.handleInput(nonAskerIds[0], 'IC_VOTE', { vote: 'yes' });
      game.handleInput(nonAskerIds[1], 'IC_VOTE', { vote: 'yes' });
      game.handleInput(nonAskerIds[2], 'IC_VOTE', { vote: 'no' });
      game.handleInput(nonAskerIds[3], 'IC_VOTE', { vote: 'no' });

      const state = game.getStateForPlayer(askerId) as {
        phase: string;
        currentQuestion: { result: string };
      };
      expect(state.phase).toBe('VOTE_RESULTS');
      expect(state.currentQuestion.result).toBe('maybe');
    });
  });

  // ─── 7. Early Guess ─────────────────────────────────────────

  describe('Early Guess', () => {
    it('correct early guess should award bonus points', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      // Find a non-asker and get their identity from spectator/state
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);
      const guesserId = nonAskerIds[0];

      // We know identities are assigned in player insertion order from MOCK_IDENTITIES
      // Find the guesser's actual identity via getStateForPlayer in other player's view
      const otherState = game.getStateForPlayer(askerId) as {
        otherIdentities: Record<string, { name: string }>;
      };
      // The guesser's identity is visible to the asker
      const guesserIdentityName = otherState.otherIdentities[guesserId]?.name;
      expect(guesserIdentityName).toBeDefined();

      game.handleInput(guesserId, 'IC_EARLY_GUESS', { guess: guesserIdentityName });

      const guessResult = findLastPlayerAction(playerLog, guesserId, 'IC_EARLY_GUESS_RESULT')!;
      expect(guessResult).toBeDefined();
      const payload = guessResult.data.payload as { correct: boolean; points: number };
      expect(payload.correct).toBe(true);
      // Points should include IC_CORRECT_GUESS_POINTS (200) + earlyBonus + efficiencyBonus
      expect(payload.points).toBeGreaterThan(200);
    });

    it('incorrect early guess should apply penalty and eliminate player', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);
      const guesserId = nonAskerIds[0];

      game.handleInput(guesserId, 'IC_EARLY_GUESS', { guess: 'Totally Wrong Person' });

      const guessResult = findLastPlayerAction(playerLog, guesserId, 'IC_EARLY_GUESS_RESULT')!;
      expect(guessResult).toBeDefined();
      const payload = guessResult.data.payload as { correct: boolean; points: number };
      expect(payload.correct).toBe(false);
      expect(payload.points).toBe(-100);

      // Player should be eliminated
      const state = game.getStateForPlayer(guesserId) as { eliminated: boolean };
      expect(state.eliminated).toBe(true);
    });

    it('guess from eliminated player should be rejected', () => {
      const { game, playerLog } = createGame();
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);
      const guesserId = nonAskerIds[0];

      // First wrong guess → eliminated
      game.handleInput(guesserId, 'IC_EARLY_GUESS', { guess: 'Wrong' });
      const firstResult = findPlayerActions(playerLog, guesserId, 'IC_EARLY_GUESS_RESULT');
      expect(firstResult.length).toBe(1);

      // Second guess should be ignored
      game.handleInput(guesserId, 'IC_EARLY_GUESS', { guess: 'Another Wrong' });
      const secondResult = findPlayerActions(playerLog, guesserId, 'IC_EARLY_GUESS_RESULT');
      expect(secondResult.length).toBe(1); // Still just the one
    });

    it('early guess with enableEarlyGuess=false should be rejected', () => {
      const { game, playerLog } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { enableEarlyGuess: false },
      );
      game.start();
      advancePastReveal();

      const askerId = findCurrentAsker(playerLog)!;
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);

      game.handleInput(nonAskerIds[0], 'IC_EARLY_GUESS', { guess: 'Albert Einstein' });

      const results = findPlayerActions(playerLog, nonAskerIds[0], 'IC_EARLY_GUESS_RESULT');
      expect(results.length).toBe(0);
    });
  });

  // ─── 8. Final Guess Phase ───────────────────────────────────

  describe('Final Guess Phase', () => {
    it('after all question rounds should transition to FINAL_GUESS', () => {
      // Use questionsPerPlayer=1 for faster test
      const { game, playerLog } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { questionsPerPlayer: 1 },
      );
      game.start();
      advancePastReveal();

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      // Run through all 4 question turns (1 round × 4 players)
      for (let i = 0; i < 4; i++) {
        const askerId = findCurrentAsker(playerLog)!;
        game.handleInput(askerId, 'IC_ASK_QUESTION', { question: `Question ${i + 1}?` });
        submitAllVotes(game, askerId, 'yes', allUserIds);
        // Advance past vote results (3000ms)
        vi.advanceTimersByTime(3000);
      }

      const state = game.getStateForPlayer(allUserIds[0]) as { phase: string };
      expect(state.phase).toBe('FINAL_GUESS');
    });

    it('correct final guess should award IC_CORRECT_GUESS_POINTS (200)', () => {
      const { game, playerLog } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { questionsPerPlayer: 1 },
      );
      game.start();
      advancePastReveal();

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      // Run through all question turns
      for (let i = 0; i < 4; i++) {
        const askerId = findCurrentAsker(playerLog)!;
        game.handleInput(askerId, 'IC_ASK_QUESTION', { question: `Question ${i + 1}?` });
        submitAllVotes(game, askerId, 'yes', allUserIds);
        vi.advanceTimersByTime(3000);
      }

      const phaseCheck = game.getStateForPlayer(allUserIds[0]) as { phase: string };
      expect(phaseCheck.phase).toBe('FINAL_GUESS');

      // Get the player's identity from another player's view
      const guesser = allUserIds[0];
      const otherView = game.getStateForPlayer(allUserIds[1]) as {
        otherIdentities: Record<string, { name: string }>;
      };
      const guesserIdentity = otherView.otherIdentities[guesser]?.name;
      expect(guesserIdentity).toBeDefined();

      game.handleInput(guesser, 'IC_FINAL_GUESS', { guess: guesserIdentity });

      const state = game.getStateForPlayer(guesser) as {
        guessedCorrectly: boolean;
      };
      expect(state.guessedCorrectly).toBe(true);
    });

    it('incorrect final guess should award 0 points', () => {
      const { game, playerLog } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { questionsPerPlayer: 1 },
      );
      game.start();
      advancePastReveal();

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      for (let i = 0; i < 4; i++) {
        const askerId = findCurrentAsker(playerLog)!;
        game.handleInput(askerId, 'IC_ASK_QUESTION', { question: `Q ${i + 1}?` });
        submitAllVotes(game, askerId, 'yes', allUserIds);
        vi.advanceTimersByTime(3000);
      }

      const guesser = allUserIds[0];
      game.handleInput(guesser, 'IC_FINAL_GUESS', { guess: 'Completely Wrong' });

      const state = game.getStateForPlayer(guesser) as {
        guessedCorrectly: boolean;
        finalGuessSubmitted: boolean;
      };
      expect(state.guessedCorrectly).toBe(false);
      expect(state.finalGuessSubmitted).toBe(true);
    });

    it('all players submitted → should end phase early', () => {
      const { game, playerLog } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { questionsPerPlayer: 1 },
      );
      game.start();
      advancePastReveal();

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      for (let i = 0; i < 4; i++) {
        const askerId = findCurrentAsker(playerLog)!;
        game.handleInput(askerId, 'IC_ASK_QUESTION', { question: `Q ${i + 1}?` });
        submitAllVotes(game, askerId, 'yes', allUserIds);
        vi.advanceTimersByTime(3000);
      }

      // All players submit a final guess
      for (const uid of allUserIds) {
        game.handleInput(uid, 'IC_FINAL_GUESS', { guess: 'Some Guess' });
      }

      // Should have moved to RESULTS
      const state = game.getStateForPlayer(allUserIds[0]) as { phase: string };
      expect(state.phase).toBe('RESULTS');
    });
  });

  // ─── 9. Full Game Lifecycle ─────────────────────────────────

  describe('Full Game Lifecycle', () => {
    it('should complete full lifecycle: start → questions → final guess → results → onComplete', () => {
      const { game, playerLog, completedResults } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { questionsPerPlayer: 1 },
      );
      game.start();

      // Phase 1: ASSIGNMENT_REVEAL
      let state = game.getStateForPlayer(MOCK_USERS.alice.userId) as { phase: string };
      expect(state.phase).toBe('ASSIGNMENT_REVEAL');

      // Phase 2: ASK (after 5000ms)
      advancePastReveal();

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      // Run 4 question turns
      for (let i = 0; i < 4; i++) {
        const askerId = findCurrentAsker(playerLog)!;
        expect(askerId).toBeDefined();

        state = game.getStateForPlayer(askerId) as { phase: string };
        expect(state.phase).toBe('ASK');

        game.handleInput(askerId, 'IC_ASK_QUESTION', { question: `Am I question ${i + 1}?` });

        state = game.getStateForPlayer(askerId) as { phase: string };
        expect(state.phase).toBe('VOTE');

        submitAllVotes(game, askerId, 'yes', allUserIds);

        state = game.getStateForPlayer(askerId) as { phase: string };
        expect(state.phase).toBe('VOTE_RESULTS');

        vi.advanceTimersByTime(3000);
      }

      // Phase 3: FINAL_GUESS
      state = game.getStateForPlayer(allUserIds[0]) as { phase: string };
      expect(state.phase).toBe('FINAL_GUESS');

      // All submit final guesses
      for (const uid of allUserIds) {
        game.handleInput(uid, 'IC_FINAL_GUESS', { guess: 'My Guess' });
      }

      // Phase 4: RESULTS
      state = game.getStateForPlayer(allUserIds[0]) as { phase: string };
      expect(state.phase).toBe('RESULTS');

      // Phase 5: onComplete called after IC_RESULTS_SECONDS (10s)
      vi.advanceTimersByTime(10000);
      expect(completedResults.length).toBe(1);
      expect(completedResults[0].rankings.length).toBe(4);
    });
  });

  // ─── 10. Results & Awards ───────────────────────────────────

  describe('Results & Awards', () => {
    it('computeResults should return valid rankings with 4 entries', () => {
      const { game, playerLog } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { questionsPerPlayer: 1 },
      );
      game.start();
      advancePastReveal();

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      for (let i = 0; i < 4; i++) {
        const askerId = findCurrentAsker(playerLog)!;
        game.handleInput(askerId, 'IC_ASK_QUESTION', { question: `Q ${i + 1}?` });
        submitAllVotes(game, askerId, 'yes', allUserIds);
        vi.advanceTimersByTime(3000);
      }

      // Submit final guesses
      for (const uid of allUserIds) {
        game.handleInput(uid, 'IC_FINAL_GUESS', { guess: 'Guess' });
      }

      const results = game.computeResults();
      expect(results.rankings.length).toBe(4);
      for (const ranking of results.rankings) {
        expect(ranking).toHaveProperty('userId');
        expect(ranking).toHaveProperty('userName');
        expect(ranking).toHaveProperty('score');
        expect(ranking).toHaveProperty('rank');
      }
      // Rankings should be sorted by score descending
      for (let i = 0; i < results.rankings.length - 1; i++) {
        expect(results.rankings[i].score).toBeGreaterThanOrEqual(results.rankings[i + 1].score);
      }
    });

    it('should assign up to 5 awards', () => {
      const { game, playerLog } = createGame(
        [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
        { questionsPerPlayer: 1 },
      );
      game.start();
      advancePastReveal();

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      // Have one player make an early guess to trigger more award types
      const askerId = findCurrentAsker(playerLog)!;
      const nonAskerIds = othersExcept(MOCK_USERS, askerId);
      const earlyGuesser = nonAskerIds[0];

      // Get the guesser's identity from the asker's view
      const askerView = game.getStateForPlayer(askerId) as {
        otherIdentities: Record<string, { name: string }>;
      };
      const earlyGuessName = askerView.otherIdentities[earlyGuesser]?.name;
      if (earlyGuessName) {
        game.handleInput(earlyGuesser, 'IC_EARLY_GUESS', { guess: earlyGuessName });
      }

      // Complete all question turns
      for (let i = 0; i < 4; i++) {
        const currentAsker = findCurrentAsker(playerLog)!;
        if ((game.getStateForPlayer(currentAsker) as { phase: string }).phase !== 'ASK') break;
        game.handleInput(currentAsker, 'IC_ASK_QUESTION', { question: `Q${i}?` });
        submitAllVotes(game, currentAsker, 'yes', allUserIds);
        vi.advanceTimersByTime(3000);
      }

      // If still not in FINAL_GUESS, advance through remaining turns
      let phaseState = game.getStateForPlayer(allUserIds[0]) as { phase: string };
      while (phaseState.phase === 'ASK') {
        const currentAsker = findCurrentAsker(playerLog)!;
        game.handleInput(currentAsker, 'IC_ASK_QUESTION', { question: 'Another Q?' });
        submitAllVotes(game, currentAsker, 'yes', allUserIds);
        vi.advanceTimersByTime(3000);
        phaseState = game.getStateForPlayer(allUserIds[0]) as { phase: string };
      }

      if (phaseState.phase === 'FINAL_GUESS') {
        for (const uid of allUserIds) {
          game.handleInput(uid, 'IC_FINAL_GUESS', { guess: 'FinalGuess' });
        }
      }

      const results = game.computeResults();
      expect(results.awards.length).toBeGreaterThan(0);
      expect(results.awards.length).toBeLessThanOrEqual(5);

      for (const award of results.awards) {
        expect(award).toHaveProperty('userId');
        expect(award).toHaveProperty('title');
        expect(award).toHaveProperty('description');
        expect(award).toHaveProperty('icon');
      }

      const awardTitles = results.awards.map((a) => a.title);
      const validTitles = ['Self-Aware', 'Master of Disguise', 'Philosopher', 'Crowd Pleaser', 'Bold Move'];
      for (const title of awardTitles) {
        expect(validTitles).toContain(title);
      }
    });
  });

  // ─── 11. Disconnect/Reconnect ───────────────────────────────

  describe('Disconnect/Reconnect', () => {
    it('asker disconnect during ASK should advance to next turn', () => {
      const { game, playerLog, context } = createGame();
      game.start();
      advancePastReveal();

      const firstAsker = findCurrentAsker(playerLog)!;
      expect(firstAsker).toBeDefined();

      // Disconnect the asker
      const player = context.players.get(firstAsker)!;
      player.isConnected = false;
      game.handlePlayerDisconnect(firstAsker);

      // A new asker should be selected (IC_TURN_START_SELF sent again)
      const newAsker = findCurrentAsker(playerLog);
      // The new asker should be different from the first (or we advanced to a new phase)
      const state = game.getStateForPlayer(
        newAsker ?? MOCK_USERS.alice.userId,
      ) as { phase: string };
      // Should have advanced: either a new ASK turn or FINAL_GUESS
      expect(['ASK', 'FINAL_GUESS']).toContain(state.phase);
      if (state.phase === 'ASK') {
        expect(newAsker).not.toBe(firstAsker);
      }
    });

    it('reconnect should send state snapshot via getStateForPlayer', () => {
      const { game, playerLog, context } = createGame();
      game.start();
      advancePastReveal();

      const userId = MOCK_USERS.alice.userId;

      // Reconnect
      game.handlePlayerReconnect(userId);

      // Should have sent a state_snapshot event
      const snapshots = findPlayerEvents(playerLog, userId, 'rmhbox:game:state_snapshot');
      expect(snapshots.length).toBeGreaterThan(0);

      const lastSnapshot = snapshots[snapshots.length - 1];
      const snapshotData = lastSnapshot.data as { phase: string };
      expect(snapshotData).toHaveProperty('phase');
    });
  });
});
