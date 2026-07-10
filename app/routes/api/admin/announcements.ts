import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
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

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/announcements')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const rows = await prisma.feedAnnouncement.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { poll: { include: { options: { orderBy: { position: 'asc' } } } } },
        });
        return Response.json({
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
        });
      },
      POST: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        try {
          const body = await request.json().catch(() => ({}));
          const parsed = createAnnouncementSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 }
            );
          }
          const d = parsed.data;

          const created = await prisma.feedAnnouncement.create({
            data: {
              title: d.title,
              body: d.body,
              linkUrl: d.linkUrl || null,
              linkLabel: d.linkLabel || null,
              variant: d.variant,
              pinned: d.pinned,
              expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
              createdById: session.user.id,
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

          await logAdminAction(session.user.id, 'announcement.create', {
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
                  id: { not: session.user.id },
                  OR: handles.map((h) => ({ handle: { equals: h, mode: 'insensitive' as const } })),
                },
                select: { id: true },
              });
              await Promise.all(
                mentioned.map((m) =>
                  createNotification({
                    userId: m.id,
                    actorId: session.user.id,
                    type: 'MENTION',
                    entityType: 'announcement',
                    entityId: created.id,
                    preview: `${d.title} — ${d.body}`,
                    link: '/',
                  })
                )
              );
            }
          } catch (err) {
            console.error('Announcement mention notification error:', err);
          }

          return Response.json({ success: true, id: created.id }, { status: 201 });
        } catch (error) {
          console.error('Create announcement error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
