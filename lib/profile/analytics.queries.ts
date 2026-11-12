/** The signed-in creator's own analytics as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { getCreatorAnalyticsApi } from '@/lib/profile/profile-extras.contract';
import { contractQuery } from '@/lib/route/route-query';

export const creatorAnalyticsQuery = () =>
  contractQuery(
    ['profile', 'analytics'],
    getCreatorAnalyticsApi,
    { retries: 0 },
    { staleTime: 30_000 },
  );
