import { describe, expect, it } from 'vitest';
import {
  composeContent,
  describeCadence,
  fitsPost,
  formatTime,
  nextThreadAt,
  parseTime,
  MAX_ACTIVE,
  type RecurrenceSpec,
} from '@/lib/communities/recurring';

const iso = (ms: number) => new Date(ms).toISOString();
const at = (s: string) => Date.parse(s);

const londonMonday: RecurrenceSpec = {
  cadence: 'weekly',
  weekday: 1,
  dayOfMonth: null,
  minuteOfDay: 540,
  timeZone: 'Europe/London',
};

describe('weekly occurrences across a clock change', () => {
  it('Monday 09:00 London stays 09:00 local after the clocks go back (25 October 2026)', () => {
    // Monday 19 October 09:00 BST is 08:00Z; the next Monday, 26 October, is 09:00 GMT.
    expect(iso(nextThreadAt(londonMonday, at('2026-10-19T08:00:00Z')))).toBe('2026-10-26T09:00:00.000Z');
  });

  it('and after they go forward (29 March 2026)', () => {
    expect(iso(nextThreadAt(londonMonday, at('2026-03-23T09:00:00Z')))).toBe('2026-03-30T08:00:00.000Z');
  });

  it('Sunday 09:00 New York across the March change (8 March 2026)', () => {
    const spec: RecurrenceSpec = {
      ...londonMonday,
      weekday: 0,
      timeZone: 'America/New_York',
    };
    expect(iso(nextThreadAt(spec, at('2026-03-01T14:00:00Z')))).toBe('2026-03-08T13:00:00.000Z');
  });

  it('is strictly after the instant it is given, and later the same day counts', () => {
    expect(iso(nextThreadAt(londonMonday, at('2026-11-23T09:00:00Z')))).toBe('2026-11-30T09:00:00.000Z');
    expect(iso(nextThreadAt(londonMonday, at('2026-11-23T08:59:00Z')))).toBe('2026-11-23T09:00:00.000Z');
  });

  it('reads the weekday in the template zone, not in UTC', () => {
    // 23:30Z on Sunday 22 November is already Monday 08 in Tokyo; Monday 09:00 Tokyo is 00:00Z.
    const tokyo: RecurrenceSpec = {
      ...londonMonday,
      timeZone: 'Asia/Tokyo',
    };
    expect(iso(nextThreadAt(tokyo, at('2026-11-22T23:30:00Z')))).toBe('2026-11-23T00:00:00.000Z');
  });
});

describe('monthly occurrences', () => {
  const monthly = (dayOfMonth: number, timeZone: string): RecurrenceSpec => ({
    cadence: 'monthly',
    weekday: null,
    dayOfMonth,
    minuteOfDay: 540,
    timeZone,
  });

  it('the 28th at 09:00 New York moves from daylight to standard time (1 November 2026)', () => {
    expect(iso(nextThreadAt(monthly(28, 'America/New_York'), at('2026-10-28T13:00:00Z')))).toBe(
      '2026-11-28T14:00:00.000Z',
    );
  });

  it('the 15th at 09:00 London in summer and winter', () => {
    expect(iso(nextThreadAt(monthly(15, 'Europe/London'), at('2026-09-15T08:00:00Z')))).toBe(
      '2026-10-15T08:00:00.000Z',
    );
    expect(iso(nextThreadAt(monthly(15, 'Europe/London'), at('2026-11-15T09:00:00Z')))).toBe(
      '2026-12-15T09:00:00.000Z',
    );
  });

  it('rolls the year, and takes this month when the day is still ahead', () => {
    expect(iso(nextThreadAt(monthly(1, 'UTC'), at('2026-12-01T09:00:00Z')))).toBe('2027-01-01T09:00:00.000Z');
    expect(iso(nextThreadAt(monthly(28, 'UTC'), at('2026-02-10T00:00:00Z')))).toBe('2026-02-28T09:00:00.000Z');
  });
});

describe('catching up', () => {
  it('from a long-missed occurrence the next one is after now, so one post covers the whole outage', () => {
    const now = at('2026-11-23T10:00:00Z');
    const missed = at('2026-10-05T09:00:00Z');
    const next = nextThreadAt(londonMonday, now);
    expect(next).toBeGreaterThan(now);
    expect(iso(next)).toBe('2026-11-30T09:00:00.000Z');
    // Computed from now, not from the missed one: it never steps through the weeks in between.
    expect(next).toBeGreaterThan(nextThreadAt(londonMonday, missed));
    expect(nextThreadAt(londonMonday, next)).toBeGreaterThan(next);
  });
});

describe('helpers', () => {
  it('parses and formats a time', () => {
    expect(parseTime('09:00')).toBe(540);
    expect(parseTime('23:59')).toBe(1439);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9:00')).toBeNull();
    expect(formatTime(540)).toBe('09:00');
  });

  it('describes a cadence as data for the UI', () => {
    expect(describeCadence(londonMonday)).toEqual({
      cadence: 'weekly',
      weekday: 1,
      dayOfMonth: null,
      time: '09:00',
      timeZone: 'Europe/London',
    });
  });

  it('puts a blank line between the title and the body and keeps the whole inside one post', () => {
    expect(composeContent(' Weekly ', ' Share ')).toBe('Weekly\n\nShare');
    expect(composeContent('Weekly', '')).toBe('Weekly');
    expect(fitsPost('a'.repeat(100), 'b'.repeat(178))).toBe(true);
    expect(fitsPost('a'.repeat(100), 'b'.repeat(179))).toBe(false);
  });

  it('allows five active templates', () => {
    expect(MAX_ACTIVE).toBe(5);
  });
});
