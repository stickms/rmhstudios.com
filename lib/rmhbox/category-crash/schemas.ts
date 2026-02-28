/**
 * Category Crash — Zod Validation Schemas
 *
 * Input validation for answer saving, submission, crashing, and uncrashing.
 */

import { z } from 'zod';
import { CC_MAX_ANSWER_LENGTH, CC_CATEGORIES_PER_ROUND } from '../constants';

/** Schema for auto-saving draft answers (debounced). */
export const SaveAnswersSchema = z.object({
  answers: z.array(
    z.union([
      z.string().max(CC_MAX_ANSWER_LENGTH).transform((s) => s.trim()),
      z.null(),
    ]),
  ).length(CC_CATEGORIES_PER_ROUND),
});

/** Schema for final answer submission (locks answers). */
export const SubmitAnswersSchema = z.object({
  answers: z.array(
    z.union([
      z.string().max(CC_MAX_ANSWER_LENGTH).transform((s) => s.trim().toLowerCase()),
      z.null(),
    ]),
  ).length(CC_CATEGORIES_PER_ROUND),
});

/** Schema for crashing another player's answer. */
export const CrashAnswerSchema = z.object({
  targetUserId: z.string().min(1),
  categoryIndex: z.number().int().min(0).max(CC_CATEGORIES_PER_ROUND - 1),
});

/** Schema for removing a crash from another player's answer. */
export const UncrashAnswerSchema = z.object({
  targetUserId: z.string().min(1),
  categoryIndex: z.number().int().min(0).max(CC_CATEGORIES_PER_ROUND - 1),
});

/** Schema for voting crash or safe on another player's answer. */
export const VoteAnswerSchema = z.object({
  targetUserId: z.string().min(1),
  categoryIndex: z.number().int().min(0).max(CC_CATEGORIES_PER_ROUND - 1),
  vote: z.enum(['crash', 'safe']),
});
