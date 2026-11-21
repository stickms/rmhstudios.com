/**
 * Zod schemas for the /api/study/decks routes. Imported by the ROUTES only; the
 * client reaches the same types through `decks.contract.ts` with `import type`.
 */
import { z } from 'zod';
import { CARD_SIDE_MAX, MAX_DECK_CARDS, MAX_IMPORT_CARDS } from '@/lib/study/limits';

export const createDeckBody = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  // Optional AI seed: generate starter cards for this topic.
  generateTopic: z.string().max(200).optional(),
});

export const addCardBody = z.object({
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(500),
});

export const reviewCardBody = z.object({
  grade: z.number().int().min(0).max(3),
});

/** A card side as edited or imported: trimmed, 1 to 500 characters. */
const cardSide = z.string().trim().min(1).max(CARD_SIDE_MAX);

/** PATCH a deck: any of its settings. A blank description clears it. */
export const updateDeckBody = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((b) => b.title !== undefined || b.description !== undefined || b.isPublic !== undefined);

/** PATCH a card: either side or both; the review history stays. */
export const updateCardBody = z
  .object({ front: cardSide.optional(), back: cardSide.optional() })
  .refine((b) => b.front !== undefined || b.back !== undefined);

/** POST bulk cards: one import, at most 500. */
export const importCardsBody = z.object({
  cards: z
    .array(z.object({ front: cardSide, back: cardSide }))
    .min(1)
    .max(MAX_IMPORT_CARDS),
});

/** PUT the card order: every card id of the deck, in the new order. */
export const reorderCardsBody = z.object({
  cardIds: z.array(z.string().min(1).max(64)).max(MAX_DECK_CARDS),
});
