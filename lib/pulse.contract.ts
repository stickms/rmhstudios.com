/**
 * Contract for the one repeating request a signed-in tab makes (redesign audit C1, batch 10):
 * the presence heartbeat plus whichever ambient sections the mounted consumers need. A tab over
 * the rate limit gets 200 `{ ok: true, throttled: true }` with no sections (not a 429), and a
 * signed-out one 401 `{ ok: false }`; the route is hand-wrapped to keep that, so this is the
 * hand-written shape of what it returns. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { getActiveFriends, getOnlineFriends } from '@/lib/presence.server';

export type PulseSection = 'notifications' | 'friends' | 'activeFriends';

export interface PulseResponse {
  ok: boolean;
  notifications?: number;
  friends?: Awaited<ReturnType<typeof getOnlineFriends>>;
  activeFriends?: Awaited<ReturnType<typeof getActiveFriends>>;
}

export const pulseApi = endpoint<{
  body: { want?: PulseSection[] | undefined };
  res: PulseResponse;
}>()({ method: 'POST', path: '/api/pulse' });
