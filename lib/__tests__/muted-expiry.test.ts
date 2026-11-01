import { describe, it, expect } from 'vitest';
import {
  MAX_MUTE_MS,
  MUTE_DURATIONS,
  activeMutedWords,
  cleanExpiries,
  nextExpiry,
  parseExpiries,
} from '@/lib/feed/muted-expiry';

const NOW = 1_800_000_000_000;

describe('muted word expiry', () => {
  it('keeps words with no deadline and drops the ones that have passed', () => {
    const words = ['spoiler', 'election', 'forever'];
    const expiries = { spoiler: NOW - 1, election: NOW + MUTE_DURATIONS.day };
    expect(activeMutedWords(words, expiries, NOW)).toEqual(['election', 'forever']);
  });

  it('treats a deadline of exactly now as expired', () => {
    expect(activeMutedWords(['a'], { a: NOW }, NOW)).toEqual([]);
  });

  it('parses junk from the JSON column into an empty map', () => {
    expect(parseExpiries(null)).toEqual({});
    expect(parseExpiries([1, 2])).toEqual({});
    expect(parseExpiries({ a: 'x', b: 5, c: Number.NaN })).toEqual({ b: 5 });
  });

  it('stores only listed words with future deadlines, capped at a year', () => {
    const cleaned = cleanExpiries(
      ['a', 'b', 'c'],
      { a: NOW + 10, b: NOW - 10, ghost: NOW + 10, c: NOW + MAX_MUTE_MS * 5 },
      NOW,
    );
    expect(cleaned).toEqual({ a: NOW + 10, c: NOW + MAX_MUTE_MS });
  });

  it('finds the soonest deadline', () => {
    expect(nextExpiry(['a', 'b'], { a: NOW + 50, b: NOW + 20 })).toBe(NOW + 20);
    expect(nextExpiry(['a'], {})).toBeNull();
  });
});
