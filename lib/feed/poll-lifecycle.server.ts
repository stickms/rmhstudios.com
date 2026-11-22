/**
 * Poll lifecycle (sprint 04 #08), the write side: end a poll early, extend it, and tell the author and the voters
 * once when it has ended. The pure rules are in `./poll-lifecycle`.
 *
 * Race rule: voting, ending and extending all run in a transaction that first takes `poll:<id>` (the advisory lock),
 * and re-read the poll's times under it. A vote in flight when the author ends the poll either lands first (and is in
 * the final tally) or is refused with `POLL_CLOSED`; an extension can never reopen a poll that just ended.
 */
import { notice } from '@/lib/notifications/notice-keys';
import { activeMuteWhere } from '@/lib/moderation/mute-expiry';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import { computeAndStoreResult } from '@/lib/feed/ranked-result.server';
import { rankedAuthorNotice, rankedVoterNotice } from '@/lib/feed/ranked-poll';
import {
  POLL_NOTICE_BATCH,
  POLL_VOTER_PAGE,
  allowedExtensions,
  authorNotice,
  extendedEnd,
  isPollEnded,
  pollLifecycleView,
  totalVotesOf,
  votersAreNotified,
  type PollExtendDays,
  type PollLifecycleView,
} from '@/lib/feed/poll-lifecycle';

type Tx = Prisma.TransactionClient;

export type PollLifecycleCode = 'NOT_FOUND' | 'FORBIDDEN' | 'POLL_CLOSED' | 'NOT_TIMED' | 'TOO_LONG';

/** A refusal whose message is written for the member; the route sends it as is. */
export class PollLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: PollLifecycleCode,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PollLifecycleError';
  }
}

export const pollLockKey = (pollId: string) => `poll:${pollId}`;

const POLL_TIMES = {
  id: true,
  closesAt: true,
  closedAt: true,
  extendedAt: true,
  createdAt: true,
} as const;

/** The refusal a vote (or an un-vote) gets once the poll has ended. */
export function pollClosedError(): PollLifecycleError {
  return new PollLifecycleError('This poll has ended', 'POLL_CLOSED', 409);
}

/**
 * Take the poll's lock and refuse when it has ended (by the clock or by its author). Call it first inside the
 * transaction that writes a vote, so the check and the write cannot be separated by an `endPoll`.
 */
export async function lockOpenPoll(tx: Tx, pollId: string, now: Date = new Date()): Promise<void> {
  await lockKey(tx, pollLockKey(pollId));
  const poll = await tx.rMHarkPoll.findUnique({
    where: {
      id: pollId,
    },
    select: {
      closesAt: true,
      closedAt: true,
    },
  });
  if (!poll || isPollEnded(poll, now)) throw pollClosedError();
}

/** The author's own poll on a live post, locked and re-read; anything else is a refusal. */
async function lockAuthorsPoll(tx: Tx, postId: string, userId: string) {
  const post = await tx.rMHark.findUnique({
    where: {
      id: postId,
    },
    select: {
      userId: true,
      deletedAt: true,
      poll: {
        select: {
          id: true,
        },
      },
    },
  });
  if (!post || post.deletedAt || !post.poll) {
    throw new PollLifecycleError('Poll not found', 'NOT_FOUND', 404);
  }
  if (post.userId !== userId) {
    throw new PollLifecycleError('Only the author can change this poll', 'FORBIDDEN', 403);
  }
  await lockKey(tx, pollLockKey(post.poll.id));
  const poll = await tx.rMHarkPoll.findUnique({
    where: {
      id: post.poll.id,
    },
    select: POLL_TIMES,
  });
  if (!poll) throw new PollLifecycleError('Poll not found', 'NOT_FOUND', 404);
  return poll;
}

/** End the author's open poll now (also one that never had an end). An ended poll is never reopened. */
export async function endPoll(
  input: {
    postId: string;
    userId: string;
  },
  db: Pick<typeof prisma, '$transaction'> = prisma,
  now: Date = new Date(),
): Promise<PollLifecycleView> {
  return db.$transaction(async (tx) => {
    const poll = await lockAuthorsPoll(tx, input.postId, input.userId);
    if (isPollEnded(poll, now)) throw pollClosedError();
    const updated = await tx.rMHarkPoll.update({
      where: {
        id: poll.id,
      },
      data: {
        closedAt: now,
      },
      select: POLL_TIMES,
    });
    return pollLifecycleView(updated, now);
  });
}

/** Extend the author's open, timed poll by 1, 3 or 7 days, as long as it stays within 30 days of its creation. */
export async function extendPoll(
  input: {
    postId: string;
    userId: string;
    days: PollExtendDays;
  },
  db: Pick<typeof prisma, '$transaction'> = prisma,
  now: Date = new Date(),
): Promise<PollLifecycleView> {
  return db.$transaction(async (tx) => {
    const poll = await lockAuthorsPoll(tx, input.postId, input.userId);
    if (isPollEnded(poll, now)) throw pollClosedError();
    if (poll.closesAt === null) {
      throw new PollLifecycleError('This poll has no end to extend', 'NOT_TIMED', 409);
    }
    if (!allowedExtensions(poll, now).includes(input.days)) {
      throw new PollLifecycleError('A poll can run for 30 days at most', 'TOO_LONG', 409);
    }
    const updated = await tx.rMHarkPoll.update({
      where: {
        id: poll.id,
      },
      data: {
        closesAt: extendedEnd(poll.closesAt, input.days),
        extendedAt: now,
      },
      select: POLL_TIMES,
    });
    return pollLifecycleView(updated, now);
  });
}

/** Polls whose effective end has passed and whose result has not been announced. */
function endedUnannounced(now: Date): Prisma.RMHarkPollWhereInput {
  return {
    endNotifiedAt: null,
    OR: [
      {
        closedAt: {
          lte: now,
        },
      },
      {
        closedAt: null,
        closesAt: {
          lte: now,
        },
      },
    ],
  };
}

type NoticeDb = Pick<typeof prisma, 'rMHarkPoll' | 'rMHarkPollVote' | 'userBlock' | 'userMute'>;

/** Voter ids a notice is not sent to: anyone blocked in either direction with the author, and anyone who muted them. */
async function withheldFrom(db: NoticeDb, authorId: string, voterIds: string[]): Promise<Set<string>> {
  const [blocks, mutes] = await Promise.all([
    db.userBlock.findMany({
      where: {
        OR: [
          {
            blockerId: authorId,
            blockedId: {
              in: voterIds,
            },
          },
          {
            blockedId: authorId,
            blockerId: {
              in: voterIds,
            },
          },
        ],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    }),
    db.userMute.findMany({
      where: {
        mutedId: authorId,
        muterId: {
          in: voterIds,
        },
        ...activeMuteWhere(new Date()),
      },
      select: {
        muterId: true,
      },
    }),
  ]);
  const out = new Set<string>();
  for (const b of blocks) out.add(b.blockerId === authorId ? b.blockedId : b.blockerId);
  for (const m of mutes) out.add(m.muterId);
  return out;
}

/**
 * Announce every poll that has ended since the last run: the author hears the result, and so does every voter when
 * the poll is small enough. A poll is claimed first with a compare-and-set on `endNotifiedAt`, so a second run, or a
 * second worker, finds nothing to do. A poll whose post was deleted is claimed and skipped. At most
 * `POLL_NOTICE_BATCH` polls per run; returns how many were claimed.
 */
export async function runPollEndNotices(now: Date = new Date(), db: NoticeDb = prisma): Promise<number> {
  const due = await db.rMHarkPoll.findMany({
    where: endedUnannounced(now),
    orderBy: {
      createdAt: 'asc',
    },
    take: POLL_NOTICE_BATCH,
    select: {
      id: true,
    },
  });
  let claimed = 0;
  for (const { id } of due) {
    const won = await db.rMHarkPoll.updateMany({
      where: {
        id,
        ...endedUnannounced(now),
      },
      data: {
        endNotifiedAt: now,
      },
    });
    if (won.count === 0) continue;
    claimed += 1;
    await announce(db, id);
  }
  return claimed;
}

async function announce(db: NoticeDb, pollId: string): Promise<void> {
  const poll = await db.rMHarkPoll.findUnique({
    where: {
      id: pollId,
    },
    select: {
      ranked: true,
      options: {
        orderBy: {
          position: 'asc',
        },
        select: {
          id: true,
          text: true,
          voteCount: true,
        },
      },
      rmhark: {
        select: {
          id: true,
          userId: true,
          deletedAt: true,
          user: {
            select: {
              handle: true,
            },
          },
        },
      },
    },
  });
  // A ranked poll is counted here, inside the end claim, so the notice and the post carry the same result.
  const ranked = poll?.ranked ? await computeAndStoreResult(pollId, db) : null;
  if (!poll || poll.rmhark.deletedAt) return;
  const winnerText = poll.ranked ? (poll.options.find((o) => o.id === ranked?.winnerOptionId)?.text ?? null) : null;
  const { id: postId, userId: authorId } = poll.rmhark;
  const link = `/u/${poll.rmhark.user.handle ?? authorId}/post/${postId}`;
  const base = {
    type: 'SYSTEM' as const,
    entityType: 'poll_result',
    entityId: pollId,
    link,
    groupKey: `poll-ended:${pollId}`,
  };

  await createNotification({
    ...base,
    userId: authorId,
    preview: poll.ranked ? rankedAuthorNotice(winnerText) : authorNotice(poll.options),
  });

  if (!votersAreNotified(totalVotesOf(poll.options))) return;
  let after = '';
  for (;;) {
    const page = await db.rMHarkPollVote.findMany({
      where: {
        option: {
          pollId,
        },
        userId: {
          gt: after,
          not: authorId,
        },
      },
      distinct: ['userId'],
      orderBy: {
        userId: 'asc',
      },
      take: POLL_VOTER_PAGE,
      select: {
        userId: true,
      },
    });
    if (page.length === 0) return;
    const ids = page.map((v) => v.userId);
    const withheld = await withheldFrom(db, authorId, ids);
    await Promise.allSettled(
      ids
        .filter((userId) => !withheld.has(userId))
        .map((userId) =>
          createNotification({
            ...base,
            userId,
            preview: poll.ranked ? rankedVoterNotice(winnerText) : notice('poll-voter-ended', {}),
          }),
        ),
    );
    after = ids[ids.length - 1] ?? after;
    if (page.length < POLL_VOTER_PAGE) return;
  }
}
