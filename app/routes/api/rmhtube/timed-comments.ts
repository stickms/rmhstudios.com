import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { mediaUrlSchema } from '@/lib/rmhtube/party';
import { addTimedComment, deleteTimedComment, listTimedComments } from '@/lib/rmhtube/watch.server';

/** RMHTube timed comments (F1): pinned to a second of a media URL, replayed for later viewers. */
export const Route = createFileRoute('/api/rmhtube/timed-comments')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: z.object({ url: mediaUrlSchema }) },
        async ({ userId, query }) =>
          Response.json({ comments: await listTimedComments(query.url, userId) }),
      ),
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            url: mediaUrlSchema,
            atSec: z.number().int().min(0).max(86_400),
            body: z.string().trim().min(1).max(200),
          }),
        },
        async ({ userId, body }) => {
          const comment = await addTimedComment(userId, body.url, body.atSec, body.body);
          if (!comment) return apiError('Comment limit reached for this video.', 429);
          return Response.json({ comment }, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { rateLimit: 'write', query: z.object({ id: z.string().min(1).max(40) }) },
        async ({ userId, query }) => {
          await deleteTimedComment(userId, query.id);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
