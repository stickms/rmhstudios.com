/**
 * RMHbox — Fact or Friction Minigame Types
 *
 * Phase type, interfaces, and type definitions for the Fact or Friction minigame.
 */

import type { IndexedQuestion } from '@/lib/rmhbox/fact-or-friction/question-loader';

// ─── Phase Type ──────────────────────────────────────────────────

export type FFPhase = 'QUESTION_REVEAL' | 'ANSWER' | 'ANSWER_REVEAL' | 'PAUSE';

// ─── Type Definitions ────────────────────────────────────────────

export interface PlayerAnswer {
  userId: string;
  selectedIndex: number | null;
  potValueAtSubmission: number;
  submittedAt: number;
  isCorrect: boolean;
  scoreChange: number;
  /** Speed bonus awarded (e.g. +100 for first correct answer). */
  speedBonus: number;
  /** Whether this answer was auto-set because the player didn't answer in time. */
  timedOut: boolean;
}

export interface QuestionResult {
  questionIndex: number;
  question: IndexedQuestion;
  playerAnswers: PlayerAnswer[];
  fastestCorrectUserId: string | null;
  correctCount: number;
  incorrectCount: number;
  passCount: number;
}

export interface FactOrFrictionState {
  questions: IndexedQuestion[];
  currentQuestionIndex: number;
  totalQuestions: number;
  phase: FFPhase;
  potValue: number;
  potStartedAt: number;
  playerAnswers: Map<string, PlayerAnswer>;
  playerScores: Map<string, number>;
  questionHistory: QuestionResult[];
  phaseStartedAt: number;
  phaseEndsAt: number;
}

export interface FFPlayerQuestionResult {
  userId: string;
  userName: string;
  selectedIndex: number | null;
  selectedAnswer: string | null;
  isCorrect: boolean;
  potValueAtSubmission: number;
  scoreChange: number;
  /** Speed bonus awarded (e.g. +100 for first correct answer, 0 otherwise). */
  speedBonus: number;
  /** Player's new total score after this question. */
  newTotalScore: number;
  /** Whether this player was the fastest correct answerer. */
  isFirst: boolean;
  /** Whether this player explicitly passed. */
  passed: boolean;
  /** Whether this player timed out. */
  timedOut: boolean;
}

export interface GameLogAction {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
