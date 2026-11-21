/**
 * Contracts for jam feedback (client-safe; types by `import type`). A refused call answers `{ error, code }`
 * with a `FeedbackRefusal` code; read it with `errorField(e, 'code')`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedbackDTO } from '@/lib/competitive/jam-feedback';

/** The feedback on one entry: its submitter, accepted teammates and admins only. Never cached. */
export const listJamFeedbackApi = endpoint<{
  params: { slug: string; entryId: string };
  res: { feedback: FeedbackDTO[] };
}>()({ method: 'GET', path: '/api/jams/$slug/entries/$entryId/feedback' });

/** The team marks a piece Helpful (repeating it changes nothing). */
export const markFeedbackHelpfulApi = endpoint<{
  params: { slug: string; id: string };
  res: { success: true };
}>()({ method: 'POST', path: '/api/jams/$slug/feedback/$id/helpful' });

/** The team takes the Helpful flag back off. */
export const unmarkFeedbackHelpfulApi = endpoint<{
  params: { slug: string; id: string };
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/jams/$slug/feedback/$id/helpful' });
