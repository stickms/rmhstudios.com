import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  adminAnnouncementCreate,
  adminAnnouncementsList,
} from '@/lib/admin/announcements.contract';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createAnnouncementSchema } from '@/lib/announcement-schema';
import { parseHandles } from '@/lib/feed/mentions';
import { createNotification } from '@/lib/notifications.server';

/**
 * Admin feed announcements.
 * GET  /api/admin/announcements — list all (active + inactive).
 * POST /api/admin/announcements — create a new announcement (with optional
 *      images, GIF, and poll; `@mentions`/`#hashtags` live inline in the body).
 */

export const route = apiRoute('/api/admin/announcements', {
  GET: implement(adminAnnouncementsList, { auth: 'admin' }, async () => {
    const rows = await prisma.feedAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { poll: { include: { options: { orderBy: { position: 'asc' } } } } },
    });
    return {
      announcements: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        expiresAt: r.expiresAt?.toISOString() ?? null,
        poll: r.poll
          ? {
              id: r.poll.id,
              question: r.poll.question,
              multiSelect: r.poll.multiSelect,
              options: r.poll.options.map((o) => ({ id: o.id, text: o.text })),
            }
          : null,
      })),
    };
  }),
  POST: implement(
    adminAnnouncementCreate,
    {
      auth: 'admin',
      body: createAnnouncementSchema,
      allowEmptyBody: true,
      invalid: (err) =>
        Response.json({ error: err.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ userId, body: d }) => {
      const created = await prisma.feedAnnouncement.create({
        data: {
          title: d.title,
          body: d.body,
          linkUrl: d.linkUrl || null,
          linkLabel: d.linkLabel || null,
          variant: d.variant,
          pinned: d.pinned,
          expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
          createdById: userId,
          imageUrls: d.imageUrls ?? [],
          gifUrl: d.gifUrl || null,
          ...(d.poll
            ? {
                poll: {
                  create: {
                    question: d.poll.question.trim(),
                    multiSelect: d.poll.multiSelect,
                    closesAt: d.poll.durationHours
                      ? new Date(Date.now() + d.poll.durationHours * 60 * 60 * 1000)
                      : null,
                    options: {
                      create: d.poll.options
                        .filter((o) => o.trim())
                        .map((text, i) => ({ text: text.trim(), position: i })),
                    },
                  },
                },
              }
            : {}),
        },
      });

      await logAdminAction(userId, 'announcement.create', {
        targetType: 'announcement',
        targetId: created.id,
        detail: d.title,
      });

      // Notify mentioned users so an announcement `@handle` reaches them in
      // the notification center. Best-effort: never fail the create.
      try {
        const handles = parseHandles(d.body);
        if (handles.length > 0) {
          const mentioned = await prisma.user.findMany({
            where: {
              id: { not: userId },
              OR: handles.map((h) => ({ handle: { equals: h, mode: 'insensitive' as const } })),
            },
            select: { id: true },
          });
          await Promise.all(
            mentioned.map((m) =>
              createNotification({
                userId: m.id,
                actorId: userId,
                type: 'MENTION',
                entityType: 'announcement',
                entityId: created.id,
                preview: `${d.title} — ${d.body}`,
                link: '/',
              }),
            ),
          );
        }
      } catch (err) {
        console.error('Announcement mention notification error:', err);
      }

      return Response.json({ success: true, id: created.id }, { status: 201 });
    },
  ),
});
