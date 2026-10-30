import { describe, expect, it } from 'vitest';
import { MIN_REVIEWS_FOR_LABEL, recommendation, summaryLabel } from '../review-extras';

describe('recommendation', () => {
  it('4 and 5 stars recommend, 3 is mixed, 1 and 2 do not', () => {
    expect(recommendation(5)).toBe('recommended');
    expect(recommendation(4)).toBe('recommended');
    expect(recommendation(3)).toBe('mixed');
    expect(recommendation(2)).toBe('not-recommended');
    expect(recommendation(1)).toBe('not-recommended');
  });
});

describe('summaryLabel', () => {
  it('has no label without enough reviews', () => {
    expect(summaryLabel(2, MIN_REVIEWS_FOR_LABEL - 1)).toBeNull();
    expect(summaryLabel(0, 0)).toBeNull();
  });

  it('bands the share of positive reviews, as Steam does', () => {
    expect(summaryLabel(10, 10)).toEqual({ key: 'very-positive', pct: 100 });
    expect(summaryLabel(8, 10)).toEqual({ key: 'very-positive', pct: 80 });
    expect(summaryLabel(7, 10)).toEqual({ key: 'mostly-positive', pct: 70 });
    expect(summaryLabel(5, 10)).toEqual({ key: 'mixed', pct: 50 });
    expect(summaryLabel(4, 10)).toEqual({ key: 'mixed', pct: 40 });
    expect(summaryLabel(3, 10)).toEqual({ key: 'mostly-negative', pct: 30 });
    expect(summaryLabel(1, 10)).toEqual({ key: 'very-negative', pct: 10 });
    expect(summaryLabel(0, 5)).toEqual({ key: 'very-negative', pct: 0 });
  });

  it('rounds the percentage', () => {
    expect(summaryLabel(2, 3)).toEqual({ key: 'mixed', pct: 67 });
  });

  it('never claims more positives than reviews', () => {
    expect(summaryLabel(99, 5)?.pct).toBe(100);
  });
});
