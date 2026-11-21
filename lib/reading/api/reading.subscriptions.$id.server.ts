import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteReadingSubscriptionApi,
  updateReadingSubscriptionApi,
} from '@/lib/reading/subscriptions.contract';
import { updateSubscriptionBody } from '@/lib/reading/subscriptions-schema';
import {
  deleteSubscription,
  updateSubscription,
} from '@/lib/reading/subscriptions.server';

/**
 * PATCH  /api/reading/subscriptions/$id — turn the in-site or email channel on or off.
 * DELETE /api/reading/subscriptions/$id — unfollow.
 * Owner only: someone else's id is a 404, the same as one that does not exist.
 */
const NOT_FOUND =
  () =>
    Response.json(
      {
        error:
          'Not found.',
      },
      {
        status: 404,
      },
    );

export const route =
  apiRoute(
    '/api/reading/subscriptions/$id',
    {
      PATCH:
        implement(
          updateReadingSubscriptionApi,
          {
            rateLimit:
              'write',
            body: updateSubscriptionBody,
          },
          async ({
            userId,
            body,
            params,
          }) => {
            const subscription =
              await updateSubscription(
                userId,
                params.id,
                body,
              );
            return subscription
              ? {
                  subscription,
                }
              : NOT_FOUND();
          },
        ),
      DELETE:
        implement(
          deleteReadingSubscriptionApi,
          {
            rateLimit:
              'write',
          },
          async ({
            userId,
            params,
          }) => {
            return (await deleteSubscription(
              userId,
              params.id,
            ))
              ? {
                  ok: true as const,
                }
              : NOT_FOUND();
          },
        ),
    },
  );
