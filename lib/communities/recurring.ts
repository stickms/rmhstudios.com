/**
 * Recurring community threads (s08-09), pure part: the limits, the next-occurrence maths and the data the UI
 * builds its sentence from. No dependencies beyond the calendar time-zone helpers, so a client can import it.
 */
import { addDays, dayOf, parseDay, wallToUtcMs } from '@/lib/calendar/tz';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';

/** At most this many active templates per community. */
export const MAX_ACTIVE = 5;
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;
export const CADENCES = ['weekly', 'monthly'] as const;
export type Cadence = (typeof CADENCES)[number];
/** Monthly templates stop at 28 so every month has the day. */
export const MONTH_DAY_MAX = 28;

/** Why a template is paused. Short codes (the column is 32 characters); the UI turns them into words. */
export const PAUSE_REASONS = [
  'manual',
  'author_not_moderator',
  'author_sanctioned',
  'community_gone',
  'gate_refused',
  'held_by_automod',
  'publish_failed',
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export interface RecurrenceSpec {
  cadence: Cadence;
  /** 0 (Sunday) to 6; used when weekly. */
  weekday: number | null;
  /** 1 to 28; used when monthly. */
  dayOfMonth: number | null;
  /** Minutes after local midnight, 0 to 1439. */
  minuteOfDay: number;
  timeZone: string;
}

/** `HH:MM` to minutes after midnight, or null when it is not a valid 24-hour time. */
export function parseTime(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** What the post will say: the title line, a blank line, the body. The whole must fit a post. */
export function composeContent(title: string, body: string): string {
  const t = title.trim();
  const b = body.trim();
  return b ? `${t}\n\n${b}` : t;
}

/** The title and body together must fit one RMHark. */
export function fitsPost(title: string, body: string): boolean {
  return [...composeContent(title, body)].length <= MAX_RMHARK_LENGTH;
}

function weekdayOfDay(day: string): number {
  const p = parseDay(day);
  if (!p) throw new Error(`bad day: ${day}`);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}

/**
 * The first occurrence strictly after `afterMs`, as a UTC instant. The wall time is resolved in the template's
 * zone with `wallToUtcMs`, so 09:00 stays 09:00 across a clock change; a time that does not exist (the spring-forward
 * hour) lands just after the gap, an ambiguous one (fall back) on its first occurrence.
 */
export function nextThreadAt(spec: RecurrenceSpec, afterMs: number): number {
  const h = Math.floor(spec.minuteOfDay / 60);
  const mi = spec.minuteOfDay % 60;
  const today = dayOf(afterMs, spec.timeZone);
  if (spec.cadence === 'weekly') {
    const weekday = spec.weekday ?? 0;
    for (let i = 0; i <= 8; i++) {
      const day = addDays(today, i);
      if (weekdayOfDay(day) !== weekday) continue;
      const p = parseDay(day);
      if (!p) continue;
      const ms = wallToUtcMs(
        {
          ...p,
          h,
          mi,
        },
        spec.timeZone,
      );
      if (ms > afterMs) return ms;
    }
  } else {
    const dom = Math.min(Math.max(spec.dayOfMonth ?? 1, 1), MONTH_DAY_MAX);
    const p = parseDay(today);
    if (p) {
      for (let k = 0; k <= 2; k++) {
        const idx = p.y * 12 + (p.mo - 1) + k;
        const y = Math.floor(idx / 12);
        const mo = (idx % 12) + 1;
        const ms = wallToUtcMs(
          {
            y,
            mo,
            d: dom,
            h,
            mi,
          },
          spec.timeZone,
        );
        if (ms > afterMs) return ms;
      }
    }
  }
  // Unreachable for a valid spec; a day later keeps a bad row from firing in a loop.
  return afterMs + 86_400_000;
}

/** What a row needs to say "Every Monday at 09:00 (Europe/London)": plain data, the component writes the words. */
export interface CadenceDescription {
  cadence: Cadence;
  weekday: number | null;
  dayOfMonth: number | null;
  time: string;
  timeZone: string;
}

export function describeCadence(spec: RecurrenceSpec): CadenceDescription {
  return {
    cadence: spec.cadence,
    weekday: spec.cadence === 'weekly' ? spec.weekday : null,
    dayOfMonth: spec.cadence === 'monthly' ? spec.dayOfMonth : null,
    time: formatTime(spec.minuteOfDay),
    timeZone: spec.timeZone,
  };
}

/** One template as the Recurring tab and the account export see it. */
export interface RecurringThreadDTO {
  id: string;
  title: string;
  body: string;
  flairId: string | null;
  cadence: Cadence;
  weekday: number | null;
  dayOfMonth: number | null;
  /** `HH:MM`. */
  time: string;
  timeZone: string;
  nextAt: string;
  active: boolean;
  pausedReason: PauseReason | null;
  lastPostId: string | null;
  lastPostedAt: string | null;
  failures: number;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
  } | null;
}
