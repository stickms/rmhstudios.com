import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listMarketplaceDecks } from '@/lib/study.server';

/**
 * GET /api/study/marketplace?q= — browse public flashcard decks (the deck
 * marketplace). Optional `q` filters by title/description.
 */
export const Route = createFileRoute('/api/study/marketplace')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const q = new URL(request.url).searchParams.get('q');
          return Response.json(await listMarketplaceDecks(session?.user?.id ?? null, q));
        } catch (error) {
          console.error('Deck marketplace error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
