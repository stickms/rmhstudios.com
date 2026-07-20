import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getArcadeState } from '@/lib/game/results.server';

/** GET /api/arcade/ — today's arcade challenges + streak for the viewer. */
export const Route = createFileRoute('/api/arcade/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const state = await getArcadeState(session.user.id);
          return Response.json(state);
        } catch (error) {
          console.error('arcade state error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
