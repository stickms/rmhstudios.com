import { describe, expect, it } from 'vitest';
import {
  allZones,
  dayDifference,
  dayPart,
  formatOffset,
  isValidZone,
  wallTimeIn,
  zoneOffsetMinutes,
  zonedTimeToUtc,
} from '@/lib/toolbox/timezones';

describe('offsets', () => {
  it('reads standard, daylight and half-hour offsets', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300);
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Kathmandu')).toBe(345);
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0);
  });

  it('formats offsets', () => {
    expect(formatOffset(330)).toBe('UTC+05:30');
    expect(formatOffset(-180)).toBe('UTC−03:00');
    expect(formatOffset(0)).toBe('UTC');
  });
});

describe('zonedTimeToUtc', () => {
  it('converts a wall time in a zone to the instant', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 1, hour: 9, minute: 0 }, 'Europe/Berlin').toISOString()).toBe(
      '2026-03-01T08:00:00.000Z',
    );
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 }, 'America/New_York').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    );
  });

  it('moves a time skipped by the spring change past the gap', () => {
    // Berlin skips 02:00-03:00 on 2026-03-29.
    const d = zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, 'Europe/Berlin');
    expect(d.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(wallTimeIn(d, 'Europe/Berlin').hour).toBe(3);
  });

  it('takes the first of two times repeated by the autumn change', () => {
    // Berlin repeats 02:00-03:00 on 2026-10-25; the first 02:30 is still summer time (UTC+2).
    const d = zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, 'Europe/Berlin');
    expect(d.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('round-trips through wallTimeIn', () => {
    const wall = { year: 2026, month: 11, day: 20, hour: 17, minute: 45 };
    const d = zonedTimeToUtc(wall, 'Australia/Sydney');
    expect(wallTimeIn(d, 'Australia/Sydney')).toEqual({ ...wall, second: 0 });
  });
});

describe('helpers', () => {
  it('counts day differences across the date line', () => {
    const instant = new Date('2026-11-20T22:00:00Z');
    expect(dayDifference(wallTimeIn(instant, 'America/Los_Angeles'), wallTimeIn(instant, 'Pacific/Auckland'))).toBe(1);
  });

  it('classifies hours and validates zones', () => {
    expect(dayPart(10)).toBe('work');
    expect(dayPart(19)).toBe('edge');
    expect(dayPart(8)).toBe('edge');
    expect(dayPart(3)).toBe('night');
    expect(isValidZone('Europe/Paris')).toBe(true);
    expect(isValidZone('Mars/Olympus')).toBe(false);
    expect(allZones()).toContain('UTC');
  });
});
