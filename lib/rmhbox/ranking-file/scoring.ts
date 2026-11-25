/**
 * RMHbox — Ranking File scoring (pure).
 *
 * The distance between a player's order and the official order is the
 * footrule: the sum, over the items, of how many places each one is away from
 * its true place. For five items it runs from 0 (perfect) to 12 (reversed).
 */

import { RF_ITEMS_PER_ROUND } from './schemas';

/** Points lost per unit of distance. */
export const RF_POINTS_PER_STEP = 50;
/** Added to a round whose order is exactly right. */
export const RF_PERFECT_BONUS = 200;

/** The largest footrule distance for `n` items (a reversed order): floor(n^2 / 2). */
export function maxFootrule(n: number = RF_ITEMS_PER_ROUND): number {
  return Math.floor((n * n) / 2);
}

/**
 * Footrule distance between two orders of the same labels.
 * Returns null when they are not orders of the same set of labels.
 */
export function footrule(official: readonly string[], guess: readonly string[]): number | null {
  if (official.length !== guess.length) return null;
  const place = new Map<string, number>();
  for (let i = 0; i < official.length; i++) place.set(official[i], i);
  const seen = new Set<string>();
  let distance = 0;
  for (let i = 0; i < guess.length; i++) {
    const at = place.get(guess[i]);
    if (at === undefined || seen.has(guess[i])) return null;
    seen.add(guess[i]);
    distance += Math.abs(at - i);
  }
  return distance;
}

/** Points for one round: (max - distance) x 50, plus 200 for a perfect order. */
export function pointsForDistance(distance: number, n: number = RF_ITEMS_PER_ROUND): number {
  const clamped = Math.min(Math.max(0, distance), maxFootrule(n));
  return (maxFootrule(n) - clamped) * RF_POINTS_PER_STEP + (clamped === 0 ? RF_PERFECT_BONUS : 0);
}

/** Competition ranking: equal scores share a place, the next place skips (1, 1, 3). */
export function ranksWithTies<T extends { score: number }>(entries: readonly T[]): Array<T & { rank: number }> {
  return entries.map((entry) => ({
    ...entry,
    rank: 1 + entries.filter((other) => other.score > entry.score).length,
  }));
}
