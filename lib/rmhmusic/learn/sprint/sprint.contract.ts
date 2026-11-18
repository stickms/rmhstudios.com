/**
 * Contracts for the sight reading results endpoints (plan task S5). Client-safe: types come from
 * the zod schemas by `import type`, so this file ships no zod. The rules the server applies are
 * written down in `record.ts` and `sprint.server.ts`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  sprintDailyBody,
  sprintDailyRes,
  sprintDailyStartBody,
  sprintDailyStartRes,
  sprintFreeplayBody,
  sprintFreeplayRes,
  sprintOverviewQuery,
  sprintOverviewRes,
} from './sprint-schema';

export type SprintOverview =
  z.infer<
    typeof sprintOverviewRes
  >;
export type SprintLevelBest =
  SprintOverview['bests'][number];
export type SprintDailyState =
  SprintOverview['daily'];

/** The learner's bests per level, and where the asked date's challenge stands. */
export const sprintOverviewApi =
  endpoint<{
    query: z.infer<
      typeof sprintOverviewQuery
    >;
    res: SprintOverview;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhmusic/sprint',
    },
  );

/** Keep a freeplay run; the server keeps the best per level and answers it. */
export const sprintFreeplayApi =
  endpoint<{
    body: z.infer<
      typeof sprintFreeplayBody
    >;
    res: z.infer<
      typeof sprintFreeplayRes
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhmusic/sprint/freeplay',
    },
  );

/** Keep the dealt date's scored challenge run (`already-scored` when it has one). */
export const sprintDailyApi =
  endpoint<{
    body: z.infer<
      typeof sprintDailyBody
    >;
    res: z.infer<
      typeof sprintDailyRes
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhmusic/sprint/daily',
    },
  );

/** Record that the dealt date's scored run has started (an abandoned run still counts). */
export const sprintDailyStartApi =
  endpoint<{
    body: z.infer<
      typeof sprintDailyStartBody
    >;
    res: z.infer<
      typeof sprintDailyStartRes
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhmusic/sprint/daily-start',
    },
  );
