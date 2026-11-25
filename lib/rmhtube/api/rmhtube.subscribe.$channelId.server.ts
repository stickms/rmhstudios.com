import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { subscribeApi, unsubscribeApi } from '@/lib/rmhtube/subscriptions.contract';
import { subscribeToHost, unsubscribeFromHost } from '@/lib/rmhtube/subscriptions.server';

/** PUT subscribes to a host's watch parties, DELETE stops. Both are idempotent (s13-07). */
export const route = apiRoute('/api/rmhtube/subscribe/$channelId', {
  PUT: implement(
    subscribeApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const result = await subscribeToHost(userId, params.channelId ?? '');
      if (result.ok) return { subscribed: true };
      if (result.code === 'TUBE_SUBSCRIBE_LIMIT')
        return Response.json(refusalBody('TUBE_SUBSCRIBE_LIMIT', { max: result.max }), { status: 409 });
      if (result.code === 'TUBE_SUBSCRIBE_SELF')
        return Response.json(refusalBody('TUBE_SUBSCRIBE_SELF'), { status: 400 });
      return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
    },
  ),
  DELETE: implement(
    unsubscribeApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      await unsubscribeFromHost(userId, params.channelId ?? '');
      return { subscribed: false };
    },
  ),
});
