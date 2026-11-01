import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { createCommentSchema, trackUriSchema } from '@/lib/rmhmusic/track-comments';
import {
  addTrackComment,
  deleteTrackComment,
  listTrackComments,
} from '@/lib/rmhmusic/track-comments.server';

/** RMHMusic timestamped comments: pinned to a position in a track (keyed by its Spotify URI). */
export const Route = createFileRoute('/api/rmhmusic/track-comments')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: z.object({ trackUri: trackUriSchema }) },
        async ({ userId, query }) =>
          Response.json({
            signedIn: userId !== null,
            comments: await listTrackComments(query.trackUri, userId),
          }),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: createCommentSchema },
        async ({ userId, body }) => {
          const comment = await addTrackComment(userId, body.trackUri, body.positionMs, body.body);
          if (!comment) return apiError('Comment limit reached for this track.', 429);
          return Response.json({ comment }, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { rateLimit: 'write', query: z.object({ id: z.string().min(1).max(40) }) },
        async ({ userId, query }) => {
          const removed = await deleteTrackComment(userId, query.id);
          if (!removed) return apiError('Not found', 404);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
