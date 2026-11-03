import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { isLeagueCode, picksBodySchema } from '@/lib/elections/leagues';
import { savePicks } from '@/lib/elections/leagues.server';

/** PUT /api/elections/leagues/:code/picks — save my painted map (replaces the old one). Frozen once polls close. */
export const Route = createFileRoute('/api/elections/leagues/$code/picks')({
  server: {
    handlers: {
      PUT: defineHandler({ rateLimit: 'write', body: picksBodySchema, label: 'elections.leagues.picks' }, async ({ params, userId, body }) => {
        const code = String(params.code ?? '').toUpperCase();
        if (!isLeagueCode(code)) return Response.json({ error: 'League not found.' }, { status: 404 });
        const res = await savePicks(code, userId, body.picks);
        return res.ok ? Response.json({ saved: res.saved }) : Response.json({ error: res.error }, { status: res.status });
      }),
    },
  },
});
