/** Request schema for POST /api/study/highlight-cards (server and the lazy dialog; client code never imports it statically). */
import { z } from 'zod';
import { CARD_SIDE_MAX } from '@/lib/study/limits';
import { HIGHLIGHT_EXACT_MAX, MAX_HIGHLIGHT_CARD_BATCH } from '@/lib/study/highlight-cards';

const wordRange = z.object({
  from: z.number().int().min(0).max(HIGHLIGHT_EXACT_MAX),
  to: z.number().int().min(0).max(HIGHLIGHT_EXACT_MAX),
});

const base = { highlightId: z.string().min(1).max(40), text: z.string().min(1).max(HIGHLIGHT_EXACT_MAX) };

export const highlightCardItem = z.discriminatedUnion('shape', [
  z.object({
    ...base,
    shape: z.literal('basic'),
    front: z
      .string()
      .min(1)
      .max(CARD_SIDE_MAX + 100),
  }),
  z.object({ ...base, shape: z.literal('cloze'), deletions: z.array(wordRange).min(1).max(MAX_HIGHLIGHT_CARD_BATCH) }),
]);

export const createHighlightCardsBody = z.object({
  deckId: z.string().min(1).max(40),
  items: z.array(highlightCardItem).min(1).max(MAX_HIGHLIGHT_CARD_BATCH),
});
