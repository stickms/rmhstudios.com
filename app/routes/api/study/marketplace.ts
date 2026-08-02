import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listMarketplaceDecks } from '@/lib/study.server';

/**
 * GET /api/study/marketplace?q= — browse public flashcard decks (the deck
 * marketplace). Optional `q` filters by title/description.
 */
export const Route = createFileRoute('/api/study/marketplace')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, session }) => {
        const q = new URL(request.url).searchParams.get('q');
        return Response.json(await listMarketplaceDecks(session?.user?.id ?? null, q));
      }),
    },
  },
});
