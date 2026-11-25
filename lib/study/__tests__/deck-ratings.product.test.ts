import { describe, expect, it } from 'vitest';
import {
  DECK_SORTS,
  MIN_RATINGS_TO_SHOW,
  MIN_REVIEWS_TO_RATE,
  PRIOR_MEAN,
  PRIOR_WEIGHT,
  bayesianScore,
  isStars,
  parseDeckSort,
  rateEligibility,
  ratingDisplay,
} from '@/lib/study/deck-ratings';

describe('the Bayesian score of "Best rated"', () => {
  it('is the prior for a deck with no ratings', () => {
    expect(bayesianScore(0, 0)).toBe(PRIOR_MEAN);
  });

  it('puts one 5-star rating below ten 4-star ratings and below many good ratings', () => {
    const single = bayesianScore(5, 1);
    expect(single).toBeCloseTo(3.75, 10);
    expect(single).toBeLessThan(bayesianScore(40, 10));
    expect(single).toBeCloseTo(bayesianScore(20, 5), 10);
    expect(single).toBeLessThan(bayesianScore(180, 40));
    expect(single).toBeGreaterThan(PRIOR_MEAN);
  });

  it('rises with more ratings of the same average', () => {
    const scores = [1, 5, 20, 100].map((n) => bayesianScore(4.6 * n, n));
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
    expect(scores[3]).toBeLessThan(4.6);
  });

  it('sinks a deck with many poor ratings below an unrated one', () => {
    expect(bayesianScore(40, 20)).toBeLessThan(bayesianScore(0, 0));
  });

  it('orders a field of decks the way a reader would', () => {
    const decks = [
      { id: 'one-five', sum: 5, count: 1 },
      { id: 'unrated', sum: 0, count: 0 },
      { id: 'many-good', sum: 180, count: 40 },
      { id: 'few-good', sum: 22, count: 5 },
      { id: 'many-poor', sum: 60, count: 30 },
    ];
    const order = [...decks]
      .sort((a, b) => bayesianScore(b.sum, b.count) - bayesianScore(a.sum, a.count))
      .map((d) => d.id);
    expect(order).toEqual(['many-good', 'few-good', 'one-five', 'unrated', 'many-poor']);
  });

  it('keeps the prior as 5 ratings of 3.5', () => {
    expect(PRIOR_WEIGHT).toBe(5);
    expect(PRIOR_MEAN).toBe(3.5);
  });

  it('survives damaged counters', () => {
    expect(bayesianScore(-3, 0)).toBe(PRIOR_MEAN);
    expect(Number.isFinite(bayesianScore(10, -2))).toBe(true);
  });
});

describe('what a deck shows', () => {
  it('shows no average below three ratings', () => {
    expect(MIN_RATINGS_TO_SHOW).toBe(3);
    expect(ratingDisplay(0, 0)).toEqual({ count: 0, average: null });
    expect(ratingDisplay(10, 2)).toEqual({ count: 2, average: null });
  });

  it('shows the average to one decimal from three', () => {
    expect(ratingDisplay(12, 3)).toEqual({ count: 3, average: 4 });
    expect(ratingDisplay(13, 3)).toEqual({ count: 3, average: 4.3 });
    expect(ratingDisplay(14, 3)).toEqual({ count: 3, average: 4.7 });
    expect(ratingDisplay(3, 3)).toEqual({ count: 3, average: 1 });
  });
});

describe('eligibility from the counts', () => {
  const base = { isOwner: false, isEditor: false, hasCopy: true, reviews: MIN_REVIEWS_TO_RATE };

  it('lets a studied copy through at exactly 20 reviews', () => {
    expect(MIN_REVIEWS_TO_RATE).toBe(20);
    expect(rateEligibility(base)).toBe('ok');
    expect(rateEligibility({ ...base, reviews: 19 })).toBe('not-studied');
    expect(rateEligibility({ ...base, reviews: 500 })).toBe('ok');
  });

  it('refuses the owner and an editor first, then a missing copy', () => {
    expect(rateEligibility({ ...base, isOwner: true })).toBe('own');
    expect(rateEligibility({ ...base, isEditor: true })).toBe('editor');
    expect(rateEligibility({ ...base, hasCopy: false })).toBe('no-copy');
    expect(rateEligibility({ ...base, hasCopy: false, reviews: 0 })).toBe('no-copy');
  });
});

describe('stars and sorts from the outside', () => {
  it('takes whole stars from one to five', () => {
    expect([0, 1, 5, 6, 2.5, NaN, '3', null].map(isStars)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('reads an order from a URL, with "cards" for anything unknown', () => {
    expect(DECK_SORTS).toEqual(['cards', 'rated', 'copied']);
    expect(parseDeckSort('rated')).toBe('rated');
    expect(parseDeckSort('copied')).toBe('copied');
    expect(parseDeckSort('best')).toBe('cards');
    expect(parseDeckSort(undefined)).toBe('cards');
    expect(parseDeckSort(['rated'])).toBe('cards');
  });
});
