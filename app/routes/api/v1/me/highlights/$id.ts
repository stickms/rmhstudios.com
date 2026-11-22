import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { highlightPath, patchHighlightBody } from '@/lib/api/v1/reading-schema';
import {
  deleteMyHighlight,
  patchMyHighlight,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/reading.server';

/**
 * PATCH  /api/v1/me/highlights/{id} — edit the note and/or visibility (the site's `updateHighlight`).
 * DELETE /api/v1/me/highlights/{id} — delete it (the site's `deleteHighlight`). Not tombstoned.
 * A highlight that is not yours is 404.
 */
export const Route = createFileRoute('/api/v1/me/highlights/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      PATCH: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, highlightPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, patchHighlightBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const h = await patchMyHighlight(userId, p.data.id, body.data);
            return h ? json(h) : error('not_found', 'Highlight not found.', 404);
          },
          { scope: 'write:reading', idempotent: true },
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, noContent, error }) => {
            const p = readInput(params, highlightPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            return (await deleteMyHighlight(userId, p.data.id))
              ? noContent()
              : error('not_found', 'Highlight not found.', 404);
          },
          { scope: 'write:reading', idempotent: true },
        ),
    },
  },
});
