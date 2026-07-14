import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const kindParam = new URL(request.url).searchParams.get('kind');
          const kind: PlaylistKind | undefined = kindParam === 'music' || kindParam === 'video' ? kindParam : undefined;
          return Response.json({ playlists: await listPlaylists(session.user.id, kind) });
        } catch (error) {
          console.error('Playlist list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), { limit: 20, windowMs: 60_000, prefix: 'playlist-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await createPlaylist(session.user.id, parsed.data.name, parsed.data.kind ?? 'music');
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ success: true, id: result.id }, { status: 201 });
        } catch (error) {
          console.error('Playlist create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
