/**
 * Ranked-choice polls (sprint 06 #19), the server half: replace a member's ballot, and compute and store the
 * instant-runoff result. The pure rules are in `./ranked-poll`; the count is `instantRunoff` in `./poll-count`.
 *
 * Race rules. A ballot is replaced (delete, insert, move the first-preference tallies) in one transaction that takes
 * `poll-ballot:<pollId>:<userId>` and then the poll's own lock, re-reading the poll's end under it, so a ballot in
 * flight when the poll ends is either in the count or refused. The result is written once: the end claim
 * (`runPollEndNotices`) computes it, and a read that meets an ended poll before the job ran computes it too and
 * stores it only where `resultJson` is still null, so every reader sees the one stored result.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { lockOpenPoll } from '@/lib/feed/poll-lifecycle.server';
import { ballotRows, validateRanking, type BallotIssue } from '@/lib/feed/ranked-poll';

export type RankedBallotCode = 'NOT_RANKED' | 'BAD_BALLOT';

export class RankedBallotError extends Error {
  constructor(
    message: string,
    readonly code: RankedBallotCode,
    readonly issue?: BallotIssue,
  ) {
    super(message);
    this.name = 'RankedBallotError';
  }
}

export const ballotLockKey = (pollId: string, userId: string): string => `poll-ballot:${pollId}:${userId}`;

export interface BallotOutcome {
  myRanking: string[];
  totalVotes: number;
  options: {
    id: string;
    voteCount: number;
  }[];
}

/**
 * Replace the member's ballot on a ranked poll with `ranking` (option ids, most preferred first). Throws
 * `RankedBallotError` for a poll that is not ranked or a ranking that is not valid, and `PollLifecycleError`
 * (`POLL_CLOSED`) once the poll has ended.
 */
export async function submitBallot(
  input: {
    pollId: string;
    userId: string;
    ranking: readonly string[];
  },
  db: Pick<typeof prisma, '$transaction'> = prisma,
): Promise<BallotOutcome> {
  return db.$transaction(async (tx) => {
    await lockKey(tx, ballotLockKey(input.pollId, input.userId));
    await lockOpenPoll(tx, input.pollId);
    const poll = await tx.rMHarkPoll.findUnique({
      where: {
        id: input.pollId,
      },
      select: {
        ranked: true,
        options: {
          orderBy: {
            position: 'asc',
          },
          select: {
            id: true,
          },
        },
      },
    });
    if (!poll?.ranked) throw new RankedBallotError('This poll is not ranked', 'NOT_RANKED');
    const optionIds = poll.options.map((o) => o.id);
    const issue = validateRanking(input.ranking, optionIds);
    if (issue) throw new RankedBallotError('That ranking is not valid', 'BAD_BALLOT', issue);

    const prior = await tx.rMHarkPollVote.findMany({
      where: {
        optionId: {
          in: optionIds,
        },
        userId: input.userId,
      },
      select: {
        optionId: true,
        rank: true,
      },
    });
    await tx.rMHarkPollVote.deleteMany({
      where: {
        optionId: {
          in: optionIds,
        },
        userId: input.userId,
      },
    });
    for (const p of prior) {
      if ((p.rank ?? 1) !== 1) continue;
      await tx.rMHarkPollOption.updateMany({
        where: {
          id: p.optionId,
          voteCount: {
            gt: 0,
          },
        },
        data: {
          voteCount: {
            decrement: 1,
          },
        },
      });
    }
    const rows = ballotRows(input.ranking);
    await tx.rMHarkPollVote.createMany({
      data: rows.map((r) => ({
        optionId: r.optionId,
        userId: input.userId,
        rank: r.rank,
      })),
    });
    const first = rows[0];
    if (first) {
      await tx.rMHarkPollOption.update({
        where: {
          id: first.optionId,
        },
        data: {
          voteCount: {
            increment: 1,
          },
        },
      });
    }
    const options = await tx.rMHarkPollOption.findMany({
      where: {
        pollId: input.pollId,
      },
      orderBy: {
        position: 'asc',
      },
      select: {
        id: true,
        voteCount: true,
      },
    });
    return {
      myRanking: [...input.ranking],
      totalVotes: options.reduce((s, o) => s + o.voteCount, 0),
      options,
    };
  });
}

/** The result half lives in `ranked-result.server` so the poll lifecycle can import it without a cycle. */
export { computeAndStoreResult, resolveEndedResult } from '@/lib/feed/ranked-result.server';
