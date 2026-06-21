import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';

/** GET /api/announcements — active, non-expired feed announcements for everyone. */
export const Route = createFileRoute('/api/announcements')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const now = new Date();
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
            },
          });
          return Response.json(
            { announcements: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) },
            { headers: { 'Cache-Control': 'public, max-age=30' } }
          );
        } catch (error) {
          console.error('Announcements fetch error:', error);
          return Response.json({ announcements: [] });
        }
      },
    },
  },
});
