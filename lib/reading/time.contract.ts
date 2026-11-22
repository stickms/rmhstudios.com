/**
 * Contracts for reading time (sprint 07 18). Client-safe: types come from the zod
 * schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ReadingDocKind } from '@/lib/reading/schema';
import type {
  recordTimeBody,
  timePrefsBody,
  timePrefsQuery,
  timeSummaryQuery,
} from '@/lib/reading/time-schema';

export interface ReadingTimePrefs {
  trackTime: boolean;
  weeklyMinutesTarget:
    | number
    | null;
  /** Seconds the member has read the asked-for document, all days; null when none was asked for. */
  docSeconds:
    | number
    | null;
}

export interface ReadingTimeSummary {
  trackTime: boolean;
  weeklyMinutesTarget:
    | number
    | null;
  today: string;
  weekStart: string;
  /** The seven days of this week, zero-filled, oldest first. */
  days: Array<{
    day: string;
    seconds: number;
  }>;
  weekSeconds: number;
  /** The four weeks before this one, most recent first. */
  previousWeeks: Array<{
    weekStart: string;
    seconds: number;
  }>;
  /** Top five documents this month by time. */
  topThisMonth: Array<{
    kind: ReadingDocKind;
    key: string;
    title: string;
    seconds: number;
  }>;
}

/** One flush of accumulated reading time (sent with `keepalive`). */
export const recordReadingTimeApi =
  endpoint<{
    body: z.infer<
      typeof recordTimeBody
    >;
    res: {
      recorded: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/reading/time',
    },
  );

export const readingTimeSummaryApi =
  endpoint<{
    query: z.infer<
      typeof timeSummaryQuery
    >;
    res: ReadingTimeSummary;
  }>()(
    {
      method:
        'GET',
      path: '/api/reading/time',
    },
  );

export const deleteReadingTimeApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/reading/time',
    },
  );

export const getReadingTimePrefsApi =
  endpoint<{
    query: z.infer<
      typeof timePrefsQuery
    >;
    res: ReadingTimePrefs;
  }>()(
    {
      method:
        'GET',
      path: '/api/reading/time/prefs',
    },
  );

export const setReadingTimePrefsApi =
  endpoint<{
    body: z.infer<
      typeof timePrefsBody
    >;
    res: ReadingTimePrefs;
  }>()(
    {
      method:
        'PUT',
      path: '/api/reading/time/prefs',
    },
  );
