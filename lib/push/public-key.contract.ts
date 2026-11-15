/** Contract for the VAPID public key (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

/** 404 when push is not configured. */
export const pushPublicKeyApi =
  endpoint<{
    res: {
      key: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/push/public-key',
    },
  );
