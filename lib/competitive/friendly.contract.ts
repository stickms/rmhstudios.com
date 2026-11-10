/** Contract for the friendly-challenge list (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { listFriendly } from '@/lib/competitive/friendly.server';

export const listFriendlyApi = endpoint<{
  res: { challenges: Awaited<ReturnType<typeof listFriendly>> };
}>()({ method: 'GET', path: '/api/friendly' });
