/** Contract for the community insights endpoint (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CommunityInsightsDTO } from '@/lib/communities/insights';
import type { insightsQuery } from './insights-schema';

/**
 * Moderators only (403 otherwise): every panel of the Insights tab in one response, cached for ten
 * minutes per community, range and time zone. Counts only; nobody is named except the authors of
 * public top posts.
 */
export const getCommunityInsightsApi =
  endpoint<{
    query: z.infer<
      typeof insightsQuery
    >;
    res: CommunityInsightsDTO;
  }>()(
    {
      method:
        'GET',
      path: '/api/communities/$slug/insights',
    },
  );
