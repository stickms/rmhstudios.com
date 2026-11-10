/** Request schema for POST /api/laundry-sort/score. Client-safe. */
import { z } from 'zod';
import { MATCH_DURATIONS, DIFFICULTIES } from '@features/laundry-sort/engine/constants';

export const laundryScoreBody = z.object({
  score: z.number().int().min(0).max(1_000_000),
  sorted: z.number().int().min(0).max(10_000),
  wrong: z.number().int().min(0).max(10_000),
  missed: z.number().int().min(0).max(10_000),
  bestCombo: z.number().int().min(0).max(10_000),
  durationSec: z
    .number()
    .int()
    .refine((d) => (MATCH_DURATIONS as readonly number[]).includes(d)),
  difficulty: z.enum(DIFFICULTIES),
});
