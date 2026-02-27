/**
 * RMHbox — Fact or Friction Minigame Types
 *
 * Phase type, interfaces, and type definitions for the Fact or Friction minigame.
 */

import type { TriviaQuestion } from '@/lib/rmhbox/fact-or-friction/schemas';

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
  /** Whether this answer was auto-set because the player didn't answer in time. */
  timedOut: boolean;
}

export interface QuestionResult {
  questionIndex: number;
  question: TriviaQuestion;
  playerAnswers: PlayerAnswer[];
  fastestCorrectUserId: string | null;
  correctCount: number;
  incorrectCount: number;
  passCount: number;
}

export interface FactOrFrictionState {
  questions: TriviaQuestion[];
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
}

export interface GameLogAction {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
