/**
 * The host's waitlist view as a React Query, and the one write it makes (redesign
 * audit B4: data a panel reads is a query, not an effect). Client-safe: contracts only.
 */
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/contract/client';
import { listWaitlistApi, removeFromWaitlistApi } from '@/lib/events/waitlist.contract';

export const waitlistQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event-waitlist', eventId] as const,
    queryFn: ({ signal }) => api(listWaitlistApi, { params: { id: eventId }, signal }),
    staleTime: 15_000,
  });

/** Take one member off the waitlist; answers the waitlist as it now stands. */
export const removeFromWaitlist = (eventId: string, userId: string) =>
  api(removeFromWaitlistApi, { params: { id: eventId }, query: { userId } });
