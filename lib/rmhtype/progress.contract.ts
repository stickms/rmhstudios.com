/**
 * Contracts for the RMHType progress page. Client-safe: types only.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  BestRun,
  DailyPoint,
  ProgressMode,
  ProgressRange,
  ProgressSummary,
  RunRow,
} from '@/lib/rmhtype/progress';

/** The caller's daily medians, summary and personal bests for a range and mode. */
export const getRmhTypeProgressApi =
  endpoint<{
    query: {
      range: ProgressRange;
      mode: ProgressMode;
      tz: string;
    };
    res: {
      daily: DailyPoint[];
      /** True when older days were left off so the chart stays within its point budget. */
      truncated: boolean;
      /** True when the scan hit its row cap, so the figures cover the newest runs only. */
      capped: boolean;
      summary: ProgressSummary;
      bests: BestRun[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhtype/progress',
    },
  );

/** The caller's runs, newest first, 25 to a page. */
export const getRmhTypeRunsApi =
  endpoint<{
    query: {
      mode: ProgressMode;
      cursor?:
        | string
        | undefined;
    };
    res: {
      runs: RunRow[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhtype/progress/runs',
    },
  );
