import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { removeItem } from '@/lib/playlists.server';

/** DELETE /api/playlists/$id/items/$itemId — remove an item from the caller's playlist. */
export const Route = createFileRoute('/api/playlists/$id/items/$itemId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const ok = await removeItem(params.id, params.itemId, session.user.id);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Playlist remove-item error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
