import { describe, expect, it } from 'vitest';
import { dayOf, wallTimeOf } from '@/lib/calendar/tz';
import {
  GRID_TIMES,
  MAX_LATE_MS,
  PAUSE_AFTER_REMINDERS,
  isGridTime,
  isStale,
  nextReminderMs,
} from '@/lib/study/reminders';

const at = (iso: string) => Date.parse(iso);
const wall = (ms: number, tz: string) => {
  const w = wallTimeOf(ms, tz);
  return `${dayOf(ms, tz)} ${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`;
};

describe('the 15-minute grid', () => {
  it('accepts quarter hours and nothing else', () => {
    for (const ok of ['00:00', '06:15', '18:30', '23:45']) expect(isGridTime(ok), ok).toBe(true);
    for (const bad of ['18:10', '24:00', '9:00', '18:60', '', '18:00:00', 'ab:cd']) {
      expect(isGridTime(bad), bad).toBe(false);
    }
  });
  it('lists 96 distinct grid times', () => {
    expect(GRID_TIMES).toHaveLength(96);
    expect(new Set(GRID_TIMES).size).toBe(96);
    expect(GRID_TIMES.every(isGridTime)).toBe(true);
  });
});

describe('nextReminderMs', () => {
  it('is later today when the time has not come, tomorrow once it has', () => {
    expect(wall(nextReminderMs('18:00', 'UTC', at('2026-11-21T10:00:00Z')), 'UTC')).toBe('2026-11-21 18:00');
    expect(wall(nextReminderMs('18:00', 'UTC', at('2026-11-21T18:00:00Z')), 'UTC')).toBe('2026-11-22 18:00');
    expect(wall(nextReminderMs('18:00', 'UTC', at('2026-11-21T19:00:00Z')), 'UTC')).toBe('2026-11-22 18:00');
  });
  it('reads the time in the member zone', () => {
    // 22:00 UTC is already 17:00 in New York in November (UTC-5): 18:00 is an hour away.
    const ms = nextReminderMs('18:00', 'America/New_York', at('2026-11-21T22:00:00Z'));
    expect(new Date(ms).toISOString()).toBe('2026-11-21T23:00:00.000Z');
  });
  it('keeps the wall time across the London spring-forward', () => {
    // Clocks go forward on 2027-03-28: 18:00 is UTC+0 before, UTC+1 after.
    const before = nextReminderMs('18:00', 'Europe/London', at('2027-03-27T19:00:00Z'));
    expect(new Date(before).toISOString()).toBe('2027-03-28T17:00:00.000Z');
    expect(wall(before, 'Europe/London')).toBe('2027-03-28 18:00');
  });
  it('keeps the wall time across the New York fall-back', () => {
    // Clocks go back on 2026-11-01.
    const next = nextReminderMs('18:00', 'America/New_York', at('2026-10-31T21:00:00Z'));
    expect(new Date(next).toISOString()).toBe('2026-10-31T22:00:00.000Z');
    const after = nextReminderMs('18:00', 'America/New_York', next);
    expect(new Date(after).toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(wall(after, 'America/New_York')).toBe('2026-11-01 18:00');
  });
  it('fires a skipped time shifted past the gap, once', () => {
    // 01:30 does not exist in London on 2027-03-28 (01:00 jumps to 02:00).
    const ms = nextReminderMs('01:30', 'Europe/London', at('2027-03-28T00:00:00Z'));
    expect(wall(ms, 'Europe/London')).toBe('2027-03-28 02:30');
    expect(ms).toBeGreaterThan(at('2027-03-28T00:00:00Z'));
    const next = nextReminderMs('01:30', 'Europe/London', ms);
    expect(wall(next, 'Europe/London')).toBe('2027-03-29 01:30');
  });
  it('fires a repeated time at its first occurrence, once', () => {
    // 01:30 happens twice in New York on 2026-11-01 (EDT then EST).
    const first = nextReminderMs('01:30', 'America/New_York', at('2026-11-01T00:00:00Z'));
    expect(new Date(first).toISOString()).toBe('2026-11-01T05:30:00.000Z');
    const next = nextReminderMs('01:30', 'America/New_York', first);
    expect(wall(next, 'America/New_York')).toBe('2026-11-02 01:30');
  });
  it('always moves strictly forward, a day at a time', () => {
    let from = at('2026-11-21T00:00:00Z');
    for (let i = 0; i < 400; i++) {
      const next = nextReminderMs('02:30', 'America/New_York', from);
      expect(next).toBeGreaterThan(from);
      expect(next - from).toBeLessThanOrEqual(25 * 3_600_000 + 60_000);
      from = next;
    }
  });
  it('rejects a time that is not HH:MM', () => {
    expect(() => nextReminderMs('6pm', 'UTC', 0)).toThrow();
  });
});

describe('the pause rule', () => {
  it('pauses after fourteen reminders', () => {
    expect(PAUSE_AFTER_REMINDERS).toBe(14);
  });
  it('skips a reminder that is more than three hours late', () => {
    const due = at('2026-11-21T18:00:00Z');
    expect(isStale(due, due + MAX_LATE_MS)).toBe(false);
    expect(isStale(due, due + MAX_LATE_MS + 1)).toBe(true);
  });
});
