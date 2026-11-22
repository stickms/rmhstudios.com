/**
 * Query validation and cursor encoding for `/api/v1/me/typing*`, `/api/v1/me/music/practice` and
 * `/api/v1/me/focus-sessions` (s09-09). Pure (no server imports) so the limits are testable on their own.
 */
import { z } from 'zod';
import { TYPING_LAYOUTS } from '@/lib/rmhtype/keystats';

export const PRACTICE_PAGE_MAX = 100;
export const PRACTICE_PAGE_DEFAULT = 50;
/** The longest span `typing/daily` returns, inclusive of both ends. */
export const DAILY_MAX_DAYS = 366;
/** The span `typing/daily` returns when `from` is omitted. */
export const DAILY_DEFAULT_DAYS = 30;

/** An empty parameter reads as absent, as the other v1 list routes treat `?cursor=`. */
const blankAsAbsent = (v: unknown) => (v === '' || v === null ? undefined : v);

const DAY_RE = /^(\d{4})-?(\d{2})-?(\d{2})$/;

/** `YYYYMMDD` (as stored) or `YYYY-MM-DD` to the stored form, or null for anything that is not a real day. */
export function normalizeDay(raw: string): string | null {
  const m = DAY_RE.exec(raw);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

function dayToMs(day: string): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
}

function msToDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

const dayParam = z.preprocess(blankAsAbsent, z.string().max(10).optional());

export const dailyQuery = z.object({ from: dayParam, to: dayParam });

/** The inclusive day range for a `typing/daily` request, or the message to refuse it with. */
export function resolveDailyRange(
  q: z.infer<typeof dailyQuery>,
  now: Date,
): { ok: true; from: string; to: string } | { ok: false; message: string } {
  const to = q.to === undefined ? msToDay(now.getTime()) : normalizeDay(q.to);
  if (!to) return { ok: false, message: '`to` must be a day, YYYYMMDD or YYYY-MM-DD.' };
  const from =
    q.from === undefined ? msToDay(dayToMs(to) - (DAILY_DEFAULT_DAYS - 1) * 86_400_000) : normalizeDay(q.from);
  if (!from) return { ok: false, message: '`from` must be a day, YYYYMMDD or YYYY-MM-DD.' };
  if (from > to) return { ok: false, message: '`from` must not be after `to`.' };
  const span = Math.round((dayToMs(to) - dayToMs(from)) / 86_400_000) + 1;
  if (span > DAILY_MAX_DAYS) return { ok: false, message: `The range may span at most ${DAILY_MAX_DAYS} days.` };
  return { ok: true, from, to };
}

export const keysQuery = z.object({
  layout: z.preprocess(blankAsAbsent, z.enum(TYPING_LAYOUTS).optional()),
});

const pageLimit = z.preprocess(
  blankAsAbsent,
  z.coerce.number().int().min(1).max(PRACTICE_PAGE_MAX).default(PRACTICE_PAGE_DEFAULT),
);

/** `since` is an ISO instant; only rows at or after it are returned. */
export const pagedQuery = z.object({
  limit: pageLimit,
  cursor: z.preprocess(blankAsAbsent, z.string().max(120).optional()),
  since: z.preprocess(blankAsAbsent, z.string().datetime({ offset: true }).optional()),
});

export type PagedQuery = z.infer<typeof pagedQuery>;

/** `time|id` keyset cursor, newest first. */
export function encodePracticeCursor(c: { at: Date; id: string }): string {
  return `${c.at.toISOString()}|${c.id}`;
}

export function decodePracticeCursor(raw: string, idPattern: RegExp): { at: Date; id: string } | null {
  const [iso, id, extra] = raw.split('|');
  if (!iso || !id || extra !== undefined || !idPattern.test(id)) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : { at, id };
}

export const MUSIC_ID_PATTERN = /^\d{1,18}$/;
export const FOCUS_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
