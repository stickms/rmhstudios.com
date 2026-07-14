import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { cloneDeck } from '@/lib/study.server';

/**
 * POST /api/study/decks/$id/clone — copy a public deck (and its cards) into the
 * caller's own decks. Idempotent per source deck.
 */
export const Route = createFileRoute('/api/study/decks/$id/clone')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'deck-clone',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const result = await cloneDeck(session.user.id, params.id);
          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }
          return Response.json({ success: true, id: result.id, alreadyOwned: result.alreadyOwned });
        } catch (error) {
          console.error('Deck clone error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
