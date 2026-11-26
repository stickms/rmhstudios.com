import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { markReadBody } from '@/lib/api/v1/notifications-schema';
import { NO_STORE, markReadForKey, readInput } from '@/lib/api/v1/notifications.server';

/**
 * POST /api/v1/me/notifications/read — mark notifications read (`write:notifications`, explicit). The body is
 * `{ ids }` (1 to 100 of your own; other people's ids change nothing) or `{ before }` (every unread notification
 * created at or before that time). Answers `{ updated }`, the rows that changed, through the inbox's own `setRead` /
 * `markAllRead`. Idempotent; honours `Idempotency-Key`.
 */
export const Route = createFileRoute('/api/v1/me/notifications/read')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = readInput(await request.json().catch(() => null), markReadBody);
            if (!body.ok) return error('invalid_request', body.message, 400, NO_STORE);
            return json(await markReadForKey(userId, body.data), 200, NO_STORE);
          },
          { scope: 'write:notifications', idempotent: true },
        ),
    },
  },
});
