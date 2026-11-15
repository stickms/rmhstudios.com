/** Contract for the "what's on" grid, GET /api/schedule (redesign audit C1, batch 10). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { Occurrence } from '@/lib/schedule/slots';

/** An occurrence as it crosses the wire: the instants are ISO strings. */
export type ScheduleOccurrence =
  Omit<
    Occurrence,
    | 'startsAt'
    | 'endsAt'
  > & {
    startsAt: string;
    endsAt: string;
  };

export interface ScheduleGrid {
  from: string;
  days: number;
  next: ScheduleOccurrence | null;
  byDay: {
    day: string;
    occurrences: ScheduleOccurrence[];
  }[];
}

/** `days` is clamped to 1..31; `from` (ISO) defaults to today. Public, identical for everyone. */
export const getScheduleApi =
  endpoint<{
    query: {
      days?:
        | number
        | undefined;
      from?:
        | string
        | undefined;
    };
    res: ScheduleGrid;
  }>()(
    {
      method:
        'GET',
      path: '/api/schedule',
    },
  );
