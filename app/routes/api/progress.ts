import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getProgressSummary } from '@/lib/progress-summary.server';

/** GET /api/progress — the signed-in user's level, quests, and season summary. */
export const Route = createFileRoute('/api/progress')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json(await getProgressSummary(session.user.id));
        } catch (error) {
          console.error('Progress fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
