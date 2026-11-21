/**
 * Contracts for the RMHStudy focus-history endpoints. Client-safe: request types come from
 * the zod schemas by `import type`; responses are plain data.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  goalBody,
  historyQuery,
  sessionsQuery,
} from '@/lib/rmhstudy/history-schema';

export interface FocusHistory {
  /** Today in the viewer's time zone, `YYYY-MM-DD`. */
  today: string;
  /** The week's first day as `getUTCDay()` numbers, as the weeks below were built. */
  firstDay: number;
  /** Focus minutes this week and last week, whatever week is selected. */
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  /** Weekly goal in minutes, or null when none is set. */
  goalMinutes:
    | number
    | null;
  streak: {
    current: number;
    longest: number;
  };
  /** The selected week: seven days, first day first. */
  week: {
    start: string;
    days: {
      date: string;
      minutes: number;
    }[];
  };
  /** Days with focus time in the last 365 days (the page fills the gaps). */
  year: {
    date: string;
    minutes: number;
  }[];
  records: {
    longestRunMinutes: number;
    /** Best day and best week cover the last 400 days. */
    bestDay: {
      date: string;
      minutes: number;
    } | null;
    bestWeek: {
      start: string;
      minutes: number;
    } | null;
    totalSessions: number;
  };
}

export interface FocusSession {
  id: string;
  /** ISO time the run was recorded. */
  startedAt: string;
  focusMinutes: number;
  breakMinutes: number;
  /** Pomodoros in the run. */
  pomodoros: number;
  /** The room's code, when the run was in a room. */
  roomCode:
    | string
    | null;
}

export interface FocusSessionsPage {
  sessions: FocusSession[];
  /** Pass as `cursor` for the next page; null at the end. */
  nextCursor:
    | string
    | null;
}

export const getFocusHistoryApi =
  endpoint<{
    query: z.infer<
      typeof historyQuery
    >;
    res: FocusHistory;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhstudy/history',
    },
  );

export const getFocusSessionsApi =
  endpoint<{
    query: z.infer<
      typeof sessionsQuery
    >;
    res: FocusSessionsPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhstudy/history/sessions',
    },
  );

export const setWeeklyGoalApi =
  endpoint<{
    body: z.infer<
      typeof goalBody
    >;
    res: {
      goalMinutes:
        | number
        | null;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/rmhstudy/goal',
    },
  );
