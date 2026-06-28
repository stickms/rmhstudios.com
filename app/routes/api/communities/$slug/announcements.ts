import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getCommunityBySlug, getRole, canModerate } from '@/lib/communities/access.server';
import { z } from 'zod';

/**
 * GET  /api/communities/$slug/announcements — list announcements (newest first).
 * POST /api/communities/$slug/announcements — post one (mods/admins only).
 */
const createSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const Route = createFileRoute('/api/communities/$slug/announcements')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const community = await getCommunityBySlug(params.slug);
        if (!community) return Response.json({ error: 'Not found' }, { status: 404 });
        const announcements = await prisma.communityAnnouncement.findMany({
          where: { communityId: community.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { name: true, handle: true, image: true } },
          },
        });
        return Response.json({
          announcements: announcements.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
        });
      },
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60 * 60 * 1000, prefix: 'community-announce' });
          if (!allowed) return Response.json({ error: 'Too many announcements. Try later.' }, { status: 429 });

          const community = await getCommunityBySlug(params.slug);
          if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

          const role = await getRole(community.id, session.user.id);
          if (!canModerate(role)) return Response.json({ error: 'Only mods can post announcements' }, { status: 403 });

          const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }

          const created = await prisma.communityAnnouncement.create({
            data: { communityId: community.id, authorId: session.user.id, body: parsed.data.body },
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: { select: { name: true, handle: true, image: true } },
            },
          });
          return Response.json({ announcement: { ...created, createdAt: created.createdAt.toISOString() } }, { status: 201 });
        } catch (error) {
          console.error('Community announcement create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
