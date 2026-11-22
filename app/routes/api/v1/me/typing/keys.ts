import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { keysQuery } from '@/lib/api/v1/practice-schema';
import { typingKeys } from '@/lib/api/v1/practice.server';

/** GET /api/v1/me/typing/keys — the key owner's per-key counters and derived metrics, slowest first (?layout). */
export const Route = createFileRoute('/api/v1/me/typing/keys')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = keysQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', 'Invalid `layout`.', 400);
            return json(await typingKeys(userId, q.data.layout));
          },
          { scope: 'read:practice' },
        ),
    },
  },
});
