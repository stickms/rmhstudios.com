/**
 * K1 — turning a poll's parameters into its slot grid, and a respondent's
 * answers into something `lib/schedule/availability.ts` can score. Pure and
 * client-safe: the server and the browser derive the SAME slots from the same
 * parameters, which is why a poll stores five numbers and a timezone instead of
 * hundreds of slot rows.
 *
 * Slots are UTC epoch minutes (the unit `availability.ts` works in). The
 * organiser picks the daily hour window in THEIR timezone; every viewer sees
 * the same instants rendered in their own.
 */
import {
  bestRuns,
  scoreSlots,
  type Answer,
  type AvailabilityResponse,
  type PollWindow,
  type Run,
  type SlotScore,
} from '@/lib/schedule/availability';
import { addDays, dayOf, minuteOfDay, parseDay, wallToUtcMs, isValidTimeZone } from './tz';

export const POLL_MAX_DAYS = 14;
export const POLL_SLOT_LENGTHS = [30, 60] as const;
/** 14 days x 48 half-hour slots. Also the width of the `answers` column. */
export const POLL_MAX_SLOTS = POLL_MAX_DAYS * 48;
export const POLL_MAX_INVITEES = 20;
export const POLL_MAX_RESPONDENTS = 200;

export interface PollParams {
  tz: string;
  /** First day of the range, YYYY-MM-DD in `tz`. */
  firstDay: string;
  days: number;
  /** 0–23, in `tz`. */
  dayStartHour: number;
  /** 1–24 (exclusive), in `tz`. */
  dayEndHour: number;
  slotMin: number;
}

export type PollParamsError =
  'bad-timezone' | 'bad-day' | 'bad-days' | 'bad-hours' | 'bad-slot' | 'misaligned';

/** Validate parameters; returns the first problem or null. */
export function checkPollParams(p: PollParams): PollParamsError | null {
  if (!isValidTimeZone(p.tz)) return 'bad-timezone';
  if (!parseDay(p.firstDay)) return 'bad-day';
  if (!Number.isInteger(p.days) || p.days < 1 || p.days > POLL_MAX_DAYS) return 'bad-days';
  if (
    !Number.isInteger(p.dayStartHour) ||
    !Number.isInteger(p.dayEndHour) ||
    p.dayStartHour < 0 ||
    p.dayStartHour > 23 ||
    p.dayEndHour < 1 ||
    p.dayEndHour > 24 ||
    p.dayEndHour <= p.dayStartHour
  ) {
    return 'bad-hours';
  }
  if (!(POLL_SLOT_LENGTHS as readonly number[]).includes(p.slotMin)) return 'bad-slot';
  if (((p.dayEndHour - p.dayStartHour) * 60) % p.slotMin !== 0) return 'bad-hours';
  const starts = pollSlotStarts(p);
  // `availability.ts` walks a window in steps of slotMin from its first slot, so
  // every slot must sit on that lattice. A daylight-saving change that is not a
  // multiple of the slot length (Lord Howe Island, 30 minutes, with hour slots)
  // would break it; refusing is better than silently dropping slots.
  for (const s of starts) if ((s - starts[0]) % p.slotMin !== 0) return 'misaligned';
  return null;
}

/** Every slot start, ascending, as UTC epoch minutes. */
export function pollSlotStarts(p: PollParams): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.days; i++) {
    const day = parseDay(addDays(p.firstDay, i));
    if (!day) continue;
    for (let m = p.dayStartHour * 60; m < p.dayEndHour * 60; m += p.slotMin) {
      const ms = wallToUtcMs({ ...day, h: Math.floor(m / 60), mi: m % 60 }, p.tz);
      out.push(Math.floor(ms / 60_000));
    }
  }
  out.sort((a, b) => a - b);
  return out.filter((v, i) => i === 0 || v !== out[i - 1]);
}

/** The window `bestRuns` / `scoreSlots` walk. Null for an empty poll. */
export function pollWindow(p: PollParams, starts = pollSlotStarts(p)): PollWindow | null {
  if (starts.length === 0) return null;
  return { startMin: starts[0], endMin: starts[starts.length - 1] + p.slotMin, slotMin: p.slotMin };
}

// ── Answers ─────────────────────────────────────────────────────────────────

const CHAR_TO_ANSWER: Record<string, Answer | undefined> = { '1': 'yes', '2': 'maybe' };

/** A valid answer string is exactly one of `0 1 2` per slot. */
export function isValidAnswers(raw: string, slotCount: number): boolean {
  return raw.length === slotCount && /^[012]*$/.test(raw);
}

export function emptyAnswers(slotCount: number): string {
  return '0'.repeat(slotCount);
}

/** Answer string -> the map `availability.ts` consumes. Unlisted means "no". */
export function answersToSlots(answers: string, starts: readonly number[]): Record<number, Answer> {
  const out: Record<number, Answer> = {};
  for (let i = 0; i < starts.length; i++) {
    const a = CHAR_TO_ANSWER[answers[i] ?? '0'];
    if (a) out[starts[i]] = a;
  }
  return out;
}

export interface PollRespondent {
  userId: string;
  answers: string;
  required: boolean;
}

/**
 * Responses in the shape `availability.ts` scores. A required invitee who has
 * not answered yet is included with no availability — otherwise a slot would
 * look unanimous simply because the person it depends on had not looked.
 */
export function toAvailabilityResponses(
  respondents: readonly PollRespondent[],
  requiredPending: readonly string[],
  starts: readonly number[],
): AvailabilityResponse[] {
  const rows: AvailabilityResponse[] = respondents.map((r) => ({
    userId: r.userId,
    required: r.required,
    slots: answersToSlots(r.answers, starts),
  }));
  for (const userId of requiredPending) rows.push({ userId, required: true, slots: {} });
  return rows;
}

export function rankPoll(
  p: PollParams,
  respondents: readonly PollRespondent[],
  requiredPending: readonly string[],
  opts: { limit?: number } = {},
): { heat: SlotScore[]; runs: Run[] } {
  const starts = pollSlotStarts(p);
  const window = pollWindow(p, starts);
  if (!window) return { heat: [], runs: [] };
  const responses = toAvailabilityResponses(respondents, requiredPending, starts);
  return {
    heat: scoreSlots(window, responses),
    runs: bestRuns(window, responses, { limit: opts.limit ?? 5 }),
  };
}

/**
 * Is [startMin, endMin) a legal lock-in? It must begin on a slot, be a whole
 * number of slots long, and every slot in between must exist (a run may not
 * straddle the gap between two days' windows).
 */
export function isValidLock(
  startMin: number,
  endMin: number,
  starts: readonly number[],
  slotMin: number,
): boolean {
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin) || endMin <= startMin) return false;
  if ((endMin - startMin) % slotMin !== 0) return false;
  const set = new Set(starts);
  for (let t = startMin; t < endMin; t += slotMin) if (!set.has(t)) return false;
  return true;
}

// ── Viewer-timezone layout ──────────────────────────────────────────────────

export interface GridLayout {
  /** One column per viewer-local day that has any slot. */
  days: { day: string; startMs: number }[];
  /** One row per distinct viewer-local minute-of-day, ascending. */
  rows: number[];
  /** cells[dayIndex * rows.length + rowIndex] = slot index, or -1 for no slot. */
  cells: Int16Array;
}

/**
 * Lay the poll's slots out as a day-by-time grid in the VIEWER's timezone.
 * A poll set 9–17 in New York shows 15:00–23:00 for a viewer in Berlin, and a
 * window that crosses the viewer's midnight simply splits across two columns —
 * the grid has a row for every distinct local time of day, and a cell is blank
 * where no slot falls.
 */
export function layoutGrid(starts: readonly number[], viewerTz: string): GridLayout {
  const dayIndex = new Map<string, number>();
  const days: GridLayout['days'] = [];
  const rowSet = new Set<number>();
  const place: { d: number; tod: number }[] = [];
  for (const s of starts) {
    const ms = s * 60_000;
    const day = dayOf(ms, viewerTz);
    let di = dayIndex.get(day);
    if (di === undefined) {
      di = days.length;
      dayIndex.set(day, di);
      days.push({ day, startMs: ms });
    }
    const tod = minuteOfDay(ms, viewerTz);
    rowSet.add(tod);
    place.push({ d: di, tod });
  }
  const rows = [...rowSet].sort((a, b) => a - b);
  const rowIndex = new Map(rows.map((r, i) => [r, i]));
  const cells = new Int16Array(days.length * rows.length).fill(-1);
  place.forEach((pl, i) => {
    cells[pl.d * rows.length + (rowIndex.get(pl.tod) as number)] = i;
  });
  return { days, rows, cells };
}
