import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { addWatchLaterBody, watchLaterQuery, WATCH_LATER_PAGE_DEFAULT } from '@/lib/api/v1/rmhtube-schema';
import { addWatchLaterForKey, listWatchLaterForKey } from '@/lib/api/v1/rmhtube.server';

/**
 * GET  /api/v1/me/rmhtube/watch-later — your Watch later list, oldest first, in pages.
 * POST /api/v1/me/rmhtube/watch-later — save a video (200 with the existing item when already saved, else 201).
 */
export const Route = createFileRoute('/api/v1/me/rmhtube/watch-later')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = watchLaterQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid request', 400);
            const page = await listWatchLaterForKey(userId, {
              limit: q.data.limit ?? WATCH_LATER_PAGE_DEFAULT,
              cursor: q.data.cursor,
            });
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            return json(page);
          },
          { scope: 'read:rmhtube' },
        ),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = addWatchLaterBody.safeParse(await request.json().catch(() => null));
            if (!body.success) return error('invalid_request', body.error.issues[0]?.message ?? 'Invalid request', 400);
            const out = await addWatchLaterForKey(userId, body.data);
            return json(out.item, out.created ? 201 : 200);
          },
          { scope: 'write:rmhtube', idempotent: true },
        ),
    },
  },
});
