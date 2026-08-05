/**
 * Poll counting, including instant-runoff for ranked-choice polls (F3).
 *
 * `RMHarkPoll` modelled exactly one vote per user, which is the right default
 * and the wrong tool for the decisions communities actually use polls for
 * ("which game next season?"). Plurality picks the option with the largest
 * minority, so a field of five similar options and one polarising one elects
 * the polarising one. Instant-runoff is the standard fix and is cheap to
 * compute for the ballot counts a community poll produces.
 *
 * Client-safe and pure: the same function counts on the server and renders the
 * round-by-round explanation in the UI, so the two cannot disagree about who
 * won — which is the bug that makes people stop trusting a voting feature.
 */

export interface IrvRound {
  /** Option id → first-preference count at the start of this round. */
  tally: Record<string, number>;
  /** Option eliminated at the end of this round; null on the deciding round. */
  eliminated: string | null;
}

export interface IrvResult {
  winner: string | null;
  rounds: IrvRound[];
  /** True when the winner was decided by elimination rather than a majority. */
  byElimination: boolean;
  /** Ballots that expressed no usable preference — reported, never silently dropped. */
  exhausted: number;
}

/**
 * A ballot is an ordered list of option ids, most-preferred first.
 *
 * Ballots may be partial (a voter ranking two of five options is normal) and
 * may contain ids that no longer exist; both are handled by filtering at count
 * time rather than by validating at submission time, so an option deleted
 * mid-poll does not invalidate the ballots that mentioned it.
 */
export type Ballot = readonly string[];

function countFirstPreferences(
  ballots: readonly Ballot[],
  remaining: ReadonlySet<string>,
): { tally: Record<string, number>; counted: number } {
  const tally: Record<string, number> = {};
  for (const option of remaining) tally[option] = 0;

  let counted = 0;
  for (const ballot of ballots) {
    // The voter's highest-ranked option that is still in the race. A ballot
    // whose every choice has been eliminated is exhausted and stops counting —
    // it must not keep propping up the total, or the majority threshold drifts.
    const top = ballot.find((option) => remaining.has(option));
    if (top === undefined) continue;
    tally[top] = (tally[top] ?? 0) + 1;
    counted++;
  }
  return { tally, counted };
}

/**
 * Break an elimination tie deterministically.
 *
 * Ties are rare but real, and "whichever the Map iterated first" is not an
 * answer you can defend to the person whose option was dropped. Fewest
 * first-preferences, then fewest total mentions anywhere on any ballot, then
 * lexicographic id — fully determined by the ballots, so a recount always
 * reaches the same result.
 */
function pickForElimination(
  tally: Record<string, number>,
  ballots: readonly Ballot[],
  remaining: ReadonlySet<string>,
): string {
  const mentions = new Map<string, number>();
  for (const option of remaining) mentions.set(option, 0);
  for (const ballot of ballots) {
    for (const option of ballot) {
      if (remaining.has(option)) mentions.set(option, (mentions.get(option) ?? 0) + 1);
    }
  }

  return [...remaining].sort((a, b) => {
    const byTally = (tally[a] ?? 0) - (tally[b] ?? 0);
    if (byTally !== 0) return byTally;
    const byMentions = (mentions.get(a) ?? 0) - (mentions.get(b) ?? 0);
    if (byMentions !== 0) return byMentions;
    return a < b ? -1 : a > b ? 1 : 0;
  })[0]!;
}

/**
 * Run an instant-runoff count.
 *
 * Returns every round, because the elimination sequence is the interesting part
 * and showing it is what makes people use the format a second time. A poll with
 * no usable ballots returns `winner: null` rather than throwing — an empty poll
 * is a normal state, not an error.
 */
export function instantRunoff(ballots: readonly Ballot[], options: readonly string[]): IrvResult {
  const rounds: IrvRound[] = [];
  if (options.length === 0) {
    return { winner: null, rounds, byElimination: false, exhausted: ballots.length };
  }

  const remaining = new Set(options);

  while (remaining.size > 1) {
    const { tally, counted } = countFirstPreferences(ballots, remaining);
    if (counted === 0) {
      // Every ballot is exhausted; no option can claim a mandate.
      rounds.push({ tally, eliminated: null });
      return { winner: null, rounds, byElimination: false, exhausted: ballots.length };
    }

    const leader = [...remaining].reduce((best, o) =>
      (tally[o] ?? 0) > (tally[best] ?? 0) ? o : best,
    );

    // Strict majority of ballots STILL COUNTING — exhausted ballots are
    // excluded from the denominator, which is what makes a late-round majority
    // reachable at all.
    if ((tally[leader] ?? 0) * 2 > counted) {
      rounds.push({ tally, eliminated: null });
      const { counted: finalCounted } = countFirstPreferences(ballots, remaining);
      return {
        winner: leader,
        rounds,
        byElimination: rounds.length > 1,
        exhausted: ballots.length - finalCounted,
      };
    }

    const loser = pickForElimination(tally, ballots, remaining);
    rounds.push({ tally, eliminated: loser });
    remaining.delete(loser);
  }

  const winner = [...remaining][0] ?? null;
  const { tally, counted } = countFirstPreferences(ballots, remaining);
  rounds.push({ tally, eliminated: null });
  return {
    winner,
    rounds,
    byElimination: rounds.length > 1,
    exhausted: ballots.length - counted,
  };
}

/**
 * Assemble ballots from flat `RMHarkPollVote` rows.
 *
 * Rows with a null `rank` are single-choice votes and become one-entry ballots,
 * so a poll converted from single-choice to ranked keeps every vote already
 * cast — the alternative is discarding them, which no voter would accept.
 */
export function ballotsFromVotes(
  votes: readonly { userId: string; optionId: string; rank: number | null }[],
): Ballot[] {
  const byUser = new Map<string, { optionId: string; rank: number }[]>();
  for (const vote of votes) {
    const list = byUser.get(vote.userId) ?? [];
    list.push({ optionId: vote.optionId, rank: vote.rank ?? 1 });
    byUser.set(vote.userId, list);
  }
  return [...byUser.values()].map((list) =>
    list.sort((a, b) => a.rank - b.rank).map((v) => v.optionId),
  );
}

/** Plain plurality, for single-choice polls. Kept here so both live together. */
export function plurality(
  votes: readonly { optionId: string }[],
  options: readonly string[],
): { tally: Record<string, number>; winner: string | null } {
  const tally: Record<string, number> = {};
  for (const option of options) tally[option] = 0;
  for (const vote of votes) {
    if (vote.optionId in tally) tally[vote.optionId]!++;
  }
  let winner: string | null = null;
  for (const option of options) {
    if (winner === null || (tally[option] ?? 0) > (tally[winner] ?? 0)) winner = option;
  }
  // An all-zero poll has no winner, only a default.
  return { tally, winner: winner !== null && (tally[winner] ?? 0) > 0 ? winner : null };
}
