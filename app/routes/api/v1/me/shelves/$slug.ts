import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import { putShelfBody, shelfPath } from '@/lib/api/v1/reading-schema';
import {
  deleteMyShelf,
  putMyShelf,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/reading.server';

/**
 * PUT    /api/v1/me/shelves/{slug} — put a library book on a shelf (the site's `setShelf`).
 * DELETE /api/v1/me/shelves/{slug} — take it off your shelves.
 * An unknown library slug is 404.
 */
export const Route = createFileRoute('/api/v1/me/shelves/$slug')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      PUT: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, shelfPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, putShelfBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (writeBudgetExceeded(userId))
              return error('rate_limited', 'Too many writes. Slow down.', 429);
            const entry = await putMyShelf(userId, p.data.slug, body.data);
            return entry ? json(entry) : error('not_found', 'Book not found.', 404);
          },
          { scope: 'write:reading', idempotent: true },
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, noContent, error }) => {
            const p = readInput(params, shelfPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            if (writeBudgetExceeded(userId))
              return error('rate_limited', 'Too many writes. Slow down.', 429);
            return (await deleteMyShelf(userId, p.data.slug))
              ? noContent()
              : error('not_found', 'Shelf entry not found.', 404);
          },
          { scope: 'write:reading', idempotent: true },
        ),
    },
  },
});
