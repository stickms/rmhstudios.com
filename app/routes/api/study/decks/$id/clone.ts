import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cloneDeck } from '@/lib/study.server';

/**
 * POST /api/study/decks/$id/clone — copy a public deck (and its cards) into the
 * caller's own decks. Idempotent per source deck.
 */
export const Route = createFileRoute('/api/study/decks/$id/clone')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'deck-clone' } },
        async ({ params, session }) => {
          const result = await cloneDeck(session.user.id, params.id);
          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }
          return Response.json({ success: true, id: result.id, alreadyOwned: result.alreadyOwned });
        },
      ),
    },
  },
});
