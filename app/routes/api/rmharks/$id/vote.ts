import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { awardXp } from "@/lib/xp/engine.server";
import { progressQuests } from "@/lib/quests/engine.server";

export const Route = createFileRoute('/api/rmharks/$id/vote')({
  server: {
    handlers: {
  POST: async ({ request, params }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 20,
      windowMs: 60_000,
      prefix: "poll-vote",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { optionId } = body;

    if (!optionId || typeof optionId !== "string") {
      return Response.json({ error: "optionId is required" }, { status: 400 });
    }

    // Verify the option belongs to a poll on this rmhark
    const option = await prisma.rMHarkPollOption.findUnique({
      where: { id: optionId },
      include: { poll: { select: { rmheetId: true, multiSelect: true, id: true, closesAt: true } } },
    });

    if (!option || option.poll.rmheetId !== id) {
      return Response.json({ error: "Invalid option" }, { status: 400 });
    }

    if (option.poll.closesAt && option.poll.closesAt.getTime() <= Date.now()) {
      return Response.json({ error: "This poll has closed" }, { status: 403 });
    }

    const userId = session.user.id;
    const pollId = option.poll.id;
    const isMultiSelect = option.poll.multiSelect;

    // Check if user already voted on this option
    const existingVote = await prisma.rMHarkPollVote.findUnique({
      where: { optionId_userId: { optionId, userId } },
    });

    let castVote = false;
    if (existingVote) {
      // Toggle off — remove the vote and drop the option's denormalized tally in
      // the same transaction (guarded so it never goes below zero).
      await prisma.$transaction([
        prisma.rMHarkPollVote.delete({ where: { id: existingVote.id } }),
        prisma.rMHarkPollOption.updateMany({
          where: { id: optionId, voteCount: { gt: 0 } },
          data: { voteCount: { decrement: 1 } },
        }),
      ]);
    } else if (isMultiSelect) {
      castVote = true;
      // Multi-select: add the vote and bump the option's tally atomically.
      await prisma.$transaction([
        prisma.rMHarkPollVote.create({ data: { optionId, userId } }),
        prisma.rMHarkPollOption.update({
          where: { id: optionId },
          data: { voteCount: { increment: 1 } },
        }),
      ]);
    } else {
      castVote = true;
      // Single-select: remove any existing votes on this poll (decrementing the
      // tally of each option the user had chosen), then add the new vote and
      // bump its tally — all in one transaction so counts stay consistent.
      const allOptions = await prisma.rMHarkPollOption.findMany({
        where: { pollId },
        select: { id: true },
      });
      const optionIds = allOptions.map((o) => o.id);
      const priorVotes = await prisma.rMHarkPollVote.findMany({
        where: { optionId: { in: optionIds }, userId },
        select: { optionId: true },
      });

      await prisma.$transaction([
        prisma.rMHarkPollVote.deleteMany({
          where: { optionId: { in: optionIds }, userId },
        }),
        ...priorVotes.map((pv) =>
          prisma.rMHarkPollOption.updateMany({
            where: { id: pv.optionId, voteCount: { gt: 0 } },
            data: { voteCount: { decrement: 1 } },
          })
        ),
        prisma.rMHarkPollVote.create({ data: { optionId, userId } }),
        prisma.rMHarkPollOption.update({
          where: { id: optionId },
          data: { voteCount: { increment: 1 } },
        }),
      ]);
    }

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

    // Read the updated tallies straight from the denormalized column — no
    // per-option `_count.votes` aggregate.
    const updatedOptions = await prisma.rMHarkPollOption.findMany({
      where: { pollId },
      orderBy: { position: "asc" },
      select: { id: true, voteCount: true },
    });

    const totalVotes = updatedOptions.reduce((sum, o) => sum + o.voteCount, 0);

    // Progression: XP + quests only when a vote was actually cast (not toggled off).
    if (castVote) {
      await awardXp(userId, 3);
      await progressQuests(userId, "vote");
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
  } catch (error) {
    console.error("Poll vote error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
