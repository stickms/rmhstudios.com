import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

    if (existingVote) {
      // Toggle off — remove the vote
      await prisma.rMHarkPollVote.delete({ where: { id: existingVote.id } });
    } else if (isMultiSelect) {
      // Multi-select: just add the vote
      await prisma.rMHarkPollVote.create({
        data: { optionId, userId },
      });
    } else {
      // Single-select: remove any existing votes on this poll, then add new one
      const allOptions = await prisma.rMHarkPollOption.findMany({
        where: { pollId },
        select: { id: true },
      });
      const optionIds = allOptions.map((o) => o.id);

      await prisma.$transaction([
        prisma.rMHarkPollVote.deleteMany({
          where: { optionId: { in: optionIds }, userId },
        }),
        prisma.rMHarkPollVote.create({
          data: { optionId, userId },
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

    // Fetch updated vote counts
    const updatedOptions = await prisma.rMHarkPollOption.findMany({
      where: { pollId },
      orderBy: { position: "asc" },
      include: { _count: { select: { votes: true } } },
    });

    const totalVotes = updatedOptions.reduce((sum, o) => sum + o._count.votes, 0);

    return Response.json({
      success: true,
      myVotes: myVotes.map((v) => v.optionId),
      totalVotes,
      options: updatedOptions.map((o) => ({
        id: o.id,
        voteCount: o._count.votes,
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
