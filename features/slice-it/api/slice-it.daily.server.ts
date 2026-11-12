import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/slice-it/engine/slice-it.contract';
import { getDailyState } from '@features/slice-it/engine/daily.server';

/**
 * S1 — today's daily challenge, its board, and the viewer's attempt.
 *
 * `auth: 'optional'`: a signed-out player should still be able to see what
 * today's challenge is and who is on the board — hiding it behind a login is
 * how a daily nobody knows about stays a daily nobody plays. They simply get no
 * `entry` and no `myRank`, and the submit route below does require an account.
 *
 * Not cached. The selection is a pure function of the day key so it is cheap to
 * recompute, but the board changes on every submission, and a daily board that
 * is thirty seconds stale is a daily board that shows a player someone else's
 * rank as their own.
 */
export const route = apiRoute('/api/slice-it/daily', {
  GET: implement(C.getDailyApi, { auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
    return Response.json(await getDailyState(userId));
  }),
});
