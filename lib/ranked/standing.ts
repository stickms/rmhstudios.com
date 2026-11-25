/**
 * Your standing in a ranked season: the pure half (sprint 13 #13).
 *
 * `season.server.ts` reads the rows; what is said about them is decided here, with no database in it: how a place on
 * the ladder is counted from the rows that could be above you, and the decay sentence's figures. Client-safe: the
 * Ranked tab imports the types and the sentence helpers.
 *
 * The place is a number. It is never another member's name or id, so nothing here can leak who sits above you.
 */

import { displayRating } from '@/lib/ranked/season';
import type { TierId } from '@/lib/ranked/tiers';

/** Most candidate rows `placeOf` reads. Past this the place is reported as "outside the top 5,000". */
export const PLACE_SCAN_CAP = 5_000;

/** One game's standing for the signed-in member, as `GET /api/ranked/standing` returns it. */
export interface RankedStandingGame {
  game: string;
  name: string;
  /** False when the member has no row for the game this season; the rest of the row is then the empty standing. */
  played: boolean;
  /** Null while provisional. */
  rating: number | null;
  /** The tier's name, null while provisional. A word, never a colour. */
  tier: string | null;
  /** The tier's stable id, null while provisional. Clients translate this; `tier` stays English for older readers. */
  tierId: TierId | null;
  provisional: boolean;
  placementsLeft: number;
  wins: number;
  losses: number;
  draws: number;
  /** 1-based place among placed, visible players; null while provisional, hidden from boards, or beyond the cap. */
  place: number | null;
  /** True when more than {@link PLACE_SCAN_CAP} placed players are above the member. */
  beyondCap: boolean;
  /** Placed, visible players in the game this season; null when the member is not on the ladder. */
  of: number | null;
  /** Points shed to decay. */
  shed: number;
  /** Whole days since the last ranked match. */
  idleDays: number;
}

export interface RankedStandingResponse {
  season: number;
  endsAt: string;
  progress: number;
  games: RankedStandingGame[];
}

/**
 * The place of a member whose displayed rating is `displayed`, counted from the stored rows that could be above them.
 *
 * Decay only ever lowers a rating, so a candidate whose stored rating is above `displayed` may have decayed to
 * `displayed` or below; each is run through `displayRating` the way the ladder does and only those still above count.
 * `rows` is the whole candidate read, so reaching `cap` means the read may have stopped short of the member.
 */
export function placeFromCandidates(
  rows: ReadonlyArray<{ rating: number; lastPlayedAt: Date | null }>,
  displayed: number,
  now: Date,
  cap: number = PLACE_SCAN_CAP,
): { place: number | null; beyondCap: boolean } {
  if (rows.length >= cap) return { place: null, beyondCap: true };
  let above = 0;
  for (const r of rows) {
    // Candidates are placed rows (the read filters `placementsLeft: 0`), so the shown rating is never null.
    const shown = displayRating({ rating: r.rating, placementsLeft: 0, lastPlayedAt: r.lastPlayedAt }, now).rating;
    if ((shown ?? r.rating) > displayed) above += 1;
  }
  return { place: above + 1, beyondCap: false };
}

/** The figures of "Down {{count}} points: no ranked match in {{days}} days", or null when nothing was shed. */
export function decayNotice(shed: number, idleDays: number): { count: number; days: number } | null {
  if (!(shed > 0)) return null;
  return { count: Math.round(shed), days: Math.max(0, Math.floor(idleDays)) };
}

/** What to say about the place: a number, "outside the top 5,000", or that the member is not on the ladder. */
export type PlaceSummary =
  { kind: 'placed'; place: number; of: number | null } | { kind: 'beyond-cap'; cap: number } | { kind: 'off-ladder' };

export function placeSummary(g: Pick<RankedStandingGame, 'place' | 'beyondCap' | 'of'>): PlaceSummary {
  if (g.beyondCap) return { kind: 'beyond-cap', cap: PLACE_SCAN_CAP };
  if (g.place === null) return { kind: 'off-ladder' };
  return { kind: 'placed', place: g.place, of: g.of };
}

/** Games the member has no row for this season, and the rest, in the order the server listed them. */
export function splitPlayed(games: readonly RankedStandingGame[]): {
  played: RankedStandingGame[];
  unplayed: RankedStandingGame[];
} {
  return { played: games.filter((g) => g.played), unplayed: games.filter((g) => !g.played) };
}
