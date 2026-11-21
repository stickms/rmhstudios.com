/**
 * RMHStudy's daily focus streak, as the hub updates it when a work session ends, and the same
 * rule derived from session days for the history page and the backfill script. Pure, so the rule
 * is tested where the socket hub cannot be.
 *
 * A streak counts calendar days in the member's own time zone (UTC when none is stored) with at
 * least one finished focus session: a second session the same day keeps it, the next day extends
 * it, and a missed day starts again at 1. Days, not 24-hour gaps: a session at 23:00 and one at
 * 07:00 the next morning are consecutive days even though they are 8 hours apart. Days are
 * compared as `YYYY-MM-DD` keys, so a DST change never makes a day count twice or be skipped.
 *
 * Relative imports: the socket hub bundles this file.
 */
import {
  addDays,
  dayKeyInZone,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  streaks,
} from '../study/stats';

const DAY_MS = 86_400_000;

export interface StudyStreakState {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: Date | null;
}

/** `timeZone` when it is a zone the runtime knows, otherwise UTC. */
export function studyZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/** The calendar day `date` falls on for a member, as `YYYY-MM-DD`. */
export function studyDayKey(date: Date, timeZone: string | null | undefined): string {
  return dayKeyInZone(date, studyZone(timeZone));
}

function dayGap(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS);
}

/**
 * The streak after a session finishing at `now`, from the profile as it was before it. Both
 * dates are read in `timeZone`.
 */
export function nextStudyStreak(
  previous: StudyStreakState | null,
  now: Date,
  timeZone?: string | null,
): { currentStreak: number; longestStreak: number } {
  if (!previous?.lastStudyDate) {
    return { currentStreak: 1, longestStreak: Math.max(previous?.longestStreak ?? 0, 1) };
  }
  const gap = dayGap(studyDayKey(now, timeZone), studyDayKey(previous.lastStudyDate, timeZone));
  const currentStreak =
    gap <= 0 ? Math.max(previous.currentStreak, 1) : gap === 1 ? previous.currentStreak + 1 : 1;
  return { currentStreak, longestStreak: Math.max(previous.longestStreak, currentStreak) };
}

/**
 * Current and longest streaks from the days that have a session (any order, repeats allowed).
 * The current streak counts back from `todayKey`; a today with no session yet does not end it,
 * the day is not over, so it then counts back from yesterday.
 */
export function deriveStreak(dayKeys: string[], todayKey: string): { current: number; longest: number } {
  return streaks(dayKeys, todayKey);
}

/** The longest run of consecutive days among `dayKeys`. */
export function longestRun(dayKeys: string[]): number {
  const last = [...dayKeys].sort().at(-1);
  return last === undefined ? 0 : streaks(dayKeys, last).longest;
}

/** The days of the current streak (oldest first): empty when it has ended. */
export function currentStreakDays(dayKeys: string[], todayKey: string): string[] {
  const set = new Set(dayKeys);
  const out: string[] = [];
  let cursor = set.has(todayKey) ? todayKey : addDays(todayKey, -1);
  while (set.has(cursor)) {
    out.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return out.reverse();
}
