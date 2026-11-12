import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { leagueCreateSchema } from '@/lib/elections/leagues';
import { createLeague, listMyLeagues } from '@/lib/elections/leagues.server';

/**
 * GET  /api/elections/leagues — the leagues I am in.
 * POST /api/elections/leagues — start one; I become its first member. No coins are involved anywhere.
 */
export const route = apiRoute('/api/elections/leagues', {
  GET: defineHandler({ rateLimit: 'read', label: 'elections.leagues.list' }, async ({ userId }) =>
    Response.json(
      { leagues: await listMyLeagues(userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
  POST: defineHandler(
    { rateLimit: 'write', body: leagueCreateSchema, label: 'elections.leagues.create' },
    async ({ userId, body }) => {
      const res = await createLeague(userId, body);
      return res.ok
        ? Response.json({ code: res.code }, { status: 201 })
        : Response.json({ error: res.error }, { status: res.status });
    },
  ),
});
