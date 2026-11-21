/**
 * Zod schemas for the /api/study/decks routes. Imported by the ROUTES only; the
 * client reaches the same types through `decks.contract.ts` with `import type`.
 */
import { z } from 'zod';
import { CARD_KINDS, validateCard } from '@/lib/study/card-types';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX, MAX_DECK_CARDS, MAX_IMPORT_CARDS } from '@/lib/study/limits';

export const createDeckBody =
  z.object(
    {
      title:
        z
          .string()
          .min(
            1,
          )
          .max(
            100,
          ),
      description:
        z
          .string()
          .max(
            500,
          )
          .optional(),
      isPublic:
        z
          .boolean()
          .optional(),
      // Optional AI seed: generate starter cards for this topic.
      generateTopic:
        z
          .string()
          .max(
            200,
          )
          .optional(),
    },
  );

export const reviewCardBody =
  z.object(
    {
      grade:
        z
          .number()
          .int()
          .min(
            0,
          )
          .max(
            3,
          ),
    },
  );

/**
 * A card as authored: its kind (basic when absent), a front (a cloze card's whole text, up to
 * 1,000 characters) and a back (none for a cloze card). The per-kind rules are `validateCard`'s,
 * the same ones the editor shows inline and the server re-checks.
 */
const authoredCard = z
  .object({
    kind: z.enum(CARD_KINDS).optional(),
    front: z.string().trim().min(1).max(CLOZE_TEXT_MAX),
    back: z.string().trim().max(CARD_SIDE_MAX).optional(),
  })
  .superRefine((card, ctx) => {
    const checked = validateCard(card);
    if (!checked.ok) ctx.addIssue({ code: 'custom', message: checked.error });
  });

/** POST one card to a deck. */
export const addCardBody = authoredCard;

/** PATCH a deck: any of its settings. A blank description clears it. */
export const updateDeckBody = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((b) => b.title !== undefined || b.description !== undefined || b.isPublic !== undefined);

/** PATCH a card: any of its kind and sides; the review history stays. The merged card is checked by the server. */
export const updateCardBody = z
  .object({
    kind: z.enum(CARD_KINDS).optional(),
    front: z.string().trim().min(1).max(CLOZE_TEXT_MAX).optional(),
    back: z.string().trim().max(CARD_SIDE_MAX).optional(),
  })
  .refine((b) => b.front !== undefined || b.back !== undefined || b.kind !== undefined);

/** POST bulk cards: one import, at most 500 authored cards. */
export const importCardsBody = z.object({
  cards: z.array(authoredCard).min(1).max(MAX_IMPORT_CARDS),
});

/** PUT the card order: every card id of the deck, in the new order. */
export const reorderCardsBody = z.object({
  cardIds: z.array(z.string().min(1).max(64)).max(MAX_DECK_CARDS),
});
