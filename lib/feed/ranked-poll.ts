/**
 * Ranked-choice polls (sprint 06 #19), the pure half: what a ranked poll may be, what a ballot may be, and how the
 * count in `./poll-count` is shaped for storage and for the people looking at it. Client-safe: no Prisma, no zod.
 *
 * The counter itself is `instantRunoff` in `./poll-count`; nothing here counts a vote. A ranked ballot is one
 * `RMHarkPollVote` row per ranked option, `rank` 1..n without gaps. An option's `voteCount` on a ranked poll is its
 * first-preference count (rank 1), which is all anyone sees while the poll is open.
 */
import { notice, type NoticePreview } from '@/lib/notifications/notice-keys';
import { ballotsFromVotes, instantRunoff, type IrvResult } from '@/lib/feed/poll-count';

export const RANKED_MIN_OPTIONS = 3;
export const RANKED_MAX_OPTIONS = 6;

export type RankedPollIssue = 'RANKED_MULTI_SELECT' | 'RANKED_OPTION_COUNT' | 'RANKED_NEEDS_END';

/** What is wrong with a poll that asks to be ranked; empty for a plain poll and for a valid ranked one. */
export function rankedPollIssues(input: {
  ranked?: boolean | undefined;
  multiSelect?: boolean | undefined;
  optionCount: number;
  durationHours?: number | null | undefined;
}): RankedPollIssue[] {
  if (!input.ranked) return [];
  const issues: RankedPollIssue[] = [];
  if (input.multiSelect) issues.push('RANKED_MULTI_SELECT');
  if (input.optionCount < RANKED_MIN_OPTIONS || input.optionCount > RANKED_MAX_OPTIONS) {
    issues.push('RANKED_OPTION_COUNT');
  }
  if (!input.durationHours) issues.push('RANKED_NEEDS_END');
  return issues;
}

export type BallotIssue = 'EMPTY' | 'TOO_LONG' | 'GAP' | 'DUPLICATE' | 'FOREIGN';

/**
 * A ballot ranks at least one option and at most all of them, each once, every one of them an option of this poll.
 * The ranking is an ordered list (the first entry is rank 1), so ranks are 1..n without gaps by construction; an
 * empty or non-string entry would be a gap in that list and is refused.
 */
export function validateRanking(ranking: readonly unknown[], optionIds: readonly string[]): BallotIssue | null {
  if (ranking.length === 0) return 'EMPTY';
  if (ranking.length > optionIds.length) return 'TOO_LONG';
  const known = new Set(optionIds);
  const seen = new Set<string>();
  for (const id of ranking) {
    if (typeof id !== 'string' || id === '') return 'GAP';
    if (!known.has(id)) return 'FOREIGN';
    if (seen.has(id)) return 'DUPLICATE';
    seen.add(id);
  }
  return null;
}

/** The `RMHarkPollVote` rows of a ballot: the option and its rank, 1 first. */
export function ballotRows(ranking: readonly string[]): {
  optionId: string;
  rank: number;
}[] {
  return ranking.map((optionId, i) => ({
    optionId,
    rank: i + 1,
  }));
}

export interface RankedRound {
  /** Option id to first-preference count at the start of the round. */
  tally: Record<string, number>;
  /** The option eliminated at the end of the round; null on the deciding round. */
  eliminatedOptionId: string | null;
}

export interface RankedResult {
  winnerOptionId: string | null;
  rounds: RankedRound[];
  /** Ballots that no longer counted for anyone by the last round. */
  exhausted: number;
  /** Every ballot cast. */
  ballots: number;
  byElimination: boolean;
}

/** An `instantRunoff` result in the shape that is stored on the poll and sent to readers. */
export function shapeRankedResult(irv: IrvResult, ballots: number): RankedResult {
  return {
    winnerOptionId: irv.winner,
    rounds: irv.rounds.map((r) => ({
      tally: {
        ...r.tally,
      },
      eliminatedOptionId: r.eliminated,
    })),
    exhausted: irv.exhausted,
    ballots,
    byElimination: irv.byElimination,
  };
}

/** The whole count: ballots from the poll's vote rows, run through the one counter. */
export function computeRankedResult(
  votes: readonly {
    userId: string;
    optionId: string;
    rank: number | null;
  }[],
  optionIds: readonly string[],
): RankedResult {
  const ballots = ballotsFromVotes(votes);
  return shapeRankedResult(instantRunoff(ballots, optionIds), ballots.length);
}

/** A stored `resultJson` read back, or null when it is absent or not a result (a column is never trusted blindly). */
export function parseStoredResult(json: unknown): RankedResult | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Partial<RankedResult>;
  if (!Array.isArray(r.rounds) || typeof r.ballots !== 'number' || typeof r.exhausted !== 'number') {
    return null;
  }
  if (r.winnerOptionId !== null && typeof r.winnerOptionId !== 'string') return null;
  return {
    winnerOptionId: r.winnerOptionId ?? null,
    rounds: r.rounds as RankedRound[],
    exhausted: r.exhausted,
    ballots: r.ballots,
    byElimination: !!r.byElimination,
  };
}

/** A result as a reader sees it: counts, or only shares when the author hides counts from that reader. */
export interface RankedResultView {
  winnerOptionId: string | null;
  rounds: RankedRound[];
  exhausted: number | null;
  ballots: number | null;
  /** True when `tally` values are whole percents of the round, not counts. */
  percentOnly: boolean;
}

/** Quiet counts: every round's tally becomes a whole percent of that round's counted ballots; no totals leave. */
export function viewRankedResult(result: RankedResult, countsHidden: boolean): RankedResultView {
  if (!countsHidden) {
    return {
      winnerOptionId: result.winnerOptionId,
      rounds: result.rounds,
      exhausted: result.exhausted,
      ballots: result.ballots,
      percentOnly: false,
    };
  }
  return {
    winnerOptionId: result.winnerOptionId,
    rounds: result.rounds.map((round) => {
      const total = Object.values(round.tally).reduce((s, n) => s + n, 0);
      const tally: Record<string, number> = {};
      for (const [id, n] of Object.entries(round.tally)) {
        tally[id] = total > 0 ? Math.round((n / total) * 100) : 0;
      }
      return {
        tally,
        eliminatedOptionId: round.eliminatedOptionId,
      };
    }),
    exhausted: null,
    ballots: null,
    percentOnly: true,
  };
}

/** The fields a ranked poll adds to a poll payload (`FeedPoll`); nothing is added for a plain poll. */
export interface RankedPollFields {
  ranked?: true;
  /** The viewer's own ballot, option ids from rank 1. */
  myRanking?: string[];
  /** Present once the poll has ended and been counted. */
  result?: RankedResultView;
}

interface RankedPollRow {
  ranked?: boolean | null;
  resultJson?: unknown;
  options: {
    id: string;
    votes?: {
      optionId: string;
      rank?: number | null;
    }[];
  }[];
}

/**
 * The ranked fields of a poll row for one reader. While the poll is open there is no `result`, so only first
 * preferences (the options' `voteCount`) reach anyone; the count appears once the poll has ended.
 */
export function rankedPollFields(
  poll: RankedPollRow,
  opts: {
    ended: boolean;
    countsHidden: boolean;
  },
): RankedPollFields {
  if (!poll.ranked) return {};
  const mine: {
    optionId: string;
    rank: number;
  }[] = [];
  for (const o of poll.options) {
    for (const v of o.votes ?? [])
      mine.push({
        optionId: v.optionId,
        rank: v.rank ?? 1,
      });
  }
  mine.sort((a, b) => a.rank - b.rank);
  const stored = opts.ended ? parseStoredResult(poll.resultJson) : null;
  return {
    ranked: true,
    ...(mine.length
      ? {
          myRanking: mine.map((m) => m.optionId),
        }
      : {}),
    ...(stored
      ? {
          result: viewRankedResult(stored, opts.countsHidden),
        }
      : {}),
  };
}

/** An option's count as the poll shows it: first preferences on a ranked poll, every vote row otherwise. */
export function pollOptionCount(
  poll: {
    ranked?: boolean | null;
  },
  o: {
    voteCount?: number;
    _count?: {
      votes?: number;
    };
  },
): number {
  return poll.ranked ? (o.voteCount ?? 0) : (o._count?.votes ?? o.voteCount ?? 0);
}

/** The end notice for a ranked poll's author, naming the winner; the option text is passed in. */
export function rankedAuthorNoticeText(winnerText: string | null): string {
  return winnerText ? `Your ranked poll ended: ${winnerText} won the count` : 'Your ranked poll ended with no votes';
}

/** {@link rankedAuthorNoticeText} as a key and params. */
export function rankedAuthorNotice(winnerText: string | null): NoticePreview {
  return winnerText ? notice('poll-ranked-ended', { winner: winnerText }) : notice('poll-ranked-ended-no-votes', {});
}

/** {@link rankedVoterNoticeText} as a key and params. */
export function rankedVoterNotice(winnerText: string | null): NoticePreview {
  return winnerText
    ? notice('poll-ranked-voter-ended-winner', { winner: winnerText })
    : notice('poll-ranked-voter-ended', {});
}

/** The end notice for a voter in a ranked poll. */
export function rankedVoterNoticeText(winnerText: string | null): string {
  return winnerText
    ? `A ranked poll you voted in ended: ${winnerText} won the count`
    : 'A ranked poll you voted in ended';
}
