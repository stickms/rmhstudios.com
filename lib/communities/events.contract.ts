/** Contract for a community's events (s10-07; client-safe, types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { EventDTO } from '@/lib/events.server';
import type { communityEventsQuery } from './events-schema';

/**
 * The community's upcoming events (soonest first) or its last 20 ended ones (newest first). A slug that does not exist
 * and a private community the caller is not in both answer `{ events: [] }`, so the endpoint is no existence oracle.
 */
export const communityEventsApi = endpoint<{
  query: z.infer<typeof communityEventsQuery>;
  res: { events: EventDTO[] };
}>()({
  method: 'GET',
  path: '/api/communities/$slug/events',
});
