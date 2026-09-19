import { describe, it, expect } from 'vitest';

/**
 * Matchmaking's widening search (P2).
 *
 * All of the behaviour worth arguing about is in these pure functions, and
 * three of the tests are about a queue's failure modes rather than its happy
 * path: starving the longest waiter, splitting a party, and inventing a wait
 * estimate out of two samples.
 */

import {
  DEFAULT_BANDS,
  bandFor,
  eligible,
  estimateWaitMs,
  pickGroup,
} from '@/lib/matchmaking/bands';

const S = 1000;

describe('bandFor', () => {
  it('starts tight', () => {
    expect(bandFor(0).spread).toBe(100);
    expect(bandFor(14 * S).spread).toBe(100);
  });

  it('widens on schedule', () => {
    expect(bandFor(15 * S).spread).toBe(200);
    expect(bandFor(45 * S).spread).toBe(400);
  });

  it('eventually accepts anyone, so a queue always resolves', () => {
    expect(bandFor(90 * S).spread).toBeNull();
    expect(bandFor(60 * 60 * S).spread).toBeNull();
  });

  it('honours a custom schedule', () => {
    const impatient = [{ afterMs: 0, spread: 50 }, { afterMs: 5 * S, spread: null }];
    expect(bandFor(6 * S, impatient).spread).toBeNull();
  });
});

describe('eligible — the wider band wins', () => {
  it('matches two fresh players of similar rating', () => {
    expect(eligible({ rating: 1000, waitedMs: 0 }, { rating: 1080, waitedMs: 0 })).toBe(true);
  });

  it('refuses two fresh players far apart', () => {
    expect(eligible({ rating: 1000, waitedMs: 0 }, { rating: 1400, waitedMs: 0 })).toBe(false);
  });

  it('lets a long waiter pull in a fresh joiner', () => {
    // The point of taking the WIDER band: otherwise the person who just arrived
    // holds the person who has waited two minutes hostage to their own narrow
    // band, and the long waiter never matches at all.
    const patient = { rating: 1000, waitedMs: 120 * S };
    const fresh = { rating: 1600, waitedMs: 0 };
    expect(eligible(patient, fresh)).toBe(true);
    expect(eligible(fresh, patient)).toBe(true);
  });

  it('is symmetric', () => {
    const a = { rating: 1000, waitedMs: 20 * S };
    const b = { rating: 1150, waitedMs: 0 };
    expect(eligible(a, b)).toBe(eligible(b, a));
  });
});

describe('estimateWaitMs', () => {
  it('says nothing when there is nothing to say', () => {
    expect(estimateWaitMs([])).toBeNull();
    expect(estimateWaitMs([1000, 2000])).toBeNull();
  });

  it('takes the median once there are enough samples', () => {
    expect(estimateWaitMs([1000, 2000, 3000, 4000, 5000])).toBe(3000);
  });

  it('averages the middle pair on an even count', () => {
    expect(estimateWaitMs([1000, 2000, 3000, 4000, 5000, 6000])).toBe(3500);
  });

  it('is not dragged away by one abandoned tab', () => {
    // A mean would report ten minutes; the median reports three seconds.
    const withOutlier = [2000, 3000, 3000, 4000, 60 * 60 * S];
    expect(estimateWaitMs(withOutlier)).toBe(3000);
  });
});

describe('pickGroup', () => {
  const entry = (rating: number, waitedMs: number, size = 1) => ({ rating, waitedMs, size });

  it('returns null for an empty queue', () => {
    expect(pickGroup([], 2, 4)).toBeNull();
  });

  it('returns null when nobody is close enough yet', () => {
    expect(pickGroup([entry(1000, 0), entry(2000, 0)], 2, 4)).toBeNull();
  });

  it('seats two compatible players', () => {
    const group = pickGroup([entry(1000, 0), entry(1050, 0)], 2, 4);
    expect(group).toHaveLength(2);
  });

  it('seeds on the longest waiter', () => {
    // Fairness is entirely this: the person who has waited most is the one
    // everybody else is measured against, so nobody can be starved.
    const patient = entry(1000, 100 * S);
    const group = pickGroup([entry(1200, 0), entry(1205, 0), patient], 2, 4);
    expect(group).toContain(patient);
  });

  it('never splits a party', () => {
    // A party of three into a two-seat game is not a partial seating, it is no
    // seating — the whole reason parties queue as a unit.
    expect(pickGroup([entry(1000, 0, 3)], 2, 2)).toBeNull();
  });

  it('fills up to max without overflowing it', () => {
    const group = pickGroup(
      [entry(1000, 0, 2), entry(1010, 0, 2), entry(1020, 0, 2)],
      2,
      4,
    );
    expect(group!.reduce((n, g) => n + g.size, 0)).toBe(4);
  });

  it('seats a party exactly filling the room', () => {
    const group = pickGroup([entry(1000, 0, 4)], 2, 4);
    expect(group).toHaveLength(1);
  });

  it('will not seat below the minimum', () => {
    expect(pickGroup([entry(1000, 0)], 2, 4)).toBeNull();
  });

  it('eventually seats anyone once the bands open', () => {
    const group = pickGroup([entry(100, 120 * S), entry(3000, 0)], 2, 4);
    expect(group).toHaveLength(2);
  });

  it('respects a custom band schedule', () => {
    const strict = [{ afterMs: 0, spread: 10 }];
    expect(pickGroup([entry(1000, 0), entry(1100, 0)], 2, 4, strict)).toBeNull();
    expect(pickGroup([entry(1000, 0), entry(1005, 0)], 2, 4, strict)).toHaveLength(2);
  });

  it('leaves DEFAULT_BANDS untouched', () => {
    pickGroup([entry(1000, 0), entry(1050, 0)], 2, 4);
    expect(DEFAULT_BANDS[0].spread).toBe(100);
  });
});
