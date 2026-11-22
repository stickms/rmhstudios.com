import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, errorRate, keyStatus, sumUsage, windowDays } from '@/lib/admin/api-keys';

describe('errorRate', () => {
  it('is errors over requests, 0 with no requests, never above 1', () => {
    expect(errorRate(1, 4)).toBe(0.25);
    expect(errorRate(0, 10)).toBe(0);
    expect(errorRate(5, 0)).toBe(0);
    expect(errorRate(9, 3)).toBe(1);
  });
});

describe('keyStatus', () => {
  const now = new Date('2026-11-28T12:00:00Z');
  it('reads suspended before expired before active', () => {
    expect(
      keyStatus(
        {
          suspendedAt: null,
          expiresAt: null,
        },
        now,
      ),
    ).toBe('active');
    expect(
      keyStatus(
        {
          suspendedAt: null,
          expiresAt: new Date('2026-11-28T11:00:00Z'),
        },
        now,
      ),
    ).toBe('expired');
    expect(
      keyStatus(
        {
          suspendedAt: null,
          expiresAt: new Date('2026-11-29T00:00:00Z'),
        },
        now,
      ),
    ).toBe('active');
    expect(
      keyStatus(
        {
          suspendedAt: now,
          expiresAt: new Date('2026-11-01T00:00:00Z'),
        },
        now,
      ),
    ).toBe('suspended');
  });
});

describe('windowDays and sumUsage', () => {
  it('lists seven UTC days, today first, in both day spellings', () => {
    const d = windowDays(new Date('2026-11-02T23:59:00Z'));
    expect(d.compact).toEqual(['20261102', '20261101', '20261031', '20261030', '20261029', '20261028', '20261027']);
    expect(d.dashed[0]).toBe('2026-11-02');
    expect(d.dashed).toHaveLength(7);
  });

  it('splits today from the window', () => {
    const r = (day: string, requests: number, units: number, c = 0, s = 0) => ({
      day,
      requests,
      units,
      clientErrors: c,
      serverErrors: s,
    });
    const out = sumUsage([r('20261102', 10, 30, 1, 0), r('20261101', 5, 5, 0, 2)], '20261102');
    expect(out.today).toEqual({
      requests: 10,
      units: 30,
      clientErrors: 1,
      serverErrors: 0,
    });
    expect(out.week).toEqual({
      requests: 15,
      units: 35,
      clientErrors: 1,
      serverErrors: 2,
    });
  });
});

describe('cursor', () => {
  it('round-trips and starts at the first ranked page', () => {
    expect(decodeCursor(undefined)).toEqual({
      phase: 'ranked',
      offset: 0,
    });
    expect(
      decodeCursor(
        encodeCursor({
          phase: 'ranked',
          offset: 50,
        }),
      ),
    ).toEqual({
      phase: 'ranked',
      offset: 50,
    });
    expect(
      decodeCursor(
        encodeCursor({
          phase: 'idle',
          afterId: 'abc_1',
        }),
      ),
    ).toEqual({
      phase: 'idle',
      afterId: 'abc_1',
    });
    expect(
      decodeCursor(
        encodeCursor({
          phase: 'idle',
          afterId: null,
        }),
      ),
    ).toEqual({
      phase: 'idle',
      afterId: null,
    });
  });
  it('rejects anything it did not issue', () => {
    for (const bad of ['x', 'r:-1', 'r:abc', 'i:a b', 'r:1234567']) expect(decodeCursor(bad)).toBeNull();
  });
});
