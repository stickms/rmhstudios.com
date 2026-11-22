import { describe, expect, it } from 'vitest';
import { MUTE_DURATIONS } from '@/lib/feed/muted-expiry';
import { ACCOUNT_MUTE_DURATIONS, isAccountMuteDuration, muteExpiresAt } from '@/lib/moderation/mute-expiry';

const NOW = new Date('2026-11-30T12:00:00Z');

describe('mute durations to instants', () => {
  it('offers the muted-words durations plus "forever"', () => {
    expect([...ACCOUNT_MUTE_DURATIONS]).toEqual([...Object.keys(MUTE_DURATIONS), 'forever']);
  });

  it.each([
    ['day', '2026-12-01T12:00:00.000Z'],
    ['week', '2026-12-07T12:00:00.000Z'],
    ['month', '2026-12-30T12:00:00.000Z'],
  ] as const)('%s ends at %s', (d, iso) => {
    expect(muteExpiresAt(d, NOW)?.toISOString()).toBe(iso);
  });

  it('forever has no end; unknown names are not durations', () => {
    expect(muteExpiresAt('forever', NOW)).toBeNull();
    expect(isAccountMuteDuration('year')).toBe(false);
    expect(isAccountMuteDuration('week')).toBe(true);
  });
});
