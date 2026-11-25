import { describe, expect, it } from 'vitest';
import {
  MATCHES_PAGE_SIZE,
  decodeMatchesCursor,
  encodeMatchesCursor,
  isGuestId,
  isTombstoneId,
  placeByScore,
} from '../matches';

describe('placeByScore', () => {
  it('places by score, highest first', () => {
    const scores = [900, 1200, 300];
    expect(placeByScore(scores, 1200)).toBe(1);
    expect(placeByScore(scores, 900)).toBe(2);
    expect(placeByScore(scores, 300)).toBe(3);
  });

  it('gives players with an equal score the same place and skips the next', () => {
    const scores = [500, 500, 100, 900];
    expect(placeByScore(scores, 900)).toBe(1);
    expect(placeByScore(scores, 500)).toBe(2);
    expect(placeByScore(scores, 100)).toBe(4);
  });

  it('is first in a one-player match and when every score ties', () => {
    expect(placeByScore([0], 0)).toBe(1);
    expect(placeByScore([40, 40, 40], 40)).toBe(1);
  });
});

describe('matches cursor', () => {
  it('round-trips a time and an id', () => {
    const at = new Date('2026-12-01T10:20:30.456Z');
    expect(decodeMatchesCursor(encodeMatchesCursor({ at, id: 'clx9abc' }))).toEqual({ at, id: 'clx9abc' });
  });

  it('refuses anything that is not a cursor', () => {
    for (const bad of ['', 'not a token!', 'bm9kb3Q', 'x'.repeat(201)]) {
      expect(decodeMatchesCursor(bad), bad).toBeNull();
    }
    // a token with a non-numeric time, and one with an empty id
    expect(decodeMatchesCursor(btoa('abc.id'))).toBeNull();
    expect(decodeMatchesCursor(btoa('1700000000000.'))).toBeNull();
  });
});

describe('ids', () => {
  it('tells guests and tombstones from accounts', () => {
    expect(isGuestId('guest:AbC123')).toBe(true);
    expect(isGuestId('user-1')).toBe(false);
    expect(isTombstoneId('deleted:row1')).toBe(true);
    expect(isTombstoneId('deleted-user')).toBe(false);
  });

  it('pages 20 at a time', () => {
    expect(MATCHES_PAGE_SIZE).toBe(20);
  });
});
