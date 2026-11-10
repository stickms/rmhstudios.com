/**
 * Battle Royale rank-and-cut (REF-05, A1 §4.3) and live targets (REF-08).
 *
 *     ranked = alive sorted by score ascending
 *     cut = max(1, floor(N/2)); cutScore = ranked[cut].score   (1-based)
 *     if top == cutScore: cut = highest i with score < top; cutScore = ranked[i].score (if any)
 *     losers = every player with score <= cutScore
 *     if losers == everyone: nobody loses
 *
 * Ties in the sort keep roster order (the input order), so the result is
 * deterministic.
 */

import type { Id } from '../types';

export interface Scored {
  id: Id;
  score: number;
}

/** Ascending by score; equal scores keep input (roster) order. */
export function rankAscending(entries: readonly Scored[]): Scored[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.score === b.e.score ? a.i - b.i : a.e.score < b.e.score ? -1 : 1))
    .map((x) => x.e);
}

/** The players who lose a life this Royale round (possibly none). */
export function royaleLosers(entries: readonly Scored[]): Id[] {
  const n = entries.length;
  if (n < 2) return [];
  const ranked = rankAscending(entries);
  const top = (ranked[n - 1] as Scored).score;
  const cut = Math.max(1, Math.floor(n / 2));
  let cutScore: number | null = (ranked[cut - 1] as Scored).score;
  if (cutScore === top) {
    cutScore = null;
    for (let i = n - 1; i >= 0; i--) {
      if ((ranked[i] as Scored).score < top) {
        cutScore = (ranked[i] as Scored).score;
        break;
      }
    }
  }
  if (cutScore === null) return [];
  const losers = ranked.filter((e) => e.score <= (cutScore as number)).map((e) => e.id);
  if (losers.length === n) return [];
  // Keep the input (roster) order for the output.
  const set = new Set(losers);
  return entries.filter((e) => set.has(e.id)).map((e) => e.id);
}

/**
 * Live Royale targets: a safe player sees the next-lower neighbour in the
 * ranking, an unsafe player the next-higher one ('' at either end).
 */
export function royaleTargets(entries: readonly Scored[]): Record<Id, Id | ''> {
  const ranked = rankAscending(entries);
  const losers = new Set(royaleLosers(entries));
  const out: Record<Id, Id | ''> = {};
  const idx = new Map(ranked.map((e, i) => [e.id, i]));
  for (const e of entries) {
    const i = idx.get(e.id) as number;
    const neighbour = losers.has(e.id) ? ranked[i + 1] : ranked[i - 1];
    out[e.id] = neighbour ? neighbour.id : '';
  }
  return out;
}
