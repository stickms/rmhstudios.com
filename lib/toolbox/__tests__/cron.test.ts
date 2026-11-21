import { describe, expect, it } from 'vitest';
import { matches, nextRuns, parseCron, type ParsedCron } from '@/lib/toolbox/cron';

const parse = (s: string): ParsedCron => {
  const r = parseCron(s);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.cron;
};
const utc = (s: string) => new Date(`${s}Z`);
const iso = (ds: Date[]) => ds.map((d) => d.toISOString().slice(0, 16));

describe('parseCron', () => {
  it('expands steps, ranges, lists and names', () => {
    const c = parse('*/15 9-17/4 1,15 JAN-MAR mon-fri');
    expect(c.fields.minute).toEqual([0, 15, 30, 45]);
    expect(c.fields.hour).toEqual([9, 13, 17]);
    expect(c.fields.dayOfMonth).toEqual([1, 15]);
    expect(c.fields.month).toEqual([1, 2, 3]);
    expect(c.fields.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it('treats 7 as Sunday and n/step as n to the end', () => {
    expect(parse('0 0 * * 7').fields.dayOfWeek).toEqual([0]);
    expect(parse('5/20 * * * *').fields.minute).toEqual([5, 25, 45]);
  });

  it('expands macros', () => {
    expect(parse('@weekly').expression).toBe('0 0 * * 0');
    expect(parseCron('@sometimes')).toEqual({ ok: false, error: { code: 'unknown-macro', token: '@sometimes' } });
  });

  it('explains what is wrong', () => {
    expect(parseCron('* * *')).toEqual({ ok: false, error: { code: 'field-count', count: 3 } });
    expect(parseCron('60 * * * *')).toMatchObject({ ok: false, error: { code: 'out-of-range', field: 'minute', max: 59 } });
    expect(parseCron('*/0 * * * *')).toMatchObject({ ok: false, error: { code: 'bad-step' } });
    expect(parseCron('* * * FOO *')).toMatchObject({ ok: false, error: { code: 'bad-value', field: 'month' } });
    expect(parseCron('5-1 * * * *')).toMatchObject({ ok: false, error: { code: 'bad-value' } });
  });
});

describe('matches', () => {
  it('ORs day-of-month and day-of-week when both are restricted (Vixie cron)', () => {
    const c = parse('0 12 13 * 5');
    expect(matches(c, utc('2026-11-13T12:00'), 'utc')).toBe(true); // a Friday the 13th
    expect(matches(c, utc('2026-11-20T12:00'), 'utc')).toBe(true); // any Friday
    expect(matches(c, utc('2026-12-13T12:00'), 'utc')).toBe(true); // any 13th
    expect(matches(c, utc('2026-11-19T12:00'), 'utc')).toBe(false);
  });
});

describe('nextRuns', () => {
  it('lists the next runs in UTC', () => {
    const c = parse('30 9 * * 1-5');
    expect(iso(nextRuns(c, utc('2026-11-20T10:00'), 3, 'utc'))).toEqual([
      '2026-11-23T09:30',
      '2026-11-24T09:30',
      '2026-11-25T09:30',
    ]);
  });

  it('starts strictly after the given time', () => {
    expect(iso(nextRuns(parse('* * * * *'), utc('2026-01-01T00:00'), 2, 'utc'))).toEqual([
      '2026-01-01T00:01',
      '2026-01-01T00:02',
    ]);
  });

  it('finds leap days and gives up on dates that never come', () => {
    expect(iso(nextRuns(parse('0 0 29 2 *'), utc('2026-03-01T00:00'), 2, 'utc', 8))).toEqual([
      '2028-02-29T00:00',
      '2032-02-29T00:00',
    ]);
    expect(nextRuns(parse('0 0 30 2 *'), utc('2026-01-01T00:00'), 1, 'utc')).toEqual([]);
  });

  it('handles monthly schedules across month lengths', () => {
    expect(iso(nextRuns(parse('0 6 31 * *'), utc('2026-01-31T07:00'), 2, 'utc'))).toEqual([
      '2026-03-31T06:00',
      '2026-05-31T06:00',
    ]);
  });
});
