/**
 * Rhyme Time — Zod Validation Schemas
 *
 * Defines input validation schemas for player submissions
 * and data validation schemas for root words and rhyme entries.
 */

import { z } from 'zod';
import {
  RT_MIN_WORD_LEN,
  RT_MAX_WORD_LEN,
  RT_MIN_RHYMES,
} from '../constants';

/** Schema for validating a player's rhyme submission. */
export const SubmitRhymeSchema = z.object({
  word: z.string()
    .min(RT_MIN_WORD_LEN)
    .max(RT_MAX_WORD_LEN)
    .transform((s) => s.trim().toLowerCase()),
});

/** Schema for validating root word data entries. */
export const RootWordSchema = z.object({
  word: z.string(),
  phonetic: z.string(),
  syllableCount: z.number().int().positive(),
  rhymeEndSound: z.string(),
  knownRhymeCount: z.number().int().min(RT_MIN_RHYMES),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

/** Schema for validating rhyme dictionary entries. */
export const RhymeEntrySchema = z.object({
  word: z.string(),
  syllableCount: z.number().int().positive(),
  frequencyRank: z.number().int().positive(),
  isMultiSyllableRhyme: z.boolean(),
});
