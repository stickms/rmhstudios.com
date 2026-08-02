import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
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
      POST: defineHandler(
        {
          rateLimit: {
            limit: 20,
            windowMs: 60 * 60 * 1000,
            prefix: 'community-announce',
            message: 'Too many announcements. Try later.',
          },
          body: createSchema,
          allowEmptyBody: true,
          verboseValidationErrors: true,
        },
        async ({ params, session, body }) => {
          const community = await getCommunityBySlug(params.slug);
          if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

          const role = await getRole(community.id, session.user.id);
          if (!canModerate(role))
            return Response.json({ error: 'Only mods can post announcements' }, { status: 403 });

          const created = await prisma.communityAnnouncement.create({
            data: { communityId: community.id, authorId: session.user.id, body: body.body },
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: { select: { name: true, handle: true, image: true } },
            },
          });
          return Response.json(
            { announcement: { ...created, createdAt: created.createdAt.toISOString() } },
            { status: 201 },
          );
        },
      ),
    },
  },
});
