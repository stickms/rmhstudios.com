/** Query for a community's events (s10-07). Shared by the route and `events.contract.ts` (types only). */
import { z } from 'zod';

export const COMMUNITY_EVENT_WHEN = ['upcoming', 'past'] as const;

export const communityEventsQuery = z.object({
  when: z.enum(COMMUNITY_EVENT_WHEN).default('upcoming'),
});
