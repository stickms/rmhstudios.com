/**
 * Contracts for event updates (client-safe; types only). A refused call answers `{ error, code }`; read the
 * code with `errorField(e, 'code')`. `RATE_LIMITED` also carries `nextAt`, when the next update is possible.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { EventUpdateDTO, UpdatesRes } from '@/lib/events/updates';
import type { postUpdateBody, recipientsQuery } from '@/lib/events/updates-schema';

export const listUpdatesApi = endpoint<{ res: UpdatesRes }>()({
  method: 'GET',
  path: '/api/events/$id/updates',
});

export const postUpdateApi = endpoint<{
  body: z.infer<typeof postUpdateBody>;
  res: { update: EventUpdateDTO };
}>()({ method: 'POST', path: '/api/events/$id/updates' });

export const deleteUpdateApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/events/$id/updates/$updateId',
});

/** How many people a post would notify. `occurrenceAt`: an original start, or `series`; omitted: the next date. */
export const updateRecipientsApi = endpoint<{
  query: z.infer<typeof recipientsQuery>;
  res: { count: number };
}>()({ method: 'GET', path: '/api/events/$id/updates/recipients' });
