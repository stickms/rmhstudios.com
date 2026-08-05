import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getUserTier } from '@/lib/entitlements';
import { listTrash } from '@/lib/trash/trash.server';
import { TRASH_KINDS, trashWindowDays } from '@/lib/trash/types';

const querySchema = z.object({
  kind: z.enum(TRASH_KINDS as unknown as [string, ...string[]]).optional(),
  cursor: z.string().max(120).optional(),
});

/**
 * GET /api/trash?kind=&cursor= — the caller's recycle bin.
 *
 * Never takes a user id: the bin is always the session's own. The rows are
 * soft-deleted content, which for a moderated account is evidence, so there is
 * deliberately no admin variant of this endpoint here.
 */
export const Route = createFileRoute('/api/trash/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: querySchema }, async ({ userId, query }) => {
        const tier = await getUserTier(userId);
        const page = await listTrash(userId, trashWindowDays(tier), {
          kind: query.kind as 'post' | 'comment' | undefined,
          cursor: query.cursor,
        });
        return Response.json(page);
      }),
    },
  },
});
