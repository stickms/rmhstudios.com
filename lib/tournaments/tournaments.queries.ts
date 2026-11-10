/**
 * The tournaments list as a route-seeded query (redesign audit B4): the
 * `/tournaments` loader fetches the first tab on the server, the page reads the
 * same key. Same list for everyone, so the server half needs no session.
 */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { listTournaments } from '@/lib/tournaments/tournament.server';
import { listTournamentsApi } from '@/lib/tournaments/tournaments.contract';

export type TournamentStatus = 'REGISTRATION' | 'LIVE' | 'COMPLETE';

const listTournamentsOnServer = createServerFn({ method: 'GET' })
  .validator((status: TournamentStatus): TournamentStatus => status)
  .handler(async ({ data: status }) => ({ tournaments: await listTournaments({ status }) }));

export const tournamentsQuery = (status: TournamentStatus) =>
  queryOptions({
    queryKey: ['tournaments', 'list', status],
    queryFn: routeQueryFn(
      () => listTournamentsOnServer({ data: status }),
      () => api(listTournamentsApi, { query: { status }, retries: 0 }),
    ),
    // The page refetched on every tab change and mount; keep it that fresh, but
    // let the loader's own result stand for the mount that follows it.
    staleTime: 5_000,
  });
