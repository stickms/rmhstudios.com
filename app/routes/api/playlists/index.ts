import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { listPlaylists, createPlaylist, type PlaylistKind } from '@/lib/playlists.server';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  // Only video playlists can be created; `music` ones belonged to the retired
  // RMHMusic listening-party app and are read-only legacy rows.
  kind: z.literal('video').optional(),
});

/**
 * GET  /api/playlists?kind= — the caller's playlists.
 * POST /api/playlists — create a (video) playlist.
 */
export const Route = createFileRoute('/api/playlists/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ request, session }) => {
        const kindParam = new URL(request.url).searchParams.get('kind');
        const kind: PlaylistKind | undefined =
          kindParam === 'music' || kindParam === 'video' ? kindParam : undefined;
        return Response.json({ playlists: await listPlaylists(session.user.id, kind) });
      }),

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
