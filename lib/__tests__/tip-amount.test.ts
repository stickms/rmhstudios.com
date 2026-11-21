import { describe, it, expect } from 'vitest';
import { parseTipAmount } from '@/lib/economy/tip-amount';
import { TIP_MAX, TIP_MIN } from '@/lib/economy/tip-limits';

describe('parseTipAmount', () => {
  it('passes through valid whole amounts', () => {
    expect(parseTipAmount('12')).toBe(12);
    expect(parseTipAmount(String(TIP_MAX))).toBe(TIP_MAX);
  });

  it('clamps to the server cap so a slipped digit cannot overshoot', () => {
    expect(parseTipAmount('250000')).toBe(TIP_MAX);
    expect(parseTipAmount('99999999999')).toBe(TIP_MAX);
  });

  it('never goes below the minimum', () => {
    expect(parseTipAmount('0')).toBe(TIP_MIN);
    expect(parseTipAmount('-5')).toBe(TIP_MIN);
  });

  it('falls back to the minimum for empty or non-numeric input', () => {
    expect(parseTipAmount('')).toBe(TIP_MIN);
    expect(parseTipAmount('abc')).toBe(TIP_MIN);
  });

  it('truncates decimals like the previous parseInt did', () => {
    expect(parseTipAmount('10.9')).toBe(10);
  });
});
