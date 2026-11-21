import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { canReadPostThread } from '@/lib/feed/audience.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { lockOpenPoll, PollLifecycleError, pollClosedError } from '@/lib/feed/poll-lifecycle.server';
import { isPollEnded } from '@/lib/feed/poll-lifecycle';
import { rankedBallotSchema } from '@/lib/feed/ranked-poll-schema';
import { RankedBallotError, submitBallot } from '@/lib/feed/ranked-poll.server';

/** 409 `POLL_CLOSED`: the poll has ended, by the clock or by its author. */
function pollClosedResponse(): Response {
  const err = pollClosedError();
  return Response.json({ error: err.message, code: err.code }, { status: err.status });
}

/** Submit (or replace) the caller's ranked ballot on the poll of post `postId`. */
async function castRankedBallot(postId: string, userId: string, body: unknown): Promise<Response> {
  const parsed = rankedBallotSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid ranking', code: 'BAD_BALLOT' }, { status: 400 });
  }
  const poll = await prisma.rMHarkPoll.findUnique({
    where: { rmheetId: postId },
    select: { id: true, ranked: true, closesAt: true, closedAt: true },
  });
  if (!poll) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!poll.ranked) {
    return Response.json({ error: 'This poll is not ranked', code: 'NOT_RANKED' }, { status: 400 });
  }
  if (isPollEnded(poll)) return pollClosedResponse();
  if (!(await canReadPostThread(postId, userId))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const outcome = await submitBallot({ pollId: poll.id, userId, ranking: parsed.data.ranking });
    await awardXp(userId, 3);
    await progressQuests(userId, 'vote');
    return Response.json({ success: true, ...outcome });
  } catch (err) {
    if (err instanceof PollLifecycleError && err.code === 'POLL_CLOSED') return pollClosedResponse();
    if (err instanceof RankedBallotError) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }
}

export const route = apiRoute('/api/rmharks/$id/vote', {
  POST: defineHandler(
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'poll-vote' } },
    async ({ request, params, session }) => {
      const { id } = params;
      const body = await request.json();

      // A ranked ballot: `{ ranking: string[] }` (sprint 06 #19). Plain and multi-select polls keep `{ optionId }`.
      if (body && typeof body === 'object' && 'ranking' in body) {
        return castRankedBallot(id, session.user.id, body);
      }
      const { optionId } = body;

      if (!optionId || typeof optionId !== 'string') {
        return Response.json({ error: 'optionId is required' }, { status: 400 });
      }

      // Verify the option belongs to a poll on this rmhark
      const option = await prisma.rMHarkPollOption.findUnique({
        where: { id: optionId },
        include: {
          poll: {
            select: { rmheetId: true, multiSelect: true, ranked: true, id: true, closesAt: true, closedAt: true },
          },
        },
      });

      if (!option || option.poll.rmheetId !== id) {
        return Response.json({ error: 'Invalid option' }, { status: 400 });
      }

      // Ended by the clock or by its author. Checked again under the poll's lock below, where it is race-safe.
      if (isPollEnded(option.poll)) {
        return pollClosedResponse();
      }

      // One option cannot be a ranking: a ranked poll is voted with `{ ranking }`.
      if (option.poll.ranked) {
        return Response.json({ error: 'This poll takes a ranking', code: 'RANKED_POLL' }, { status: 400 });
      }

      const userId = session.user.id;
      const pollId = option.poll.id;
      const isMultiSelect = option.poll.multiSelect;

      // Check if user already voted on this option
      const existingVote = await prisma.rMHarkPollVote.findUnique({
        where: { optionId_userId: { optionId, userId } },
      });

      // Voting needs a readable post (un-voting stays allowed).
      if (!existingVote && !(await canReadPostThread(id, userId))) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      try {
        // Every write below runs under the poll's lock, after re-reading its end, so a vote in flight when the
        // author ends the poll is either in the final tally or refused. Tallies move in the same transaction as
        // the votes (guarded so a decrement never goes below zero).
        await prisma.$transaction(async (tx) => {
          await lockOpenPoll(tx, pollId);
          if (existingVote) {
            // Toggle off.
            await tx.rMHarkPollVote.delete({ where: { id: existingVote.id } });
            await tx.rMHarkPollOption.updateMany({
              where: { id: optionId, voteCount: { gt: 0 } },
              data: { voteCount: { decrement: 1 } },
            });
          } else if (isMultiSelect) {
            // Multi-select: add the vote and bump the option's tally.
            await tx.rMHarkPollVote.create({ data: { optionId, userId } });
            await tx.rMHarkPollOption.update({
              where: { id: optionId },
              data: { voteCount: { increment: 1 } },
            });
          } else {
            // Single-select: remove any existing votes on this poll (decrementing the tally of each option the
            // user had chosen), then add the new vote and bump its tally.
            const allOptions = await tx.rMHarkPollOption.findMany({
              where: { pollId },
              select: { id: true },
            });
            const optionIds = allOptions.map((o) => o.id);
            const priorVotes = await tx.rMHarkPollVote.findMany({
              where: { optionId: { in: optionIds }, userId },
              select: { optionId: true },
            });
            await tx.rMHarkPollVote.deleteMany({ where: { optionId: { in: optionIds }, userId } });
            for (const pv of priorVotes) {
              await tx.rMHarkPollOption.updateMany({
                where: { id: pv.optionId, voteCount: { gt: 0 } },
                data: { voteCount: { decrement: 1 } },
              });
            }
            await tx.rMHarkPollVote.create({ data: { optionId, userId } });
            await tx.rMHarkPollOption.update({
              where: { id: optionId },
              data: { voteCount: { increment: 1 } },
            });
          }
        });
      } catch (err) {
        if (err instanceof PollLifecycleError && err.code === 'POLL_CLOSED') return pollClosedResponse();
        throw err;
      }
      // Progression runs only when a vote was cast (not toggled off).
      const castVote = !existingVote;
      // An un-vote on a post the caller can no longer read still removes the vote, but the tallies are withheld.
      const unreadable = !!existingVote && !(await canReadPostThread(id, userId));

      // Fetch the user's current votes for this poll
      const allOptions = await prisma.rMHarkPollOption.findMany({
        where: { pollId },
        select: { id: true },
      });
      const optionIds = allOptions.map((o) => o.id);
      const myVotes = await prisma.rMHarkPollVote.findMany({
        where: { optionId: { in: optionIds }, userId },
        select: { optionId: true },
      });

      if (unreadable) {
        return Response.json({ success: true, myVotes: myVotes.map((v) => v.optionId) });
      }

      // Read the updated tallies straight from the denormalized column — no
      // per-option `_count.votes` aggregate.
      const updatedOptions = await prisma.rMHarkPollOption.findMany({
        where: { pollId },
        orderBy: { position: 'asc' },
        select: { id: true, voteCount: true },
      });

      const totalVotes = updatedOptions.reduce((sum, o) => sum + o.voteCount, 0);

      // Progression: XP + quests only when a vote was actually cast (not toggled off).
      if (castVote) {
        await awardXp(userId, 3);
        await progressQuests(userId, 'vote');
      }

      return Response.json({
        success: true,
        myVotes: myVotes.map((v) => v.optionId),
        totalVotes,
        options: updatedOptions.map((o) => ({
          id: o.id,
          voteCount: o.voteCount,
        })),
      });
    },
  ),
});
