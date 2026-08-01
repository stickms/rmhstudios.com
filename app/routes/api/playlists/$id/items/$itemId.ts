import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { removeItem } from '@/lib/playlists.server';

/** DELETE /api/playlists/$id/items/$itemId — remove an item from the caller's playlist. */
export const Route = createFileRoute('/api/playlists/$id/items/$itemId')({
  server: {
    handlers: {
      DELETE: defineHandler({}, async ({ params, session }) => {
        const ok = await removeItem(params.id, params.itemId, session.user.id);
        if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ success: true });
      }),
    },
  },
});
