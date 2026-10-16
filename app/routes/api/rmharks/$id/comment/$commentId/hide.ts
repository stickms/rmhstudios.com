import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { setReplyHidden } from '@/lib/feed/hidden-replies.server';

/**
 * POST /api/rmharks/$id/comment/$commentId/hide — hide or unhide a reply in
 * your own post's conversation (X2). Body: { hidden: boolean }. Only the post's
 * author may call it; a hidden reply stays readable under "Hidden replies".
 */
export const Route = createFileRoute('/api/rmharks/$id/comment/$commentId/hide')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ hidden: z.boolean() }) },
        async ({ userId, params, body }) => {
          const result = await setReplyHidden(params.id, params.commentId, userId, body.hidden);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ hidden: result.hidden });
        },
      ),
    },
  },
});
