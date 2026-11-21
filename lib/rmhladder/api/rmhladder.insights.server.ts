import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getInsightsApi } from '@/lib/rmhladder/insights.contract';
import { insightsQuery } from '@/lib/rmhladder/insights-schema';
import { loadInsights } from '@/lib/rmhladder/insights.server';

/** GET /api/rmhladder/insights summarises the caller's own applications and status history. */
export const route =
  apiRoute(
    '/api/rmhladder/insights',
    {
      GET: implement(
        getInsightsApi,
        {
          rateLimit:
            'read',
          query:
            insightsQuery,
        },
        async ({
          userId,
          query,
        }) =>
          loadInsights(
            userId,
            {
              range:
                query.range,
              quietDays:
                query.quietDays
                  ? Number(
                      query.quietDays,
                    )
                  : undefined,
            },
          ),
      ),
    },
  );
