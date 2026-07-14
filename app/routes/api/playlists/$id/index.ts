import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getPlaylist, renamePlaylist, deletePlaylist } from '@/lib/playlists.server';

const renameSchema = z.object({ name: z.string().min(1).max(100) });

/**
 * GET    /api/playlists/$id — playlist detail (with items), owner only.
 * PATCH  /api/playlists/$id — rename.
 * DELETE /api/playlists/$id — delete.
 */
export const Route = createFileRoute('/api/playlists/$id/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const pl = await getPlaylist(params.id, session.user.id);
          if (!pl) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(pl);
        } catch (error) {
          console.error('Playlist get error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'playlist-rename' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = renameSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const ok = await renamePlaylist(params.id, session.user.id, parsed.data.name);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Playlist rename error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const ok = await deletePlaylist(params.id, session.user.id);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Playlist delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
