import { describe, it, expect } from 'vitest';
import {
  buildHourlySeries,
  currenciesOf,
  hourBucket,
  summarizeBurn,
  type BalanceSample,
} from '@/lib/deepseek/balance';

const s = (iso: string, total: number, extra: Partial<BalanceSample> = {}): BalanceSample => ({
  createdAt: iso,
  currency: 'USD',
  totalBalance: total,
  grantedBalance: 0,
  toppedUpBalance: total,
  source: 'cron',
  ...extra,
});

describe('hourBucket', () => {
  it('truncates to the UTC hour', () => {
    expect(hourBucket('2026-10-21T13:59:59.999Z').toISOString()).toBe('2026-10-21T13:00:00.000Z');
  });
});

describe('buildHourlySeries', () => {
  it('keeps the latest sample per hour and computes deltas', () => {
    const points = buildHourlySeries(
      [
        s('2026-10-21T10:05:00Z', 100),
        s('2026-10-21T10:50:00Z', 99, { source: 'manual' }),
        s('2026-10-21T11:05:00Z', 98.5),
        s('2026-10-21T12:05:00Z', 98.4, { currency: 'CNY' }),
      ],
      'USD',
    );
    expect(points.map((p) => [p.hour, p.total, p.delta, p.source])).toEqual([
      ['2026-10-21T10:00:00.000Z', 99, null, 'manual'],
      ['2026-10-21T11:00:00.000Z', 98.5, -0.5, 'cron'],
    ]);
  });

  it('is order independent and ignores other currencies', () => {
    const points = buildHourlySeries(
      [s('2026-10-21T11:05:00Z', 5), s('2026-10-21T10:05:00Z', 6)],
      'USD',
    );
    expect(points.map((p) => p.total)).toEqual([6, 5]);
    expect(buildHourlySeries([], 'USD')).toEqual([]);
  });
});

describe('currenciesOf', () => {
  it('orders by sample count', () => {
    expect(currenciesOf([{ currency: 'CNY' }, { currency: 'USD' }, { currency: 'USD' }])).toEqual([
      'USD',
      'CNY',
    ]);
  });
});

describe('summarizeBurn', () => {
  const series = (totals: number[]) =>
    buildHourlySeries(
      totals.map((t, i) => s(new Date(Date.UTC(2026, 9, 21, i, 5)).toISOString(), t)),
      'USD',
    );

  it('averages spend per hour and projects time remaining', () => {
    const b = summarizeBurn(series([10, 9, 8, 7, 6])); // 1/hour over 4 hours
    expect(b.spent).toBe(4);
    expect(b.spanHours).toBe(4);
    expect(b.perHour).toBe(1);
    expect(b.perDay).toBe(24);
    expect(b.hoursRemaining).toBe(6);
    expect(b.daysRemaining).toBe(0.25);
  });

  it('ignores top-up jumps instead of netting them against spend', () => {
    const b = summarizeBurn(series([10, 9, 109, 108])); // -1, +100, -1
    expect(b.spent).toBe(2);
    expect(b.toppedUp).toBe(100);
    expect(b.perHour).toBeCloseTo(2 / 3);
    expect(b.latest).toBe(108);
  });

  it('has no projection without burn or without enough points', () => {
    expect(summarizeBurn(series([5, 5, 5])).hoursRemaining).toBeNull();
    expect(summarizeBurn(series([5, 6])).hoursRemaining).toBeNull();
    const one = summarizeBurn(series([5]));
    expect(one.perHour).toBeNull();
    expect(one.latest).toBe(5);
    expect(summarizeBurn([]).latest).toBeNull();
  });

  it('counts missing hours in the span so gaps dilute the rate', () => {
    const points = buildHourlySeries(
      [s('2026-10-21T00:05:00Z', 10), s('2026-10-21T04:05:00Z', 6)],
      'USD',
    );
    expect(summarizeBurn(points).perHour).toBe(1);
  });
});
