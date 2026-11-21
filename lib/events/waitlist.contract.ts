/**
 * Contracts for the host's view of an event waitlist. Client-safe: types only.
 * A refused call answers `{ error }`; a caller who is neither the host nor a
 * site admin gets 404, so a private event does not reveal itself.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { WaitlistViewDTO } from '@/lib/events/waitlist';

/** The waitlist in order, with when each member joined. Host or site admin. */
export const listWaitlistApi = endpoint<{ res: WaitlistViewDTO }>()({
  method: 'GET',
  path: '/api/events/$id/waitlist',
});

/** Take one member off the waitlist; answers the new queue. Host or site admin. */
export const removeFromWaitlistApi = endpoint<{
  query: { userId: string };
  res: WaitlistViewDTO;
}>()({ method: 'DELETE', path: '/api/events/$id/waitlist' });
