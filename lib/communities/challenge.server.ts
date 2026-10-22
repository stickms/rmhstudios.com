/**
 * N5 — weekly challenge (server-only).
 *
 * A mod posts a prompt with a submission window and a voting window. Members
 * submit a community post as their entry (one each; the composer sends
 * `challengeId` with the post, see app/routes/api/rmharks.ts), then vote once
 * during the voting window. When the voting window ends, finalization picks the
 * winner, gives the winning post the "Challenge winner" flair and notifies the
 * author. It runs from the worker (see jobs.server.ts) and, idempotently, from
 * the first read after the deadline so the result never waits for a cron tick.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import type { ChallengeDTO } from '@/lib/communities/plus';
import { ensureWinnerFlair } from '@/lib/communities/flairs.server';
import { challengePhase, pickWinner, validateChallengeWindows } from '@/lib/communities/challenge';

export class ChallengeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

/** The challenge a new post may enter right now, or an explanation why not. */
export async function challengeEntryError(
  communityId: string,
  challengeId: string,
  userId: string,
): Promise<string | null> {
  const challenge = await prisma.communityChallenge.findFirst({
    where: { id: challengeId, communityId },
    select: { submitEndsAt: true, voteEndsAt: true },
  });
  if (!challenge) return 'That challenge no longer exists';
  if (challengePhase(challenge) !== 'submit') return 'Submissions for this challenge are closed';
  const mine = await prisma.communityChallengeEntry.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
    select: { id: true },
  });
  return mine ? 'You have already entered this challenge' : null;
}

export async function createChallenge(
  communityId: string,
  userId: string,
  input: { title: string; prompt: string; submitEndsAt: string; voteEndsAt: string },
): Promise<{ id: string }> {
  const windowError = validateChallengeWindows(input.submitEndsAt, input.voteEndsAt);
  if (windowError) throw new ChallengeError(windowError, 400);
  const running = await prisma.communityChallenge.findFirst({
    where: { communityId, voteEndsAt: { gt: new Date() } },
    select: { id: true },
  });
  if (running) {
    throw new ChallengeError(
      'A challenge is already running — cancel it or wait for it to end',
      409,
    );
  }
  const row = await prisma.communityChallenge.create({
    data: {
      communityId,
      title: input.title,
      prompt: input.prompt,
      submitEndsAt: new Date(input.submitEndsAt),
      voteEndsAt: new Date(input.voteEndsAt),
      createdById: userId,
    },
    select: { id: true },
  });
  return row;
}

/** Cancel the running challenge (entries are deleted; their posts stay). */
export async function cancelChallenge(communityId: string, challengeId: string): Promise<void> {
  const res = await prisma.communityChallenge.deleteMany({
    where: { id: challengeId, communityId, finalizedAt: null },
  });
  if (res.count === 0) throw new ChallengeError('Challenge not found or already finished', 404);
}

export async function castVote(args: {
  communityId: string;
  challengeId: string;
  entryId: string;
  userId: string;
}): Promise<void> {
  const challenge = await prisma.communityChallenge.findFirst({
    where: { id: args.challengeId, communityId: args.communityId },
    select: { submitEndsAt: true, voteEndsAt: true },
  });
  if (!challenge) throw new ChallengeError('Challenge not found', 404);
  if (challengePhase(challenge) !== 'vote') {
    throw new ChallengeError('Voting is not open for this challenge', 409);
  }
  const entry = await prisma.communityChallengeEntry.findFirst({
    where: { id: args.entryId, challengeId: args.challengeId },
    select: { userId: true },
  });
  if (!entry) throw new ChallengeError('Entry not found', 404);
  if (entry.userId === args.userId)
    throw new ChallengeError("You can't vote for your own entry", 403);
  try {
    await prisma.$transaction([
      prisma.communityChallengeVote.create({
        data: { challengeId: args.challengeId, entryId: args.entryId, userId: args.userId },
      }),
      prisma.communityChallengeEntry.update({
        where: { id: args.entryId },
        data: { voteCount: { increment: 1 } },
      }),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new ChallengeError('You have already voted in this challenge', 409);
    }
    throw e;
  }
}

/** Pick the winner, flair the post, notify the author. Idempotent. */
export async function finalizeChallenge(challengeId: string): Promise<boolean> {
  const claimed = await prisma.communityChallenge.updateMany({
    where: { id: challengeId, finalizedAt: null, voteEndsAt: { lte: new Date() } },
    data: { finalizedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  const challenge = await prisma.communityChallenge.findUnique({
    where: { id: challengeId },
    select: { id: true, title: true, communityId: true, community: { select: { slug: true } } },
  });
  if (!challenge) return false;
  const entries = await prisma.communityChallengeEntry.findMany({
    where: { challengeId },
    orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
    take: 500,
    select: { id: true, postId: true, userId: true, voteCount: true, createdAt: true },
  });
  const winnerId = pickWinner(entries);
  const winner = entries.find((e) => e.id === winnerId);
  if (!winner) return true; // nobody voted — finished without a winner

  await prisma.communityChallenge.update({
    where: { id: challengeId },
    data: { winnerEntryId: winner.id },
  });
  const flairId = await ensureWinnerFlair(challenge.communityId);
  if (flairId) {
    await prisma.communityPostFlair.upsert({
      where: { postId: winner.postId },
      create: { postId: winner.postId, flairId },
      update: { flairId },
    });
  }
  await createNotification({
    userId: winner.userId,
    type: 'SYSTEM',
    entityType: 'rmhark',
    entityId: winner.postId,
    preview: `You won the "${challenge.title}" challenge`,
    link: `/c/${challenge.community.slug}`,
  });
  return true;
}

/** Worker entry point: finalize every challenge whose voting window has ended. */
export async function finalizeDueChallenges(): Promise<number> {
  const due = await prisma.communityChallenge.findMany({
    where: { finalizedAt: null, voteEndsAt: { lte: new Date() } },
    orderBy: { voteEndsAt: 'asc' },
    take: 50,
    select: { id: true },
  });
  let done = 0;
  for (const c of due) {
    try {
      if (await finalizeChallenge(c.id)) done++;
    } catch (e) {
      console.error('challenge finalize error:', e);
    }
  }
  return done;
}

/** The community's latest challenge (running, or the last finished one). */
export async function getCurrentChallenge(
  communityId: string,
  viewerId: string | null,
): Promise<ChallengeDTO | null> {
  let challenge = await prisma.communityChallenge.findFirst({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) return null;
  if (!challenge.finalizedAt && challenge.voteEndsAt.getTime() <= Date.now()) {
    await finalizeChallenge(challenge.id).catch(() => {});
    challenge =
      (await prisma.communityChallenge.findUnique({ where: { id: challenge.id } })) ?? challenge;
  }
  const phase = challengePhase(challenge);

  const [entries, myVote] = await Promise.all([
    prisma.communityChallengeEntry.findMany({
      where: { challengeId: challenge.id, post: { deletedAt: null } },
      orderBy:
        phase === 'closed' ? [{ voteCount: 'desc' }, { createdAt: 'asc' }] : { createdAt: 'asc' },
      take: 60,
      select: {
        id: true,
        postId: true,
        userId: true,
        voteCount: true,
        post: {
          select: {
            content: true,
            imageUrls: true,
            imageAlts: true,
            gifUrl: true,
            user: { select: userDisplaySelect },
          },
        },
      },
    }),
    viewerId
      ? prisma.communityChallengeVote.findUnique({
          where: { challengeId_userId: { challengeId: challenge.id, userId: viewerId } },
          select: { entryId: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    id: challenge.id,
    title: challenge.title,
    prompt: challenge.prompt,
    submitEndsAt: challenge.submitEndsAt.toISOString(),
    voteEndsAt: challenge.voteEndsAt.toISOString(),
    phase,
    winnerEntryId: challenge.winnerEntryId,
    myEntryId: entries.find((e) => e.userId === viewerId)?.id ?? null,
    myVoteEntryId: myVote?.entryId ?? null,
    entries: entries.map((e) => ({
      id: e.id,
      postId: e.postId,
      author: resolveUser(e.post.user),
      content: e.post.content.slice(0, 280),
      imageUrl: e.post.imageUrls[0] ?? null,
      imageAlt: e.post.imageAlts[0] ?? null,
      gifUrl: e.post.gifUrl,
      voteCount: phase === 'closed' ? e.voteCount : null,
      mine: e.userId === viewerId,
      isWinner: e.id === challenge.winnerEntryId,
    })),
  };
}
