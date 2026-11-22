import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { deckPath, patchDeckBody } from '@/lib/api/v1/study-schema';
import {
  deleteMyDeck,
  editFailure,
  getMyDeck,
  patchMyDeck,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/study.server';

/**
 * GET    /api/v1/me/decks/{id} — one of your decks.
 * PATCH  /api/v1/me/decks/{id} — title, description, isPublic.
 * DELETE /api/v1/me/decks/{id} — delete the deck with its cards and review history.
 * A deck that is not yours is 404.
 */
export const Route = createFileRoute('/api/v1/me/decks/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, deckPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const deck = await getMyDeck(userId, p.data.id);
            return deck ? json(deck) : error('not_found', 'Deck not found.', 404);
          },
          {
            scope: 'read:study',
          },
        ),

      PATCH: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, deckPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, patchDeckBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const result = await patchMyDeck(userId, p.data.id, body.data);
            return result.ok ? json(result.deck) : editFailure(error, result);
          },
          {
            scope: 'write:study',
            idempotent: true,
          },
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, noContent, error }) => {
            const p = readInput(params, deckPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const result = await deleteMyDeck(userId, p.data.id);
            return result.ok ? noContent() : editFailure(error, result);
          },
          {
            scope: 'write:study',
            idempotent: true,
          },
        ),
    },
  },
});
