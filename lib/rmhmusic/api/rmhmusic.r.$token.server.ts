import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { sharedResultApi } from '@/lib/rmhmusic/social/share.contract';
import { utcDate } from '@/lib/rmhmusic/learn/sprint/generate';
import { sharedResultRes } from '@/lib/rmhmusic/learn/social/share-schema';
import { getSharedResult } from '@/lib/rmhmusic/learn/social/share.server';
import { cardLines } from '@/lib/rmhmusic/learn/social/share';

/**
 * `GET /api/rmhmusic/r/$token` — a shared result for its public page (`/rmhmusic/r/$token`, Phase
 * 6, plan 1.4), signed out or in. One "gone" for every reason a link cannot be seen, including a
 * signed-in viewer who blocks or is blocked by the sharer. The token is checked for shape before
 * any query and never logged. Not cached: stopping a link takes the page down at once.
 *
 * The share's id (what Report names) goes to a signed-in viewer only. The result goes out through
 * `sharedResultRes.parse`, which drops every key the schema does not name: that, not
 * `implement()`'s `response` check (dev and test only), is the leak filter.
 */
export const route = apiRoute('/api/rmhmusic/r/$token', {
  GET: implement(
    sharedResultApi,
    { auth: 'optional', rateLimit: 'read', response: sharedResultRes },
    async ({ userId, params }) => {
      const now = Date.now();
      const view = await getSharedResult(params.token, userId, now);
      if (view.state !== 'live') return sharedResultRes.parse({ state: 'gone' });
      const { id, ...rest } = view;
      return sharedResultRes.parse({
        ...rest,
        ...(userId ? { id } : {}),
        mine: userId !== null && view.mine,
        lines: cardLines(view.payload),
        today: view.payload.kind === 'daily' && view.payload.date === utcDate(now),
      });
    },
  ),
});
