/**
 * Contracts for event co-hosts (client-safe; types by `import type`). A refused call answers
 * `{ error, code }` (see `refusalMessage` in `cohosts.ts`); read the code with `errorField(e, 'code')`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CohostEntryDTO } from '@/lib/events/cohosts';
import type { inviteCohostBody, respondCohostBody } from '@/lib/events/cohosts-schema';

/** The co-hosts the viewer may see: the host sees everyone, an accepted co-host the accepted ones. */
export const listCohostsApi = endpoint<{ res: { cohosts: CohostEntryDTO[]; max: number } }>()({
  method: 'GET',
  path: '/api/events/$id/cohosts',
});

/** The host invites a member (repeating an invitation changes nothing). */
export const inviteCohostApi = endpoint<{
  body: z.infer<typeof inviteCohostBody>;
  res: { cohost: CohostEntryDTO };
}>()({ method: 'POST', path: '/api/events/$id/cohosts' });

/** The host removes a co-host or withdraws an invitation; a co-host removes themself (steps down). */
export const removeCohostApi = endpoint<{
  query: { userId: string };
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/events/$id/cohosts' });

/** The invited member accepts or declines. */
export const respondCohostApi = endpoint<{
  body: z.infer<typeof respondCohostBody>;
  res: { success: true; accept: boolean };
}>()({ method: 'POST', path: '/api/events/$id/cohosts/respond' });
