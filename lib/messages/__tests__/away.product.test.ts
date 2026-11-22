import { describe, expect, it } from 'vitest';
import {
  AWAY_MAX_DAYS,
  awayLastDay,
  awayLineData,
  isAwayActive,
  isAwayAutoReply,
  resolveAwayWindow,
} from '@/lib/messages/away';

describe('isAwayActive', () => {
  const row = { startsAt: new Date('2026-12-01T00:00:00Z'), endsAt: new Date('2026-12-05T00:00:00Z') };
  it('is active inside the window only', () => {
    expect(isAwayActive(row, new Date('2026-11-30T23:59:59Z'))).toBe(false);
    expect(isAwayActive(row, new Date('2026-12-01T00:00:00Z'))).toBe(true);
    expect(isAwayActive(row, new Date('2026-12-04T23:59:59Z'))).toBe(true);
    expect(isAwayActive(row, new Date('2026-12-05T00:00:00Z'))).toBe(false);
  });
});

describe('resolveAwayWindow across daylight saving', () => {
  it('ends at the end of the end day in the member zone (spring forward, New York)', () => {
    const now = new Date('2027-03-10T15:00:00Z');
    const w = resolveAwayWindow({ endDay: '2027-03-14', tz: 'America/New_York', now });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    // 14 March is the 23-hour day; the window ends at local midnight of the 15th, 04:00 UTC (EDT).
    expect(w.endsAt.toISOString()).toBe('2027-03-15T04:00:00.000Z');
    expect(awayLastDay(w.endsAt, 'America/New_York')).toBe('2027-03-14');
    expect(isAwayActive(w, new Date('2027-03-15T03:59:00Z'))).toBe(true);
    expect(isAwayActive(w, new Date('2027-03-15T04:00:00Z'))).toBe(false);
  });

  it('handles fall back (Berlin) and a future start day', () => {
    const now = new Date('2027-10-20T10:00:00Z');
    const w = resolveAwayWindow({ startDay: '2027-10-30', endDay: '2027-10-31', tz: 'Europe/Berlin', now });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(w.startsAt.toISOString()).toBe('2027-10-29T22:00:00.000Z');
    // The 31st is the 25-hour day; local midnight of 1 Nov is 23:00 UTC.
    expect(w.endsAt.toISOString()).toBe('2027-10-31T23:00:00.000Z');
    expect(isAwayActive(w, now)).toBe(false);
  });

  it('starts now when no start day or a past one is given', () => {
    const now = new Date('2026-12-01T12:00:00Z');
    for (const startDay of [undefined, null, '2026-11-01']) {
      const w = resolveAwayWindow({ startDay, endDay: '2026-12-03', tz: 'UTC', now });
      expect(w.ok && w.startsAt.getTime()).toBe(now.getTime());
    }
  });

  it('refuses a bad zone, an ended day, a start after the end and more than 60 days', () => {
    const now = new Date('2026-12-01T12:00:00Z');
    const r = (o: object) => resolveAwayWindow({ endDay: '2026-12-03', tz: 'UTC', now, ...o });
    expect(r({ tz: 'Nope/Zone' })).toEqual({ ok: false, error: 'tz' });
    expect(r({ endDay: '2026-11-30' })).toEqual({ ok: false, error: 'ended' });
    expect(r({ startDay: '2026-12-09' })).toEqual({ ok: false, error: 'end-before-start' });
    expect(r({ endDay: '2027-01-30' }).ok).toBe(true);
    expect(r({ endDay: '2027-01-31' })).toEqual({ ok: false, error: 'too-far' });
    expect(AWAY_MAX_DAYS).toBe(60);
  });

  it('measures "today" in the member zone, not UTC', () => {
    // 23:30 UTC on 1 Dec is already 2 Dec in Tokyo, so 1 Dec is over there.
    const now = new Date('2026-12-01T23:30:00Z');
    expect(resolveAwayWindow({ endDay: '2026-12-01', tz: 'Asia/Tokyo', now })).toEqual({ ok: false, error: 'ended' });
    expect(resolveAwayWindow({ endDay: '2026-12-01', tz: 'UTC', now }).ok).toBe(true);
  });
});

describe('header text data', () => {
  it('carries the last day and a date to format, never text', () => {
    const data = awayLineData({
      startsAt: new Date('2026-12-01T00:00:00Z'),
      endsAt: new Date('2026-12-04T00:00:00Z'),
      tz: 'UTC',
    });
    expect(data.lastDay).toBe('2026-12-03');
    expect(data.date.toISOString()).toBe('2026-12-03T12:00:00.000Z');
    expect(Object.keys(data).sort()).toEqual(['date', 'lastDay']);
  });
});

describe('isAwayAutoReply', () => {
  it('recognises only the away label', () => {
    expect(isAwayAutoReply({ autoReply: 'away' })).toBe(true);
    expect(isAwayAutoReply({ autoReply: true })).toBe(false);
    expect(isAwayAutoReply(null)).toBe(false);
  });
});
