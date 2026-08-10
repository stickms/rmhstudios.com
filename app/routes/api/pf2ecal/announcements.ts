import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { announcementSchema } from '@/lib/pf2ecal/types';

/** POST /api/pf2ecal/announcements — post a note to the table. */
export const Route = createFileRoute('/api/pf2ecal/announcements')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: announcementSchema },
        async ({ userId, user, body }) => {
          const row = await prisma.pf2eAnnouncement.create({
            data: { body: body.body, pinned: body.pinned, authorId: userId },
            select: { id: true, body: true, pinned: true, createdAt: true, updatedAt: true },
          });
          return Response.json(
            {
              announcement: {
                ...row,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
                authorName: user?.name ?? null,
                authorImage: user?.image ?? null,
              },
            },
            { status: 201 },
          );
        },
      ),
    },
  },
});
