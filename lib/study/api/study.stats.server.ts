import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getStudyStatsApi } from '@/lib/study/stats.contract';
import { statsQuery } from '@/lib/study/stats-schema';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '@/lib/study/stats';
import { getStudyStats } from '@/lib/study/stats.server';

/** GET /api/study/stats?deckId=&tz= — the signed-in member's own review statistics. */
export const route = apiRoute('/api/study/stats', {
  GET: implement(getStudyStatsApi, { rateLimit: 'read', query: statsQuery }, async ({ userId, query }) => {
    const timeZone = query.tz ?? DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(timeZone)) {
      return Response.json({ error: 'Invalid time zone' }, { status: 400 });
    }
    return getStudyStats(userId, { deckId: query.deckId, timeZone });
  }),
});
