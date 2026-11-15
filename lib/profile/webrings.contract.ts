/**
 * Contracts for /api/webrings writes (redesign audit C1, batch 4). Client-safe:
 * request types come from the zod schemas by `import type`. Failures carry the
 * server's `{ error }` text as the `HttpError` message.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { RingSummary } from '@/lib/profile/webrings';
import type { createRingSchema } from '@/lib/profile/webrings-schema';

/** 201. The creator is the ring's first member. */
export const createRingApi =
  endpoint<{
    body: z.infer<
      typeof createRingSchema
    >;
    res: {
      ring: RingSummary;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/webrings',
    },
  );

/** The owner closes the ring. */
export const closeRingApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/webrings/$slug',
    },
  );

export const joinRingApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/webrings/$slug/membership',
    },
  );

export const leaveRingApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/webrings/$slug/membership',
    },
  );
