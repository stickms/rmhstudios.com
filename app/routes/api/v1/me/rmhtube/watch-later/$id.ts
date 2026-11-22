import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { watchLaterIdPath } from '@/lib/api/v1/rmhtube-schema';
import { deleteWatchLaterForKey } from '@/lib/api/v1/rmhtube.server';

/** DELETE /api/v1/me/rmhtube/watch-later/{id} — remove one of your own saved videos. */
export const Route = createFileRoute('/api/v1/me/rmhtube/watch-later/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, noContent, error }) => {
            const p = watchLaterIdPath.safeParse(params);
            if (!p.success) return error('invalid_request', 'Invalid id.', 400);
            if (!(await deleteWatchLaterForKey(userId, p.data.id))) return error('not_found', 'Not found.', 404);
            return noContent();
          },
          { scope: 'write:rmhtube', idempotent: true },
        ),
    },
  },
});
