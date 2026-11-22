import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getReadingTimePrefsApi, setReadingTimePrefsApi } from '@/lib/reading/time.contract';
import { timePrefsBody, timePrefsQuery } from '@/lib/reading/time-schema';
import { getTimePrefs, setTracking, setWeeklyTarget } from '@/lib/reading/time.server';

/**
 * GET /api/reading/time/prefs — whether tracking is on, the weekly target and,
 *     with `kind` and `key`, the caller's total reading time for that document.
 * PUT /api/reading/time/prefs — switch tracking and/or set the weekly target.
 */
export const route = apiRoute('/api/reading/time/prefs', {
  GET: implement(
    getReadingTimePrefsApi,
    {
      rateLimit: 'read',
      query: timePrefsQuery,
    },
    async ({ userId, query }) => {
      const doc =
        query.kind && query.key
          ? {
              kind: query.kind,
              key: query.key,
            }
          : undefined;
      return Response.json(await getTimePrefs(userId, doc), {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      });
    },
  ),
  PUT: implement(
    setReadingTimePrefsApi,
    {
      rateLimit: 'write',
      body: timePrefsBody,
    },
    async ({ userId, body }) => {
      if (body.trackTime !== undefined) await setTracking(userId, body.trackTime);
      if (body.weeklyMinutesTarget !== undefined) await setWeeklyTarget(userId, body.weeklyMinutesTarget);
      return getTimePrefs(userId);
    },
  ),
});
