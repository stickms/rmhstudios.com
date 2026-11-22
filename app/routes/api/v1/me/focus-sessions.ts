import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { pagedQuery } from '@/lib/api/v1/practice-schema';
import { focusSessions } from '@/lib/api/v1/practice.server';

/** GET /api/v1/me/focus-sessions — the key owner's focus sessions, newest first (?since, ?limit, ?cursor). */
export const Route = createFileRoute('/api/v1/me/focus-sessions')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = pagedQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            const out = await focusSessions(userId, q.data);
            if (out === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            return json(out);
          },
          { scope: 'read:practice' },
        ),
    },
  },
});
