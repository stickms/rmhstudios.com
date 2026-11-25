import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { deckPath, reviewQuery } from '@/lib/api/v1/study-schema';
import { queryOf, readInput, reviewQueueFor } from '@/lib/api/v1/study.server';

/**
 * GET /api/v1/me/decks/{id}/review?limit= — the cards due now in this deck, in the order the site's review queue
 * shows them (scheduled cards due, then new cards within the deck's pace), with their text and pictures. Never a
 * card sound. A deck you may not read is 404.
 */
export const Route = createFileRoute('/api/v1/me/decks/$id/review')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, deckPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const q = readInput(queryOf(request), reviewQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const cards = await reviewQueueFor(userId, p.data.id, q.data.limit);
            return cards ? json({ data: cards }) : error('not_found', 'Deck not found.', 404);
          },
          {
            scope: 'read:study',
          },
        ),
    },
  },
});
