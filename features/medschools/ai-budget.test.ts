import { describe, expect, it, vi } from 'vitest';
import {
  QA_DEADLINE_MS,
  QA_LEASE_MS,
  QA_THINK_CLIENT_TIMEOUT_MS,
  QA_THINK_DEADLINE_MS,
  qaCapForTier,
  qaCapUsd,
  qaDailyCap,
  qaDeadlineMs,
  qaShare,
  qaThinkingEnabled,
  scrapeCapUsd,
  utcDayStart,
} from './ai-budget';

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
  it('defaults to 25 when unset or blank', () => {
    for (const v of [undefined, '', ' ']) expect(qaDailyCap(v)).toBe(25);
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

describe('the limit tiers (R19)', () => {
  it('default to 25 free, 40 approved, 100 member, and no cap for an admin', () => {
    expect(qaCapForTier('free', {})).toBe(25);
    expect(qaCapForTier('approved', {})).toBe(40);
    expect(qaCapForTier('member', {})).toBe(100);
    expect(qaCapForTier('admin', { MEDSCHOOLS_QA_DAILY_CAP: '1' })).toBeNull();
  });
  it('read each tier from its own variable', () => {
    const env = {
      MEDSCHOOLS_QA_DAILY_CAP: '5',
      MEDSCHOOLS_QA_DAILY_CAP_APPROVED: '6',
      MEDSCHOOLS_QA_DAILY_CAP_MEMBER: '7',
    };
    expect([qaCapForTier('free', env), qaCapForTier('approved', env), qaCapForTier('member', env)]).toEqual([5, 6, 7]);
  });
  it('close a tier whose variable is invalid, naming the variable, and leave the others alone', () => {
    const warn = vi.fn();
    const env = { MEDSCHOOLS_QA_DAILY_CAP_APPROVED: 'lots', MEDSCHOOLS_QA_DAILY_CAP_MEMBER: '-1' };
    expect(qaCapForTier('approved', env, warn)).toBe(0);
    expect(qaCapForTier('member', env, warn)).toBe(0);
    expect(qaCapForTier('free', env, warn)).toBe(25);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toContain('MEDSCHOOLS_QA_DAILY_CAP_APPROVED');
    expect(warn.mock.calls[1]![0]).toContain('MEDSCHOOLS_QA_DAILY_CAP_MEMBER');
  });
});

describe('thinking (R20)', () => {
  it('is on by default and for on, off for off and for anything invalid, which warns', () => {
    for (const v of [undefined, '', ' ', 'on', 'ON', ' On ']) expect(qaThinkingEnabled(v)).toBe(true);
    const warn = vi.fn();
    for (const v of ['off', 'OFF']) expect(qaThinkingEnabled(v, warn)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    for (const v of ['true', '1', 'yes', 'maybe']) expect(qaThinkingEnabled(v, warn)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[0]![0]).toContain('MEDSCHOOLS_QA_THINKING');
  });
  it('orders the deadlines: server < client timeout, and the lease outlives the longest question', () => {
    expect(qaDeadlineMs(false)).toBe(QA_DEADLINE_MS);
    expect(qaDeadlineMs(true)).toBe(QA_THINK_DEADLINE_MS);
    expect(QA_DEADLINE_MS).toBeLessThan(60_000);
    expect(QA_THINK_DEADLINE_MS).toBe(120_000);
    expect(QA_THINK_CLIENT_TIMEOUT_MS).toBeGreaterThan(QA_THINK_DEADLINE_MS);
    expect(QA_LEASE_MS).toBeGreaterThanOrEqual(QA_THINK_DEADLINE_MS + 30_000);
  });
});
