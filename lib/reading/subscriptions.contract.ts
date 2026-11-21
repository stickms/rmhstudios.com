/**
 * Contracts for /api/reading/subscriptions (follow the Logs, a Log tag, a News category or a story). Client-safe:
 * types come from the zod schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  createSubscriptionBody,
  SubscriptionView,
  updateSubscriptionBody,
} from '@/lib/reading/subscriptions-schema';

export const listReadingSubscriptionsApi =
  endpoint<{
    res: {
      subscriptions: SubscriptionView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/reading/subscriptions',
    },
  );

export const createReadingSubscriptionApi =
  endpoint<{
    body: z.infer<
      typeof createSubscriptionBody
    >;
    res: {
      subscription: SubscriptionView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/reading/subscriptions',
    },
  );

export const updateReadingSubscriptionApi =
  endpoint<{
    body: z.infer<
      typeof updateSubscriptionBody
    >;
    res: {
      subscription: SubscriptionView;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/reading/subscriptions/$id',
    },
  );

export const deleteReadingSubscriptionApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/reading/subscriptions/$id',
    },
  );
