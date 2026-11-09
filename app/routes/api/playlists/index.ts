import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { listPlaylists, createPlaylist } from '@/lib/playlists.server';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  // Every playlist is a video playlist; the field is accepted for older clients.
  kind: z.literal('video').optional(),
});

/**
 * GET  /api/playlists — the caller's (video) playlists. A `?kind=` param is ignored.
 * POST /api/playlists — create a (video) playlist.
 */
export const Route = createFileRoute('/api/playlists/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) =>
        Response.json({ playlists: await listPlaylists(session.user.id) }),
      ),

      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'playlist-create' },
          body: createSchema,
          allowEmptyBody: true,
        },
        async ({ session, body }) => {
          const result = await createPlaylist(session.user.id, body.name);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ success: true, id: result.id }, { status: 201 });
        },
      ),
    },
  },
});
