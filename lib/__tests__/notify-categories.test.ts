import { describe, it, expect } from 'vitest';
import {
  resolveChannels,
  inQuietHours,
  CATEGORY_DEFAULTS,
  notifPrefsSchema,
} from '@/lib/notify/categories';

describe('resolveChannels', () => {
  it('falls back to category defaults when unset', () => {
    expect(resolveChannels({}, 'social')).toEqual(CATEGORY_DEFAULTS.social);
    expect(resolveChannels(undefined, 'system')).toEqual(CATEGORY_DEFAULTS.system);
  });

  it('merges partial overrides over defaults', () => {
    expect(resolveChannels({ social: { push: false } }, 'social')).toEqual({
      inapp: true,
      push: false,
      email: false,
    });
  });
});

describe('inQuietHours', () => {
  it('handles a same-day window', () => {
    expect(inQuietHours(9 * 60, 8 * 60, 10 * 60)).toBe(true);
    expect(inQuietHours(11 * 60, 8 * 60, 10 * 60)).toBe(false);
  });

  it('handles a cross-midnight window (22:00–07:00)', () => {
    expect(inQuietHours(23 * 60, 22 * 60, 7 * 60)).toBe(true); // 23:00 inside
    expect(inQuietHours(3 * 60, 22 * 60, 7 * 60)).toBe(true); // 03:00 inside
    expect(inQuietHours(12 * 60, 22 * 60, 7 * 60)).toBe(false); // noon outside
  });

  it('is off when unset or equal', () => {
    expect(inQuietHours(600, null, null)).toBe(false);
    expect(inQuietHours(600, 480, 480)).toBe(false);
  });
});

describe('notifPrefsSchema', () => {
  it('validates matrix + quiet minutes', () => {
    expect(notifPrefsSchema.safeParse({ matrix: { social: { push: false } }, quietStart: 1320, quietEnd: 420 }).success).toBe(true);
    expect(notifPrefsSchema.safeParse({ quietStart: 2000 }).success).toBe(false); // > 1439
    expect(notifPrefsSchema.safeParse({ matrix: { bogus: { push: false } } }).success).toBe(false);
  });
});
