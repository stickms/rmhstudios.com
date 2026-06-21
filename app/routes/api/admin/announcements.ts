import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';

/**
 * Admin feed announcements.
 * GET  /api/admin/announcements — list all (active + inactive).
 * POST /api/admin/announcements — create a new announcement.
 */
const createSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  linkUrl: z.string().url().max(500).optional().or(z.literal('')),
  linkLabel: z.string().max(60).optional(),
  variant: z.enum(['info', 'success', 'warning', 'event']).default('info'),
  pinned: z.boolean().default(true),
  expiresAt: z.string().datetime().optional().or(z.literal('')),
});

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
        });
        return Response.json({
          announcements: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            expiresAt: r.expiresAt?.toISOString() ?? null,
          })),
        });
      },
      POST: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        try {
          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
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
            },
          });
          await logAdminAction(session.user.id, 'announcement.create', { targetType: 'announcement', targetId: created.id, detail: d.title });
          return Response.json({ success: true, id: created.id }, { status: 201 });
        } catch (error) {
          console.error('Create announcement error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
