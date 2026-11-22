import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_PER_DAY,
  DEFAULT_RETENTION,
  MAX_NEW_PER_DAY,
  MAX_RETENTION,
  MIN_RETENTION,
  clampNewPerDay,
  clampRetention,
  retentionPercent,
} from './practice-settings';

describe('retention', () => {
  it('stays inside 80% to 95% and to whole percent', () => {
    expect(clampRetention(0.5)).toBe(MIN_RETENTION);
    expect(clampRetention(0.99)).toBe(MAX_RETENTION);
    expect(clampRetention(0.873)).toBe(0.87);
    expect(clampRetention(0.9)).toBe(DEFAULT_RETENTION);
  });

  it('repairs anything that is not a finite number', () => {
    for (const bad of [Number.NaN, Infinity, '0.9', null, undefined])
      expect(clampRetention(bad)).toBe(DEFAULT_RETENTION);
  });

  it('is shown as a whole percent', () => {
    expect(retentionPercent(0.9)).toBe(90);
    expect(retentionPercent(0.855)).toBe(86);
    expect(retentionPercent(7)).toBe(95);
  });
});

describe('new cards per day', () => {
  it('is a whole number from 0 to 50, and 0 is allowed', () => {
    expect(clampNewPerDay(0)).toBe(0);
    expect(clampNewPerDay(-4)).toBe(0);
    expect(clampNewPerDay(12.6)).toBe(13);
    expect(clampNewPerDay(500)).toBe(MAX_NEW_PER_DAY);
  });

  it('repairs anything that is not a finite number', () => {
    for (const bad of [Number.NaN, Infinity, '5', null, undefined])
      expect(clampNewPerDay(bad)).toBe(DEFAULT_NEW_PER_DAY);
  });
});
