/**
 * Zod schemas for the /api/study/decks routes. Imported by the ROUTES only; the
 * client reaches the same types through `decks.contract.ts` with `import type`.
 */
import { z } from 'zod';

/** `?tz=` on the deck list: the member's IANA zone, for the day a paced deck's counts use (UTC when unknown). */
export const listDecksQuery = z.object({ tz: z.string().min(1).max(64).optional() });
import { CARD_KINDS, validateCard } from '@/lib/study/card-types';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX, MAX_DECK_CARDS, MAX_IMPORT_CARDS } from '@/lib/study/limits';
import { addPictureIssue, cardPicturesShape } from '@/lib/study/card-images-schema';
import { addSoundIssue, cardSoundsShape } from '@/lib/study/card-sound-schema';
import { occlusionShape } from '@/lib/study/occlusion-schema';
import { isDeckLanguageTag } from '@/lib/study/listen';

export const createDeckBody = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  // Optional AI seed: generate starter cards for this topic.
  generateTopic: z.string().max(200).optional(),
});

export const reviewCardBody = z.object({
  grade: z.number().int().min(0).max(3),
});

/**
 * A card as authored: its kind (basic when absent), a front (a cloze card's whole text, up to
 * 1,000 characters; an occlusion card's optional prompt) and a back (none for a cloze card; an occlusion
 * card's optional note), plus the masks of an occlusion card. The per-kind rules are `validateCard`'s,
 * the same ones the editor shows inline and the server re-checks.
 */
const authoredFields = {
  kind: z.enum(CARD_KINDS).optional(),
  front: z.string().trim().max(CLOZE_TEXT_MAX).default(''),
  back: z.string().trim().max(CARD_SIDE_MAX).optional(),
  ...cardPicturesShape,
  ...occlusionShape,
};
const authoredCard = z.object(authoredFields).superRefine((card, ctx) => {
  const checked = validateCard(card);
  if (!checked.ok) ctx.addIssue({ code: 'custom', message: checked.error });
  addPictureIssue(card, ctx);
});

/**
 * POST one card to a deck. Only the card form's own save takes sounds (s10-02): a bulk import and the developer API
 * never carry one, so `authoredCard` above stays soundless.
 */
export const addCardBody = z.object({ ...authoredFields, ...cardSoundsShape }).superRefine((card, ctx) => {
  const checked = validateCard(card);
  if (!checked.ok) ctx.addIssue({ code: 'custom', message: checked.error });
  addPictureIssue(card, ctx);
  addSoundIssue(card, ctx);
});

/** A deck's language for one side (s11-17): a tag from the list, or null for "Same as the site". */
const deckLanguage = z.string().max(16).refine(isDeckLanguageTag, { message: 'unknown-language' }).nullable();

/** PATCH a deck: any of its settings. A blank description clears it. */
export const updateDeckBody = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    isPublic: z.boolean().optional(),
    /** "Tell me about updates", on a copied deck. */
    notifyUpdates: z.boolean().optional(),
    /** Let people who study the deck suggest fixes (s10-04); off until the author turns it on. */
    acceptsSuggestions: z.boolean().optional(),
    /** The languages the fronts and backs are written in, for Listen (s11-17); the owner's setting. */
    frontLang: deckLanguage.optional(),
    backLang: deckLanguage.optional(),
  })
  .refine(
    (b) =>
      b.title !== undefined ||
      b.description !== undefined ||
      b.isPublic !== undefined ||
      b.notifyUpdates !== undefined ||
      b.acceptsSuggestions !== undefined ||
      b.frontLang !== undefined ||
      b.backLang !== undefined,
  );

/**
 * PATCH a card: any of its kind, sides and pictures; the review history stays. The merged card is checked by the
 * server (a picture needs a description; a cloze front takes none). `null` removes a picture.
 */
export const updateCardBody = z
  .object({
    kind: z.enum(CARD_KINDS).optional(),
    front: z.string().trim().max(CLOZE_TEXT_MAX).optional(),
    back: z.string().trim().max(CARD_SIDE_MAX).optional(),
    ...cardPicturesShape,
    ...cardSoundsShape,
    ...occlusionShape,
  })
  .refine(
    (b) =>
      b.front !== undefined ||
      b.back !== undefined ||
      b.kind !== undefined ||
      b.frontImage !== undefined ||
      b.backImage !== undefined ||
      b.frontSound !== undefined ||
      b.backSound !== undefined ||
      b.occlusion !== undefined,
  );

/** POST bulk cards: one import, at most 500 authored cards. */
export const importCardsBody = z.object({
  cards: z.array(authoredCard).min(1).max(MAX_IMPORT_CARDS),
});

/** PUT the card order: every card id of the deck, in the new order. */
export const reorderCardsBody = z.object({
  cardIds: z.array(z.string().min(1).max(64)).max(MAX_DECK_CARDS),
});
