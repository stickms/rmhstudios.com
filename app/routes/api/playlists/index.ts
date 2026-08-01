import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { listPlaylists, createPlaylist, type PlaylistKind } from '@/lib/playlists.server';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(['music', 'video']).optional(),
});

/**
 * GET  /api/playlists?kind= — the caller's playlists.
 * POST /api/playlists — create a playlist.
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
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'playlist-create' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await createPlaylist(
            session.user.id,
            parsed.data.name,
            parsed.data.kind ?? 'music',
          );
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ success: true, id: result.id }, { status: 201 });
        },
      ),
    },
  },
});
