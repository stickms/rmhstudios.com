/**
 * Ranked-choice polls (sprint 06 #19): compute and store the instant-runoff result. Kept apart from the ballot
 * write (`ranked-poll.server`) because the poll lifecycle imports this and the ballot write imports the lifecycle.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { isPollEnded } from '@/lib/feed/poll-lifecycle';
import {
  computeRankedResult,
  parseStoredResult,
  type RankedResult,
} from '@/lib/feed/ranked-poll';

type ResultDb =
  Pick<
    typeof prisma,
    | 'rMHarkPoll'
    | 'rMHarkPollVote'
  >;

/**
 * The stored result of an ended ranked poll, computing and storing it first when it is not there yet. Returns null
 * for a poll that is not ranked (or does not exist). The write is a compare-and-set on `resultJson` being null, so
 * the end job and a reader that got there first cannot disagree: whoever loses re-reads the winner's result.
 */
export async function computeAndStoreResult(
  pollId: string,
  db: ResultDb = prisma,
): Promise<RankedResult | null> {
  const poll =
    await db.rMHarkPoll.findUnique(
      {
        where:
          {
            id: pollId,
          },
        select:
          {
            ranked: true,
            resultJson: true,
            options:
              {
                select:
                  {
                    id: true,
                  },
              },
          },
      },
    );
  if (
    !poll?.ranked
  )
    return null;
  const stored =
    parseStoredResult(
      poll.resultJson,
    );
  if (
    stored
  )
    return stored;

  const votes =
    await db.rMHarkPollVote.findMany(
      {
        where:
          {
            option:
              {
                pollId,
              },
          },
        select:
          {
            userId: true,
            optionId: true,
            rank: true,
          },
      },
    );
  const result =
    computeRankedResult(
      Array.isArray(
        votes,
      )
        ? votes
        : [],
      poll.options.map(
        (
          o,
        ) =>
          o.id,
      ),
    );
  const won =
    await db.rMHarkPoll.updateMany(
      {
        where:
          {
            id: pollId,
            resultJson:
              {
                equals:
                  Prisma.DbNull,
              },
          },
        data: {
          resultJson:
            result as unknown as Prisma.InputJsonValue,
        },
      },
    );
  if (
    won.count >
    0
  )
    return result;
  const again =
    await db.rMHarkPoll.findUnique(
      {
        where:
          {
            id: pollId,
          },
        select:
          {
            resultJson: true,
          },
      },
    );
  return (
    parseStoredResult(
      again?.resultJson,
    ) ??
    result
  );
}

/**
 * The read path for an ended ranked poll whose `resultJson` is still null (the minute before the job runs, or a
 * stalled job): compute and store it now. A poll that has not ended has no result, so nothing is computed.
 */
export async function resolveEndedResult(
  poll: {
    id: string;
    ranked?:
      | boolean
      | null;
    resultJson?: unknown;
    closesAt: Date | null;
    closedAt: Date | null;
  },
  db: ResultDb = prisma,
  now: Date = new Date(),
): Promise<RankedResult | null> {
  if (
    !poll.ranked ||
    !isPollEnded(
      poll,
      now,
    )
  )
    return null;
  return (
    parseStoredResult(
      poll.resultJson,
    ) ??
    computeAndStoreResult(
      poll.id,
      db,
    )
  );
}
