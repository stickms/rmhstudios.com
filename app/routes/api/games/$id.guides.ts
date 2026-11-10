import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listGuides, isValidGame } from '@/lib/games/meta.server';

/** GET /api/games/:id/guides — published guides (+ the caller's own drafts). */
export const Route = createFileRoute('/api/games/$id/guides')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, userId }) => {
        if (!isValidGame(params.id)) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ guides: await listGuides(params.id, userId) });
      }),
    },
  },
});
