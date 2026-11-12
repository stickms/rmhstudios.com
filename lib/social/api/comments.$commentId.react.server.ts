import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reactToCommentApi } from '@/lib/social/comment-reaction.contract';
import { reactBody } from '@/lib/social/reaction-schema';
import { isValidReactionEmoji } from '@/lib/social/reactions';
import { toggleCommentReaction } from '@/lib/social/reactions.server';

/** POST /api/comments/$commentId/react — toggle an emoji reaction on a comment. */
export const route = apiRoute('/api/comments/$commentId/react', {
  POST: implement(
    reactToCommentApi,
    {
      rateLimit: { limit: 60, windowMs: 60_000, prefix: 'reaction' },
      body: reactBody,
      invalid: () => Response.json({ error: 'Invalid emoji' }, { status: 400 }),
    },
    async ({ params, session, body }) => {
      const { commentId } = params;
      const userId = session.user.id;

      if (!isValidReactionEmoji(body.emoji)) {
        return Response.json({ error: 'Invalid emoji' }, { status: 400 });
      }

      const result = await toggleCommentReaction(userId, commentId, body.emoji);
      if (!result.found) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json({ success: true, reacted: result.reacted, reactions: result.rows });
    },
  ),
});
