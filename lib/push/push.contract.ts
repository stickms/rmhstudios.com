/** Contracts for /api/push/subscribe (redesign audit C1, batch 9). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  subscribePushBody,
  unsubscribePushBody,
} from './push-schema';

/** Store this browser's push subscription (400 `Invalid subscription` on a malformed one). */
export const subscribePushApi =
  endpoint<{
    body: z.infer<
      typeof subscribePushBody
    >;
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/push/subscribe',
    },
  );

export const unsubscribePushApi =
  endpoint<{
    body: z.infer<
      typeof unsubscribePushBody
    >;
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/push/subscribe',
    },
  );
