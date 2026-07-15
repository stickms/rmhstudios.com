import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { authorizeInternalRequest } from '@/lib/internal-auth';
import { settleWagerByGameSession } from '@/lib/wager/wager.server';
import { reportTournamentMatchByGameSession } from '@/lib/tournaments/tournament.server';

// Authoritative match-result seam. A game hub (e.g. the socket-server RMHType
// handler) POSTs the server-validated winner here after a match tied to a wager
// or tournament finishes. Guarded by the shared internal secret (constant-time
// compare) — never reachable from the browser. Idempotent downstream.
const schema = z.object({
  gameSessionRef: z.string().min(1).max(96),
  winnerId: z.string().min(1).max(64),
});

export const Route = createFileRoute('/api/internal/match-result')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = authorizeInternalRequest(
          request.headers.get('x-internal-secret'),
          process.env.INTERNAL_API_SECRET,
        );
        if (!authz.ok) return Response.json({ error: 'Unauthorized' }, { status: authz.status });

        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

        try {
          const { gameSessionRef, winnerId } = parsed.data;
          const wager = await settleWagerByGameSession({ gameSessionRef, winnerId });
          if (wager.settled) return Response.json({ ok: true, kind: 'wager' });

          const tourney = await reportTournamentMatchByGameSession({ gameSessionRef, winnerId });
          if (tourney.settled) return Response.json({ ok: true, kind: 'tournament' });

          return Response.json({ ok: true, kind: 'none', note: 'no live match for session' });
        } catch (error) {
          console.error('Internal match-result error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
