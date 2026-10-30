/**
 * Review upgrades as pure rules: whether a rating recommends, and Steam's overall label
 * for a title. Recommendation is derived from the stars (4 and 5 recommend, 3 is mixed,
 * 1 and 2 do not), so there is no second thing to keep in step with the rating. Client-safe.
 */

export type Recommendation = 'recommended' | 'mixed' | 'not-recommended';

export function recommendation(stars: number): Recommendation {
  if (stars >= 4) return 'recommended';
  if (stars === 3) return 'mixed';
  return 'not-recommended';
}

/** Fewer reviews than this and a label would claim more than the data says. */
export const MIN_REVIEWS_FOR_LABEL = 3;

export type SummaryKey = 'very-positive' | 'mostly-positive' | 'mixed' | 'mostly-negative' | 'very-negative';

/** Steam-style label from the share of positive (4 to 5 star) reviews. */
export function summaryLabel(positive: number, total: number): { key: SummaryKey; pct: number } | null {
  if (total < MIN_REVIEWS_FOR_LABEL) return null;
  const pct = Math.round((Math.min(positive, total) / total) * 100);
  const key: SummaryKey =
    pct >= 80 ? 'very-positive' : pct >= 70 ? 'mostly-positive' : pct >= 40 ? 'mixed' : pct >= 20 ? 'mostly-negative' : 'very-negative';
  return { key, pct };
}
