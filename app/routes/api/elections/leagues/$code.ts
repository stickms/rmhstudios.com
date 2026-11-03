import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { isLeagueCode } from '@/lib/elections/leagues';
import { getLeagueView, joinLeague, leaveLeague } from '@/lib/elections/leagues.server';

const notFound = () => Response.json({ error: 'League not found.' }, { status: 404 });

/**
 * GET    /api/elections/leagues/:code — the league. Anyone with the code sees its name and size; members
 *        also see the leaderboard and their own saved map.
 * POST   — join (the code is the invitation).
 * DELETE — leave (the owner leaving closes the league).
 */
export const Route = createFileRoute('/api/elections/leagues/$code')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read', label: 'elections.leagues.get' }, async ({ params, userId }) => {
        const code = String(params.code ?? '').toUpperCase();
        if (!isLeagueCode(code)) return notFound();
        const view = await getLeagueView(code, userId);
        return view ? Response.json({ league: view }, { headers: { 'Cache-Control': 'private, no-store' } }) : notFound();
      }),
      POST: defineHandler({ rateLimit: 'write', label: 'elections.leagues.join' }, async ({ params, userId }) => {
        const code = String(params.code ?? '').toUpperCase();
        if (!isLeagueCode(code)) return notFound();
        const res = await joinLeague(code, userId);
        return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: res.status });
      }),
      DELETE: defineHandler({ rateLimit: 'write', label: 'elections.leagues.leave' }, async ({ params, userId }) => {
        const code = String(params.code ?? '').toUpperCase();
        if (!isLeagueCode(code)) return notFound();
        const res = await leaveLeague(code, userId);
        return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: res.status });
      }),
    },
  },
});
