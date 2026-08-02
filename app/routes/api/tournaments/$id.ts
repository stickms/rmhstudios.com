import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getTournament } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/api/tournaments/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const tournament = await getTournament(params.id, session?.user?.id ?? null);
        if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ tournament });
      }),
    },
  },
});
