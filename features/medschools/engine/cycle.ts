import type { MedEventType } from './types';

const DAY_MS = 86_400_000;

/** Entry year from a label: '2026-2027' -> 2027. */
export function cycleYearFromLabel(
  label: string,
): number {
  const m =
    /^(\d{4})-(\d{4})$/.exec(
      label.trim(),
    );
  if (
    !m
  )
    throw new Error(
      `Invalid cycle label: ${label}`,
    );
  const first =
    Number(
      m[1],
    );
  const second =
    Number(
      m[2],
    );
  if (
    second !==
    first +
      1
  )
    throw new Error(
      `Invalid cycle label: ${label}`,
    );
  return second;
}

export function defaultDayZero(
  cycleYear: number,
): string {
  return `${cycleYear - 1}-06-01`;
}

function utcDay(
  date: string,
): number {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      date,
    );
  if (
    !m
  )
    throw new Error(
      `Invalid date: ${date}`,
    );
  return (
    Date.UTC(
      Number(
        m[1],
      ),
      Number(
        m[2],
      ) -
        1,
      Number(
        m[3],
      ),
    ) /
    DAY_MS
  );
}

/** Whole days from `dayZeroOn` to `date` (both YYYY-MM-DD), computed in UTC so no timezone can shift it. */
export function dayOfCycle(
  date: string,
  dayZeroOn: string,
): number {
  return (
    utcDay(
      date,
    ) -
    utcDay(
      dayZeroOn,
    )
  );
}

/** UTC month (0-based) at which an event type starts belonging to the NEXT entry year. */
const NEXT_CYCLE_FROM_MONTH: Record<MedEventType, number> = {
  SECONDARY: 5, // June 1: secondaries open for the next cycle
  INTERVIEW: 6, // July 1
  ACCEPTANCE: 8, // September 1: summer decisions still belong to that August's class
  WAITLIST: 8,
  REJECTION: 8,
  WITHDRAWN: 8,
  HOLD: 8,
};

/**
 * Entry year an event belongs to, by its type (ruling R0): decisions roll over on
 * September 1, interviews on July 1, secondaries on June 1, all in UTC.
 */
export function cycleYearOf(date: Date, type: MedEventType): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() < NEXT_CYCLE_FROM_MONTH[type] ? year : year + 1;
}
