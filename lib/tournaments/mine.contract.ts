/**
 * The contract of "Yours" (s15-14). It is not in `tournaments.contract.ts`: the `/tournaments` route loader imports
 * that file, so whatever it holds is in the client entry on every page, while only the lazy Yours panel
 * (`mine.queries.ts`) and its server route read this one.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { MyTournamentsPage } from '@/lib/tournaments/mine.server';

/**
 * The signed-in member's own tournaments, entered or hosted, newest first, 20 a page, each with their place and prize
 * (`GET /api/tournaments/mine`). Private and never cached. `cursor` is the previous page's `nextCursor`; a malformed
 * one is a 400.
 */
export const listMyTournamentsApi = endpoint<{
  query: {
    cursor?: string | undefined;
  };
  res: MyTournamentsPage;
}>()({
  method: 'GET',
  path: '/api/tournaments/mine',
});
