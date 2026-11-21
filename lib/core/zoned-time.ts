/**
 * Timezone arithmetic done with `Intl` alone: read an instant's wall-clock
 * fields in a zone, and turn a wall-clock time in a zone back into an instant.
 *
 * A schedule defined as "8pm Eastern" is not a fixed UTC instant: the correct
 * instant moves by an hour when the US leaves daylight time while the wall-clock
 * time does not. Storing an anchor as UTC and adding days forever silently drifts
 * it by an hour across a DST transition. `/dunesday` plans and `/sohumtracker`
 * day buckets both depend on getting that right.
 *
 * `date-fns` is in the tree but its timezone half (`@date-fns/tz`) is not, so this
 * uses the platform: every modern runtime ships the full IANA database behind
 * `Intl.DateTimeFormat`. No dependency, no bundled tz data, correct across DST
 * transitions and future rule changes.
 *
 * Core module (tsconfig.core.json): imports nothing, no `node:*`, no Prisma, so
 * client and server both use it. Born in `lib/pf2ecal/` (deleted 2026-11-19).
 */

/** Calendar fields of an instant, as read in some timezone. */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Read an instant's wall-clock fields in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value ?? '0';
    return Number.parseInt(value, 10);
  };
  // `hour12: false` still renders midnight as "24" in some ICU versions
  // (hourCycle h24 rather than h23); normalise so arithmetic on the result
  // cannot land a day ahead.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * The offset of `timeZone` from UTC at `instant`, in minutes (east positive, so
 * New York in summer is -240).
 */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round to the minute: `asUtc` drops sub-second precision that `instant` has.
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The UTC instant for a wall-clock time in `timeZone` — the inverse of
 * {@link getZonedParts}.
 *
 * Solved by iteration rather than by a table because the offset that applies is
 * the offset *at the answer*, which is not known until the answer is. Guess UTC,
 * measure the zone's offset there, correct, and measure again: the second pass
 * settles every case except a time that falls inside a DST gap or repeat, and
 * for those it returns the instant on the near side of the transition (2:30am
 * on a spring-forward date is not a real local time; something has to be
 * chosen, and the alternative is throwing at a schedule the user can't fix).
 * An evening wall-clock time is hours away from any US transition, so the loop
 * converges on the first correction in practice.
 */
export function zonedTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string,
): Date {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  let instant = naive;
  for (let pass = 0; pass < 2; pass++) {
    const offset = offsetMinutesAt(new Date(instant), timeZone);
    const corrected = naive - offset * 60_000;
    if (corrected === instant) break;
    instant = corrected;
  }
  return new Date(instant);
}

/** Day of week (0 = Sunday) of an instant as read in `timeZone`. */
export function zonedDayOfWeek(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  // Day-of-week is a property of the calendar date, so build the date in UTC
  // and read it there — `getUTCDay` on the zone's own fields.
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** `YYYY-MM-DD` for an instant as read in `timeZone`. */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The short zone abbreviation in force at `instant` — "CDT", "CST", "GMT+9". */
export function zoneAbbreviation(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
    hour: 'numeric',
  }).formatToParts(instant);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/**
 * Whether two instants land on the same calendar day in `timeZone`.
 */
export function isSameZonedDay(a: Date, b: Date, timeZone: string): boolean {
  return zonedDateKey(a, timeZone) === zonedDateKey(b, timeZone);
}
