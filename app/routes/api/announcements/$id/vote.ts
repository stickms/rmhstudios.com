import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/announcements/$id/vote — cast/toggle a vote on an announcement poll.
 * `$id` is the announcement id; the body carries the chosen `optionId`. Mirrors
 * the RMHark poll-vote semantics (toggle off, single- vs. multi-select).
 */
export const Route = createFileRoute('/api/announcements/$id/vote')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 20,
            windowMs: 60_000,
            prefix: 'announcement-poll-vote',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
          }

          const { id } = params;
          const body = await request.json().catch(() => ({}));
          const { optionId } = body;

          if (!optionId || typeof optionId !== 'string') {
            return Response.json({ error: 'optionId is required' }, { status: 400 });
          }

          // Verify the option belongs to a poll on this announcement.
          const option = await prisma.feedAnnouncementPollOption.findUnique({
            where: { id: optionId },
            include: {
              poll: { select: { announcementId: true, multiSelect: true, id: true, closesAt: true } },
            },
          });

          if (!option || option.poll.announcementId !== id) {
            return Response.json({ error: 'Invalid option' }, { status: 400 });
          }

          if (option.poll.closesAt && option.poll.closesAt.getTime() <= Date.now()) {
            return Response.json({ error: 'This poll has closed' }, { status: 403 });
          }

          const userId = session.user.id;
          const pollId = option.poll.id;
          const isMultiSelect = option.poll.multiSelect;

          const existingVote = await prisma.feedAnnouncementPollVote.findUnique({
            where: { optionId_userId: { optionId, userId } },
          });

          if (existingVote) {
            // Toggle off.
            await prisma.feedAnnouncementPollVote.delete({ where: { id: existingVote.id } });
          } else if (isMultiSelect) {
            await prisma.feedAnnouncementPollVote.create({ data: { optionId, userId } });
          } else {
            // Single-select: clear other votes on this poll, then add the new one.
            const allOptions = await prisma.feedAnnouncementPollOption.findMany({
              where: { pollId },
              select: { id: true },
            });
            const optionIds = allOptions.map((o) => o.id);
            await prisma.$transaction([
              prisma.feedAnnouncementPollVote.deleteMany({
                where: { optionId: { in: optionIds }, userId },
              }),
              prisma.feedAnnouncementPollVote.create({ data: { optionId, userId } }),
            ]);
          }

          const allOptions = await prisma.feedAnnouncementPollOption.findMany({
            where: { pollId },
            select: { id: true },
          });
          const optionIds = allOptions.map((o) => o.id);
          const myVotes = await prisma.feedAnnouncementPollVote.findMany({
            where: { optionId: { in: optionIds }, userId },
            select: { optionId: true },
          });

          const updatedOptions = await prisma.feedAnnouncementPollOption.findMany({
            where: { pollId },
            orderBy: { position: 'asc' },
            include: { _count: { select: { votes: true } } },
          });
          const totalVotes = updatedOptions.reduce((sum, o) => sum + o._count.votes, 0);

          return Response.json({
            success: true,
            myVotes: myVotes.map((v) => v.optionId),
            totalVotes,
            options: updatedOptions.map((o) => ({ id: o.id, voteCount: o._count.votes })),
          });
        } catch (error) {
          console.error('Announcement poll vote error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
