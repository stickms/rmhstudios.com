/**
 * Contracts for the RMHMusic practice-log endpoints. Client-safe: request types come from the zod
 * schemas by `import type`; responses are plain data.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  PracticeDay,
  PracticeKind,
} from '@/lib/rmhmusic/history';
import type {
  entriesQuery,
  songProgressQuery,
  summaryQuery,
} from '@/lib/rmhmusic/history-schema';

export interface PracticeSummary {
  /** Today in the member's time zone, `YYYY-MM-DD`. */
  today: string;
  /** The week's first day as `getUTCDay()` numbers, as the weeks below were built. */
  firstDay: number;
  /** Activities a day must have to meet the goal (`MusicLearnProfile.dailyGoal`). */
  dailyGoal: number;
  /** Minutes this week and last week, whatever week is selected. */
  thisWeekMinutes: number;
  lastWeekMinutes: number;
  /** This week's days that met the daily goal, out of the days of the week so far. */
  goalDays: {
    met: number;
    elapsed: number;
  };
  /** The selected week: seven days, first day first. */
  week: {
    start: string;
    days: PracticeDay[];
  };
  /** Days with entries in the last 365 days (the page fills the gaps). */
  year: PracticeDay[];
  /** Every entry the member has, whatever its age. */
  totalEntries: number;
}

export interface PracticeEntry {
  /** The entry's id, a BigInt as a string. */
  id: string;
  kind: PracticeKind;
  /** The lesson id, song id, sprint level, the date of a daily sprint, or `cards`. */
  refId: string;
  /** A song's mode (`wait`, `play`) or a sprint's (`daily`, `free`); null for lessons and cards. */
  mode:
    | string
    | null;
  score:
    | number
    | null;
  durationMs:
    | number
    | null;
  /** ISO time the activity finished. */
  createdAt: string;
}

export interface PracticePage {
  entries: PracticeEntry[];
  /** Pass as `cursor` for the next page; null at the end. */
  nextCursor:
    | string
    | null;
}

export interface SongProgress {
  /** The newest attempts at the song, oldest first (so a line of scores reads left to right). */
  attempts: PracticeEntry[];
}

/** The summary: this week and last, goal days, the selected week's days and a year of days. */
export const getPracticeSummaryApi =
  endpoint<{
    query: z.infer<
      typeof summaryQuery
    >;
    res: PracticeSummary;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhmusic/history',
    },
  );

/** Clear history: delete the member's entries. Bests, lesson progress and the streak stay. */
export const clearPracticeApi =
  endpoint<{
    res: {
      deleted: number;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rmhmusic/history',
    },
  );

/** One page of the member's entries, newest first, optionally of one kind. */
export const listPracticeApi =
  endpoint<{
    query: z.infer<
      typeof entriesQuery
    >;
    res: PracticePage;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhmusic/history/entries',
    },
  );

/** The member's attempts at one song, optionally of one mode. */
export const getSongProgressApi =
  endpoint<{
    params: {
      songId: string;
    };
    query: z.infer<
      typeof songProgressQuery
    >;
    res: SongProgress;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhmusic/history/songs/$songId',
    },
  );
