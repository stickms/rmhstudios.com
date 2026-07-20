import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getStudioOverview } from '@/lib/creator/studio.server';

/** GET /api/studio/overview — the caller's Creator Studio dashboard model. */
export const Route = createFileRoute('/api/studio/overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json(await getStudioOverview(session.user.id));
        } catch (error) {
          console.error('Studio overview error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
