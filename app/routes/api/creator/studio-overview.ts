import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getStudioOverview } from '@/lib/creator/studio.server';

export const Route = createFileRoute('/api/creator/studio-overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          return Response.json({ overview: await getStudioOverview(session.user.id) });
        } catch (error) {
          console.error('Creator studio overview error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
