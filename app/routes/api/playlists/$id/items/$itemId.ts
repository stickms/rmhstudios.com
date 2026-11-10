import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { removePlaylistItemApi } from '@/lib/playlists/playlists.contract';
import { removeItem } from '@/lib/playlists.server';

/** DELETE /api/playlists/$id/items/$itemId — remove an item from the caller's playlist. */
export const Route = createFileRoute('/api/playlists/$id/items/$itemId')({
  server: {
    handlers: {
      DELETE: implement(
        removePlaylistItemApi,
        {
          rateLimit: {
            policy: 'write',
            scope: 'user',
            prefix: 'mutation:playlists/:id/items/:itemId',
          },
        },
        async ({ params, session }) => {
          const ok = await removeItem(params.id, params.itemId, session.user.id);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return { success: true as const };
        },
      ),
    },
  },
});
