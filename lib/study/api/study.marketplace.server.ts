import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { listMarketplaceDecks } from '@/lib/study.server';
import { marketplaceQuery } from '@/lib/study/deck-ratings-schema';

/**
 * GET /api/study/marketplace?q=&sort= — browse public flashcard decks (the deck
 * marketplace). Optional `q` filters by title/description; `sort` is `cards`
 * (the default), `rated` or `copied` (s12-08).
 */
export const route = apiRoute('/api/study/marketplace', {
  GET: defineHandler({ auth: 'optional', query: marketplaceQuery }, async ({ session, query }) => {
    return Response.json(await listMarketplaceDecks(session?.user?.id ?? null, query.q ?? null, query.sort));
  }),
});
