/**
 * Matchmaking (P2) — how far the search widens, and when.
 *
 * Pure and client-safe, for the same reason the booking rules are: the queue UI
 * says "searching within ±100 rating" and the server decides who is eligible,
 * and two copies of that would disagree the first time one was edited.
 *
 * ## Why the schedule is data
 *
 * A 1v1 fighter and a four-player party game want completely different
 * patience. Kowloon's queue can afford to hold out for an even match because a
 * bad one is a 30-second round; Hold'em's cannot, because a table that never
 * fills is a table nobody comes back to. So the schedule is per-game data with
 * a sane default, not a constant.
 *
 * ## The honest-estimate rule
 *
 * An estimate is only worth showing if it is derived from what actually
 * happened. {@link estimateWaitMs} takes recent match times and returns null
 * when there are too few to mean anything — the UI then says how many people
 * are searching instead of inventing a number, which is the one thing a queue
 * must never do.
 */

/** One step of the widening search. */
export interface Band {
  /** Milliseconds into the search at which this band starts applying. */
  afterMs: number;
  /**
   * Rating spread allowed, or null for "anyone". A null band is what makes a
   * queue always eventually resolve.
   */
  spread: number | null;
}

/**
 * The default schedule: tight, then generous, then anyone.
 *
 * Fifteen seconds of a fair fight is worth waiting for; ninety seconds of one
 * is not, because by then the alternative is not a worse match, it is no match.
 */
export const DEFAULT_BANDS: readonly Band[] = [
  { afterMs: 0, spread: 100 },
  { afterMs: 15_000, spread: 200 },
  { afterMs: 45_000, spread: 400 },
  { afterMs: 90_000, spread: null },
];

/** The band in force for someone who has been searching `waitedMs`. */
export function bandFor(waitedMs: number, bands: readonly Band[] = DEFAULT_BANDS): Band {
  let current = bands[0];
  for (const b of bands) if (waitedMs >= b.afterMs) current = b;
  return current;
}

/**
 * May these two be matched right now?
 *
 * Deliberately uses the WIDER of the two bands rather than the narrower. Both
 * players have been waiting; honouring only the stricter one means the person
 * who just joined holds the person who has waited two minutes hostage to their
 * own freshly-narrow band.
 */
export function eligible(
  a: { rating: number; waitedMs: number },
  b: { rating: number; waitedMs: number },
  bands: readonly Band[] = DEFAULT_BANDS,
): boolean {
  const sa = bandFor(a.waitedMs, bands).spread;
  const sb = bandFor(b.waitedMs, bands).spread;
  if (sa === null || sb === null) return true;
  return Math.abs(a.rating - b.rating) <= Math.max(sa, sb);
}

/**
 * Median of the last few match times, or null when there is not enough to say.
 *
 * Median rather than mean: one person who left a queue open in a background tab
 * for an hour should not tell everybody else to expect an hour.
 */
export function estimateWaitMs(recentMs: readonly number[], minSamples = 5): number | null {
  if (recentMs.length < minSamples) return null;
  const sorted = [...recentMs].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Pick a group from a queue, oldest first.
 *
 * Longest-waiting first is the whole fairness model: it means a queue cannot
 * starve anybody, because every tick the person who has waited most is the
 * seed everyone else is measured against.
 *
 * Entries carry a `size` so a party of three is seated as three, never split.
 * Returns null when no group of at least `min` can be assembled within the
 * bands currently in force.
 */
export function pickGroup<T extends { rating: number; waitedMs: number; size: number }>(
  queue: readonly T[],
  min: number,
  max: number,
  bands: readonly Band[] = DEFAULT_BANDS,
): T[] | null {
  if (queue.length === 0) return null;
  const byWait = [...queue].sort((a, b) => b.waitedMs - a.waitedMs);

  for (const seed of byWait) {
    if (seed.size > max) continue; // cannot ever be seated here
    const group: T[] = [seed];
    let seats = seed.size;

    for (const other of byWait) {
      if (other === seed || seats >= max) continue;
      if (seats + other.size > max) continue;
      if (!eligible(seed, other, bands)) continue;
      group.push(other);
      seats += other.size;
    }

    if (seats >= min) return group;
  }
  return null;
}
