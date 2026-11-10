/** Contracts for the daily "Today" widget and the streak-freeze purchase (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export interface TodaySummary {
  streak: { current: number; checkedInToday: boolean; freezeTokens: number };
  wheel: { spunToday: boolean };
  puzzles: Array<{ mode: string; done: boolean }>;
  quests: { total: number; completed: number; claimable: number };
}

export const getTodayApi = endpoint<{ res: TodaySummary }>()({
  method: 'GET',
  path: '/api/today',
});

export const buyStreakFreezeApi = endpoint<{
  res: { success: true; cost: number; freezeTokens: number; newBalance: number };
}>()({ method: 'POST', path: '/api/streak/freeze' });
