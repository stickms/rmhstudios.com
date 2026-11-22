import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { addPlaylistItemsBulkApi } from '@/lib/playlists/playlists.contract';
import { addPlaylistItemsBulkBody } from '@/lib/playlists/playlists-schema';
import { addItems } from '@/lib/playlists.server';

/** POST /api/playlists/$id/items/bulk — append several items to a playlist the caller may edit. */
export const route = apiRoute('/api/playlists/$id/items/bulk', {
  POST: implement(
    addPlaylistItemsBulkApi,
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'playlist-add-bulk' },
      body: addPlaylistItemsBulkBody,
    },
    async ({ params, session, body }) => {
      const result = await addItems(params.id, session.user.id, body.items);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return {
        success: true as const,
        added: result.added,
        duplicates: result.duplicates,
        skipped: result.skipped,
      };
    },
  ),
});
