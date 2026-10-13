import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, apiError, notFound } from '@/lib/api/handler.server';
import { commentaryLinesSchema, mediaUrlSchema } from '@/lib/rmhtube/party';
import { addTrack, getTrack, listTracks } from '@/lib/rmhtube/watch.server';

/**
 * RMHTube commentary tracks (T5). GET ?url= lists tracks for a media URL;
 * GET ?id= returns one track with its timestamped lines; POST records one.
 */
export const Route = createFileRoute('/api/rmhtube/commentary')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          rateLimit: 'read',
          query: z.object({ url: mediaUrlSchema.optional(), id: z.string().max(40).optional() }),
        },
        async ({ query }) => {
          if (query.id) {
            const track = await getTrack(query.id);
            return track ? Response.json({ track }) : notFound();
          }
          if (!query.url) return apiError('url or id required', 400);
          return Response.json({ tracks: await listTracks(query.url) });
        },
      ),
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            url: mediaUrlSchema,
            title: z.string().trim().min(1).max(80),
            lines: commentaryLinesSchema,
          }),
        },
        async ({ userId, body }) => {
          const track = await addTrack(userId, body.url, body.title, body.lines);
          if (!track) return apiError('Track limit reached for this video.', 429);
          return Response.json({ track }, { status: 201 });
        },
      ),
    },
  },
});
