import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { deckPath } from '@/lib/api/v1/study-schema';
import { dueFor, readInput } from '@/lib/api/v1/study.server';

/** GET /api/v1/me/decks/{id}/due — how many cards are due now and in the next 24 hours. No card content. */
export const Route = createFileRoute('/api/v1/me/decks/$id/due')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, deckPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const due = await dueFor(userId, p.data.id);
            return due ? json(due) : error('not_found', 'Deck not found.', 404);
          },
          {
            scope: 'read:study',
          },
        ),
    },
  },
});
