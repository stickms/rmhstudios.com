/** Contract for the site-wide online counter (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export const onlineCountApi = endpoint<{ res: { count: number } }>()({
  method: 'GET',
  path: '/api/presence/online-count',
});
