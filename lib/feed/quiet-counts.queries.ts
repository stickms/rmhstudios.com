/**
 * The member's two quiet-counts switches as a route-seeded query (redesign audit B4). Signed out, nothing is seeded
 * and `useHideCountsInFeed` reads false.
 */
import { getQuietCountsApi } from '@/lib/feed/quiet-counts.contract';
import { contractQuery } from '@/lib/route/route-query';

export const quietCountsQuery = () =>
  contractQuery(['settings', 'quiet-counts'], getQuietCountsApi, undefined, { staleTime: 60_000 });
