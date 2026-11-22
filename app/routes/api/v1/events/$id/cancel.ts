import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { eventPath } from '@/lib/api/v1/events-schema';
import { cancelEventForKey, readInput, writeBudgetExceeded } from '@/lib/api/v1/events.server';

/** POST /api/v1/events/{id}/cancel — cancel an event you host (the site's `cancelEvent`); `409 already_canceled` twice. */
export const Route = createFileRoute('/api/v1/events/$id/cancel')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const out = await cancelEventForKey(p.data.id, userId);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result);
          },
          {
            scope: 'manage:events',
            idempotent: true,
          },
        ),
    },
  },
});
