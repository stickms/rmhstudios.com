import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getAudienceApi } from '@/lib/social/audience.contract';
import { audienceQuery } from '@/lib/social/audience-schema';
import { getAudienceInsights } from '@/lib/social/audience.server';
import type { AudienceRange } from '@/lib/social/audience';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '@/lib/study/stats';

/** GET /api/analytics/audience?range=&tz= — the signed-in member's own follower history and audience hours. */
export const route = apiRoute('/api/analytics/audience', {
  GET: implement(
    getAudienceApi,
    {
      rateLimit: 'read',
      query: audienceQuery,
    },
    async ({ userId, query }) => {
      const timeZone = query.tz ?? DEFAULT_TIME_ZONE;
      if (!isValidTimeZone(timeZone)) {
        return Response.json(
          {
            error: 'Invalid time zone',
          },
          {
            status: 400,
          },
        );
      }
      const range = Number(query.range ?? '30') as AudienceRange;
      return getAudienceInsights(userId, {
        range,
        timeZone,
      });
    },
  ),
});
