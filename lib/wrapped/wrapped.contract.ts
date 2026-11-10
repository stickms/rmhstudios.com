/** Contracts for the year-in-review and weekly recap reads (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { getWeeklyRecap } from '@/lib/recap.server';
import type { YearlyWrapped } from '@/lib/wrapped/wrapped.server';

export const getWrappedApi = endpoint<{
  query: { year?: number };
  res: YearlyWrapped;
}>()({ method: 'GET', path: '/api/wrapped' });

export const getRecapApi = endpoint<{
  res: Awaited<ReturnType<typeof getWeeklyRecap>>;
}>()({ method: 'GET', path: '/api/recap' });
