import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getWager } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/api/wager/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const wager = await getWager(params.id, session?.user?.id ?? null);
          if (!wager) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ wager });
        } catch (error) {
          console.error('Wager get error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
