/**
 * The query of "Yours" (s15-14), beside its contract and out of `tournaments.queries.ts`, which the `/tournaments`
 * route loader imports (so it is in the client entry on every page); only the lazy Yours panel reads these.
 */
import { api } from '@/lib/contract/client';
import { listMyTournamentsApi } from '@/lib/tournaments/mine.contract';

/** Key of the member's own list; one cache entry per page chain (`useInfiniteQuery`). */
export const myTournamentsKey = ['tournaments', 'mine'] as const;

/** One page of "Yours" (`GET /api/tournaments/mine`); `cursor` is the previous page's `nextCursor`. */
export const fetchMyTournamentsPage = (cursor: string | undefined) =>
  api(listMyTournamentsApi, { query: cursor ? { cursor } : {}, retries: 0 });
