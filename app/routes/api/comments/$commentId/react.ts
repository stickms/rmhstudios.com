import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { isValidReactionEmoji } from '@/lib/social/reactions';
import { toggleCommentReaction } from '@/lib/social/reactions.server';

/** POST /api/comments/$commentId/react — toggle an emoji reaction on a comment. */
export const Route = createFileRoute('/api/comments/$commentId/react')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'reaction' } },
        async ({ request, params, session }) => {
          const { commentId } = params;
          const userId = session.user.id;

          const body = await request.json().catch(() => null);
          const parsed = z.object({ emoji: z.string().min(1).max(32) }).safeParse(body);
          if (!parsed.success || !isValidReactionEmoji(parsed.data.emoji)) {
            return Response.json({ error: 'Invalid emoji' }, { status: 400 });
          }

          const result = await toggleCommentReaction(userId, commentId, parsed.data.emoji);
          if (!result.found) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true, reacted: result.reacted, reactions: result.rows });
        },
      ),
    },
  },
});
