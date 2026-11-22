/**
 * Request schemas for the debt counter. Client-safe (zod only) so the form and
 * the route validate against the same object rather than two that drift.
 */

import { z } from 'zod';
import { MAX_CLAIM_CHARS, MAX_QUESTION_CHARS } from '@/lib/kaikai-debt/debt';

/**
 * What someone types to add to the pile: prose, not a form.
 *
 * There is deliberately **no amount field**. Letting the submitter name the
 * figure turns the ledger into a contest over who types the most zeroes on their
 * first try; routing it through the appraiser means the number is at least
 * argued for, and the $5–$250 clamp in `ai.server.ts` bounds it regardless of
 * what either of them decides.
 */
export const addDebtSchema = z.object({
  claim: z.string().trim().min(3).max(MAX_CLAIM_CHARS),
});

export type AddDebtInput = z.infer<typeof addDebtSchema>;

export const askDebtSchema = z.object({
  question: z.string().trim().min(3).max(MAX_QUESTION_CHARS),
});

export type AskDebtInput = z.infer<typeof askDebtSchema>;
