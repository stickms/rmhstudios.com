import { describe, it, expect } from 'vitest';
import {
  categorize,
  csvCell,
  monthRange,
  recentMonths,
  summarize,
  toCsv,
  type TypeTotal,
} from '@/lib/economy/statement';

describe('categorize (C4)', () => {
  it('buckets by type first, then direction', () => {
    expect(categorize('WAGER', 'out')).toBe('staked');
    expect(categorize('WAGER', 'in')).toBe('staked');
    expect(categorize('GIFT', 'in')).toBe('gifted');
    expect(categorize('TIP', 'out')).toBe('gifted');
    expect(categorize('REWARD', 'in')).toBe('earned');
    expect(categorize('MARKET', 'in')).toBe('earned');
    expect(categorize('PURCHASE', 'out')).toBe('spent');
    expect(categorize('MEMBERSHIP', 'out')).toBe('spent');
  });
});

describe('summarize', () => {
  const groups: TypeTotal[] = [
    { type: 'REWARD', direction: 'in', total: 500, count: 5 },
    { type: 'PURCHASE', direction: 'out', total: 300, count: 2 },
    { type: 'TIP', direction: 'in', total: 40, count: 2 },
    { type: 'GIFT', direction: 'out', total: 60, count: 1 },
    { type: 'WAGER', direction: 'out', total: 200, count: 8 },
    { type: 'WAGER', direction: 'in', total: 150, count: 3 },
  ];

  it('every row lands in exactly one bucket, so buckets sum to the month', () => {
    const s = summarize('2026-09', groups, 1000);
    expect(s.rowCount).toBe(21);
    expect(s.categories.reduce((a, c) => a + c.count, 0)).toBe(21);
    expect(s.categories.reduce((a, c) => a + c.inTotal, 0)).toBe(s.totalIn);
    expect(s.categories.reduce((a, c) => a + c.outTotal, 0)).toBe(s.totalOut);
    expect(s.totalIn).toBe(690);
    expect(s.totalOut).toBe(560);
  });

  it('opening + net = closing, by construction', () => {
    const s = summarize('2026-09', groups, 1000);
    expect(s.net).toBe(130);
    expect(s.openingBalance).toBe(870);
    expect(s.openingBalance + s.net).toBe(s.closingBalance);
  });

  it('an empty month has opening = closing', () => {
    const s = summarize('2026-09', [], 42);
    expect(s).toMatchObject({ openingBalance: 42, closingBalance: 42, net: 0, rowCount: 0 });
  });
});

describe('months', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('parses a past or current month to a UTC half-open range', () => {
    const r = monthRange('2026-09', now)!;
    expect(r.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(monthRange('2026-10', now)).not.toBeNull();
    expect(monthRange('2026-12', now)).toBeNull(); // future
  });
  it('rejects malformed and ancient months', () => {
    for (const bad of ['2026-13', '2026-9', 'abc', '2026-09-01', '2019-01']) {
      expect(monthRange(bad, now)).toBeNull();
    }
  });
  it('lists recent months newest first across a year boundary', () => {
    expect(recentMonths(new Date('2026-02-10T00:00:00Z'), 4)).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12)).toBe('12');
  });

  it('defuses spreadsheet formulas in notes written by other people', () => {
    for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd']) {
      expect(csvCell(evil).replace(/^"/, '')[0]).toBe("'");
    }
    // A negative NUMBER is data, not a formula.
    expect(csvCell(-5)).toBe('-5');
  });

  it('renders signed amounts, categories and a CRLF-terminated file', () => {
    const csv = toCsv([
      {
        createdAt: new Date('2026-09-02T10:00:00Z'),
        type: 'REWARD',
        direction: 'in',
        amount: 50,
        counterparty: 'RMH Studios',
        note: 'Daily',
        reference: 'tx1',
      },
      {
        createdAt: new Date('2026-09-03T10:00:00Z'),
        type: 'PURCHASE',
        direction: 'out',
        amount: 120,
        counterparty: 'RMH Studios',
        note: null,
        reference: 'tx2',
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('date_utc,type,category,direction,amount,counterparty,note,reference');
    expect(lines[1]).toBe('2026-09-02T10:00:00.000Z,REWARD,earned,in,50,RMH Studios,Daily,tx1');
    expect(lines[2]).toBe('2026-09-03T10:00:00.000Z,PURCHASE,spent,out,-120,RMH Studios,,tx2');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
