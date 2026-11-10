import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { createPlaylistApi, listPlaylistsApi } from '@/lib/playlists/playlists.contract';
import { createPlaylistBody } from '@/lib/playlists/playlists-schema';
import { listPlaylists, createPlaylist } from '@/lib/playlists.server';

/**
 * GET  /api/playlists — the caller's (video) playlists. A `?kind=` param is ignored.
 * POST /api/playlists — create a (video) playlist.
 */
export const Route = createFileRoute('/api/playlists/')({
  server: {
    handlers: {
      GET: implement(listPlaylistsApi, {}, async ({ session }) => ({
        playlists: await listPlaylists(session.user.id),
      })),

      POST: implement(
        createPlaylistApi,
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'playlist-create' },
          body: createPlaylistBody,
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
