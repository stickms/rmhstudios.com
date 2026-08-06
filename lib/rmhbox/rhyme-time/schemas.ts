/**
 * Rhyme Time — Zod Validation Schemas
 *
 * Defines input validation schemas for player submissions
 * and data validation schemas for root words.
 */

import { z } from 'zod';
import { RT_MIN_WORD_LEN, RT_MAX_WORD_LEN, RT_MIN_RHYMES } from '../constants';

/**
 * A single English word: letters, optionally joined by an apostrophe or hyphen
 * (the CMU dictionary carries "don't" and "well-being").
 *
 * The submission has to be one word because `rhyming-part` silently scores the
 * LAST word of whatever it is given and ignores every non-letter. Without this,
 * "tree", "a tree" and "the tree" are three distinct strings to the duplicate
 * check but the same rhyme to the scorer — so one found rare word could be
 * banked over and over at full value.
 */
const SINGLE_WORD = /^[a-z]+(?:['-][a-z]+)*$/;

/** Schema for validating a player's rhyme submission. */
export const SubmitRhymeSchema = z.object({
  word: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().min(RT_MIN_WORD_LEN).max(RT_MAX_WORD_LEN).regex(SINGLE_WORD)),
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
