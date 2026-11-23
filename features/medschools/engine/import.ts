/**
 * Pure rules for the tracker import (owner 2026-11-23): what a file may be, how the model's dates are checked against the
 * text they came from, and how a year the file never wrote is inferred. Client-safe: no `node:`, no zod, no I/O. The
 * server modules (`api/import/`) and the import view both read it, so a rule is written once.
 */
import { cycleYearOf } from './cycle';
import { MILESTONE_TYPES, milestoneDateProblem, type MilestoneType } from './tracker';
import type { MedEventType } from './types';

export const IMPORT_LIMITS = {
  /** A file's size, checked before it is read. */
  fileBytes: 2 * 1024 * 1024,
  /** Rows of a sheet or a CSV; the rest is counted and dropped. */
  rows: 300,
  /** Characters of extracted text sent to the model; the rest is dropped. */
  chars: 40_000,
  /** The paste box. Longer text is cut to `chars` like a file's; this only bounds the request. */
  pasteChars: 200_000,
  /** Schools the model may return, and milestones per school. */
  schools: 60,
  /** A grounding quote: a cell or a short phrase, never a paragraph. */
  rawChars: 80,
} as const;

/** The milestone types a file can carry (all of the tracker's: the enum is the schema's). */
export const IMPORT_TYPES: readonly MilestoneType[] = MILESTONE_TYPES;

export type ImportKind = 'xlsx' | 'csv' | 'docx' | 'pdf' | 'txt';

export const IMPORT_MIME: Record<ImportKind, readonly string[]> = {
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'application/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
};

const EXTENSION: Record<string, ImportKind> = {
  xlsx: 'xlsx',
  csv: 'csv',
  docx: 'docx',
  pdf: 'pdf',
  txt: 'txt',
  text: 'txt',
};

/** What the file input's `accept` lists. */
export const IMPORT_ACCEPT = '.xlsx,.csv,.docx,.pdf,.txt';

const GENERIC_MIME = new Set(['', 'application/octet-stream', 'application/vnd.ms-excel']);

/**
 * The kind of a file from its declared type and its name, or null when it is none we read. A browser sends no type, or a
 * generic one, for a CSV on some systems, so the extension decides then; a specific type that is not ours is refused
 * whatever the name says, and a specific type that disagrees with the extension is refused too.
 */
export function importKindOf(mimeType: string, filename: string): ImportKind | null {
  const mime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = /\.([a-z0-9]+)$/i.exec(filename.trim())?.[1]?.toLowerCase();
  const byExt = ext ? EXTENSION[ext] : undefined;
  const byMime = (Object.keys(IMPORT_MIME) as ImportKind[]).find((k) => IMPORT_MIME[k].includes(mime));
  if (GENERIC_MIME.has(mime)) {
    // `application/vnd.ms-excel` is Windows' type for a CSV; it is a CSV only when the name says so.
    if (mime === 'application/vnd.ms-excel') return byExt === 'csv' ? 'csv' : null;
    return byExt ?? null;
  }
  if (!byMime) return null;
  return byExt && byExt !== byMime ? null : byMime;
}

/* ------------------------------ dates ------------------------------ */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The year, month and day of a real calendar day string, or null (no `2026-02-30`). */
export function parseIsoDay(s: string): { y: number; m: number; d: number } | null {
  const m = DAY_RE.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(0);
  probe.setUTCFullYear(y, mo - 1, d);
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
    ? { y, m: mo, d }
    : null;
}

const pad = (n: number): string => String(n).padStart(2, '0');
export const isoDay = (y: number, m: number, d: number): string => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** Month numbers a word in the text names ("Jul", "july", "Sept"). */
function monthsNamed(text: string): Set<number> {
  const out = new Set<number>();
  for (const w of text.toLowerCase().match(/[a-z]{3,9}/g) ?? []) {
    const i = MONTHS.findIndex((name) => name.startsWith(w));
    if (i >= 0) out.add(i + 1);
  }
  return out;
}

export interface RawDate {
  /** The quote writes the year (four digits, or two in a numeric date). */
  yearWritten: boolean;
  /** Both of a numeric date's first two parts could be a month, and they differ: 03/04 is March 4 or April 3. */
  ambiguous: boolean;
}

/**
 * Does the quote the model gave actually say this day? The day and the month must both be readable in it (a month name
 * and the day number, or two numbers that are the month and the day); the year is not required, because a sheet often
 * leaves it out, but a year the quote does write must be the model's. This is what stops a date the model made up from
 * sitting beside a real quote like a column header. Null when the quote does not support the date, otherwise what the
 * quote did and did not say.
 */
export function rawSupportsDate(raw: string, day: { y: number; m: number; d: number }): RawDate | null {
  const text = raw.normalize('NFKC');
  const nums = (text.match(/\d+/g) ?? []).map((n) => Number(n));
  const named = monthsNamed(text);
  const supported = named.has(day.m)
    ? nums.includes(day.d)
    : nums.some((n, i) => n === day.m && nums.some((k, j) => j !== i && k === day.d));
  if (!supported) return null;
  const years4 = (text.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/g) ?? []).map(Number);
  if (years4.length > 0 && !years4.includes(day.y)) return null;
  const twoDigit = /(?<!\d)\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*(\d{2})(?!\d)/.exec(text);
  const yearWritten = years4.includes(day.y) || (twoDigit !== null && Number(twoDigit[1]) === day.y % 100);
  // A year-first date (2026-10-09) reads one way only: take it out before looking for a numeric month and day.
  const numeric = /(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})(?!\d)/.exec(text.replace(/(?<!\d)\d{4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2}(?!\d)/g, ' '));
  const ambiguous =
    named.size === 0 && numeric !== null && Number(numeric[1]) <= 12 && Number(numeric[2]) <= 12 && numeric[1] !== numeric[2];
  return { yearWritten, ambiguous };
}

/**
 * Which event rule decides a milestone's cycle: the shareable types use their own (`cycleYearOf`, ruling R0); the
 * private ones follow the secondary's, because they happen in the same stretch (June and after belong to the cycle that
 * begins; secondaries and submissions open then).
 */
function ruleOf(type: MilestoneType): MedEventType {
  switch (type) {
    case 'INTERVIEW':
    case 'WAITLIST':
    case 'REJECTION':
    case 'ACCEPTANCE':
    case 'WITHDRAWN':
    case 'HOLD':
      return type;
    default:
      return 'SECONDARY';
  }
}

/** The cycle (entry year) an explicit date belongs to by `cycleYearOf`; submissions open in May, so May counts as the next cycle's. */
export function cycleOfDate(type: MilestoneType, y: number, m: number, d: number): number {
  const day = new Date(Date.UTC(y, m - 1, d));
  if ((type === 'SUBMITTED' || type === 'COMPLETE') && m === 5) return y + 1;
  return cycleYearOf(day, ruleOf(type));
}

/**
 * The year a sheet left out: the one of `cycleYear - 1` and `cycleYear` in which this month and day falls inside the
 * tracker's window for the cycle and belongs to it by the type's rule. Null when neither does (a date months away from
 * the cycle).
 */
export function inferYear(type: MilestoneType, m: number, d: number, cycleYear: number, now: Date): number | null {
  for (const y of [cycleYear - 1, cycleYear]) {
    const iso = isoDay(y, m, d);
    if (!parseIsoDay(iso)) continue;
    if (cycleOfDate(type, y, m, d) !== cycleYear) continue;
    const problem = milestoneDateProblem(cycleYear, iso, now);
    if (problem === 'window' || problem === 'format') continue;
    return y;
  }
  return null;
}

/**
 * The cycle a file is about: the one most of its dated-with-a-year milestones belong to; else the model's hint when it is
 * a real cycle; else the current one. A tie goes to the later cycle.
 */
export function inferCycle(
  dated: readonly { type: MilestoneType; y: number; m: number; d: number }[],
  hint: number | null,
  now: Date,
): { cycleYear: number; from: 'dates' | 'hint' | 'default' } {
  const tally = new Map<number, number>();
  for (const x of dated) tally.set(cycleOfDate(x.type, x.y, x.m, x.d), (tally.get(cycleOfDate(x.type, x.y, x.m, x.d)) ?? 0) + 1);
  let best: number | null = null;
  for (const [year, n] of tally) {
    if (best === null || n > (tally.get(best) ?? 0) || (n === (tally.get(best) ?? 0) && year > best)) best = year;
  }
  if (best !== null) return { cycleYear: best, from: 'dates' };
  const current = cycleYearOf(now, 'SECONDARY');
  if (hint !== null && Number.isInteger(hint) && Math.abs(hint - current) <= 3) return { cycleYear: hint, from: 'hint' };
  return { cycleYear: current, from: 'default' };
}

/** A program as a file writes it ("MD", "DO", "MD/PhD", "DO-PhD", "MSTP") as the tracker's `REG` or `PHD`. */
export function programOf(text: string): 'REG' | 'PHD' {
  return /ph\.?\s*d|mstp/i.test(text) ? 'PHD' : 'REG';
}

/** Whitespace and case folded away, so a quote matches the text it was cut from however a cell was spaced. */
export const foldForMatch = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
