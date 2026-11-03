/**
 * Election calendar — computed, not hand-maintained, so the hub keeps working
 * for 2028, 2030 … without a code change. Client-safe and pure.
 *
 * General Election Day (federal) is the Tuesday after the first Monday in
 * November of every even year. A year divisible by 4 has the presidency on the
 * ballot; the others are midterms.
 */

import type { Office } from './types';

/** `other` = any election day that is not a general: a primary, runoff or special. */
export type CycleKind = 'presidential' | 'midterm' | 'other';
export type Phase = 'upcoming' | 'election-day' | 'counting' | 'archive';

export interface Cycle {
  year: number;
  kind: CycleKind;
  /** YYYY-MM-DD, Election Day. */
  date: string;
  title: string;
  /** Short label for chips and tabs: "2026 Midterms". */
  shortTitle: string;
  /** The offices a cycle can carry. Governors/Senate are only some states each time. */
  offices: Office[];
}

/** How long after Election Day a cycle stays "current" — counts and calls run for days. */
export const COUNTING_WINDOW_DAYS = 21;

const DAY = 86_400_000;

export function generalElectionDate(year: number): string {
  // First Monday of November, then +1 day.
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const dow = nov1.getUTCDay(); // 0 Sun … 6 Sat
  const firstMonday = 1 + ((8 - dow) % 7);
  return `${year}-11-${String(firstMonday + 1).padStart(2, '0')}`;
}

export function cycleForYear(year: number): Cycle {
  const kind: CycleKind = year % 4 === 0 ? 'presidential' : 'midterm';
  return {
    year,
    kind,
    date: generalElectionDate(year),
    title: kind === 'presidential' ? `${year} Presidential Election` : `${year} Midterm Elections`,
    shortTitle: kind === 'presidential' ? `${year} Presidential` : `${year} Midterms`,
    offices:
      kind === 'presidential'
        ? ['president', 'senate', 'house', 'governor']
        : ['senate', 'house', 'governor'],
  };
}

export function isValidCycleYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2020 && year <= 2100 && year % 2 === 0;
}

/** Parse a `?cycle=` value (a year, or an election date); null when unusable. */
export function parseCycle(raw: unknown): Cycle | null {
  if (typeof raw !== 'string') return null;
  const year = Number(raw.slice(0, 4));
  if (!isValidCycleYear(year)) return null;
  const c = cycleForYear(year);
  // Accept a bare year or exactly that cycle's date; anything else is a typo.
  return raw.length === 4 || raw === c.date ? c : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Any real YYYY-MM-DD between 2000 and 2100 as an election day; a general date resolves to its cycle. */
export function dayForDate(raw: unknown): Cycle | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // 2026-02-31
  if (y % 2 === 0 && raw === generalElectionDate(y) && isValidCycleYear(y)) return cycleForYear(y);
  const pretty = `${MONTHS[m - 1]} ${d}, ${y}`;
  return {
    year: y,
    kind: 'other',
    date: raw,
    title: `${pretty} Elections`,
    shortTitle: pretty,
    offices: ['president', 'senate', 'house', 'governor'],
  };
}

/** `?cycle=` value → a general cycle (a year, or its date) or any other election day (a date). */
export function parseDay(raw: unknown): Cycle | null {
  return parseCycle(raw) ?? dayForDate(raw);
}

/** UTC offset of America/New_York at the given instant, in minutes (−300 EST / −240 EDT). */
function etOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant a YYYY-MM-DD starts, in New York. */
export function etDayStart(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 5));
  return new Date(Date.UTC(y, m - 1, d) - etOffsetMinutes(guess) * 60_000);
}

export function phaseOf(date: string, now: Date = new Date()): Phase {
  const start = etDayStart(date).getTime();
  const t = now.getTime();
  if (t < start) return 'upcoming';
  if (t < start + DAY) return 'election-day';
  if (t < start + (1 + COUNTING_WINDOW_DAYS) * DAY) return 'counting';
  return 'archive';
}

/**
 * The cycle the hub opens on: the next general election, held open through the
 * counting window after it. Before the first one in a run it is simply "next".
 */
export function currentCycle(now: Date = new Date()): Cycle {
  let year = now.getUTCFullYear() - (now.getUTCFullYear() % 2);
  for (let i = 0; i < 4; i++, year += 2) {
    const c = cycleForYear(year);
    if (phaseOf(c.date, now) !== 'archive') return c;
  }
  return cycleForYear(year);
}

/** The cycles the switcher offers: the one before, the current one, and the next two. */
export function cycleOptions(now: Date = new Date()): Cycle[] {
  const cur = currentCycle(now);
  return [cur.year - 2, cur.year, cur.year + 2, cur.year + 4].map(cycleForYear);
}

export interface Countdown {
  /** Whole days/hours/minutes/seconds until the first polls close; zeros once past. */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Total ms remaining (≥ 0). */
  totalMs: number;
}

/** The first polls to close anywhere in the US (Indiana and Kentucky, 6 p.m. Eastern) — when results begin. */
export const FIRST_CLOSE_HOUR_ET = 18;

export function firstCloseAt(date: string): Date {
  return new Date(etDayStart(date).getTime() + FIRST_CLOSE_HOUR_ET * 3_600_000);
}

/** Time left until `target` (default: the first polls closing on `date`); zeros once past. */
export function countdownTo(date: string, now: Date = new Date(), target: Date = firstCloseAt(date)): Countdown {
  const ms = Math.max(0, target.getTime() - now.getTime());
  return {
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
    totalMs: ms,
  };
}

export const DEFAULT_RESULTS_BASE = 'https://static01.nyt.com/elections-assets/pages/data';

/**
 * Where the free, keyless results pages live: one file per office per Election
 * Day. `base` lets a server point at a mirror (`ELECTIONS_RESULTS_BASE`) — the
 * same layout, `<base>/<date>/results-<office>.json`.
 */
export function resultsUrl(date: string, office: Office, base?: string): string {
  const root = (base || DEFAULT_RESULTS_BASE).replace(/\/+$/, '');
  return `${root}/${date}/results-${office}.json`;
}
