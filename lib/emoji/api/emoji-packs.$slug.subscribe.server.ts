/**
 * /api/emoji-packs/$slug/subscribe — install or remove a pack.
 *
 * Deliberately NOT gated. Creating packs is a membership feature; installing
 * and using them is free for everyone, which is what makes a member's pack
 * worth making.
 */
import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { subscribePackApi, unsubscribePackApi } from '@/lib/emoji/packs.contract';
import { subscribe, unsubscribe, PackError } from '@/lib/emoji/packs.server';

export const route = apiRoute('/api/emoji-packs/$slug/subscribe', {
  POST: implement(subscribePackApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    try {
      await subscribe(userId, params.slug);
      return Response.json({ ok: true });
    } catch (err) {
      if (err instanceof PackError) return apiError(err.message, err.status);
      throw err;
    }
  }),
  DELETE: implement(unsubscribePackApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    await unsubscribe(userId, params.slug);
    return Response.json({ ok: true });
  }),
});
