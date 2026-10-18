/**
 * Swiss-system pairing — pure and client-safe.
 * Feature idea E4 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * `bracket.ts` has single elimination and round robin. Single elim sends half
 * the field home after one game; round robin is n(n−1)/2 games and stops
 * scaling past ~10 entrants. Swiss is what chess, Magic and most esports
 * open qualifiers use in between: everyone plays every round, each round
 * pairs players on equal scores, nobody meets the same opponent twice, and
 * ⌈log2 n⌉ rounds produce a clear top cut from any field size.
 *
 * Pairing rules, in order of priority:
 *   1. no rematches (hard);
 *   2. at most one bye per player, given to the lowest-ranked eligible
 *      player (a bye scores as a win — the standard convention);
 *   3. players paired within their score group, floating the leftover down.
 *
 * Implemented as backtracking over the standings order: take the highest
 * unpaired player, try opponents nearest them in the standings first, and
 * back up if the remainder cannot be paired. That honours (3) as closely as
 * (1) allows without a full weighted-matching solver. Real fields pair on the
 * first or second try; a step budget turns the pathological late-event case
 * (no rematch-free pairing left) into a clean `null` rather than a hang, and
 * the organiser ends the event there.
 *
 * Standings use Buchholz (sum of opponents' scores) as the first tiebreak —
 * the one players understand ("I lost to stronger people").
 */

export interface SwissResult {
  a: string;
  /** `null` for a bye. */
  b: string | null;
  /** The winner's id, or `null` for a draw. A bye is a win for `a`. */
  winner: string | null;
}

export interface Standing {
  id: string;
  points: number;
  buchholz: number;
  opponents: string[];
  hadBye: boolean;
}

export const WIN = 1;
/** Backtracking cap: a field with no valid pairing fails fast instead of hanging. */
const STEP_BUDGET = 100_000;
export const DRAW = 0.5;

export function standings(players: readonly string[], results: readonly SwissResult[]): Standing[] {
  const by = new Map<string, Standing>(
    players.map((id) => [id, { id, points: 0, buchholz: 0, opponents: [], hadBye: false }]),
  );
  for (const r of results) {
    const a = by.get(r.a);
    if (!a) continue;
    if (r.b === null) {
      a.hadBye = true;
      a.points += WIN;
      continue;
    }
    const b = by.get(r.b);
    if (!b) continue;
    a.opponents.push(b.id);
    b.opponents.push(a.id);
    if (r.winner === null) {
      a.points += DRAW;
      b.points += DRAW;
    } else if (r.winner === a.id) a.points += WIN;
    else if (r.winner === b.id) b.points += WIN;
  }
  for (const s of by.values()) {
    s.buchholz = s.opponents.reduce((sum, o) => sum + (by.get(o)?.points ?? 0), 0);
  }
  // Stable on input order (seeding) for full ties.
  const seed = new Map(players.map((p, i) => [p, i]));
  return [...by.values()].sort(
    (x, y) => y.points - x.points || y.buchholz - x.buchholz || seed.get(x.id)! - seed.get(y.id)!,
  );
}

export interface Pairing {
  a: string;
  b: string | null;
}

/** Pair the next round, or `null` if no rematch-free pairing exists. */
export function pairRound(
  players: readonly string[],
  results: readonly SwissResult[],
): Pairing[] | null {
  const table = standings(players, results);
  const met = new Map(table.map((s) => [s.id, new Set(s.opponents)]));
  const all = table.map((s) => s.id);

  if (all.length % 2 === 0) return pairEven(all, met);
  // Bye to the lowest-ranked player who has not had one — or, if that leaves
  // a field with no rematch-free pairing, the next lowest.
  for (const s of [...table].reverse()) {
    if (s.hadBye) continue;
    const rest = pairEven(
      all.filter((id) => id !== s.id),
      met,
    );
    if (rest) return [...rest, { a: s.id, b: null }];
  }
  return null;
}

function pairEven(
  order: readonly string[],
  met: ReadonlyMap<string, ReadonlySet<string>>,
): Pairing[] | null {
  const pairs: Pairing[] = [];
  const used = new Set<string>();
  let steps = 0;
  const solve = (): boolean => {
    if (++steps > STEP_BUDGET) return false;
    const top = order.find((id) => !used.has(id));
    if (top === undefined) return true;
    used.add(top);
    for (const opp of order) {
      if (used.has(opp) || met.get(top)!.has(opp)) continue;
      used.add(opp);
      pairs.push({ a: top, b: opp });
      if (solve()) return true;
      pairs.pop();
      used.delete(opp);
    }
    used.delete(top);
    return false;
  };
  return solve() ? pairs : null;
}

/** Rounds needed for a clear winner: ⌈log2 n⌉. */
export function recommendedRounds(n: number): number {
  return n < 2 ? 0 : Math.ceil(Math.log2(n));
}
