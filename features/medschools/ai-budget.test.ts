import { describe, expect, it, vi } from 'vitest';
import { qaCapUsd, qaDailyCap, qaShare, scrapeCapUsd, utcDayStart } from './ai-budget';

describe('qaShare', () => {
  it('defaults to 0.25 when unset or blank', () => {
    for (const v of [undefined, '', ' ']) expect(qaShare(v)).toBe(0.25);
  });
  it('reads a fraction from 0 to 1', () => {
    expect(qaShare('0')).toBe(0);
    expect(qaShare('1')).toBe(1);
    expect(qaShare('0.4')).toBe(0.4);
  });
  it('fails closed to 0 and warns once on anything else', () => {
    for (const v of ['1.5', '-1', 'abc', 'NaN']) {
      const warn = vi.fn();
      expect(qaShare(v, warn), v).toBe(0);
      expect(warn, v).toHaveBeenCalledTimes(1);
    }
  });
});

describe('qaDailyCap', () => {
  it('defaults to 15 when unset or blank', () => {
    for (const v of [undefined, '', ' ']) expect(qaDailyCap(v)).toBe(15);
  });
  it('reads a non-negative integer', () => {
    expect(qaDailyCap('15')).toBe(15);
    expect(qaDailyCap('0')).toBe(0);
  });
  it('fails closed to 0 and warns once on anything else', () => {
    for (const v of ['3.5', '-2', 'x']) {
      const warn = vi.fn();
      expect(qaDailyCap(v, warn), v).toBe(0);
      expect(warn, v).toHaveBeenCalledTimes(1);
    }
  });
});

describe('the split', () => {
  it('never lets the two sides pass the cap', () => {
    for (const [cap, share] of [
      [20, 0.25],
      [20, 0],
      [20, 1],
      [0, 0.25],
      [7.3, 0.4],
    ] as const) {
      const q = qaCapUsd(cap, share);
      const s = scrapeCapUsd(cap, share);
      expect(Math.abs(q + s - cap)).toBeLessThan(1e-9);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(s).toBeGreaterThanOrEqual(0);
    }
    expect(qaCapUsd(20, 0.25)).toBe(5);
    expect(scrapeCapUsd(20, 0.25)).toBe(15);
  });
});

describe('utcDayStart', () => {
  it('is midnight UTC of the day', () => {
    expect(utcDayStart(new Date('2026-11-23T23:59:59.999Z')).toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });
});
