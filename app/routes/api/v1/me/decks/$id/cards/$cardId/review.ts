import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { cardPath, gradeBody } from '@/lib/api/v1/study-schema';
import { editFailure, gradeBudgetExceeded, gradeFor, readBody, readInput } from '@/lib/api/v1/study.server';

/**
 * POST /api/v1/me/decks/{id}/cards/{cardId}/review — grade one card (`again`, `hard`, `good` or `easy`) on your own
 * schedule, exactly as a grade in the browser, except that it earns no quest progress or XP. Needs the explicit
 * `write:study-reviews` scope. A card that is not in this deck is 404; a suspended card is 409.
 */
export const Route = createFileRoute('/api/v1/me/decks/$id/cards/$cardId/review')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, cardPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, gradeBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (gradeBudgetExceeded(userId)) return error('rate_limited', 'Too many grades. Slow down.', 429);
            const result = await gradeFor(userId, p.data.id, p.data.cardId, body.data.grade);
            return result.ok ? json({ data: result.review }) : editFailure(error, result);
          },
          {
            scope: 'write:study-reviews',
            idempotent: true,
          },
        ),
    },
  },
});
