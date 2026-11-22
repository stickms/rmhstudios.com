/**
 * Contract for /api/study/highlight-cards (s10-01). Client-safe: request types come from the zod schema by
 * `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createHighlightCardsBody } from '@/lib/study/highlight-cards-schema';

/** 201. One entry per card made, in the order of the request's items. */
export const createHighlightCardsApi = endpoint<{
  body: z.infer<typeof createHighlightCardsBody>;
  res: {
    success: true;
    created: number;
    cardCount: number;
    cards: { cardId: string; highlightId: string }[];
  };
}>()({
  method: 'POST',
  path: '/api/study/highlight-cards',
});
