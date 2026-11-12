/** The creator studio overview and redemptions as route-seeded queries (redesign audit B4). */
import { getCreatorRedemptionsApi } from '@/lib/creator/earnings.contract';
import { studioOverviewApi } from '@/lib/creator/studio.contract';
import { contractQuery } from '@/lib/route/route-query';

export const studioOverviewQuery = () =>
  contractQuery(['creator', 'studio-overview'], studioOverviewApi, undefined, {
    staleTime: 30_000,
  });

export const creatorRedemptionsQuery = () =>
  contractQuery(['creator', 'redemptions'], getCreatorRedemptionsApi, undefined, {
    staleTime: 15_000,
  });
