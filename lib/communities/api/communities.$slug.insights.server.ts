import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod } from '@/lib/communities/guard.server';
import { getCommunityInsightsApi } from '@/lib/communities/insights.contract';
import { insightsQuery } from '@/lib/communities/insights-schema';
import { getCommunityInsights } from '@/lib/communities/insights.server';
import { DEFAULT_INSIGHT_RANGE, type InsightRange } from '@/lib/communities/insights';

/**
 * GET /api/communities/$slug/insights?range=28|90|365&tz= — the Insights tab's figures, charts and
 * tables in one response. Moderators only: counts and public top posts, never a list of members.
 */
export const route = apiRoute('/api/communities/$slug/insights', {
  GET: implement(
    getCommunityInsightsApi,
    {
      rateLimit: 'read',
      query: insightsQuery,
    },
    async ({ params, userId, query }) => {
      const guard = await requireMod(params.slug, userId);
      if (!guard.ok) return guard.response;
      return getCommunityInsights(
        guard.value.id,
        query.range ? (Number(query.range) as InsightRange) : DEFAULT_INSIGHT_RANGE,
        query.tz ?? 'UTC',
      );
    },
  ),
});
