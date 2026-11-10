import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { addPlaylistItemApi } from '@/lib/playlists/playlists.contract';
import { addPlaylistItemBody } from '@/lib/playlists/playlists-schema';
import { addItem } from '@/lib/playlists.server';

/** POST /api/playlists/$id/items — add an item to the caller's playlist. */
export const Route = createFileRoute('/api/playlists/$id/items/')({
  server: {
    handlers: {
      POST: implement(
        addPlaylistItemApi,
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'playlist-add' },
          body: addPlaylistItemBody,
          allowEmptyBody: true,
        },
        async ({ params, session, body }) => {
          const result = await addItem(params.id, session.user.id, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return { success: true as const, duplicate: result.duplicate };
        },
      ),
    },
  },
});
