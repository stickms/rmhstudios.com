/**
 * Zod schema for POST /api/study/decks/$id/tests. Imported by the route only; the client reaches
 * the type through `tests.contract.ts` with `import type`.
 */
import { z } from 'zod';
import { MAX_TEST_POINTS, TEST_KINDS } from '@/lib/study/practice-test';

/** Longest test duration kept: four hours. */
export const MAX_TEST_DURATION_MS = 4 * 60 * 60 * 1000;
/** Last results returned by GET. */
export const TEST_HISTORY_LIMIT = 20;

export const recordTestBody = z
  .object({
    // Points: one per question, one per pair in a matching question.
    total: z.number().int().min(1).max(MAX_TEST_POINTS),
    correct: z.number().int().min(0).max(MAX_TEST_POINTS),
    kinds: z
      .array(z.enum(TEST_KINDS))
      .min(1)
      .max(TEST_KINDS.length)
      .refine((k) => new Set(k).size === k.length),
    durationMs: z.number().finite().min(0),
    missedCardIds: z.array(z.string().min(1).max(64)).max(MAX_TEST_POINTS),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 31 - 1),
  })
  .refine((b) => b.correct <= b.total, { path: ['correct'] });
