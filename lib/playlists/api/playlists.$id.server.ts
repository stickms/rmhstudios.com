import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deletePlaylistApi,
  getPlaylistApi,
  renamePlaylistApi,
} from '@/lib/playlists/playlists.contract';
import { renamePlaylistBody } from '@/lib/playlists/playlists-schema';
import { getPlaylist, renamePlaylist, deletePlaylist } from '@/lib/playlists.server';

/**
 * GET    /api/playlists/$id — playlist detail (with items), owner only.
 * PATCH  /api/playlists/$id — rename.
 * DELETE /api/playlists/$id — delete.
 */
export const route = apiRoute('/api/playlists/$id', {
  GET: implement(getPlaylistApi, {}, async ({ params, session }) => {
    const pl = await getPlaylist(params.id, session.user.id);
    if (!pl) return Response.json({ error: 'Not found' }, { status: 404 });
    return pl;
  }),

  PATCH: implement(
    renamePlaylistApi,
    {
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'playlist-rename' },
      body: renamePlaylistBody,
      allowEmptyBody: true,
    },
    async ({ params, session, body }) => {
      const ok = await renamePlaylist(params.id, session.user.id, body.name);
      if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
      return { success: true as const };
    },
  ),

  DELETE: implement(
    deletePlaylistApi,
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:playlists/:id/index' } },
    async ({ params, session }) => {
      const ok = await deletePlaylist(params.id, session.user.id);
      if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
      return { success: true as const };
    },
  ),
});
