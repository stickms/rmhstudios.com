/** Contract for the solo Laundry Sort score submit (redesign audit C1, batch 10). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { LeaderboardRow } from '@/app/routes/api/laundry-sort/leaderboard';
import type { laundryScoreBody } from './score-schema';

export const submitLaundryScoreApi = endpoint<{
  body: z.infer<typeof laundryScoreBody>;
  res: { ok: true; personalBest: boolean };
}>()({ method: 'POST', path: '/api/laundry-sort/score' });

export const laundryLeaderboardApi = endpoint<{
  query: { mode?: 'solo' | 'versus'; limit?: number };
  res: LeaderboardRow[];
}>()({ method: 'GET', path: '/api/laundry-sort/leaderboard' });
