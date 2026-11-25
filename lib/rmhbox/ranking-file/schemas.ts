/**
 * RMHbox — Ranking File Zod Schemas
 *
 * Validates the content pack (data/rmhbox/ranking-file/sets.json) and the
 * client->server input for the Ranking File minigame.
 *
 * Every set is ordered from the LARGEST value to the smallest: the prompt says
 * what the value is ("Longest to shortest by length"), so the official order
 * is the items sorted by value, descending.
 */

import { z } from 'zod';

/** Items shown to the players in every round. */
export const RF_ITEMS_PER_ROUND = 5;

export const RF_CATEGORIES = ['science', 'geography', 'history', 'culture'] as const;
export type RankingCategory = (typeof RF_CATEGORIES)[number];

// ─── Client→Server Input Schemas ────────────────────────────────

/**
 * A new order: the round's labels, each once. The handler additionally checks
 * that they are the labels of the current round (a foreign label is refused).
 */
export const ReorderInputSchema = z.object({
  order: z.array(z.string().min(1).max(120)).length(RF_ITEMS_PER_ROUND),
});

/** Locking in carries nothing: the order on the server is the one that counts. */
export const LockInputSchema = z.object({});

// ─── Data Validation Schemas ────────────────────────────────────

export const RankingItemSchema = z.object({
  label: z.string().min(1).max(120),
  value: z.number().finite(),
});

/** One set of 6 to 8 items; five are drawn per round. */
export const RankingSetSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(RF_CATEGORIES),
    prompt: z.string().min(10),
    unit: z.string().min(1),
    items: z.array(RankingItemSchema).min(6).max(8),
    source: z.string().min(1),
  })
  .superRefine((set, ctx) => {
    const values = new Set<number>();
    const labels = new Set<string>();
    for (const item of set.items) {
      if (values.has(item.value)) {
        ctx.addIssue({ code: 'custom', message: `equal values in set ${set.id}: ${item.value}` });
      }
      if (labels.has(item.label)) {
        ctx.addIssue({ code: 'custom', message: `repeated label in set ${set.id}: ${item.label}` });
      }
      values.add(item.value);
      labels.add(item.label);
    }
  });

export type RankingItem = z.infer<typeof RankingItemSchema>;
export type RankingSet = z.infer<typeof RankingSetSchema>;
