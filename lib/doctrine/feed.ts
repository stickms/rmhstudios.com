/**
 * Doctrine Engine — Feed Algorithm
 *
 * Sorts content by recency, divisiveness, or trending score.
 * The Tung Tung Tung Doctrine: most polarizing first.
 */

import type { FeedItem, FeedSortMode } from './types';

/**
 * Sort feed items according to the selected mode.
 */
export function getSortedFeed(items: FeedItem[], sortBy: FeedSortMode): FeedItem[] {
  const sorted = [...items];

  switch (sortBy) {
    case 'recent':
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    case 'divisive':
      // TUNG TUNG TUNG DOCTRINE: Most polarizing first
      return sorted.sort((a, b) => b.divisiveness - a.divisiveness);

    case 'trending': {
      // Hybrid: recent + divisive + reaction velocity
      return sorted.sort((a, b) => {
        const ageA = (Date.now() - a.createdAt.getTime()) / 3_600_000; // hours
        const ageB = (Date.now() - b.createdAt.getTime()) / 3_600_000;
        const scoreA = a.divisiveness / Math.pow(ageA + 2, 1.5);
        const scoreB = b.divisiveness / Math.pow(ageB + 2, 1.5);
        return scoreB - scoreA;
      });
    }

    default:
      return sorted;
  }
}
