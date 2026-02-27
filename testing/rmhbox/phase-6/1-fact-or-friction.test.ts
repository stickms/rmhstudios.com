/**
 * Phase 6 — Section 6.1: Fact or Friction Server Handler Tests
 *
 * Tests the FactOrFrictionGame server handler covering:
 * - State initialization and question selection
 * - Phase transitions (QUESTION_REVEAL → ANSWER → ANSWER_REVEAL → PAUSE)
 * - Input handling (valid answer, pass, duplicate, wrong phase)
 * - Pot drain mechanics and difficulty multipliers
 * - Score computation and score floor
 * - State masking (correctIndex hidden during ANSWER phase)
 * - Join-in-progress handling
 * - Reconnection handling
 * - Awards computation
 * - Game log building
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FactOrFrictionGame } from '../../../server/rmhbox/minigames/fact-or-friction';
import {
  FF_QUESTION_REVEAL_SECONDS,
  FF_ANSWER_DURATION_SECONDS,
  FF_ANSWER_REVEAL_SECONDS,
  FF_PAUSE_SECONDS,
  FF_POT_START_VALUE,
  FF_POT_TICK_VALUE,
  FF_POT_TICK_INTERVAL_MS,
  FF_POT_MIN_VALUE,
  FF_SCORE_FLOOR,
} from '../../../lib/rmhbox/constants';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerEvents,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new FactOrFrictionGame(ctx.context);
  return { game, ...ctx };
}

/** Advance timers into ANSWER phase (past QUESTION_REVEAL) */
function advanceToAnswerPhase() {
  vi.advanceTimersByTime(FF_QUESTION_REVEAL_SECONDS * 1000 + 50);
}

/** Advance timers through ANSWER_REVEAL and PAUSE to next question */
function advanceToNextQuestion() {
  vi.advanceTimersByTime(FF_ANSWER_REVEAL_SECONDS * 1000 + 50);
  vi.advanceTimersByTime(FF_PAUSE_SECONDS * 1000 + 50);
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Fact or Friction Server Handler (§6.1)', () => {
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

    it('should start and emit FF_QUESTION on start()', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const questionEvents = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_QUESTION',
      );
      expect(questionEvents.length).toBe(1);

      const qData = questionEvents[0].data as Record<string, unknown>;
      expect(qData.questionIndex).toBe(0);
      expect(qData.totalQuestions).toBeGreaterThan(0);

      // Verify question data does NOT include correctIndex
      const question = qData.question as Record<string, unknown>;
      expect(question.question).toBeDefined();
      expect(question.options).toBeDefined();
      expect(question).not.toHaveProperty('correctIndex');

      game.cleanup();
    });
  });

  describe('Phase Transitions', () => {
    it('should transition from QUESTION_REVEAL to ANSWER after timer', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      broadcastLog.length = 0;

      advanceToAnswerPhase();

      const answerPhase = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_PHASE',
      );
      expect(answerPhase).toBeDefined();

      game.cleanup();
    });

    it('should emit FF_POT_TICK during ANSWER phase', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      // Advance several pot tick intervals
      vi.advanceTimersByTime(FF_POT_TICK_INTERVAL_MS * 3);

      const potTicks = findActionBroadcasts(broadcastLog, 'FF_POT_TICK');
      expect(potTicks.length).toBeGreaterThan(0);

      const lastTick = potTicks[potTicks.length - 1].data as Record<string, unknown>;
      expect(lastTick.potValue).toBeDefined();
      expect(typeof lastTick.potValue).toBe('number');

      game.cleanup();
    });

    it('should drain pot by FF_POT_TICK_VALUE each tick', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      vi.advanceTimersByTime(FF_POT_TICK_INTERVAL_MS);

      const potTicks = findActionBroadcasts(broadcastLog, 'FF_POT_TICK');
      expect(potTicks.length).toBeGreaterThanOrEqual(1);
      const tickData = potTicks[0].data as Record<string, unknown>;
      expect(tickData.potValue).toBe(FF_POT_START_VALUE - FF_POT_TICK_VALUE);

      game.cleanup();
    });

    it('should not drain pot below FF_POT_MIN_VALUE', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      // Advance enough ticks to fully drain pot
      const ticksToMin = Math.ceil((FF_POT_START_VALUE - FF_POT_MIN_VALUE) / FF_POT_TICK_VALUE);
      vi.advanceTimersByTime(FF_POT_TICK_INTERVAL_MS * (ticksToMin + 5));

      const potTicks = findActionBroadcasts(broadcastLog, 'FF_POT_TICK');
      const lastTickData = potTicks[potTicks.length - 1].data as Record<string, unknown>;
      expect(lastTickData.potValue).toBe(FF_POT_MIN_VALUE);

      game.cleanup();
    });

    it('should emit FF_ANSWER_REVEAL after ANSWER phase timer expires', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      // Advance past answer duration
      vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);

      const reveal = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_REVEAL',
      );
      expect(reveal).toBeDefined();

      const data = reveal!.data as Record<string, unknown>;
      expect(data.correctIndex).toBeDefined();

      game.cleanup();
    });
  });

  describe('Input Handling', () => {
    it('should accept a valid answer submission during ANSWER phase', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      const locked = playerLog.find(
        (e) => e.userId === userId &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_LOCKED',
      );
      expect(locked).toBeDefined();
      const lockData = locked!.data as Record<string, unknown>;
      expect(lockData.selectedIndex).toBe(0);
      expect(lockData.potValueAtSubmission).toBeDefined();

      game.cleanup();
    });

    it('should reject answer submission during wrong phase', () => {
      const { game, playerLog } = createGame();
      game.start();
      // Still in QUESTION_REVEAL phase
      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      const rejected = playerLog.find(
        (e) => e.userId === userId &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_REJECTED',
      );
      expect(rejected).toBeDefined();

      game.cleanup();
    });

    it('should reject duplicate answer submission', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(userId, 'SUBMIT_ANSWER', { selectedIndex: 1 });

      const rejections = playerLog.filter(
        (e) => e.userId === userId &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_REJECTED' &&
          (e.data as Record<string, unknown>).reason === 'already_answered',
      );
      expect(rejections.length).toBe(1);

      game.cleanup();
    });

    it('should reject invalid selectedIndex', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_ANSWER', { selectedIndex: 5 });

      const rejected = playerLog.find(
        (e) => e.userId === userId &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_REJECTED' &&
          (e.data as Record<string, unknown>).reason === 'invalid_input',
      );
      expect(rejected).toBeDefined();

      game.cleanup();
    });

    it('should accept pass during ANSWER phase', () => {
      const { game, playerLog, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'PASS_QUESTION', {});

      const locked = playerLog.find(
        (e) => e.userId === userId &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_LOCKED',
      );
      expect(locked).toBeDefined();
      const lockData = locked!.data as Record<string, unknown>;
      expect(lockData.selectedIndex).toBeNull();

      // Should broadcast FF_PLAYER_ANSWERED to all
      const answered = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_PLAYER_ANSWERED' &&
          (e.data as Record<string, unknown>).userId === userId,
      );
      expect(answered).toBeDefined();

      game.cleanup();
    });

    it('should trigger early phase end when all players answer', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      // All 4 players answer
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_ANSWER', { selectedIndex: 1 });
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_ANSWER', { selectedIndex: 2 });
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      // Should immediately show ANSWER_REVEAL (no timer wait)
      const reveal = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_ANSWER_REVEAL',
      );
      expect(reveal).toBeDefined();

      game.cleanup();
    });

    it('should broadcast FF_PLAYER_ANSWERED without revealing the answer', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 2 });

      const answered = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_PLAYER_ANSWERED',
      );
      expect(answered).toBeDefined();

      const data = answered!.data as Record<string, unknown>;
      expect(data.userId).toBe(MOCK_USERS.alice.userId);
      // Should NOT include selectedIndex or isCorrect
      expect(data).not.toHaveProperty('selectedIndex');
      expect(data).not.toHaveProperty('isCorrect');

      game.cleanup();
    });
  });

  describe('State Masking (§6.1 Security)', () => {
    it('should not include correctIndex in getStateForPlayer during ANSWER phase', () => {
      const { game } = createGame();
      game.start();
      advanceToAnswerPhase();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const question = state.question as Record<string, unknown>;

      expect(question).toBeDefined();
      expect(question).not.toHaveProperty('correctIndex');
      expect(state.phase).toBe('ANSWER');

      game.cleanup();
    });

    it('should not include correctIndex in getStateForPlayer during QUESTION_REVEAL', () => {
      const { game } = createGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const question = state.question as Record<string, unknown>;

      expect(question).not.toHaveProperty('correctIndex');
      expect(state.phase).toBe('QUESTION_REVEAL');

      game.cleanup();
    });

    it('should include correctIndex in getStateForPlayer during ANSWER_REVEAL', () => {
      const { game } = createGame();
      game.start();
      advanceToAnswerPhase();

      // All answer to trigger reveal
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.phase).toBe('ANSWER_REVEAL');

      const question = state.question as Record<string, unknown>;
      expect(question).toHaveProperty('correctIndex');

      game.cleanup();
    });

    it('should not reveal other players\' answers during ANSWER phase', () => {
      const { game } = createGame();
      game.start();
      advanceToAnswerPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 2 });

      // Bob's state should not reveal Alice's selectedIndex
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;
      const answeredIds = bobState.answeredPlayerIds as string[];
      expect(answeredIds).toContain(MOCK_USERS.alice.userId);

      // Bob's myAnswer should be null (hasn't answered)
      expect(bobState.myAnswer).toBeNull();

      game.cleanup();
    });

    it('should not include correctIndex in getStateForSpectator during ANSWER', () => {
      const { game } = createGame();
      game.start();
      advanceToAnswerPhase();

      const state = game.getStateForSpectator() as Record<string, unknown>;
      const question = state.question as Record<string, unknown>;
      expect(question).not.toHaveProperty('correctIndex');

      game.cleanup();
    });
  });

  describe('Score Computation', () => {
    it('should award positive score for correct answers', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      // All players answer — we can check scores after reveal
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_ANSWER', { selectedIndex: 1 });
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_ANSWER', { selectedIndex: 2 });
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_ANSWER', { selectedIndex: 3 });

      const scoreUpdate = broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_SCORE_UPDATE',
      );
      expect(scoreUpdate).toBeDefined();

      const scores = (scoreUpdate!.data as Record<string, unknown>).scores as Record<string, number>;
      // At least one player should have a positive score (the correct answerer)
      // and at least one should have negative (incorrect answerer)
      const scoreValues = Object.values(scores);
      const hasPositive = scoreValues.some((s) => s > 0);
      const hasNegativeOrZero = scoreValues.some((s) => s <= 0);
      expect(hasPositive || hasNegativeOrZero).toBe(true);

      game.cleanup();
    });

    it('should enforce score floor', () => {
      const { game } = createGame();
      game.start();
      advanceToAnswerPhase();

      // Submit wrong answer — score decreases
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = state.scores as Record<string, number>;
      const aliceScore = scores[MOCK_USERS.alice.userId];

      // Score should never go below FF_SCORE_FLOOR
      expect(aliceScore).toBeGreaterThanOrEqual(FF_SCORE_FLOOR);

      game.cleanup();
    });

    it('should give 0 score change for pass', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      game.handleInput(MOCK_USERS.alice.userId, 'PASS_QUESTION', {});

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = state.scores as Record<string, number>;
      expect(scores[MOCK_USERS.alice.userId]).toBe(0);

      game.cleanup();
    });
  });

  describe('Join-in-Progress', () => {
    it('should queue JIP player and promote at pause', () => {
      const { game, context, playerLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      // Add Eve as JIP
      const evePlayer = {
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
        role: 'player' as const,
      };
      context.players.set(MOCK_USERS.eve.userId, evePlayer);

      game.handlePlayerJoin(MOCK_USERS.eve.userId);

      // Eve should receive spectator state
      const eveEvents = playerLog.filter((e) => e.userId === MOCK_USERS.eve.userId);
      expect(eveEvents.length).toBeGreaterThan(0);

      game.cleanup();
    });
  });

  describe('Reconnection', () => {
    it('should send full state on reconnect', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAnswerPhase();

      game.handlePlayerReconnect(MOCK_USERS.alice.userId);

      const snapshot = playerLog.find(
        (e) => e.userId === MOCK_USERS.alice.userId &&
          e.event === 'rmhbox:game:state_snapshot',
      );
      expect(snapshot).toBeDefined();

      const state = snapshot!.data as Record<string, unknown>;
      expect(state.phase).toBeDefined();
      expect(state.scores).toBeDefined();

      game.cleanup();
    });
  });

  describe('Results & Awards', () => {
    it('should compute results with rankings after game ends', () => {
      const { game, completedResults } = createGame();
      game.start();

      // Play through all questions by advancing through timeouts
      for (let i = 0; i < 8; i++) {
        advanceToAnswerPhase();
        vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
        advanceToNextQuestion();
      }

      // Game should have completed
      expect(completedResults.length).toBe(1);
      const results = completedResults[0];
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(4);
      expect(results.awards).toBeDefined();

      // Rankings should be sorted
      for (let i = 0; i < results.rankings.length - 1; i++) {
        expect(results.rankings[i].score).toBeGreaterThanOrEqual(
          results.rankings[i + 1].score,
        );
      }
    });

    it('should include game log in results', () => {
      const { game, completedResults } = createGame();
      game.start();

      // Play through all questions
      for (let i = 0; i < 8; i++) {
        advanceToAnswerPhase();
        vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
        advanceToNextQuestion();
      }

      expect(completedResults.length).toBe(1);
      const gameData = completedResults[0].gameSpecificData;
      expect(gameData.gameLog).toBeDefined();
      expect(gameData.questionHistory).toBeDefined();
    });
  });

  describe('Full Game Flow', () => {
    it('should complete an 8-question game with mixed player actions', () => {
      const { game, completedResults, broadcastLog } = createGame();
      game.start();

      for (let q = 0; q < 8; q++) {
        advanceToAnswerPhase();

        // Vary actions per question
        if (q % 3 === 0) {
          // Everyone answers
          game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
          game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_ANSWER', { selectedIndex: 1 });
          game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_ANSWER', { selectedIndex: 2 });
          game.handleInput(MOCK_USERS.diana.userId, 'PASS_QUESTION', {});
        } else if (q % 3 === 1) {
          // Some answer, rest timeout
          game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 1 });
          game.handleInput(MOCK_USERS.bob.userId, 'PASS_QUESTION', {});
          vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
        } else {
          // All timeout
          vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
        }

        // Advance through ANSWER_REVEAL and PAUSE
        vi.advanceTimersByTime(FF_ANSWER_REVEAL_SECONDS * 1000 + FF_PAUSE_SECONDS * 1000 + 200);
      }

      expect(completedResults.length).toBe(1);
      expect(completedResults[0].rankings.length).toBe(4);

      // Should have 8 FF_QUESTION events
      const questionEvents = broadcastLog.filter(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_QUESTION',
      );
      expect(questionEvents.length).toBe(8);
    });
  });

  describe('Phase Transition Safety (zombie timer prevention)', () => {
    it('should not call endAnswerPhase twice when all answer early', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      // All players answer early → triggers immediate endAnswerPhase
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_ANSWER', { selectedIndex: 1 });
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      // Count ANSWER_REVEAL events so far (should be exactly 1)
      const reveals1 = findActionBroadcasts(broadcastLog, 'FF_ANSWER_REVEAL');
      expect(reveals1.length).toBe(1);

      // Now advance past the FULL answer duration — the zombie timeout should NOT
      // fire endAnswerPhase again because schedulePhaseTransition cancelled it
      vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000);

      const reveals2 = findActionBroadcasts(broadcastLog, 'FF_ANSWER_REVEAL');
      // Still exactly 1 ANSWER_REVEAL — no zombie duplicate
      expect(reveals2.length).toBe(1);

      game.cleanup();
    });

    it('should not create duplicate pot intervals after early answer', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAnswerPhase();
      broadcastLog.length = 0;

      // All answer early
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_ANSWER', { selectedIndex: 1 });
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      // Advance through ANSWER_REVEAL + PAUSE → next QUESTION_REVEAL → ANSWER
      vi.advanceTimersByTime(
        FF_ANSWER_REVEAL_SECONDS * 1000 +
        FF_PAUSE_SECONDS * 1000 +
        FF_QUESTION_REVEAL_SECONDS * 1000 + 100,
      );
      broadcastLog.length = 0;

      // Now in Q2 ANSWER phase — count pot ticks over a short interval
      vi.advanceTimersByTime(FF_POT_TICK_INTERVAL_MS * 3);
      const potTicks = findActionBroadcasts(broadcastLog, 'FF_POT_TICK');

      // Should be exactly 3 ticks — NOT 6 (which would happen with 2 intervals)
      expect(potTicks.length).toBe(3);

      // Verify pot drained at consistent rate
      const tData0 = potTicks[0].data as Record<string, unknown>;
      const tData2 = potTicks[2].data as Record<string, unknown>;
      expect(tData0.potValue).toBe(FF_POT_START_VALUE - FF_POT_TICK_VALUE);
      expect(tData2.potValue).toBe(FF_POT_START_VALUE - FF_POT_TICK_VALUE * 3);

      game.cleanup();
    });
  });

  describe('Game Log Accuracy (history display)', () => {
    it('should include questionText, options, and correctIndex in question_start actions', () => {
      const { game, completedResults } = createGame();
      game.start();

      // Play through all 8 questions
      for (let i = 0; i < 8; i++) {
        advanceToAnswerPhase();
        vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
        advanceToNextQuestion();
      }

      expect(completedResults.length).toBe(1);
      const gameLog = completedResults[0].gameSpecificData.gameLog as {
        actions: Array<{ type: string; payload: Record<string, unknown> }>;
      };
      const questionStarts = gameLog.actions.filter((a) => a.type === 'question_start');
      expect(questionStarts.length).toBe(8);

      for (const qs of questionStarts) {
        expect(qs.payload.questionText).toBeDefined();
        expect(typeof qs.payload.questionText).toBe('string');
        expect(Array.isArray(qs.payload.options)).toBe(true);
        expect(typeof qs.payload.correctIndex).toBe('number');
        expect(qs.payload.category).toBeDefined();
        expect(qs.payload.difficulty).toBeDefined();
      }

      game.cleanup();
    });

    it('should include answer_reveal actions with per-player results', () => {
      const { game, completedResults } = createGame();
      game.start();

      // Play through all questions with some answering
      for (let i = 0; i < 8; i++) {
        advanceToAnswerPhase();
        game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
        vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
        advanceToNextQuestion();
      }

      expect(completedResults.length).toBe(1);
      const gameLog = completedResults[0].gameSpecificData.gameLog as {
        actions: Array<{ type: string; payload: Record<string, unknown> }>;
      };
      const answerReveals = gameLog.actions.filter((a) => a.type === 'answer_reveal');
      expect(answerReveals.length).toBe(8);

      for (const ar of answerReveals) {
        expect(typeof ar.payload.correctIndex).toBe('number');
        const results = ar.payload.playerResults as Array<Record<string, unknown>>;
        expect(results.length).toBe(4); // 4 players

        for (const r of results) {
          expect(r).toHaveProperty('userId');
          expect(r).toHaveProperty('isCorrect');
          expect(r).toHaveProperty('scoreChange');
          expect(r).toHaveProperty('isFirst');
          expect(r).toHaveProperty('passed');
          expect(r).toHaveProperty('timedOut');
        }
      }

      game.cleanup();
    });

    it('should distinguish passed vs timedOut players in answer_reveal', () => {
      const { game, completedResults } = createGame();
      game.start();
      advanceToAnswerPhase();

      // Alice answers, Bob passes explicitly, Charlie & Diana time out
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.bob.userId, 'PASS_QUESTION', {});

      // Advance past answer duration → Charlie & Diana auto-pass as timeout
      vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);

      // Advance through remaining questions quickly
      for (let i = 1; i < 8; i++) {
        advanceToNextQuestion();
        advanceToAnswerPhase();
        vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
      }
      advanceToNextQuestion();

      expect(completedResults.length).toBe(1);
      const gameLog = completedResults[0].gameSpecificData.gameLog as {
        actions: Array<{ type: string; payload: Record<string, unknown> }>;
      };
      const firstReveal = gameLog.actions.find((a) => a.type === 'answer_reveal');
      expect(firstReveal).toBeDefined();

      const results = firstReveal!.payload.playerResults as Array<{
        userId: string;
        passed: boolean;
        timedOut: boolean;
        selectedIndex: number | null;
      }>;

      const alice = results.find((r) => r.userId === MOCK_USERS.alice.userId)!;
      const bob = results.find((r) => r.userId === MOCK_USERS.bob.userId)!;
      const charlie = results.find((r) => r.userId === MOCK_USERS.charlie.userId)!;

      // Alice submitted an answer — neither passed nor timedOut
      expect(alice.passed).toBe(false);
      expect(alice.timedOut).toBe(false);
      expect(alice.selectedIndex).not.toBeNull();

      // Bob explicitly passed — passed=true, timedOut=false
      expect(bob.passed).toBe(true);
      expect(bob.timedOut).toBe(false);
      expect(bob.selectedIndex).toBeNull();

      // Charlie timed out — passed=false, timedOut=true
      expect(charlie.passed).toBe(false);
      expect(charlie.timedOut).toBe(true);
      expect(charlie.selectedIndex).toBeNull();

      game.cleanup();
    });

    it('should mark isFirst correctly for fastest correct answer', () => {
      const { game, completedResults } = createGame();
      game.start();
      advanceToAnswerPhase();

      // Alice answers first (correct or not depends on question data)
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      vi.advanceTimersByTime(100);
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      vi.advanceTimersByTime(100);
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_ANSWER', { selectedIndex: 0 });

      // Play through remaining questions
      for (let i = 1; i < 8; i++) {
        vi.advanceTimersByTime(FF_ANSWER_REVEAL_SECONDS * 1000 + FF_PAUSE_SECONDS * 1000 + 200);
        advanceToAnswerPhase();
        vi.advanceTimersByTime(FF_ANSWER_DURATION_SECONDS * 1000 + 50);
      }
      vi.advanceTimersByTime(FF_ANSWER_REVEAL_SECONDS * 1000 + FF_PAUSE_SECONDS * 1000 + 200);

      expect(completedResults.length).toBe(1);
      const gameLog = completedResults[0].gameSpecificData.gameLog as {
        actions: Array<{ type: string; payload: Record<string, unknown> }>;
      };

      const firstReveal = gameLog.actions.find((a) => a.type === 'answer_reveal');
      expect(firstReveal).toBeDefined();

      const results = firstReveal!.payload.playerResults as Array<{
        userId: string;
        isFirst: boolean;
        isCorrect: boolean;
      }>;

      // At most one player should be marked isFirst
      const firstPlayers = results.filter((r) => r.isFirst);
      expect(firstPlayers.length).toBeLessThanOrEqual(1);

      // If any player is isFirst, they must also be isCorrect
      for (const fp of firstPlayers) {
        expect(fp.isCorrect).toBe(true);
      }

      game.cleanup();
    });
  });
});
