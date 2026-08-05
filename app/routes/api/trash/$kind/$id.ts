import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { purgeItem } from '@/lib/trash/trash.server';
import { isTrashKind, refusalStatus } from '@/lib/trash/types';

/**
 * DELETE /api/trash/$kind/$id — hard-delete now.
 *
 * For a post this also releases the attached media (object store, CDN and rows),
 * so "Delete forever" reclaims storage immediately instead of waiting a week for
 * the media sweep.
 *
 * Refuses moderator- and system-deleted rows for the same reason restore does:
 * `lib/cleanup.server.ts` keeps admin deletions as moderation evidence, and a
 * purge button the moderated account could press would shred it.
 */
export const Route = createFileRoute('/api/trash/$kind/$id')({
  server: {
    handlers: {
      DELETE: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user' } },
        async ({ userId, params }) => {
          const { kind, id } = params;
          if (!isTrashKind(kind)) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          const result = await purgeItem(userId, kind, id);
          if (!result.ok) {
            return Response.json(
              { error: 'Delete refused', reason: result.reason },
              { status: refusalStatus(result.reason) },
            );
          }
          return Response.json({ ok: true, kind, id });
        },
      ),
    },
  },
});
