/**
 * RMHbox — Fact or Friction Zod Validation Schemas
 *
 * Validates all client→server payloads and data file entries
 * for the Fact or Friction trivia minigame.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §1.5
 */

import { z } from 'zod';

// ─── Client→Server Input Schemas ────────────────────────────────

/** Validates a player's answer submission (A=0, B=1, C=2, D=3). */
export const SubmitAnswerSchema = z.object({
  selectedIndex: z.number().int().min(0).max(3),
});

/** Validates a player's explicit pass on the current question. */
export const PassQuestionSchema = z.object({});

// ─── Data Validation Schemas ────────────────────────────────────

/** Schema for each trivia question in questions.json. */
export const TriviaQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  category: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  source: z.string().min(1),
});

export type TriviaQuestion = z.infer<typeof TriviaQuestionSchema>;
