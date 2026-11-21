/** A player's RMHBox record as a route-seeded query (redesign audit B4). */
import { getRmhboxStatsApi } from '@/lib/rmhbox/rmhbox-reads.contract';
import { contractQuery } from '@/lib/route/route-query';

export const playerStatsQuery = (userId: string) =>
  contractQuery(['rmhbox', 'stats', userId], getRmhboxStatsApi, { query: { userId } }, { staleTime: 30_000 });
