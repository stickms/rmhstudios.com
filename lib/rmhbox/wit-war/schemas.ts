/**
 * Wit-War — Zod Validation Schemas
 *
 * Input validation for answer submission and vote casting.
 */

import { z } from 'zod';
import { WW_MAX_ANSWER_LENGTH } from '../constants';

/** Schema for submitting an answer to an assigned prompt. */
export const SubmitAnswerSchema = z.object({
  promptIndex: z.number().int().min(0),
  answer: z.string().min(1).max(WW_MAX_ANSWER_LENGTH).transform((s) => s.trim()),
});

/** Schema for casting a vote on a head-to-head matchup. */
export const CastVoteSchema = z.object({
  matchupIndex: z.number().int().min(0),
  votedForUserId: z.string().min(1),
});
