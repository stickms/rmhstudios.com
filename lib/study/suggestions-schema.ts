/** Zod schemas for the deck-suggestion routes. Routes only; the client reaches the types through the contract. */
import { z } from 'zod';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX } from '@/lib/study/limits';
import { DECLINE_REASON_MAX, SUGGESTION_NOTE_MAX } from '@/lib/study/suggestions';

const id = z.string().min(1).max(64);

/** A new front and back for one card (a cloze card sends only its front) and an optional note. */
export const createSuggestionBody = z.object({
  cardId: id,
  front: z.string().trim().min(1).max(CLOZE_TEXT_MAX),
  back: z.string().trim().max(CARD_SIDE_MAX).optional(),
  note: z.string().trim().max(SUGGESTION_NOTE_MAX).optional(),
});

export const listSuggestionsQuery = z.object({
  /** `author`: the open suggestions for the deck's author; `mine`: the caller's own on this deck. */
  scope: z.enum(['author', 'mine']).default('mine'),
});

/** Accept (optionally with the author's own wording) or decline (optionally with a reason, optionally blocking). */
export const decisionBody = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('accept'),
    /** "Accept with edits": the wording to apply instead of the suggested one. */
    edit: z
      .object({
        front: z.string().trim().min(1).max(CLOZE_TEXT_MAX),
        back: z.string().trim().max(CARD_SIDE_MAX).optional(),
      })
      .optional(),
  }),
  z.object({
    decision: z.literal('decline'),
    reason: z.string().trim().max(DECLINE_REASON_MAX).optional(),
    /** "Decline and block": also declines every other open suggestion from this member to the author's decks. */
    block: z.boolean().optional(),
  }),
]);
