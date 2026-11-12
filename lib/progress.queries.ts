/** The member's progress summary and the season pass as route-seeded queries (redesign audit B4). */
import { getBattlePassApi, getProgressApi } from '@/lib/battlepass/battlepass.contract';
import { contractQuery } from '@/lib/route/route-query';

/** Signed in only: signed out, the route answers 401 and nothing is seeded. */
export const progressSummaryQuery = () =>
  contractQuery(['progress', 'summary'], getProgressApi, undefined, { staleTime: 15_000 });

/** Public; the viewer's own progress is filled in when there is a session. */
export const battlepassQuery = () =>
  contractQuery(['progress', 'battlepass'], getBattlePassApi, undefined, { staleTime: 15_000 });
