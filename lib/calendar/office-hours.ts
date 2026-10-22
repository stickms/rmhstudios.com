/**
 * K2 — office-hours slot arithmetic. Pure and client-safe.
 *
 * A host publishes weekly windows ("Tuesdays 18:00–20:00") in their own
 * timezone and a slot length; the bookable slots for any date range are
 * COMPUTED from those, never stored. Only a booking is a row, and the unique
 * (hostId, startsAt) on it is what stops two people taking the same slot.
 */
import { addDays, parseDay, wallTimeOf, wallToUtcMs, dayOf } from './tz';

/** Bookable slot lengths, minutes. Also enforced by `officeHoursConfigSchema`. */
export const OFFICE_HOURS_SLOT_LENGTHS = [15, 30, 45, 60] as const;

export const OFFICE_HOURS_HORIZON_DAYS = 28;
/** A slot must start at least this far ahead to be bookable. */
export const OFFICE_HOURS_LEAD_MS = 15 * 60_000;
/** One guest may hold at most this many upcoming bookings with one host. */
export const OFFICE_HOURS_MAX_PER_GUEST = 3;

export interface OfficeWindow {
  /** 0 = Sunday. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface OfficeConfig {
  tz: string;
  slotMin: number;
  windows: readonly OfficeWindow[];
}

export interface OfficeSlot {
  startsAt: Date;
  endsAt: Date;
}

/** Do any two windows on the same weekday overlap? */
export function windowsOverlap(windows: readonly OfficeWindow[]): boolean {
  const byDay = new Map<number, OfficeWindow[]>();
  for (const w of windows) byDay.set(w.weekday, [...(byDay.get(w.weekday) ?? []), w]);
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) return true;
    }
  }
  return false;
}

/** Every slot starting in [from, to), ascending. */
export function expandSlots(config: OfficeConfig, from: Date, to: Date): OfficeSlot[] {
  if (config.windows.length === 0 || config.slotMin <= 0) return [];
  const out: OfficeSlot[] = [];
  // One day of slack each side: the host's local day can start before `from` in UTC.
  let day = addDays(dayOf(from.getTime(), config.tz), -1);
  const lastDay = addDays(dayOf(to.getTime(), config.tz), 1);
  for (let guard = 0; day <= lastDay && guard < 400; guard++, day = addDays(day, 1)) {
    const p = parseDay(day);
    if (!p) break;
    const weekday = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
    for (const w of config.windows) {
      if (w.weekday !== weekday) continue;
      for (let m = w.startMinute; m + config.slotMin <= w.endMinute; m += config.slotMin) {
        const ms = wallToUtcMs({ ...p, h: Math.floor(m / 60), mi: m % 60 }, config.tz);
        if (ms >= from.getTime() && ms < to.getTime()) {
          out.push({ startsAt: new Date(ms), endsAt: new Date(ms + config.slotMin * 60_000) });
        }
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Is `startsAt` exactly one of the host's bookable slots within the horizon? */
export function isBookableSlot(config: OfficeConfig, startsAt: Date, now: Date): boolean {
  if (startsAt.getTime() < now.getTime() + OFFICE_HOURS_LEAD_MS) return false;
  const horizon = new Date(now.getTime() + OFFICE_HOURS_HORIZON_DAYS * 86_400_000);
  if (startsAt.getTime() >= horizon.getTime()) return false;
  return expandSlots(
    config,
    new Date(startsAt.getTime() - 1000),
    new Date(startsAt.getTime() + 1000),
  ).some((s) => s.startsAt.getTime() === startsAt.getTime());
}

/** [Monday 00:00, next Monday 00:00) in the host's timezone, as instants. */
export function weekBounds(at: Date, tz: string): { start: Date; end: Date } {
  const w = wallTimeOf(at.getTime(), tz);
  const day = dayOf(at.getTime(), tz);
  const monday = addDays(day, -((w.weekday + 6) % 7));
  const nextMonday = addDays(monday, 7);
  const m = parseDay(monday);
  const n = parseDay(nextMonday);
  if (!m || !n) throw new Error('bad week');
  return {
    start: new Date(wallToUtcMs({ ...m, h: 0, mi: 0 }, tz)),
    end: new Date(wallToUtcMs({ ...n, h: 0, mi: 0 }, tz)),
  };
}
