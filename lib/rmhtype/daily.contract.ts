/** Contracts for the RMHType daily challenge. Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { DailyBoard, DailyState } from '@/lib/rmhtype/daily';
import type { dailyFinishBody, dailyLeaderboardQuery } from '@/lib/rmhtype/daily-schema';

/** Today's state for the caller. */
export const getRmhTypeDailyApi = endpoint<{
  res: DailyState;
}>()({
  method: 'GET',
  path: '/api/rmhtype/daily',
});

/** Use today's attempt. A second call returns the first, with the same clock. */
export const startRmhTypeDailyApi = endpoint<{
  res: DailyState;
}>()({
  method: 'POST',
  path: '/api/rmhtype/daily/start',
});

/** Report a finished run by keystroke counts; the server supplies the time. */
export const finishRmhTypeDailyApi = endpoint<{
  body: z.infer<typeof dailyFinishBody>;
  res: DailyState;
}>()({
  method: 'POST',
  path: '/api/rmhtype/daily/finish',
});

/** Today's or yesterday's board. */
export const getRmhTypeDailyBoardApi = endpoint<{
  query: z.infer<typeof dailyLeaderboardQuery>;
  res: DailyBoard;
}>()({
  method: 'GET',
  path: '/api/rmhtype/daily/leaderboard',
});
