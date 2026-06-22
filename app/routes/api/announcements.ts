import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/** GET /api/announcements — active, non-expired feed announcements for everyone. */
export const Route = createFileRoute('/api/announcements')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const now = new Date();
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const viewerId = session?.user?.id;

          const rows = await prisma.feedAnnouncement.findMany({
            where: {
              active: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
            take: 5,
            select: {
              id: true,
              title: true,
              body: true,
              linkUrl: true,
              linkLabel: true,
              variant: true,
              createdAt: true,
              imageUrls: true,
              gifUrl: true,
              poll: {
                select: {
                  id: true,
                  question: true,
                  multiSelect: true,
                  closesAt: true,
                  options: {
                    orderBy: { position: 'asc' },
                    select: {
                      id: true,
                      text: true,
                      _count: { select: { votes: true } },
                      ...(viewerId
                        ? { votes: { where: { userId: viewerId }, select: { id: true } } }
                        : {}),
                    },
                  },
                },
              },
            },
          });

          const announcements = rows.map((r) => {
            const poll = r.poll
              ? {
                  id: r.poll.id,
                  question: r.poll.question,
                  multiSelect: r.poll.multiSelect,
                  closesAt: r.poll.closesAt?.toISOString() ?? null,
                  totalVotes: r.poll.options.reduce((sum, o) => sum + o._count.votes, 0),
                  options: r.poll.options.map((o) => ({
                    id: o.id,
                    text: o.text,
                    voteCount: o._count.votes,
                  })),
                  myVotes: viewerId
                    ? r.poll.options
                        .filter((o) => 'votes' in o && (o.votes as { id: string }[]).length > 0)
                        .map((o) => o.id)
                    : [],
                }
              : null;
            return {
              id: r.id,
              title: r.title,
              body: r.body,
              linkUrl: r.linkUrl,
              linkLabel: r.linkLabel,
              variant: r.variant,
              createdAt: r.createdAt.toISOString(),
              imageUrls: r.imageUrls,
              gifUrl: r.gifUrl,
              poll,
            };
          });

          // Per-viewer poll state means we can't share-cache once signed in.
          const cacheControl = viewerId ? 'private, no-store' : 'public, max-age=30';
          return Response.json({ announcements }, { headers: { 'Cache-Control': cacheControl } });
        } catch (error) {
          console.error('Announcements fetch error:', error);
          return Response.json({ announcements: [] });
        }
      },
    },
  },
});
