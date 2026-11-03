/**
 * Cross-check: set a government count beside the results feed's, race by race.
 * Pure and client-safe. The point is not to replace either source but to make
 * disagreement VISIBLE — on election night the most useful thing a second,
 * independent source can say is "these two counts agree" or "they differ by 2
 * points, wait".
 */

import type { OfficialCheck, Race } from './types';

/** Counts within this many percentage points (per candidate share) are said to agree. */
export const OFFICIAL_TOLERANCE_PTS = 1.5;

/** The race an official count corresponds to: same office, same district (statewide races have none). */
function sameRace(a: Race, b: Race): boolean {
  return a.office === b.office && a.state === b.state && (a.district ?? '') === (b.district ?? '') && a.primaryParty === b.primaryParty;
}

export function checkRace(race: Race, official: Race, source: string): OfficialCheck | null {
  if (official.totalVotes <= 0 || race.totalVotes <= 0) return null;
  const byLast = new Map(official.candidates.map((c) => [c.lastName.toLowerCase(), c]));
  const matched = race.candidates.filter((c) => c.votes > 0 && byLast.has(c.lastName.toLowerCase()));
  if (matched.length < 2) return null; // cannot compare a race we cannot line up

  // Compare SHARES over the same candidates on both sides, so a write-in line or a differing
  // minor-party roster cannot manufacture a gap.
  const aSum = matched.reduce((s, c) => s + c.votes, 0);
  const bSum = matched.reduce((s, c) => s + (byLast.get(c.lastName.toLowerCase())?.votes ?? 0), 0);
  if (aSum <= 0 || bSum <= 0) return null;
  let delta = 0;
  for (const c of matched) {
    const a = (c.votes / aSum) * 100;
    const b = ((byLast.get(c.lastName.toLowerCase())?.votes ?? 0) / bSum) * 100;
    delta = Math.max(delta, Math.abs(a - b));
  }
  const votes: Record<string, number> = {};
  for (const c of official.candidates) votes[c.lastName.toLowerCase()] = c.votes;
  const deltaPts = Math.round(delta * 10) / 10;
  return { source, totalVotes: official.totalVotes, votes, deltaPts, agrees: deltaPts <= OFFICIAL_TOLERANCE_PTS };
}

/** Attach `official` to every race that has a counterpart in the government count. */
export function crossCheck(races: Race[], officialRaces: Race[], source: string): Race[] {
  if (!officialRaces.length) return races;
  return races.map((r) => {
    const match = officialRaces.find((o) => sameRace(r, o));
    if (!match) return r;
    const official = checkRace(r, match, source);
    return official ? { ...r, official } : r;
  });
}
