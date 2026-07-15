import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getTournament } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/api/tournaments/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const tournament = await getTournament(params.id, session?.user?.id ?? null);
          if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ tournament });
        } catch (error) {
          console.error('Tournament get error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
