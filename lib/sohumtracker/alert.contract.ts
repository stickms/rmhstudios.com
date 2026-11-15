/**
 * Contracts for /api/sohumtracker/alert (redesign audit C1, batch 8): the
 * caller's "tell me when he joins voice" switch. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

export const getSohumAlertApi =
  endpoint<{
    res: {
      enabled: boolean;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/sohumtracker/alert',
    },
  );

export const setSohumAlertApi =
  endpoint<{
    body: {
      enabled: boolean;
    };
    res: {
      enabled: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/sohumtracker/alert',
    },
  );
