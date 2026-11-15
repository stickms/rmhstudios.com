/** Contracts for the close-friends circle (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { getCircleData } from '@/lib/circle.server';

export const getCircleApi =
  endpoint<{
    res: Awaited<
      ReturnType<
        typeof getCircleData
      >
    >;
  }>()(
    {
      method:
        'GET',
      path: '/api/circle',
    },
  );

export const setCircleApi =
  endpoint<{
    body: {
      userIds: string[];
    };
    res: {
      ok: true;
      count: number;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/circle',
    },
  );
