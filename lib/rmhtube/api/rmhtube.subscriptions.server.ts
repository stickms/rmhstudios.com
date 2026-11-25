import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listSubscriptionsApi } from '@/lib/rmhtube/subscriptions.contract';
import { listMySubscriptions } from '@/lib/rmhtube/subscriptions.server';

/** The hosts the signed-in member follows (s13-07). Nobody can read anyone else's, and nothing here is a count. */
export const route = apiRoute('/api/rmhtube/subscriptions', {
  GET: implement(
    listSubscriptionsApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) => ({
      hosts: await listMySubscriptions(userId),
    }),
  ),
});
