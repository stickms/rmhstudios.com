import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { setReplyHidden } from '@/lib/feed/hidden-replies.server';
import { hideCommentApi } from '@/lib/feed/rmhark-actions.contract';

/**
 * POST /api/rmharks/$id/comment/$commentId/hide — hide or unhide a reply in
 * your own post's conversation (X2). Body: { hidden: boolean }. Only the post's
 * author may call it; a hidden reply stays readable under "Hidden replies".
 */
export const route = apiRoute('/api/rmharks/$id/comment/$commentId/hide', {
  POST: implement(
    hideCommentApi,
    { rateLimit: 'write', body: z.object({ hidden: z.boolean() }) },
    async ({ userId, params, body }) => {
      const result = await setReplyHidden(params.id, params.commentId, userId, body.hidden);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ hidden: result.hidden });
    },
  ),
});
