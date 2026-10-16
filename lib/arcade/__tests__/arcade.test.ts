import { describe, expect, it } from 'vitest';
import { dailyMutator, parseSeedKey, findModifier, SEEDED_GAMES } from '@/lib/arcade/seeded';
import { plausibleRun } from '@/lib/arcade/validate';
import { nextRivalState } from '@/lib/arcade/rivals';

describe('daily mutator', () => {
  it('is deterministic and always names a seeded game with a valid modifier', () => {
    for (const day of ['2026-10-12', '2026-10-13', '2027-01-01', '2026-02-28']) {
      const a = dailyMutator(day);
      expect(dailyMutator(day)).toEqual(a);
      expect(SEEDED_GAMES[a.gameId].modifiers).toContainEqual(a.modifier);
      expect(a.seed).toBeGreaterThan(0);
    }
  });
  it('varies the seed per day', () => {
    expect(dailyMutator('2026-10-12').seed).not.toBe(dailyMutator('2026-10-13').seed);
  });
});

describe('shared seeds', () => {
  it('parses only well-formed keys and known variants', () => {
    expect(parseSeedKey('123:frantic-60')).toEqual({ seed: 123, variant: 'frantic-60' });
    expect(parseSeedKey('99999999999:frantic-60')).toBeNull();
    expect(parseSeedKey('1:../etc')).toBeNull();
    expect(findModifier('laundry-sort', 'frantic-75')).toBeUndefined();
    expect(findModifier('dream-rift', 'hard-bllm')).toBeDefined();
  });
});

describe('plausibleRun', () => {
  it('rejects scores the sorted count cannot reach and too-short runs', () => {
    expect(plausibleRun('laundry-sort', 5000, 60_000, { sorted: 10 })).toBe(false);
    expect(plausibleRun('laundry-sort', 1200, 60_000, { sorted: 10 })).toBe(true);
    expect(plausibleRun('laundry-sort', 100, 5_000, { sorted: 10 })).toBe(false);
    expect(plausibleRun('laundry-sort', 100, 60_000, undefined)).toBe(false);
    expect(plausibleRun('dream-rift', 20_000_000, 60_000, undefined)).toBe(false);
    expect(plausibleRun('dream-rift', 1_000, 60_000, undefined)).toBe(true);
  });
});

describe('nextRivalState', () => {
  it('notifies only when a rival the player had passed takes the spot back', () => {
    expect(nextRivalState('ahead', 100, 200, false)).toEqual({ state: 'ahead', notify: false });
    expect(nextRivalState('ahead', 300, 200, false)).toEqual({ state: 'behind', notify: false });
    expect(nextRivalState('behind', 300, 200, false)).toEqual({ state: 'behind', notify: false });
    expect(nextRivalState('behind', 100, 200, false)).toEqual({ state: 'ahead', notify: true });
    expect(nextRivalState('behind', 100, 50, true)).toEqual({ state: 'ahead', notify: true });
  });
});
