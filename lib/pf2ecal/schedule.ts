/**
 * The recurring rule behind the table's standing schedule.
 *
 * The table plays **weekly, alternating Wednesday and Friday**, at 8pm Eastern:
 * Wed 2026-08-12, then Fri 2026-08-21, then Wed 2026-08-26, then Fri
 * 2026-09-04, and so on. Expressed as a two-week cycle with two slots in it
 * (day 0 = Wednesday, day 9 = the Friday of the following week) rather than as
 * "every 14 days" twice, because that is the shape the group actually
 * described and it stays legible when someone edits it.
 *
 * Occurrences are generated from calendar dates in {@link CAMPAIGN_TIME_ZONE}
 * and only then resolved to instants, so every session is 8pm Eastern forever
 * — not 8pm until the first Sunday in November and 7pm after it. That is the
 * whole reason this is a date walk rather than `anchor + n * 14 * 86400e3`.
 *
 * Pure and client-safe: `lib/pf2ecal/sessions.server.ts` materialises what this
 * returns into rows, and the page uses the same function to show what is coming
 * before the first write ever happens.
 */

import { CAMPAIGN_TIME_ZONE, zonedTimeToUtc, getZonedParts } from './zoned-time';

export interface RecurrenceRule {
  /** First occurrence, `YYYY-MM-DD` in {@link RecurrenceRule.timeZone}. */
  anchorDate: string;
  /** Length of the repeating cycle in days. */
  cycleDays: number;
  /** Day offsets from the anchor at which the cycle fires, ascending. */
  offsets: readonly number[];
  /** Wall-clock start in the campaign timezone. */
  startHour: number;
  startMinute: number;
  /** How long a session runs, used for `DTEND` and the "until" line. */
  durationMinutes: number;
  timeZone: string;
}

/**
 * The shipped rule. Editing these five numbers re-shapes every *future*
 * generated session; sessions the table has already touched are left alone (see
 * `pinnedToRule` in `prisma/schema.prisma`), so a rule change never silently
 * rewrites a night people have already RSVP'd to.
 */
export const CAMPAIGN_RULE: RecurrenceRule = {
  anchorDate: '2026-08-12',
  cycleDays: 14,
  offsets: [0, 9],
  startHour: 20,
  startMinute: 0,
  durationMinutes: 240,
  timeZone: CAMPAIGN_TIME_ZONE,
};

export interface Occurrence {
  /** `YYYY-MM-DD` in the campaign timezone — the row's `occurrenceKey`. */
  key: string;
  startsAt: Date;
  endsAt: Date;
}

/** Days in `month` (1-12) of `year`. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD` + `days` → `YYYY-MM-DD`, pure calendar arithmetic. */
function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map((n) => Number.parseInt(n, 10));
  let year = y;
  let month = m;
  let day = d + days;
  // Walking rather than going through Date keeps this independent of any
  // timezone: a date key is a calendar date, and adding a day to it must never
  // depend on where the process is running.
  for (;;) {
    const size = daysInMonth(year, month);
    if (day <= size) break;
    day -= size;
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  while (day < 1) {
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
    day += daysInMonth(year, month);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` precedes. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map((n) => Number.parseInt(n, 10));
  const [ty, tm, td] = to.split('-').map((n) => Number.parseInt(n, 10));
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Resolve one cycle-day offset to a concrete occurrence. */
function occurrenceAt(rule: RecurrenceRule, dayOffset: number): Occurrence {
  const key = addDaysToDateKey(rule.anchorDate, dayOffset);
  const [year, month, day] = key.split('-').map((n) => Number.parseInt(n, 10));
  const startsAt = zonedTimeToUtc(
    { year, month, day, hour: rule.startHour, minute: rule.startMinute },
    rule.timeZone,
  );
  return {
    key,
    startsAt,
    // Duration is added to the instant, not to the wall clock: a session that
    // starts at 8pm on the night the clocks go back really does run five hours
    // of wall time, and the calendar entry should say so.
    endsAt: new Date(startsAt.getTime() + rule.durationMinutes * 60_000),
  };
}

/**
 * Every occurrence of `rule` whose start falls in `[from, to)`.
 *
 * Bounded by the window rather than by a count so callers cannot accidentally
 * ask for an unbounded series; a caller that wants "the next 8" clamps `to`.
 */
export function occurrencesBetween(
  from: Date,
  to: Date,
  rule: RecurrenceRule = CAMPAIGN_RULE,
): Occurrence[] {
  const out: Occurrence[] = [];
  if (!rule.offsets.length || rule.cycleDays <= 0) return out;
  if (to.getTime() <= from.getTime()) return out;

  // Start the walk a full cycle before the window: an occurrence late in a
  // cycle can start before `from` in cycle terms yet still land inside the
  // window, and the cheap way to be sure of catching it is to begin one cycle
  // early and filter.
  const fromKey = fromDateKey(from, rule.timeZone);
  const elapsed = daysBetween(rule.anchorDate, fromKey);
  const startCycle = Math.floor(elapsed / rule.cycleDays) - 1;

  const fromMs = from.getTime();
  const toMs = to.getTime();
  // Hard stop so a pathological window can never spin: one extra cycle beyond
  // the window's own length is always enough to cover it.
  const maxCycles = Math.ceil((toMs - fromMs) / (rule.cycleDays * 86_400_000)) + 3;

  for (let i = 0; i < maxCycles; i++) {
    const cycle = startCycle + i;
    for (const offset of rule.offsets) {
      const occurrence = occurrenceAt(rule, cycle * rule.cycleDays + offset);
      const ms = occurrence.startsAt.getTime();
      if (ms >= fromMs && ms < toMs) out.push(occurrence);
    }
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

/** `YYYY-MM-DD` for an instant in `timeZone` (local copy to avoid a cycle). */
function fromDateKey(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** A human sentence describing the rule, for the page's schedule note. */
export function describeRule(rule: RecurrenceRule = CAMPAIGN_RULE): string {
  const weekdays = rule.offsets.map((offset) => {
    const key = addDaysToDateKey(rule.anchorDate, offset);
    const [y, m, d] = key.split('-').map((n) => Number.parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
  });
  // Pluralise each weekday, not just the last one — `join(' and ') + 's'` reads
  // "Wednesday and Fridays", which is the kind of thing nobody notices in a
  // diff and everybody notices on the page.
  const unique = [...new Set(weekdays)].map((day) => `${day}s`);
  const hour12 = rule.startHour % 12 === 0 ? 12 : rule.startHour % 12;
  const suffix = rule.startHour < 12 ? 'am' : 'pm';
  const minutes = rule.startMinute ? `:${String(rule.startMinute).padStart(2, '0')}` : '';
  return `Alternating ${unique.join(' and ')} at ${hour12}${minutes}${suffix} Eastern`;
}
