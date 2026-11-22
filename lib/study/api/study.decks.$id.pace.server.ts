import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getDeckPaceApi, setDeckPaceApi } from '@/lib/study/pace.contract';
import { paceBody, paceQuery } from '@/lib/study/pace-schema';
import { getDeckPace, learnMore, setDeckPace } from '@/lib/study/pace.server';

/**
 * GET   /api/study/decks/$id/pace?tz= — the owner's pace, test date, suggestion and seven-day forecast.
 * PATCH /api/study/decks/$id/pace — set the pace and/or test date, or `learnMore` (owner only; 404 otherwise).
 */
export const route = apiRoute('/api/study/decks/$id/pace', {
  GET: implement(getDeckPaceApi, { rateLimit: 'read', query: paceQuery }, async ({ userId, params, query }) => {
    const view = await getDeckPace(userId, params.id, query.tz);
    if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
    return view;
  }),

  PATCH: implement(setDeckPaceApi, { rateLimit: 'write', body: paceBody }, async ({ userId, params, body }) => {
    const result = body.learnMore
      ? await learnMore(userId, params.id, body.tz)
      : await setDeckPace(userId, params.id, body);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return {
      success: true as const,
      newPerDay: result.newPerDay,
      testDate: result.testDate,
      extraToday: result.extraToday,
    };
  }),
});
