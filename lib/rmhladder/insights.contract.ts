/**
 * Contract for GET /api/rmhladder/insights (sprint 03, feature 18). Client-safe:
 * the query type comes from the zod schema by `import type`, so no zod ships.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { Insights } from '@/lib/rmhladder/insights';
import type { insightsQuery } from '@/lib/rmhladder/insights-schema';

/** The caller's search insights over a range, with quiet applications at a chosen window. */
export const getInsightsApi =
  endpoint<{
    query: z.infer<
      typeof insightsQuery
    >;
    res: Insights;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhladder/insights',
    },
  );
