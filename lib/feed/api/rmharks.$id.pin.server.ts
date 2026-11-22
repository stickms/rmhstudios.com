import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getPinStateApi, pinPostApi } from '@/lib/feed/profile-pins.contract';
import { getPinState, pinRefusal, togglePin } from '@/lib/feed/profile-pins.server';

/**
 * `/api/rmharks/$id/pin` (sprint 05 #19). GET answers where the post stands among its author's pins; POST toggles it:
 * pins it as the last of up to three, or unpins it when it is already pinned. A fourth pin is a 409 and nothing is
 * unpinned for the member. Both answer `pinnedCount` and `limit` beside `pinned`.
 */
export const route = apiRoute('/api/rmharks/$id/pin', {
  GET: implement(getPinStateApi, { rateLimit: 'read' }, async ({ params, userId }) => {
    try {
      return Response.json(await getPinState(userId, params.id), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (err) {
      return pinRefusal(err);
    }
  }),
  POST: implement(pinPostApi, { rateLimit: 'write' }, async ({ params, userId }) => {
    try {
      return Response.json({ success: true, ...(await togglePin(userId, params.id)) });
    } catch (err) {
      return pinRefusal(err);
    }
  }),
});
