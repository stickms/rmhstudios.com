/** Contracts for recurring community threads (client-safe; types by `import type`). Moderators only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { RecurringThreadDTO } from '@/lib/communities/recurring';
import type { createRecurringBody, updateRecurringBody } from './recurring-schema';

/** The community's templates, active first, with the active cap. */
export const listRecurringApi = endpoint<{
  res: {
    threads: RecurringThreadDTO[];
    maxActive: number;
  };
}>()({
  method: 'GET',
  path: '/api/communities/$slug/recurring',
});

/** 201. A sixth active template is a 409 with code `recurring_cap`. */
export const createRecurringApi = endpoint<{
  body: z.infer<typeof createRecurringBody>;
  res: {
    thread: RecurringThreadDTO;
  };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/recurring',
});

/** A full edit (makes the caller the author) or `{ active }` alone to pause or resume. */
export const updateRecurringApi = endpoint<{
  body: z.infer<typeof updateRecurringBody>;
  res: {
    thread: RecurringThreadDTO;
  };
}>()({
  method: 'PATCH',
  path: '/api/communities/$slug/recurring/$id',
});

export const deleteRecurringApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/communities/$slug/recurring/$id',
});

/** "Post now": the next occurrence happens at once, the schedule does not move. */
export const postRecurringNowApi = endpoint<{
  res: {
    postId: string;
  };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/recurring/$id',
});
