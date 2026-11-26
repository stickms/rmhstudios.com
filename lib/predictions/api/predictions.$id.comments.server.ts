import { apiRoute } from '@/lib/api/route.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { implement } from '@/lib/api/implement.server';
import { commentListQuery } from '@/lib/predictions/predictions-schema';
import {
  addPredictionCommentApi,
  listPredictionCommentsApi,
} from '@/lib/predictions/predictions.contract';
import {
  addComment,
  advocateAvailable,
  commentSchema,
  listComments,
} from '@/lib/forecasting/forecasting.server';

/**
 * GET  /api/predictions/$id/comments?cursor= — one page of comments, newest first (hidden and banned authors left out), each with the commenter's position at the time (G6).
 * POST /api/predictions/$id/comments — comment; the position snapshot is taken server-side.
 */
export const route = apiRoute('/api/predictions/$id/comments', {
  GET: implement(
    listPredictionCommentsApi,
    { auth: 'optional', rateLimit: 'read', query: commentListQuery },
    async ({ params, query, session }) => {
      const page = await listComments(params.id, session?.user?.id, query.cursor);
      if (!page) return Response.json({ error: 'Not found' }, { status: 404 });
      // The answer depends on who is asking (their blocks and mutes), so it is never stored.
      return Response.json(
        { comments: page.comments, nextCursor: page.nextCursor, aiAvailable: advocateAvailable() },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    },
  ),
  POST: implement(
    addPredictionCommentApi,
    { rateLimit: 'write', body: commentSchema },
    async ({ params, userId, body }) => {
      const restricted = await restrictionResponse(userId, 'comment');
      if (restricted) return restricted;
      const comment = await addComment(params.id, userId, body.body);
      if (!comment) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json({ comment }, { status: 201 });
    },
  ),
});
