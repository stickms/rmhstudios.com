import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { dailyQuery, resolveDailyRange } from '@/lib/api/v1/practice-schema';
import { typingDaily } from '@/lib/api/v1/practice.server';

/** GET /api/v1/me/typing/daily — the key owner's daily-passage entries in a range of at most 366 days (?from, ?to). */
export const Route = createFileRoute('/api/v1/me/typing/daily')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = dailyQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', 'Invalid `from` or `to`.', 400);
            const range = resolveDailyRange(q.data, new Date());
            if (!range.ok) return error('invalid_request', range.message, 400);
            return json(await typingDaily(userId, range.from, range.to));
          },
          { scope: 'read:practice' },
        ),
    },
  },
});
