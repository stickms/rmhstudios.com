import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { typingSummary } from '@/lib/api/v1/practice.server';

/** GET /api/v1/me/typing — the key owner's RMHType profile per difficulty and their lesson progress. */
export const Route = createFileRoute('/api/v1/me/typing')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ userId, json }) => json(await typingSummary(userId)), {
          scope: 'read:practice',
        }),
    },
  },
});
