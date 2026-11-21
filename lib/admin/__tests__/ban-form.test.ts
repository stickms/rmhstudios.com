import { describe, expect, it } from 'vitest';
import { BAN_DAYS_MAX, BAN_REASON_MAX, checkBanDays, checkBanReason } from '../ban-form';

describe('checkBanReason', () => {
  it('trims and accepts text', () => {
    expect(checkBanReason('  spam  ')).toEqual({ ok: true, reason: 'spam' });
  });
  it('refuses blank and whitespace', () => {
    expect(checkBanReason('')).toEqual({ ok: false, error: 'required' });
    expect(checkBanReason('   ')).toEqual({ ok: false, error: 'required' });
  });
  it('cuts at the endpoint limit', () => {
    const result = checkBanReason('x'.repeat(BAN_REASON_MAX + 20));
    expect(result.ok && result.reason.length).toBe(BAN_REASON_MAX);
  });
});

describe('checkBanDays', () => {
  it('treats blank as a permanent ban', () => {
    expect(checkBanDays('')).toEqual({ ok: true, days: null });
    expect(checkBanDays('  ')).toEqual({ ok: true, days: null });
  });
  it('accepts whole days in range', () => {
    expect(checkBanDays('7')).toEqual({ ok: true, days: 7 });
    expect(checkBanDays(String(BAN_DAYS_MAX))).toEqual({ ok: true, days: BAN_DAYS_MAX });
  });
  it('refuses everything else', () => {
    for (const bad of ['0', '-3', '1.5', '7d', 'abc', String(BAN_DAYS_MAX + 1)]) {
      expect(checkBanDays(bad)).toEqual({ ok: false });
    }
  });
});
