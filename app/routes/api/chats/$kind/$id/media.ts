import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import { listSharedMedia } from '@/lib/chat-plus/media.server';

const query = z.object({
  tab: z.enum(['media', 'links']),
  cursor: z.string().min(1).max(40).optional(),
});

/**
 * GET /api/chats/$kind/$id/media?tab=media|links&cursor= — the "Media & links"
 * panel (M6): a keyset-paginated, indexed read of one chat's attachments or links.
 */
export const Route = createFileRoute('/api/chats/$kind/$id/media')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query }, async ({ params, userId, query: q }) => {
        const access = await requireChat(params, userId);
        if (access instanceof Response) return access;
        const page =
          q.tab === 'media'
            ? await listSharedMedia(access, 'media', q.cursor ?? null)
            : await listSharedMedia(access, 'links', q.cursor ?? null);
        return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
    },
  },
});
