import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listGuides, isValidGame } from '@/lib/games/meta.server';

/** GET /api/games/:id/guides — published guides (+ the caller's own drafts). */
export const Route = createFileRoute('/api/games/$id/guides')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!isValidGame(params.id)) return Response.json({ error: 'Not found' }, { status: 404 });
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          return Response.json({ guides: await listGuides(params.id, session?.user.id ?? null) });
        } catch (error) {
          console.error('Game guides error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
