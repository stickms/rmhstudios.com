import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { hasScope } from '@/lib/api/scopes';
import { deletedQuery } from '@/lib/api/v1/sync-schema';
import { queryOf, readInput } from '@/lib/api/v1/reading.server';
import { SYNC_WINDOW_EXPIRED_MESSAGE, TOMBSTONE_SCOPE, sinceExpired } from '@/lib/sync/tombstones';
import { listTombstones } from '@/lib/sync/tombstones.server';

/**
 * GET /api/v1/me/deleted — the key owner's deletions of one kind (`highlight`, `deck`, `card`, `bookmark` or
 * `shelf_entry`) after `?since=`, oldest first. The scope is the read scope of the kind, so it is checked here once the
 * kind is known. A `since` older than 90 days is `410 sync_window_expired`.
 */
export const Route = createFileRoute('/api/v1/me/deleted')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ userId, scopes, json, error }) => {
          const q = readInput(queryOf(request), deletedQuery);
          if (!q.ok) return error('invalid_request', q.message, 400);
          const scope = TOMBSTONE_SCOPE[q.data.kind];
          if (!hasScope(scopes, scope)) {
            return error(
              'insufficient_scope',
              `Deletions of kind "${q.data.kind}" require the "${scope}" scope, which this key does not have.`,
              403,
              { 'X-Accepted-Scope': scope },
            );
          }
          const since = q.data.since === undefined ? null : new Date(q.data.since);
          if (since && sinceExpired(since, new Date()))
            return error('sync_window_expired', SYNC_WINDOW_EXPIRED_MESSAGE, 410);
          const page = await listTombstones(userId, q.data.kind, {
            since,
            cursor: q.data.cursor,
            limit: q.data.limit,
          });
          if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
          return json(page);
        }),
    },
  },
});
