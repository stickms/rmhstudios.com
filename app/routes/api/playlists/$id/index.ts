import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
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
      GET: defineHandler({}, async ({ params, session }) => {
        const pl = await getPlaylist(params.id, session.user.id);
        if (!pl) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(pl);
      }),

      PATCH: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'playlist-rename' } },
        async ({ request, params, session }) => {
          const body = await request.json().catch(() => ({}));
          const parsed = renameSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const ok = await renamePlaylist(params.id, session.user.id, parsed.data.name);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true });
        },
      ),

      DELETE: defineHandler({}, async ({ params, session }) => {
        const ok = await deletePlaylist(params.id, session.user.id);
        if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ success: true });
      }),
    },
  },
});
