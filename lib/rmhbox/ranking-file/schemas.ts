/**
 * Ranking File — Zod Validation Schemas
 *
 * Input validation schemas for Ranking File game actions.
 * Used server-side to validate player inputs before processing.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §2.5
 */

import { z } from 'zod';

/** Schema for submitting a final ranking (locks in the player's choice). */
export const RFSubmitSchema = z.object({
  ranking: z.array(z.number().int().min(1).max(5)).length(5)
    .refine(
      (arr) => new Set(arr).size === 5,
      'Ranking must contain each position 1-5 exactly once',
    ),
});

/** Schema for updating a live preview ranking before submission. */
export const RFUpdateSchema = z.object({
  ranking: z.array(z.number().int().min(1).max(5)).length(5)
    .refine(
      (arr) => new Set(arr).size === 5,
      'Ranking must contain each position 1-5 exactly once',
    ),
});

/** Schema for a single ranking category entry in categories.json. */
export const RankingCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  items: z.array(z.string().min(1)).length(5),
  emoji: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

/** Inferred type for a ranking category entry. */
export type RankingCategory = z.infer<typeof RankingCategorySchema>;
