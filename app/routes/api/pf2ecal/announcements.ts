import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { scheduleAnnouncementExpiry } from '@/lib/pf2ecal/announce.server';
import { personSelect, toAnnouncementDTO } from '@/lib/pf2ecal/sessions.server';
import { announcementSchema } from '@/lib/pf2ecal/types';

/**
 * POST /api/pf2ecal/announcements — post a note to the table.
 *
 * The note is created and returned immediately. Whether it should EXPIRE is
 * worked out afterwards, without the caller waiting: "we're starting an hour
 * late on Wednesday" is worth hiding once Wednesday is over, and DeepSeek is
 * what matches the sentence to the session. That inference is a refinement, so
 * it runs detached — a slow or absent model must not delay a note appearing,
 * and a failed one simply leaves the note with no expiry, which is exactly the
 * behaviour the board had before this existed.
 */
export const Route = createFileRoute('/api/pf2ecal/announcements')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: announcementSchema },
        async ({ userId, body }) => {
          const row = await prisma.pf2eAnnouncement.create({
            data: { body: body.body, pinned: body.pinned, authorId: userId },
            include: { author: { select: personSelect } },
          });

          // Detached on purpose — see the note above. The catch is not
          // optional: an unhandled rejection here would take the process down.
          void scheduleAnnouncementExpiry(row.id, row.body).catch((cause: unknown) => {
            console.error('[pf2ecal] announcement expiry inference failed:', cause);
          });

          return Response.json({ announcement: toAnnouncementDTO(row) }, { status: 201 });
        },
      ),
    },
  },
});
