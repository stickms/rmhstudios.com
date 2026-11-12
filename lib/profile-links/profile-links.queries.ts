/** The signed-in member's profile links as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { listProfileLinksApi } from '@/lib/profile-links/profile-links.contract';
import { contractQuery } from '@/lib/route/route-query';

export const profileLinksQuery = () =>
  contractQuery(['settings', 'profile-links'], listProfileLinksApi, undefined, {
    staleTime: 15_000,
  });
