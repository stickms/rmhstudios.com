/**
 * Time-zone arithmetic on top of `Intl`, with no time-zone database shipped:
 * the browser already has one.
 *
 * `zoneOffsetMinutes` reads a zone's UTC offset at an instant from the wall
 * clock `Intl.DateTimeFormat` prints there. `zonedTimeToUtc` goes the other way
 * — "9:00 on 30 March in Berlin" to an instant — by fixed-point iteration on
 * that offset, which also settles the two hard cases: a wall time skipped by a
 * spring-forward change resolves to the instant after the gap, and an
 * ambiguous one in the autumn takes the earlier of the two.
 *
 * Reading the wall clock is `getZonedParts` from `lib/core/zoned-time` (shared
 * with /dunesday and /sohumtracker). Its own `zonedTimeToUtc` settles a gap or
 * a repeat on "the near side" by iteration; this tool needs a stated rule for
 * both, which the version below makes explicit and tests.
 */

import { getZonedParts } from '@/lib/core/zoned-time';

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock time in `zone` at `instant` (the site's one reader, `lib/core/zoned-time`). */
export function wallTimeIn(instant: Date, zone: string): WallTime & { second: number } {
  return getZonedParts(instant, zone);
}

/** Minutes ahead of UTC in `zone` at `instant` (330 for India, -300 for New York in winter). */
export function zoneOffsetMinutes(instant: Date, zone: string): number {
  const w = wallTimeIn(instant, zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60_000);
}

/** The instant at which the wall clock in `zone` reads `wall`. */
export function zonedTimeToUtc(wall: WallTime, zone: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // Earlier of the two candidate offsets first, so an ambiguous autumn time takes the first occurrence.
  const before = zoneOffsetMinutes(new Date(naive - 86_400_000 / 2), zone);
  const after = zoneOffsetMinutes(new Date(naive + 86_400_000 / 2), zone);
  for (const offset of before >= after ? [before, after] : [after, before]) {
    const guess = new Date(naive - offset * 60_000);
    if (zoneOffsetMinutes(guess, zone) === offset) return guess;
  }
  // No offset reproduces the wall time: it falls in a spring-forward gap. Use the offset before the
  // change, which lands the same distance past the gap's end, as most calendars do.
  return new Date(naive - Math.min(before, after) * 60_000);
}

/** `UTC+05:30`, `UTC−03:00`, `UTC`. */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Calendar days between two wall dates: +1 when `b` is the next day. */
export function dayDifference(a: WallTime, b: WallTime): number {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

export type DayPart = 'work' | 'edge' | 'night';

/**
 * Working hours are 09:00 to 17:59; 07:00 to 08:59 and 18:00 to 21:59 are the edges of the day, when a call is
 * possible but not polite; the rest is night.
 */
export function dayPart(hour: number): DayPart {
  if (hour >= 9 && hour < 18) return 'work';
  if ((hour >= 7 && hour < 9) || (hour >= 18 && hour < 22)) return 'edge';
  return 'night';
}

/** A starting list for the zone picker when the browser cannot enumerate its zones. */
export const FALLBACK_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function allZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported ? supported('timeZone') : FALLBACK_ZONES;
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
}
