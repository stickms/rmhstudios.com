import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { importCardsApi } from '@/lib/study/decks.contract';
import { importCardsBody } from '@/lib/study/decks-schema';
import { importCards } from '@/lib/study/deck-editor.server';

/** POST /api/study/decks/$id/cards — bulk add up to 500 cards, all or nothing (owner). */
export const route = apiRoute('/api/study/decks/$id/cards', {
  POST: implement(importCardsApi, { rateLimit: 'write', body: importCardsBody }, async ({ userId, params, body }) => {
    const result = await importCards(userId, params.id, body.cards);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(
      { success: true as const, created: result.created, cardCount: result.cardCount },
      { status: 201 },
    );
  }),
});
