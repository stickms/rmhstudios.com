import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createReadingSubscriptionApi, listReadingSubscriptionsApi } from '@/lib/reading/subscriptions.contract';
import { createSubscriptionBody } from '@/lib/reading/subscriptions-schema';
import { createSubscription, listSubscriptions } from '@/lib/reading/subscriptions.server';

/**
 * GET  /api/reading/subscriptions — the caller's follows of the Logs, tags, News categories and stories.
 * POST /api/reading/subscriptions — follow one (idempotent). Members only; at most 100 each.
 */
const MESSAGES: Record<string, string> = {
  'limit-reached': 'You follow the most you can. Unfollow something first.',
  'target-not-found': 'That tag or story does not exist.',
};

export const route = apiRoute('/api/reading/subscriptions', {
  GET: implement(
    listReadingSubscriptionsApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) => ({
      subscriptions: await listSubscriptions(userId),
    }),
  ),
  POST: implement(
    createReadingSubscriptionApi,
    {
      rateLimit: 'write',
      body: createSubscriptionBody,
    },
    async ({ userId, body }) => {
      const result = await createSubscription(userId, body);
      if (!result.ok) {
        return Response.json(
          {
            error: MESSAGES[result.reason] ?? 'That cannot be followed.',
            reason: result.reason,
          },
          {
            status: result.status,
          },
        );
      }
      return {
        subscription: result.subscription,
      };
    },
  ),
});
