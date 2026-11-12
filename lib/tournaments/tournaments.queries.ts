/**
 * The tournaments list as a route-seeded query (redesign audit B4): the
 * `/tournaments` loader fetches the first tab on the server, the page reads the
 * same key. Same list for everyone.
 */
import { contractQuery } from '@/lib/route/route-query';
import { listTournamentsApi } from '@/lib/tournaments/tournaments.contract';

export type TournamentStatus = 'REGISTRATION' | 'LIVE' | 'COMPLETE';

export const tournamentsQuery = (status: TournamentStatus) =>
  contractQuery(
    ['tournaments', 'list', status],
    listTournamentsApi,
    { query: { status }, retries: 0 },
    // The page refetched on every tab change and mount; keep it that fresh, but
    // let the loader's own result stand for the mount that follows it.
    { staleTime: 5_000 },
  );
