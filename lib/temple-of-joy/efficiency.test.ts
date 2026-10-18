import { describe, expect, it } from 'vitest';
import { efficiencyFromSave } from './efficiency';

describe('efficiencyFromSave', () => {
  it('scores joy per hour on a log scale', () => {
    // 1e12 joy over 10 hours = 1e11 per hour -> 11 * 100
    expect(efficiencyFromSave({ lifetimeJoy: 1e12, playtime: 36_000 })).toEqual({
      score: 1100,
      hours: 10,
      durationMs: 36_000_000,
    });
  });

  it('refuses under an hour of play, junk and non-finite saves', () => {
    expect(efficiencyFromSave({ lifetimeJoy: 1e12, playtime: 3_599 })).toBeNull();
    expect(efficiencyFromSave({ lifetimeJoy: Infinity, playtime: 36_000 })).toBeNull();
    expect(efficiencyFromSave({ lifetimeJoy: '1e12', playtime: 36_000 })).toBeNull();
    expect(efficiencyFromSave({ lifetimeJoy: 0, playtime: 36_000 })).toBeNull();
    expect(efficiencyFromSave(null)).toBeNull();
  });
});
