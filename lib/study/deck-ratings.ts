/**
 * Rating a public flashcard deck (s12-08), the pure half: who may rate, the score that orders "Best rated", and what
 * a deck shows. Stars are one to five, one per member per deck, changeable; there is no written review and who rated
 * what is never shown, only the aggregate.
 */

/** Reviews a member must have logged on their copy before they may rate the deck it came from. */
export const MIN_REVIEWS_TO_RATE = 20;
/** Ratings a deck needs before its average is shown. */
export const MIN_RATINGS_TO_SHOW = 3;
export const MIN_STARS = 1;
export const MAX_STARS = 5;

/** The prior of the "Best rated" order: a deck with no ratings scores `PRIOR_MEAN`, worth `PRIOR_WEIGHT` ratings. */
export const PRIOR_MEAN = 3.5;
export const PRIOR_WEIGHT = 5;

/** The orders of the marketplace; `cards` (most cards) is today's order and the default. */
export const DECK_SORTS = ['cards', 'rated', 'copied'] as const;
export type DeckSort = (typeof DECK_SORTS)[number];
export const DEFAULT_DECK_SORT: DeckSort = 'cards';

export const isDeckSort = (value: unknown): value is DeckSort =>
  typeof value === 'string' && (DECK_SORTS as readonly string[]).includes(value);

/** A sort read from a URL or a query: anything unknown is the default. */
export const parseDeckSort = (value: unknown): DeckSort => (isDeckSort(value) ? value : DEFAULT_DECK_SORT);

export const isStars = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_STARS && value <= MAX_STARS;

/** What a member's relation to a deck says about rating it. `ok` is the only answer that lets a rating through. */
export type RateEligibility = 'ok' | 'own' | 'editor' | 'no-copy' | 'not-studied';

export interface RateFacts {
  isOwner: boolean;
  isEditor: boolean;
  /** The member has a copy of the deck (`clonedFromId` is the deck). */
  hasCopy: boolean;
  /** Reviews logged on that copy. */
  reviews: number;
}

/** Eligibility from the counts: the owner and an editor made the deck, and a rating needs a studied copy. */
export function rateEligibility(facts: RateFacts): RateEligibility {
  if (facts.isOwner) return 'own';
  if (facts.isEditor) return 'editor';
  if (!facts.hasCopy) return 'no-copy';
  if (facts.reviews < MIN_REVIEWS_TO_RATE) return 'not-studied';
  return 'ok';
}

/**
 * The score "Best rated" sorts by: a Bayesian average, `(PRIOR_WEIGHT * PRIOR_MEAN + sum) / (PRIOR_WEIGHT + count)`.
 * One 5-star rating scores 3.75, below ten 4-star ratings (3.83) and level with five 4-star ones, so a single rating does not top the list, and a deck
 * with no ratings scores the prior. The marketplace computes the same expression in SQL (`ratedOrderIds`).
 */
export function bayesianScore(sum: number, count: number): number {
  const n = Math.max(0, count);
  const total = n === 0 ? 0 : Math.max(0, sum);
  return (PRIOR_WEIGHT * PRIOR_MEAN + total) / (PRIOR_WEIGHT + n);
}

export interface RatingDisplay {
  /** The ratings given. */
  count: number;
  /** The average to one decimal, or null below `MIN_RATINGS_TO_SHOW` ratings ("Not enough ratings yet"). */
  average: number | null;
}

/** What a deck shows of its ratings: the average to one decimal once there are enough of them. */
export function ratingDisplay(sum: number, count: number): RatingDisplay {
  const n = Math.max(0, Math.floor(count));
  if (n < MIN_RATINGS_TO_SHOW) return { count: n, average: null };
  return { count: n, average: Math.round((sum / n) * 10) / 10 };
}
