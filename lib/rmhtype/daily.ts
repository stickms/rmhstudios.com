/**
 * The RMHType daily challenge, pure and client-safe: which passage a UTC day gets,
 * the streak, and the checks that keep a reported run inside what a keyboard and a
 * wall clock allow. The database side is `daily.server.ts`.
 *
 * A day is `YYYYMMDD` in UTC, so the board closes at the same instant for everyone.
 */
import { mulberry32 } from '@/lib/core/rng';
import { MAX_WPM } from '@/lib/rmhtype/typing-run';

/** A started run that is not finished within this long is a miss. */
export const DAILY_WINDOW_MS = 15 * 60 * 1000;

/** Keystrokes beyond this multiple of the passage are not a typing run. */
const MAX_KEYSTROKE_RATIO = 5;

const DAY_MS = 86_400_000;

export const DAY_PATTERN = /^\d{8}$/;

export function dayKey(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** The UTC midnight a day key starts at. */
export function dayStart(day: string): Date {
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8))));
}

/** `day` moved by `delta` days (negative goes back). */
export function shiftDay(day: string, delta: number): string {
  return dayKey(new Date(dayStart(day).getTime() + delta * DAY_MS));
}

/** `2026-11-22` for the share line and headings. */
export function isoDay(day: string): string {
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
}

function dayOfYear(day: string): number {
  const start = Date.UTC(Number(day.slice(0, 4)), 0, 1);
  return Math.round((dayStart(day).getTime() - start) / DAY_MS) + 1;
}

/**
 * The passage for `day`: the list (sorted, so its order in code does not matter) is
 * shuffled with a generator seeded by the year, and the day of the year indexes the
 * shuffle. Within a year nothing repeats until the list is used up; every member gets
 * the same answer for the same day.
 */
export function passageForDay(day: string, passageIds: readonly string[]): string {
  if (passageIds.length === 0) throw new Error('No passages to choose from');
  const order = [...passageIds].sort();
  const random = mulberry32(Number(day.slice(0, 4)));
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i] as string;
    order[i] = order[j] as string;
    order[j] = swap;
  }
  return order[(dayOfYear(day) - 1) % order.length] as string;
}

/**
 * Consecutive UTC days with a finished attempt, counted back from `today`. Today not
 * being done yet does not break a streak that reaches yesterday.
 */
export function streakFrom(days: readonly string[], today: string): number {
  const done = new Set(days);
  let cursor = done.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (done.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

export interface DailyReport {
  /** Keystrokes that matched the text. */
  correct: number;
  /** Every character keystroke. */
  total: number;
  /** Server time from Start to Finish. */
  elapsedMs: number;
}

export interface DailyScore {
  wpm: number;
  accuracy: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Net speed and keystroke accuracy for a report. The clock is the server's, never the client's. */
export function scoreOf(report: DailyReport, passageLength: number): DailyScore {
  const minutes = report.elapsedMs / 60_000;
  const characters = Math.min(report.correct, passageLength);
  return {
    wpm: minutes > 0 ? round1(characters / 5 / minutes) : 0,
    accuracy: report.total > 0 ? round1((report.correct / report.total) * 100) : 0,
  };
}

/**
 * True when the counts and the time could come from one real run of this passage:
 * the counts are whole and ordered, the passage was struck out in full, there is time
 * on the clock but not more than the window, and the speed is one a person can type.
 */
export function plausible(report: DailyReport, passageLength: number): boolean {
  const { correct, total, elapsedMs } = report;
  if (!Number.isInteger(correct) || !Number.isInteger(total) || !Number.isFinite(elapsedMs)) {
    return false;
  }
  if (correct < 0 || correct > total || total < passageLength || total > passageLength * MAX_KEYSTROKE_RATIO) {
    return false;
  }
  if (elapsedMs <= 0 || elapsedMs > DAILY_WINDOW_MS) return false;
  return scoreOf(report, passageLength).wpm <= MAX_WPM;
}

export type DailyStatus =
  /** Not started: the text stays hidden, so Start really is the start. */
  | 'ready'
  /** Started and inside the window: the clock is running. */
  | 'running'
  /** Finished and scored. */
  | 'done'
  /** Started but not finished in time (or finished too late): no score. */
  | 'missed';

export interface DailyResult {
  wpm: number;
  accuracy: number;
  timeMs: number;
  /** Place on the day's global board. */
  rank: number;
}

/** The viewer's day, as every daily endpoint other than the board returns it. */
export interface DailyState {
  day: string;
  status: DailyStatus;
  passageLength: number;
  /** The passage; null until the member has started (a missed or finished day may be practised). */
  text: string | null;
  startedAt: string | null;
  /** The server's clock when this answer was made, so a client can show time left without trusting its own. */
  serverNow: string;
  result: DailyResult | null;
  /** Consecutive UTC days with a finished attempt, today included once it is done. */
  streak: number;
}

export type DailyScope = 'global' | 'friends';

export interface DailyBoardRow {
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  timeMs: number;
}

export interface DailyBoard {
  day: string;
  scope: DailyScope;
  /** Top 50. */
  rows: DailyBoardRow[];
  /** The viewer's own row when they have a score that day, wherever it ranks. */
  me: DailyBoardRow | null;
}
