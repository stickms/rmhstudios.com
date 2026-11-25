import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { listingPath, putSavedBody } from '@/lib/api/v1/homes-schema';
import {
  NO_STORE,
  deleteSavedForKey,
  putSavedForKey,
  readInput,
  readOptionalBody,
  writeBudgetExceeded,
} from '@/lib/api/v1/homes.server';

/**
 * PUT    /api/v1/me/homes/saved/{listingId} — save a home (idempotent) and set your note and price alert
 * (`write:homes`), through the site's own save. A listing that is gone, removed by a moderator or by an author
 * blocked either way is 404.
 * DELETE /api/v1/me/homes/saved/{listingId} — unsave it (`write:homes`); idempotent.
 * Both honour `Idempotency-Key`.
 */
export const Route = createFileRoute('/api/v1/me/homes/saved/$listingId')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      PUT: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, listingPath);
            if (!p.ok) return error('invalid_request', p.message, 400, NO_STORE);
            const body = await readOptionalBody(request, putSavedBody);
            if (!body.ok) return error('invalid_request', body.message, 400, NO_STORE);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429, NO_STORE);
            const result = await putSavedForKey(userId, p.data.listingId, body.data);
            return result.ok
              ? json({ data: result.saved }, 200, NO_STORE)
              : error('not_found', 'Listing not found.', 404, NO_STORE);
          },
          { scope: 'write:homes', idempotent: true },
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, noContent, error }) => {
            const p = readInput(params, listingPath);
            if (!p.ok) return error('invalid_request', p.message, 400, NO_STORE);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429, NO_STORE);
            await deleteSavedForKey(userId, p.data.listingId);
            return noContent(NO_STORE);
          },
          { scope: 'write:homes', idempotent: true },
        ),
    },
  },
});
