import { describe, expect, it } from 'vitest';
import { calendarFeedICS } from '@/lib/events-ics';
import { FEED_TOKEN_RE } from '../feed-token';

describe('personal feed ICS', () => {
  it('tags entries with categories and an alarm, and escapes text', () => {
    const ics = calendarFeedICS(
      [
        {
          id: 'office-hours-1',
          title: 'Hours; a, b',
          startsAt: new Date('2026-10-14T18:00:00Z'),
          endsAt: new Date('2026-10-14T18:30:00Z'),
          categories: ['Office hours'],
          alarmMinutes: 15,
        },
      ],
      { name: 'RMH Studios', refreshMinutes: 60 },
    );
    expect(ics).toContain('UID:office-hours-1@rmhstudios.com');
    expect(ics).toContain('CATEGORIES:Office hours');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain('SUMMARY:Hours\\; a\\, b');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT60M');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('only accepts well-formed feed tokens', () => {
    expect(FEED_TOKEN_RE.test('a'.repeat(32))).toBe(true);
    expect(FEED_TOKEN_RE.test('short')).toBe(false);
    expect(FEED_TOKEN_RE.test('../../etc/passwd' + 'a'.repeat(20))).toBe(false);
  });
});
