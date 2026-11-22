import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getBuildInsightsApi } from '@/lib/builds/insights.contract';
import { buildInsightsQuery } from '@/lib/builds/insights-schema';
import { getBuildInsights } from '@/lib/builds/insights.server';
import { parseRange } from '@/lib/builds/insights';

/**
 * GET /api/user-builds/[id]/insights?range=7|30|90 — per-day first views, likes, comments and unlocks of a build, with
 * the previous period, release markers and the biggest days. The build's owner or a site admin; anyone else, signed in
 * or not, gets 404, the same answer as a build that does not exist. `[id]` is the build's id or its slug.
 */
export const route = apiRoute('/api/user-builds/$id/insights', {
  GET: implement(
    getBuildInsightsApi,
    { auth: 'optional', rateLimit: 'read', query: buildInsightsQuery },
    async ({ params, userId, isAdmin, query }) => {
      const insights = await getBuildInsights(
        params.id,
        userId ? { id: userId, isAdmin } : null,
        parseRange(query.range),
      );
      if (!insights) return Response.json({ ...refusalBody('BUILD_NOT_FOUND') }, { status: 404 });
      return Response.json(insights, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
});
