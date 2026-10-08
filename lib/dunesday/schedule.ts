/**
 * The Dunesday scheduler — pure, deterministic, client-safe.
 *
 * Input is an ordered list of what is left to watch plus the viewer's pace;
 * output is a day-by-day plan. Two ways to drive it:
 *
 * - **Pace** — "I watch about 2h a day". The plan runs from the start date at
 *   that average and reports when it finishes, and whether that is before the
 *   deadline.
 * - **Fit** — "get me there by the 17th". A binary search finds the smallest
 *   average (rounded up to 5 minutes) that finishes on time, then plans at it.
 *
 * The average is a true average: per-weekday weights (weekends heavier,
 * weeknights off, …) are normalised so the week still totals 7× the figure the
 * viewer typed. Days in the skip list get nothing.
 *
 * Packing rules, which are the part people notice:
 *
 * - A series is split at episode boundaries. A film is never split unless
 *   `splitFilms` is on, in which case it is cut into near-equal parts no
 *   longer than the day's budget.
 * - A day may run over its budget by `overrunPct` to finish what is on it,
 *   rather than leaving one episode dangling to the next night.
 * - A title longer than a whole day's budget still gets a day to itself —
 *   Endgame on a 90-minute plan is one long night, not an infinite loop.
 */

import type { WatchTitle } from './titles';

export type PlanMode = 'pace' | 'fit';

export interface PlanSettings {
  /** YYYY-MM-DD — first day of watching. */
  startDate: string;
  /** YYYY-MM-DD — last day you can watch (inclusive). */
  deadline: string;
  mode: PlanMode;
  /** Average minutes per day (pace mode). */
  minutesPerDay: number;
  /** Relative weight for Sun..Sat. 0 = never watch that weekday. */
  weekdayWeights: [number, number, number, number, number, number, number];
  /** YYYY-MM-DD dates with no watching at all. */
  skipDates: string[];
  /** May a day run long to finish what is on it? Percent of its budget. */
  overrunPct: number;
  /** Cut films into parts when they exceed a day's budget. */
  splitFilms: boolean;
  /**
   * Minutes already watched on the start date. Ticking off tonight's film
   * should end tonight, not pull tomorrow's film forward into it.
   */
  usedOnStart?: number;
}

/** One unit the planner places: a whole film, a part of one, or an episode run. */
export interface PlanEntry {
  titleId: string;
  minutes: number;
  /** 1-based episode range for a series, inclusive. */
  episodes?: [number, number];
  /** Part n of m for a split film. */
  part?: [number, number];
}

export interface PlanDay {
  date: string;
  budget: number;
  minutes: number;
  entries: PlanEntry[];
}

export interface Plan {
  days: PlanDay[];
  /** The last day with anything on it, or null for an empty list. */
  finishDate: string | null;
  totalMinutes: number;
  /** The average the plan was built at. */
  minutesPerDay: number;
  onTime: boolean;
  /** Whole days between finishing and the deadline (negative when late). */
  slackDays: number;
  /** Fit mode could not finish even at 24h/day. */
  impossible: boolean;
}

/** Remaining work for one title: the whole runtime or the unwatched episodes. */
export interface Remaining {
  title: WatchTitle;
  minutes: number;
  /** For a series: the first unwatched episode (1-based) and how many are left. */
  fromEpisode?: number;
  episodesLeft?: number;
}

// ── Dates ──────────────────────────────────────────────────────────────────
// Plain YYYY-MM-DD arithmetic in UTC so a plan never shifts by a day across a
// DST change or a time-zone boundary. The page treats every date as local.

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

export function weekday(day: string): number {
  return parseDay(day).getUTCDay();
}

/** Today in the viewer's local zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Units ──────────────────────────────────────────────────────────────────

interface Unit {
  titleId: string;
  minutes: number;
  episode?: number;
  /** For split films: which part, filled in once the parts are known. */
  part?: [number, number];
}

function toUnits(items: Remaining[], partCap: number, splitFilms: boolean): Unit[] {
  const units: Unit[] = [];
  for (const item of items) {
    const { title } = item;
    if (title.kind === 'series' && title.episodes && item.episodesLeft) {
      const per = item.minutes / item.episodesLeft;
      const from = item.fromEpisode ?? 1;
      for (let i = 0; i < item.episodesLeft; i++) {
        units.push({ titleId: title.id, minutes: per, episode: from + i });
      }
    } else if (splitFilms && item.minutes > partCap && partCap >= 30) {
      const parts = Math.ceil(item.minutes / partCap);
      for (let p = 1; p <= parts; p++) {
        units.push({ titleId: title.id, minutes: item.minutes / parts, part: [p, parts] });
      }
    } else if (item.minutes > 0) {
      units.push({ titleId: title.id, minutes: item.minutes });
    }
  }
  return units;
}

function budgetFor(day: string, avg: number, settings: PlanSettings, skip: Set<string>): number {
  if (skip.has(day)) return 0;
  const weights = settings.weekdayWeights;
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  return (avg * 7 * weights[weekday(day)]) / sum;
}

/** Fold consecutive units of one title on one day into a single entry. */
function pushUnit(day: PlanDay, unit: Unit) {
  const last = day.entries[day.entries.length - 1];
  if (last && last.titleId === unit.titleId && unit.episode && last.episodes) {
    last.episodes = [last.episodes[0], unit.episode];
    last.minutes += unit.minutes;
  } else {
    day.entries.push({
      titleId: unit.titleId,
      minutes: unit.minutes,
      episodes: unit.episode ? [unit.episode, unit.episode] : undefined,
      part: unit.part,
    });
  }
  day.minutes += unit.minutes;
}

/** Hard ceiling on plan length so a pathological input can't spin forever. */
const MAX_DAYS = 3 * 365;

function pack(items: Remaining[], avg: number, settings: PlanSettings): PlanDay[] {
  const skip = new Set(settings.skipDates);
  const weights = settings.weekdayWeights;
  const sum = weights.reduce((a, b) => a + b, 0);
  const peak = sum > 0 ? (avg * 7 * Math.max(...weights)) / sum : avg;
  const units = toUnits(items, Math.max(peak, avg), settings.splitFilms);
  const days: PlanDay[] = [];
  const overrun = 1 + Math.max(0, settings.overrunPct) / 100;

  let cursor = settings.startDate;
  let i = 0;
  while (i < units.length && days.length < MAX_DAYS) {
    const full = budgetFor(cursor, avg, settings, skip);
    const budget =
      cursor === settings.startDate && settings.usedOnStart
        ? Math.max(0, full - settings.usedOnStart)
        : full;
    const day: PlanDay = { date: cursor, budget, minutes: 0, entries: [] };
    if (budget > 0) {
      while (i < units.length) {
        const unit = units[i];
        const fits = day.minutes + unit.minutes <= budget * overrun + 0.5;
        // Always place at least one unit on a full watching day, however
        // long — but not on a start date already partly spent.
        if (fits || (day.entries.length === 0 && budget === full)) {
          pushUnit(day, unit);
          i++;
        } else break;
      }
    }
    days.push(day);
    cursor = addDays(cursor, 1);
  }
  // Trailing empty days carry no information.
  while (days.length && days[days.length - 1].entries.length === 0) days.pop();
  for (const day of days) {
    day.minutes = Math.round(day.minutes);
    day.budget = Math.round(day.budget);
    for (const e of day.entries) e.minutes = Math.round(e.minutes);
  }
  return days;
}

function summarise(days: PlanDay[], avg: number, settings: PlanSettings, impossible = false): Plan {
  const finishDate = days.length ? days[days.length - 1].date : null;
  const totalMinutes = days.reduce((a, d) => a + d.minutes, 0);
  const slackDays = finishDate
    ? daysBetween(finishDate, settings.deadline)
    : daysBetween(settings.startDate, settings.deadline);
  return {
    days,
    finishDate,
    totalMinutes,
    minutesPerDay: avg,
    onTime: slackDays >= 0,
    slackDays,
    impossible,
  };
}

export function buildPlan(items: Remaining[], settings: PlanSettings): Plan {
  if (settings.mode === 'pace') {
    const avg = Math.max(5, settings.minutesPerDay);
    return summarise(pack(items, avg, settings), avg, settings);
  }

  // Fit: smallest average (5-minute steps) that finishes by the deadline.
  let lo = 1; // in 5-minute steps
  let hi = (24 * 60) / 5;
  const finishesAt = (steps: number) => {
    const days = pack(items, steps * 5, settings);
    const end = days.length ? days[days.length - 1].date : settings.startDate;
    return { days, ok: daysBetween(end, settings.deadline) >= 0 };
  };
  const ceiling = finishesAt(hi);
  if (!ceiling.ok) return summarise(ceiling.days, hi * 5, settings, true);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (finishesAt(mid).ok) hi = mid;
    else lo = mid + 1;
  }
  const avg = hi * 5;
  return summarise(pack(items, avg, settings), avg, settings);
}

/** "2h 05m" / "45m" — the compact form used across the page. */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return `${h}h ${String(r).padStart(2, '0')}m`;
}
