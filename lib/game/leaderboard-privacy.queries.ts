/** The member's "show me on game leaderboards" switch as a query (Settings > Privacy). */
import { getLeaderboardPrivacyApi } from '@/lib/game/leaderboard-privacy.contract';
import { contractQuery } from '@/lib/route/route-query';

export const leaderboardPrivacyQuery = () =>
  contractQuery(['settings', 'leaderboard-privacy'], getLeaderboardPrivacyApi, undefined, {
    staleTime: 30_000,
  });
