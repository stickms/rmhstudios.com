import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  countAutoDeleteCandidates,
  getAutoDelete,
  setAutoDelete,
} from '@/lib/posts-plus/lifecycle.server';
import { AUTO_DELETE_MONTHS } from '@/lib/posts-plus/constants';
import { autoDeleteSchema } from '@/lib/posts-plus/schema';

/**
 * `/api/settings/auto-delete` - "delete my posts older than N months" (X8).
 *
 * GET  - the saved window and, with `?preview=N`, how many posts that window would
 *        take right now (pinned, bookmarked and restored posts are never counted).
 * PUT  { months: 3 | 6 | 12 | 24 | null } - turn it on, change it, or switch it off.
 */
const previewQuery = z.object({
  preview: z.coerce
    .number()
    .int()
    .refine((n) => (AUTO_DELETE_MONTHS as readonly number[]).includes(n))
    .optional(),
});

export const Route = createFileRoute('/api/settings/auto-delete')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: previewQuery }, async ({ userId, query }) => {
        const setting = await getAutoDelete(userId);
        const eligible = query.preview
          ? await countAutoDeleteCandidates(userId, query.preview)
          : undefined;
        return Response.json(
          { ...setting, eligible },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
      PUT: defineHandler(
        { rateLimit: 'write', body: autoDeleteSchema },
        async ({ userId, body }) => {
          await setAutoDelete(userId, body.months);
          return Response.json(await getAutoDelete(userId));
        },
      ),
    },
  },
});
