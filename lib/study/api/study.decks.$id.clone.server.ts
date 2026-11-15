import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { cloneDeckApi } from '@/lib/study/decks.contract';
import { cloneDeck } from '@/lib/study.server';

/**
 * POST /api/study/decks/$id/clone — copy a public deck (and its cards) into the
 * caller's own decks. Idempotent per source deck.
 */
export const route = apiRoute('/api/study/decks/$id/clone', {
  POST: implement(
    cloneDeckApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'deck-clone' } },
    async ({ params, session }) => {
      const result = await cloneDeck(session.user.id, params.id);
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: result.status });
      }
      return { success: true as const, id: result.id, alreadyOwned: result.alreadyOwned };
    },
  ),
});
