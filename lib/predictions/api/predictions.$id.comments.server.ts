import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
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
 * GET  /api/predictions/$id/comments — latest comments, each with the commenter's position at the time (G6).
 * POST /api/predictions/$id/comments — comment; the position snapshot is taken server-side.
 */
export const route = apiRoute('/api/predictions/$id/comments', {
  GET: implement(
    listPredictionCommentsApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ params, session }) => {
      const comments = await listComments(params.id, session?.user?.id);
      if (!comments) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json(
        { comments, aiAvailable: advocateAvailable() },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    },
  ),
  POST: implement(
    addPredictionCommentApi,
    { rateLimit: 'write', body: commentSchema },
    async ({ params, userId, body }) => {
      const comment = await addComment(params.id, userId, body.body);
      if (!comment) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json({ comment }, { status: 201 });
    },
  ),
});
