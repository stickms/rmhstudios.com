/**
 * Query validation for the RMHBox stats and history reads. Parsed with the
 * contract's query types (`lib/rmhbox/rmhbox-reads.contract.ts`); lists are one
 * comma-separated parameter, never repeated ones.
 */
import { z } from 'zod';

export const STATS_PAGE_DEFAULT = 20;
export const STATS_PAGE_MAX = 50;

const id = z.string().min(1).max(64);

const paging = {
  // Clamped, not refused: the history reads always accepted an oversized limit.
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((n) => Math.min(n, STATS_PAGE_MAX))
    .optional(),
  offset: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
};

/** GET /api/rmhbox/stats */
export const statsQuerySchema = z.object({
  userId: id,
  minigame: id.optional(),
  ...paging,
});

/** GET /api/rmhbox/history */
export const historyQuerySchema = z.object({
  matchId: id.optional(),
  userId: id.optional(),
  minigame: id.optional(),
  ...paging,
});
