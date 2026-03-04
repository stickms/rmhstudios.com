/**
 * RMHbox — Fact or Friction Minigame Server Handler
 *
 * Players are shown trivia questions and must answer before a
 * draining pot reaches its minimum. Correct answers award points
 * equal to the pot value at the time of submission (scaled by
 * difficulty multiplier); incorrect answers subtract the same
 * amount. Passing yields 0 points.
 *
 * Phases per question:
 *   QUESTION_REVEAL → ANSWER → ANSWER_REVEAL → PAUSE → (next question or end)
 *
 * Join-in-progress policy: queue — late joiners are queued and
 * participate starting from the next question.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §6.1.6
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { loadQuestions, selectQuestionsForGame } from '@/lib/rmhbox/fact-or-friction/question-loader';
import { SubmitAnswerSchema, PassQuestionSchema } from '@/lib/rmhbox/fact-or-friction/schemas';
import type { TriviaQuestion } from '@/lib/rmhbox/fact-or-friction/schemas';
import {
  FF_TOTAL_QUESTIONS,
  FF_QUESTION_REVEAL_SECONDS,
  FF_ANSWER_DURATION_SECONDS,
  FF_ANSWER_REVEAL_SECONDS,
  FF_PAUSE_SECONDS,
  FF_POT_START_VALUE,
  FF_POT_TICK_VALUE,
  FF_POT_TICK_INTERVAL_MS,
  FF_POT_MIN_VALUE,
  FF_EASY_MULTIPLIER,
  FF_MEDIUM_MULTIPLIER,
  FF_HARD_MULTIPLIER,
  FF_SCORE_FLOOR,
  FF_SPEED_BONUS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  FFPhase,
  PlayerAnswer,
  QuestionResult,
  FactOrFrictionState,
  FFPlayerQuestionResult,
  GameLogAction,
} from './types';

// ─── Difficulty Multiplier Map ───────────────────────────────────

const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  easy: FF_EASY_MULTIPLIER,
  medium: FF_MEDIUM_MULTIPLIER,
  hard: FF_HARD_MULTIPLIER,
};

// ─── Fact or Friction Minigame ───────────────────────────────────

export class FactOrFrictionGame extends BaseMinigame {
  private questionPool: TriviaQuestion[];
  private usedQuestionIndices: Set<number> = new Set();
  private state!: FactOrFrictionState;
  private startedAt: number = 0;
  private potInterval: ReturnType<typeof globalThis.setInterval> | null = null;
  private actionLog: GameLogAction[] = [];
  private jipQueue: Set<string> = new Set();
  /** Handle for the current phase-transition timeout; cancelled on early transitions. */
  private phaseTransitionHandle: NodeJS.Timeout | null = null;

  constructor(context: MinigameContext) {
    super(context);
    this.questionPool = loadQuestions();
  }

  /**
   * Spectator mode: shared-privileged — all spectators see the same
   * omniscient state (correct answer is masked during the answer phase,
   * matching the player experience).
   */
  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  // ─── Available Points ─────────────────────────────────────────

  /** Compute the effective points available for the current question (pot × difficulty multiplier). */
  private getAvailablePoints(): number {
    const question = this.state.questions[this.state.currentQuestionIndex];
    const multiplier = question
      ? (DIFFICULTY_MULTIPLIERS[question.difficulty] ?? FF_MEDIUM_MULTIPLIER)
      : FF_MEDIUM_MULTIPLIER;
    return Math.floor(this.state.potValue * multiplier);
  }

  /** Compute the max available points for the current question (potStartValue × difficulty multiplier). */
  private getMaxAvailablePoints(): number {
    const question = this.state.questions[this.state.currentQuestionIndex];
    const potStart = this.getSetting('potStartValue', FF_POT_START_VALUE);
    const multiplier = question
      ? (DIFFICULTY_MULTIPLIERS[question.difficulty] ?? FF_MEDIUM_MULTIPLIER)
      : FF_MEDIUM_MULTIPLIER;
    return Math.floor(potStart * multiplier);
  }

  // ─── Phase Transition Scheduling ──────────────────────────────

  /**
   * Schedule a phase transition callback, cancelling any pending one first.
   * This prevents zombie timers from firing after early phase transitions
   * (e.g. when all players answer before the timer expires).
   */
  private schedulePhaseTransition(callback: () => void, delayMs: number): void {
    this.clearTrackedTimeout(this.phaseTransitionHandle);
    this.phaseTransitionHandle = this.setTimeout(callback, delayMs);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const totalQuestions = this.getSetting('totalQuestions', FF_TOTAL_QUESTIONS);
    const questions = selectQuestionsForGame(this.questionPool, this.usedQuestionIndices);
    const selected = questions.slice(0, totalQuestions);
    for (const q of selected) {
      this.usedQuestionIndices.add(q.poolIndex);
    }

    const playerScores = new Map<string, number>();
    for (const userId of this.context.players.keys()) {
      playerScores.set(userId, 0);
    }

    this.state = {
      questions: selected,
      currentQuestionIndex: -1,
      totalQuestions: selected.length,
      phase: 'QUESTION_REVEAL' as FFPhase,
      potValue: this.getSetting('potStartValue', FF_POT_START_VALUE),
      potStartedAt: 0,
      playerAnswers: new Map(),
      playerScores,
      questionHistory: [],
      phaseStartedAt: Date.now(),
      phaseEndsAt: 0,
    };

    logger.info({
      event: 'fact_or_friction:start',
      lobbyId: this.context.lobbyId,
      totalQuestions: selected.length,
      playerCount: this.context.players.size,
    });

    this.startNextQuestion();
  }

  // ─── Question Flow ──────────────────────────────────────────

  private startNextQuestion(): void {
    if (!this.isRunning) return;

    this.state.currentQuestionIndex++;
    this.state.playerAnswers = new Map();
    this.state.potValue = this.getSetting('potStartValue', FF_POT_START_VALUE);
    this.state.potStartedAt = 0;

    const question = this.state.questions[this.state.currentQuestionIndex];
    if (!question) {
      this.endGame();
      return;
    }

    this.state.phase = 'QUESTION_REVEAL';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + FF_QUESTION_REVEAL_SECONDS * 1000;

    this.broadcastRound(this.state.currentQuestionIndex + 1, this.state.totalQuestions);

    this.logAction('question_start', {
      questionIndex: this.state.currentQuestionIndex,
      questionText: question.question,
      options: question.options,
      correctIndex: question.correctIndex,
      difficulty: question.difficulty,
      category: question.category,
    });

    logger.info({
      event: 'fact_or_friction:question_reveal',
      lobbyId: this.context.lobbyId,
      questionIndex: this.state.currentQuestionIndex,
      difficulty: question.difficulty,
    });

    // Broadcast question WITHOUT correctIndex; include potStartValue so
    // the client can set the pot display max (may differ from default if
    // the host configured a custom setting).
    this.broadcastGameAction({
      type: 'FF_QUESTION',
      questionIndex: this.state.currentQuestionIndex,
      totalQuestions: this.state.totalQuestions,
      question: {
        question: question.question,
        options: question.options,
        category: question.category,
        difficulty: question.difficulty,
        source: question.source,
      },
      potStartValue: this.state.potValue,
      availablePoints: this.getAvailablePoints(),
      maxAvailablePoints: this.getMaxAvailablePoints(),
      duration: FF_QUESTION_REVEAL_SECONDS,
    });

    this.startPhaseTimer(FF_QUESTION_REVEAL_SECONDS);

    this.schedulePhaseTransition(() => this.startAnswerPhase(), FF_QUESTION_REVEAL_SECONDS * 1000);
  }

  private startAnswerPhase(): void {
    if (!this.isRunning) return;

    const answerDuration = this.getSetting('answerDuration', FF_ANSWER_DURATION_SECONDS);
    this.state.phase = 'ANSWER';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + answerDuration * 1000;
    this.state.potStartedAt = now;

    logger.info({
      event: 'fact_or_friction:answer_phase_start',
      lobbyId: this.context.lobbyId,
      questionIndex: this.state.currentQuestionIndex,
      duration: answerDuration,
      potValue: this.state.potValue,
    });

    this.broadcastGameAction({
      type: 'FF_ANSWER_PHASE',
      duration: answerDuration,
      potValue: this.state.potValue,
      availablePoints: this.getAvailablePoints(),
      maxAvailablePoints: this.getMaxAvailablePoints(),
    });

    this.startPhaseTimer(answerDuration);

    // Pot drain interval — use broadcastGameAction for consistency
    this.potInterval = this.setInterval(() => {
      if (this.state.phase !== 'ANSWER') return;
      this.state.potValue = Math.max(
        this.state.potValue - FF_POT_TICK_VALUE,
        FF_POT_MIN_VALUE,
      );
      this.broadcastGameAction({
        type: 'FF_POT_TICK',
        potValue: this.state.potValue,
        availablePoints: this.getAvailablePoints(),
      });
    }, FF_POT_TICK_INTERVAL_MS);

    this.schedulePhaseTransition(() => this.endAnswerPhase(), answerDuration * 1000);
  }

  private endAnswerPhase(): void {
    if (!this.isRunning) return;
    // Phase guard: prevent re-entry from zombie timers
    if (this.state.phase !== 'ANSWER') return;

    // Cancel any pending phase transition (e.g. the answer-phase timeout)
    this.clearTrackedTimeout(this.phaseTransitionHandle);
    this.phaseTransitionHandle = null;

    this.clearPhaseTimer();
    this.stopPotInterval();

    const question = this.state.questions[this.state.currentQuestionIndex];

    // Handle unanswered players as timed-out pass
    for (const userId of this.context.players.keys()) {
      if (!this.state.playerAnswers.has(userId) && !this.jipQueue.has(userId)) {
        const passAnswer: PlayerAnswer = {
          userId,
          selectedIndex: null,
          potValueAtSubmission: this.state.potValue,
          submittedAt: Date.now(),
          isCorrect: false,
          scoreChange: 0,
          speedBonus: 0,
          timedOut: true,
        };
        this.state.playerAnswers.set(userId, passAnswer);

        this.logAction('player_pass', {
          questionIndex: this.state.currentQuestionIndex,
          userId,
          reason: 'timeout',
        });
      }
    }

    const questionResult = this.computeQuestionResult();
    this.state.questionHistory.push(questionResult);

    this.state.phase = 'ANSWER_REVEAL';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + FF_ANSWER_REVEAL_SECONDS * 1000;

    // Build player results with correctIndex included
    const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[question.difficulty] ?? FF_MEDIUM_MULTIPLIER;
    const playerResults: FFPlayerQuestionResult[] = [];
    for (const [userId, answer] of this.state.playerAnswers) {
      const player = this.context.players.get(userId);
      const basePoints = answer.isCorrect
        ? Math.floor(answer.potValueAtSubmission * difficultyMultiplier)
        : answer.selectedIndex !== null
          ? -Math.floor(answer.potValueAtSubmission * difficultyMultiplier)
          : 0;
      playerResults.push({
        userId,
        userName: player?.userName ?? 'Unknown',
        selectedIndex: answer.selectedIndex,
        selectedAnswer: answer.selectedIndex !== null ? question.options[answer.selectedIndex] : null,
        isCorrect: answer.isCorrect,
        potValueAtSubmission: answer.potValueAtSubmission,
        scoreChange: answer.scoreChange,
        basePoints,
        difficultyMultiplier,
        speedBonus: answer.speedBonus,
        newTotalScore: this.state.playerScores.get(userId) ?? 0,
        isFirst: answer.userId === questionResult.fastestCorrectUserId,
        passed: answer.selectedIndex === null && !answer.timedOut,
        timedOut: answer.timedOut,
      });
    }

    // Log answer_reveal with per-player results for history display
    this.logAction('answer_reveal', {
      questionIndex: this.state.currentQuestionIndex,
      correctIndex: question.correctIndex,
      correctCount: questionResult.correctCount,
      incorrectCount: questionResult.incorrectCount,
      passCount: questionResult.passCount,
      fastestCorrectUserId: questionResult.fastestCorrectUserId,
      playerResults: Array.from(this.state.playerAnswers.values()).map((answer) => ({
        userId: answer.userId,
        selectedIndex: answer.selectedIndex,
        isCorrect: answer.isCorrect,
        scoreChange: answer.scoreChange,
        isFirst: answer.userId === questionResult.fastestCorrectUserId,
        passed: answer.selectedIndex === null && !answer.timedOut,
        timedOut: answer.timedOut,
      })),
    });

    logger.info({
      event: 'fact_or_friction:answer_reveal',
      lobbyId: this.context.lobbyId,
      questionIndex: this.state.currentQuestionIndex,
      correctIndex: question.correctIndex,
      correctCount: questionResult.correctCount,
      incorrectCount: questionResult.incorrectCount,
      passCount: questionResult.passCount,
    });

    this.broadcastGameAction({
      type: 'FF_ANSWER_REVEAL',
      questionIndex: this.state.currentQuestionIndex,
      correctIndex: question.correctIndex,
      playerResults,
      duration: FF_ANSWER_REVEAL_SECONDS,
    });

    // Broadcast updated scores
    const scores: Record<string, number> = {};
    for (const [userId, score] of this.state.playerScores) {
      scores[userId] = score;
    }
    this.broadcastGameAction({
      type: 'FF_SCORE_UPDATE',
      scores,
    });

    this.startPhaseTimer(FF_ANSWER_REVEAL_SECONDS);

    this.schedulePhaseTransition(() => this.startPause(), FF_ANSWER_REVEAL_SECONDS * 1000);
  }

  private startPause(): void {
    if (!this.isRunning) return;

    this.clearPhaseTimer();

    // Promote JIP players
    for (const userId of this.jipQueue) {
      if (!this.state.playerScores.has(userId)) {
        this.state.playerScores.set(userId, 0);
      }
      logger.info({
        event: 'fact_or_friction:jip_promoted',
        lobbyId: this.context.lobbyId,
        userId,
        atQuestion: this.state.currentQuestionIndex + 1,
      });
    }
    this.jipQueue.clear();

    this.state.phase = 'PAUSE';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + FF_PAUSE_SECONDS * 1000;

    logger.info({
      event: 'fact_or_friction:pause',
      lobbyId: this.context.lobbyId,
      questionIndex: this.state.currentQuestionIndex,
    });

    this.startPhaseTimer(FF_PAUSE_SECONDS);

    this.schedulePhaseTransition(() => {
      if (this.state.currentQuestionIndex + 1 >= this.state.totalQuestions) {
        this.endGame();
      } else {
        this.startNextQuestion();
      }
    }, FF_PAUSE_SECONDS * 1000);
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (action === 'SUBMIT_ANSWER') {
      this.handleSubmitAnswer(userId, data);
    } else if (action === 'PASS_QUESTION') {
      this.handlePassQuestion(userId, data);
    }
  }

  private handleSubmitAnswer(userId: string, data: unknown): void {
    if (this.state.phase !== 'ANSWER') {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    const parsed = SubmitAnswerSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    if (this.state.playerAnswers.has(userId)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'already_answered',
      });
      return;
    }

    if (!this.state.playerScores.has(userId)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'not_participant',
      });
      return;
    }

    const { selectedIndex } = parsed.data;
    const question = this.state.questions[this.state.currentQuestionIndex];
    const isCorrect = selectedIndex === question.correctIndex;

    const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[question.difficulty] ?? FF_MEDIUM_MULTIPLIER;
    const effectivePot = Math.floor(this.state.potValue * difficultyMultiplier);

    // Speed bonus: first correct answer for this question gets +FF_SPEED_BONUS
    let speedBonus = 0;
    if (isCorrect) {
      const hasExistingCorrectAnswer = Array.from(this.state.playerAnswers.values()).some((a) => a.isCorrect);
      if (!hasExistingCorrectAnswer) {
        speedBonus = FF_SPEED_BONUS;
      }
    }

    const currentScore = this.state.playerScores.get(userId) ?? 0;
    let scoreChange = isCorrect ? effectivePot + speedBonus : -effectivePot;

    // Apply score floor
    const enableScoreFloor = this.getSetting('enableScoreFloor', true);
    if (enableScoreFloor) {
      const newScore = currentScore + scoreChange;
      if (newScore < FF_SCORE_FLOOR) {
        scoreChange = FF_SCORE_FLOOR - currentScore;
      }
    }

    this.state.playerScores.set(userId, currentScore + scoreChange);

    const answer: PlayerAnswer = {
      userId,
      selectedIndex,
      potValueAtSubmission: this.state.potValue,
      submittedAt: Date.now(),
      isCorrect,
      scoreChange,
      speedBonus,
      timedOut: false,
    };
    this.state.playerAnswers.set(userId, answer);

    this.logAction('player_answer', {
      questionIndex: this.state.currentQuestionIndex,
      userId,
      selectedIndex,
      isCorrect,
      potValue: this.state.potValue,
      effectivePot,
      speedBonus,
      scoreChange,
    });

    // Notify the answering player only
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'FF_ANSWER_LOCKED',
      selectedIndex,
      potValueAtSubmission: this.state.potValue,
    });

    // Broadcast to all that a player has answered (without revealing what)
    this.broadcastGameAction({
      type: 'FF_PLAYER_ANSWERED',
      userId,
    });

    // Check if all active players have answered → early end
    const activePlayerCount = this.getActivePlayerCount();
    if (this.state.playerAnswers.size >= activePlayerCount) {
      logger.info({
        event: 'fact_or_friction:all_answered_early',
        lobbyId: this.context.lobbyId,
        questionIndex: this.state.currentQuestionIndex,
      });
      this.endAnswerPhase();
    }
  }

  private handlePassQuestion(userId: string, data: unknown): void {
    if (this.state.phase !== 'ANSWER') {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    const parsed = PassQuestionSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    if (this.state.playerAnswers.has(userId)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'already_answered',
      });
      return;
    }

    if (!this.state.playerScores.has(userId)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'FF_ANSWER_REJECTED',
        reason: 'not_participant',
      });
      return;
    }

    const passAnswer: PlayerAnswer = {
      userId,
      selectedIndex: null,
      potValueAtSubmission: this.state.potValue,
      submittedAt: Date.now(),
      isCorrect: false,
      scoreChange: 0,
      speedBonus: 0,
      timedOut: false,
    };
    this.state.playerAnswers.set(userId, passAnswer);

    this.logAction('player_pass', {
      questionIndex: this.state.currentQuestionIndex,
      userId,
      reason: 'explicit',
    });

    // Notify the passing player
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'FF_ANSWER_LOCKED',
      selectedIndex: null,
      potValueAtSubmission: this.state.potValue,
    });

    // Broadcast to all
    this.broadcastGameAction({
      type: 'FF_PLAYER_ANSWERED',
      userId,
    });

    // Check if all active players have answered
    const activePlayerCount = this.getActivePlayerCount();
    if (this.state.playerAnswers.size >= activePlayerCount) {
      logger.info({
        event: 'fact_or_friction:all_answered_early',
        lobbyId: this.context.lobbyId,
        questionIndex: this.state.currentQuestionIndex,
      });
      this.endAnswerPhase();
    }
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeQuestionResult(): QuestionResult {
    const question = this.state.questions[this.state.currentQuestionIndex];
    const playerAnswers: PlayerAnswer[] = Array.from(this.state.playerAnswers.values());

    let fastestCorrectUserId: string | null = null;
    let fastestTime = Infinity;
    let correctCount = 0;
    let incorrectCount = 0;
    let passCount = 0;

    for (const answer of playerAnswers) {
      if (answer.selectedIndex === null) {
        passCount++;
      } else if (answer.isCorrect) {
        correctCount++;
        if (answer.submittedAt < fastestTime) {
          fastestTime = answer.submittedAt;
          fastestCorrectUserId = answer.userId;
        }
      } else {
        incorrectCount++;
      }
    }

    return {
      questionIndex: this.state.currentQuestionIndex,
      question,
      playerAnswers,
      fastestCorrectUserId,
      correctCount,
      incorrectCount,
      passCount,
    };
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const question = this.state.questions[this.state.currentQuestionIndex];
    const myAnswer = this.state.playerAnswers.get(userId) ?? null;

    const scores: Record<string, number> = {};
    for (const [uid, score] of this.state.playerScores) {
      scores[uid] = score;
    }

    const base = {
      phase: this.state.phase,
      currentQuestionIndex: this.state.currentQuestionIndex,
      totalQuestions: this.state.totalQuestions,
      potValue: this.state.potValue,
      availablePoints: this.getAvailablePoints(),
      maxAvailablePoints: this.getMaxAvailablePoints(),
      scores,
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
      answeredPlayerIds: Array.from(this.state.playerAnswers.keys()),
      myAnswer: myAnswer ? {
        selectedIndex: myAnswer.selectedIndex,
        potValueAtSubmission: myAnswer.potValueAtSubmission,
      } : null,
    };

    if (!question) return base;

    // During ANSWER phase, mask correctIndex
    if (this.state.phase === 'ANSWER' || this.state.phase === 'QUESTION_REVEAL') {
      return {
        ...base,
        question: {
          question: question.question,
          options: question.options,
          category: question.category,
          difficulty: question.difficulty,
          source: question.source,
        },
      };
    }

    // During ANSWER_REVEAL or PAUSE, include correctIndex
    return {
      ...base,
      question: {
        question: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        category: question.category,
        difficulty: question.difficulty,
        source: question.source,
      },
    };
  }

  getStateForSpectator(): unknown {
    // Spectators have no privileged info — same as player view without myAnswer
    const question = this.state.questions[this.state.currentQuestionIndex];

    const scores: Record<string, number> = {};
    for (const [uid, score] of this.state.playerScores) {
      scores[uid] = score;
    }

    const base = {
      phase: this.state.phase,
      currentQuestionIndex: this.state.currentQuestionIndex,
      totalQuestions: this.state.totalQuestions,
      potValue: this.state.potValue,
      availablePoints: this.getAvailablePoints(),
      maxAvailablePoints: this.getMaxAvailablePoints(),
      scores,
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
      answeredPlayerIds: Array.from(this.state.playerAnswers.keys()),
      myAnswer: null,
    };

    if (!question) return base;

    if (this.state.phase === 'ANSWER' || this.state.phase === 'QUESTION_REVEAL') {
      return {
        ...base,
        question: {
          question: question.question,
          options: question.options,
          category: question.category,
          difficulty: question.difficulty,
          source: question.source,
        },
      };
    }

    return {
      ...base,
      question: {
        question: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        category: question.category,
        difficulty: question.difficulty,
        source: question.source,
      },
    };
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(userId: string): void {
    // Queue for next question
    this.jipQueue.add(userId);

    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );

    logger.info({
      event: 'fact_or_friction:player_join_queued',
      lobbyId: this.context.lobbyId,
      userId,
      currentQuestion: this.state.currentQuestionIndex,
    });
  }

  handlePlayerDisconnect(_userId: string): void {
    // No-op — unanswered players treated as pass (scoreChange = 0) at phase end
    logger.info({
      event: 'fact_or_friction:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId: _userId,
      questionIndex: this.state.currentQuestionIndex,
    });
  }

  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForPlayer(userId),
    );

    logger.info({
      event: 'fact_or_friction:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      questionIndex: this.state.currentQuestionIndex,
      phase: this.state.phase,
    });
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        questionHistory: this.state.questionHistory,
        totalQuestions: this.state.totalQuestions,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    for (const userId of this.context.players.keys()) {
      const player = this.context.players.get(userId)!;
      const score = this.state.playerScores.get(userId) ?? 0;

      const deltas: Record<string, number> = {};
      for (const qr of this.state.questionHistory) {
        const pa = qr.playerAnswers.find((a) => a.userId === userId);
        deltas[`question_${qr.questionIndex}`] = pa?.scoreChange ?? 0;
      }

      entries.push({
        userId,
        userName: player.userName,
        score,
        rank: 0,
        deltas,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => { e.rank = i + 1; });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Aggregate per-player stats
    const stats: Record<string, {
      correctCount: number;
      incorrectCount: number;
      passCount: number;
      totalScoreChange: number;
      highestPotSnipe: number;
      comebackDelta: number;
      lowestScore: number;
    }> = {};

    for (const userId of this.context.players.keys()) {
      stats[userId] = {
        correctCount: 0,
        incorrectCount: 0,
        passCount: 0,
        totalScoreChange: 0,
        highestPotSnipe: 0,
        comebackDelta: 0,
        lowestScore: 0,
      };
    }

    // Track running scores for comeback calculation
    const runningScores: Record<string, number> = {};
    const lowestScores: Record<string, number> = {};
    for (const userId of this.context.players.keys()) {
      runningScores[userId] = 0;
      lowestScores[userId] = 0;
    }

    for (const qr of this.state.questionHistory) {
      for (const pa of qr.playerAnswers) {
        if (!stats[pa.userId]) continue;
        const s = stats[pa.userId];

        if (pa.selectedIndex === null) {
          s.passCount++;
        } else if (pa.isCorrect) {
          s.correctCount++;
          if (pa.potValueAtSubmission > s.highestPotSnipe) {
            s.highestPotSnipe = pa.potValueAtSubmission;
          }
        } else {
          s.incorrectCount++;
        }

        s.totalScoreChange += pa.scoreChange;
        runningScores[pa.userId] = (runningScores[pa.userId] ?? 0) + pa.scoreChange;
        if (runningScores[pa.userId] < (lowestScores[pa.userId] ?? 0)) {
          lowestScores[pa.userId] = runningScores[pa.userId];
        }
      }
    }

    // Compute comeback delta (final score - lowest score)
    for (const userId of this.context.players.keys()) {
      if (stats[userId]) {
        const finalScore = this.state.playerScores.get(userId) ?? 0;
        stats[userId].comebackDelta = finalScore - (lowestScores[userId] ?? 0);
        stats[userId].lowestScore = lowestScores[userId] ?? 0;
      }
    }

    // Pot Sniper — answered correctly at highest pot value
    const potSniperEntry = this.findTopPlayer(stats, (s) => s.highestPotSnipe);
    if (potSniperEntry && potSniperEntry.value > 0) {
      awards.push({
        userId: potSniperEntry.userId,
        title: 'Pot Sniper',
        description: `Sniped the pot at ${potSniperEntry.value} points`,
        icon: 'crosshair',
      });
    }

    // Friction Burn — most incorrect answers
    const frictionEntry = this.findTopPlayer(stats, (s) => s.incorrectCount);
    if (frictionEntry && frictionEntry.value > 0) {
      awards.push({
        userId: frictionEntry.userId,
        title: 'Friction Burn',
        description: `Got ${frictionEntry.value} wrong answers`,
        icon: 'flame',
      });
    }

    // Cool Head — most passes (never guessed wrong)
    const coolHeadEntry = this.findTopPlayer(stats, (s) =>
      s.incorrectCount === 0 ? s.passCount : -1,
    );
    if (coolHeadEntry && coolHeadEntry.value > 0) {
      awards.push({
        userId: coolHeadEntry.userId,
        title: 'Cool Head',
        description: `Passed ${coolHeadEntry.value} times without a wrong answer`,
        icon: 'snowflake',
      });
    }

    // Perfect Score — all questions correct, no wrong answers
    for (const [userId, s] of Object.entries(stats)) {
      if (s.correctCount === this.state.totalQuestions && s.incorrectCount === 0 && s.passCount === 0) {
        awards.push({
          userId,
          title: 'Perfect Score',
          description: `Answered all ${this.state.totalQuestions} questions correctly`,
          icon: 'star',
        });
        break;
      }
    }

    // Comeback Kid — biggest recovery from lowest point
    const comebackEntry = this.findTopPlayer(stats, (s) =>
      s.lowestScore < 0 ? s.comebackDelta : -1,
    );
    if (comebackEntry && comebackEntry.value > 0) {
      awards.push({
        userId: comebackEntry.userId,
        title: 'Comeback Kid',
        description: `Recovered ${comebackEntry.value} points from the brink`,
        icon: 'arrow-up-circle',
      });
    }

    return awards;
  }

  private findTopPlayer<T>(
    stats: Record<string, T>,
    getValue: (s: T) => number,
  ): { userId: string; value: number } | null {
    let topUserId: string | null = null;
    let topValue = -1;
    for (const [userId, s] of Object.entries(stats)) {
      const v = getValue(s);
      if (v > topValue) {
        topValue = v;
        topUserId = userId;
      }
    }
    return topUserId ? { userId: topUserId, value: topValue } : null;
  }

  // ─── Game Log ────────────────────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.actionLog.push({
      type,
      payload,
      timestamp: Date.now(),
    });
  }

  private buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      totalQuestions: this.state.totalQuestions,
      questionsPlayed: this.state.currentQuestionIndex + 1,
      playerCount: this.context.players.size,
      players,
      actions: this.actionLog,
      finalResults: Array.from(this.context.players.keys()).map((userId) => ({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        score: this.state.playerScores.get(userId) ?? 0,
      })),
    };
  }

  // ─── End Game ────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'fact_or_friction:game_end',
      lobbyId: this.context.lobbyId,
      questionsPlayed: this.state.currentQuestionIndex + 1,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private stopPotInterval(): void {
    if (this.potInterval) {
      clearInterval(this.potInterval);
      this.intervals = this.intervals.filter((i) => i !== this.potInterval);
      this.potInterval = null;
    }
  }

  private getActivePlayerCount(): number {
    let count = 0;
    for (const userId of this.context.players.keys()) {
      if (this.state.playerScores.has(userId) && !this.jipQueue.has(userId)) {
        count++;
      }
    }
    return count;
  }
}
