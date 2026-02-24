/**
 * Identity Crisis — Zod Validation Schemas
 *
 * Input validation schemas for Identity Crisis game actions.
 * Used server-side to validate player inputs before processing.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §1.5
 */

import { z } from 'zod';
import { IC_MAX_QUESTION_LENGTH, IC_MAX_GUESS_LENGTH } from '../constants';

/** Schema for a player asking a yes/no question about themselves. */
export const ICQuestionSchema = z.object({
  question: z.string().min(3).max(IC_MAX_QUESTION_LENGTH).trim(),
});

/** Schema for a player's vote on the current question. */
export const ICVoteSchema = z.object({
  vote: z.enum(['yes', 'no', 'maybe']),
});

/** Schema for a player's identity guess (early or final). */
export const ICGuessSchema = z.object({
  guess: z.string().min(1).max(IC_MAX_GUESS_LENGTH).trim(),
});

/** Schema for a single identity entry in the identities.json data file. */
export const IdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  hints: z.array(z.string()).max(3).default([]),
});

/** Inferred type for an identity entry. */
export type Identity = z.infer<typeof IdentitySchema>;
