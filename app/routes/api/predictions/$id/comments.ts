import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
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
export const Route = createFileRoute('/api/predictions/$id/comments')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, session }) => {
        const comments = await listComments(params.id, session?.user?.id);
        if (!comments) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(
          { comments, aiAvailable: advocateAvailable() },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: commentSchema },
        async ({ params, userId, body }) => {
          const comment = await addComment(params.id, userId, body.body);
          if (!comment) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ comment }, { status: 201 });
        },
      ),
    },
  },
});
