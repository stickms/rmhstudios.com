import { cycleYearOf } from './cycle';
import type { MedEventType, MedProgram } from './types';

/**
 * Pure rules for the private tracker, anonymous sharing and list limits (spec section 7, plan Tasks 2-4). Client-safe:
 * no `node:`, no zod, no I/O. The server-side writer (`api/share-sync.server.ts`) and the lazy page chunks both import
 * this file, so a rule is written once.
 */

export type MilestoneType =
  'SUBMITTED' | 'COMPLETE' | 'SECONDARY' | 'INTERVIEW' | 'WAITLIST' | 'REJECTION' | 'ACCEPTANCE' | 'WITHDRAWN' | 'HOLD';

/** Display order on the tracker. */
export const MILESTONE_TYPES: readonly MilestoneType[] = [
  'SUBMITTED',
  'COMPLETE',
  'SECONDARY',
  'INTERVIEW',
  'WAITLIST',
  'REJECTION',
  'ACCEPTANCE',
  'WITHDRAWN',
  'HOLD',
];

/**
 * Which milestones can leave the private tables, and as what. `SUBMITTED` and `COMPLETE` are never shared (phase 5
 * aggregates them server-side from private rows under its own floor); home state never leaves either.
 */
export const SHAREABLE: Record<MilestoneType, MedEventType | null> = {
  SUBMITTED: null,
  COMPLETE: null,
  SECONDARY: 'SECONDARY',
  INTERVIEW: 'INTERVIEW',
  WAITLIST: 'WAITLIST',
  REJECTION: 'REJECTION',
  ACCEPTANCE: 'ACCEPTANCE',
  WITHDRAWN: 'WITHDRAWN',
  HOLD: 'HOLD',
};

/** The one source of every cap (spec section 7; the tracker's 60 is plan ruling Q11). */
export const LIMITS = {
  lists: 20,
  itemsPerList: 200,
  listName: 60,
  note: 500,
  trackerNotes: 1000,
  applicationsPerCycle: 60,
} as const;

/** What a shared milestone becomes: the only fields an anonymous RMH event carries. */
export interface SharedEventRow {
  schoolId: string;
  cycleYear: number;
  program: MedProgram;
  eventType: MedEventType;
  /** The calendar day at 00:00 UTC. */
  occurredAt: Date;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The UTC instant of a `YYYY-MM-DD` day, or null when it is not a day on the calendar (no `2026-02-30`, no year 99 -> 1999). */
function parseDay(s: string): Date | null {
  const m = DAY_RE.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

const dayString = (d: Date): string => d.toISOString().slice(0, 10);

export function toSharedEvent(a: {
  type: MilestoneType;
  date: string;
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  sharing: boolean;
}): SharedEventRow | null {
  const eventType = SHAREABLE[a.type];
  if (!a.sharing || !eventType) return null;
  const occurredAt = parseDay(a.date);
  if (!occurredAt) return null;
  return { schoolId: a.schoolId, cycleYear: a.cycleYear, program: a.program, eventType, occurredAt };
}

/** The count cell an event lands in: `school|program|cycle|YYYY-MM-DD|type`. */
export function cellKey(
  e: Pick<SharedEventRow, 'schoolId' | 'program' | 'cycleYear' | 'eventType' | 'occurredAt'>,
): string {
  return `${e.schoolId}|${e.program}|${e.cycleYear}|${dayString(e.occurredAt)}|${e.eventType}`;
}

export type DateProblem = 'format' | 'calendar' | 'window' | 'future';

/**
 * A milestone date is a calendar day string inside `[cycleYear-1-05-01, cycleYear-08-31]` and no later than tomorrow
 * UTC (a viewer in Hawaii can be a day behind UTC; an invite is dated when received). The window keeps a typo from
 * becoming a public cell; the future rule stops a row from existing before its day.
 */
export function milestoneDateProblem(cycleYear: number, date: unknown, now: Date): DateProblem | null {
  if (typeof date !== 'string' || !DAY_RE.test(date)) return 'format';
  if (!parseDay(date)) return 'calendar';
  if (date < `${cycleYear - 1}-05-01` || date > `${cycleYear}-08-31`) return 'window';
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (date > dayString(tomorrow)) return 'future';
  return null;
}

/**
 * The `min` and `max` of a milestone date input: the same window `milestoneDateProblem` enforces, so the control and the
 * server agree. `max` is the cycle's last day or tomorrow UTC, whichever is earlier.
 */
export function milestoneDateWindow(cycleYear: number, now: Date): { min: string; max: string } {
  const tomorrow = dayString(new Date(now.getTime() + 86_400_000));
  const end = `${cycleYear}-08-31`;
  return { min: `${cycleYear - 1}-05-01`, max: end < tomorrow ? end : tomorrow };
}

/** Sharing needs an account at least this old (plan Q8); the server checks, the toggle explains. */
export const SHARE_MIN_ACCOUNT_AGE_DAYS = 7;

/** True when an account created at `createdAt` may share on `now`. */
export function accountOldEnoughToShare(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() >= SHARE_MIN_ACCOUNT_AGE_DAYS * 86_400_000;
}

/** The milestone types this application has not set yet, in display order. */
export function unsetMilestoneTypes(set: readonly { type: MilestoneType }[]): MilestoneType[] {
  const have = new Set(set.map((m) => m.type));
  return MILESTONE_TYPES.filter((t) => !have.has(t));
}

/** A cycle year is accepted within `[currentCycle-3, currentCycle+1]`, the current cycle rolling over on June 1 UTC. */
export function cycleYearProblem(cycleYear: unknown, now: Date): 'range' | null {
  if (typeof cycleYear !== 'number' || !Number.isInteger(cycleYear)) return 'range';
  const current = cycleYearOf(now, 'SECONDARY');
  return cycleYear >= current - 3 && cycleYear <= current + 1 ? null : 'range';
}

/** The 50 states, DC and the five inhabited territories. */
export const HOME_STATE_CODES: readonly string[] = (
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA ' +
  'RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU VI AS MP'
).split(' ');
const HOME_STATES = new Set(HOME_STATE_CODES);

/** `'nc '` -> `'NC'`; empty or absent -> null; anything not a US state, DC or territory -> `'invalid'`. */
export function normalizeHomeState(v: unknown): string | null | 'invalid' {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return 'invalid';
  const s = v.trim().toUpperCase();
  if (!s) return null;
  return HOME_STATES.has(s) ? s : 'invalid';
}

/** The requested order when it is a permutation of the stored ids; null when the sets differ or either holds a duplicate. */
export function reorderIds(stored: readonly string[], requested: readonly string[]): string[] | null {
  if (stored.length !== requested.length) return null;
  const have = new Set(stored);
  if (have.size !== stored.length) return null;
  const seen = new Set<string>();
  for (const id of requested) {
    if (!have.has(id) || seen.has(id)) return null;
    seen.add(id);
  }
  return [...requested];
}

/**
 * User text for a list name or a note: NFC, control characters and U+0000 removed (a newline is kept), trimmed, counted
 * in code points. Null when empty after cleaning or longer than `max`. Markup is left alone: it is rendered as text.
 */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // Every control character except the newline: `[^\P{Cc}\n]` is Cc minus \n.
  const s = v
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n]/gu, '')
    .trim();
  if (!s) return null;
  return [...s].length > max ? null : s;
}
