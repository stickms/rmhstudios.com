/**
 * RMHType's lessons, progress and daily challenge data as React Queries (redesign
 * audit B4), and the writes those pages make. The components own UI state; reads and
 * writes live here. Client-safe: contracts only.
 */
import { infiniteQueryOptions } from '@tanstack/react-query';
import { api, type ApiInput } from '@/lib/contract/client';
import { contractQuery } from '@/lib/route/route-query';
import {
  finishRmhTypeDailyApi,
  getRmhTypeDailyApi,
  getRmhTypeDailyBoardApi,
  startRmhTypeDailyApi,
} from '@/lib/rmhtype/daily.contract';
import { getLessonProgressApi, recordLessonRunApi } from '@/lib/rmhtype/lessons.contract';
import { getRmhTypeProgressApi, getRmhTypeRunsApi } from '@/lib/rmhtype/progress.contract';
import { buildRmhTypePracticeTestApi, recordRmhTypeKeyStatsApi } from '@/lib/rmhtype/keystats.contract';
import type { ProgressMode, ProgressRange } from '@/lib/rmhtype/progress';
import type { DailyScope } from '@/lib/rmhtype/daily';

/* Daily challenge */

export const RMHTYPE_DAILY_KEY = ['rmhtype', 'daily'] as const;

export const rmhTypeDailyQuery = () =>
  contractQuery(RMHTYPE_DAILY_KEY, getRmhTypeDailyApi, { retries: 0 }, { staleTime: 0 });

export const rmhTypeDailyBoardQuery = (day: string, scope: DailyScope) =>
  contractQuery(['rmhtype', 'daily-board', day, scope], getRmhTypeDailyBoardApi, { query: { day, scope } }, { staleTime: 30_000 });

export const startDailyRun = () => api(startRmhTypeDailyApi);

export const finishDailyRun = (body: ApiInput<typeof finishRmhTypeDailyApi>['body']) =>
  api(finishRmhTypeDailyApi, { body });

/* Lessons */

export const RMHTYPE_LESSONS_KEY = ['rmhtype', 'lessons'] as const;

export const lessonProgressQuery = () =>
  contractQuery(RMHTYPE_LESSONS_KEY, getLessonProgressApi, { retries: 0 }, { staleTime: 15_000 });

export const recordLessonRun = (body: ApiInput<typeof recordLessonRunApi>['body']) =>
  api(recordLessonRunApi, { body });

/** The worst-keys practice text, generated on the server from the member's key statistics. */
export const buildPracticeDrill = (length: number) => api(buildRmhTypePracticeTestApi, { body: { length } });

export const recordKeyStats = (body: ApiInput<typeof recordRmhTypeKeyStatsApi>['body']) =>
  api(recordRmhTypeKeyStatsApi, { body });

/* Progress */

export const rmhTypeProgressQuery = (range: ProgressRange, mode: ProgressMode, tz: string) =>
  contractQuery(['rmhtype', 'progress', range, mode, tz], getRmhTypeProgressApi, { query: { range, mode, tz } }, { staleTime: 30_000 });

/** Runs newest first, 25 a page; `start` is the cursor a "show runs from this day" link jumps to. */
export const rmhTypeRunsQuery = (mode: ProgressMode, start: string | null) =>
  infiniteQueryOptions({
    queryKey: ['rmhtype', 'runs', mode, start] as const,
    queryFn: ({ pageParam, signal }) => api(getRmhTypeRunsApi, { query: { mode, cursor: pageParam }, signal }),
    initialPageParam: (start ?? undefined) as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  });
