import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createHighlightCardsApi } from '@/lib/study/highlight-cards.contract';
import { createHighlightCardsBody } from '@/lib/study/highlight-cards-schema';
import { createCardsFromHighlights } from '@/lib/study/highlight-cards.server';

/** POST /api/study/highlight-cards — make up to 50 cards from the member's own highlights, all or nothing (owner). */
export const route = apiRoute('/api/study/highlight-cards', {
  POST: implement(
    createHighlightCardsApi,
    { rateLimit: 'write', body: createHighlightCardsBody },
    async ({ userId, body }) => {
      const result = await createCardsFromHighlights(userId, body.deckId, body.items);
      if (!result.ok)
        return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
      return Response.json(
        { success: true as const, created: result.created, cardCount: result.cardCount, cards: result.cards },
        { status: 201 },
      );
    },
  ),
});
