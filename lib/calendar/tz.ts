/**
 * Timezone arithmetic for the calendar features (K1–K4, F5) — pure and
 * client-safe, built on `Intl` only (no dependency).
 *
 * Everything the calendar stores is UTC. These helpers exist for the two
 * places a wall-clock time has to become an instant: an organiser choosing
 * "9am to 5pm" for a poll, and a weekly window or repeating event that must
 * stay at 8pm local across a daylight-saving change.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

export interface WallTime {
  y: number;
  /** 1–12. */
  mo: number;
  d: number;
  h: number;
  mi: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall-clock reading of an instant in `tz`, plus its weekday (0 = Sunday). */
export function wallTimeOf(ms: number, tz: string): WallTime & { weekday: number } {
  const parts = formatterFor(tz).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    y: Number(get('year')),
    mo: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')) % 24,
    mi: Number(get('minute')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** Offset of `tz` from UTC at an instant, in milliseconds (east is positive). */
export function zoneOffsetMs(ms: number, tz: string): number {
  const w = wallTimeOf(ms, tz);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, 0);
  return asUtc - Math.floor(ms / 60_000) * 60_000;
}

/**
 * The instant at which `tz`'s clocks read `wall`. A time skipped by a
 * spring-forward resolves to the instant just after the gap; an ambiguous
 * fall-back time resolves to the first occurrence.
 */
export function wallToUtcMs(wall: WallTime, tz: string): number {
  const guess = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, 0);
  const off1 = zoneOffsetMs(guess, tz);
  const first = guess - off1;
  const off2 = zoneOffsetMs(first, tz);
  return off2 === off1 ? first : guess - off2;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDay(day: string): { y: number; mo: number; d: number } | null {
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, mo, d };
}

/** `YYYY-MM-DD` plus `n` days (calendar arithmetic, no timezone involved). */
export function addDays(day: string, n: number): string {
  const p = parseDay(day);
  if (!p) throw new Error(`bad day: ${day}`);
  const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + n));
  return dayString(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function dayString(y: number, mo: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The calendar day an instant falls on in `tz`, as `YYYY-MM-DD`. */
export function dayOf(ms: number, tz: string): string {
  const w = wallTimeOf(ms, tz);
  return dayString(w.y, w.mo, w.d);
}

/** Minutes since local midnight of an instant in `tz`. */
export function minuteOfDay(ms: number, tz: string): number {
  const w = wallTimeOf(ms, tz);
  return w.h * 60 + w.mi;
}
