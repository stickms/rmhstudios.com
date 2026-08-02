import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { listCommunities } from '@/lib/communities.server';
import { z } from 'zod';

/**
 * GET  /api/communities — browse communities (most members first).
 * POST /api/communities — create one (creator becomes ADMIN member).
 */
const createSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional(),
  icon: z.string().max(8).optional(),
  color: z.string().max(16).optional(),
  isPrivate: z.boolean().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const Route = createFileRoute('/api/communities/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, session }) => {
        const q = new URL(request.url).searchParams.get('q');
        const communities = await listCommunities({ userId: session?.user.id ?? null, q });
        return Response.json({ communities });
      }),
      POST: defineHandler(
        {
          rateLimit: {
            limit: 5,
            windowMs: 60 * 60 * 1000,
            prefix: 'community-create',
            message: 'Too many communities created. Try later.',
          },
          body: createSchema,
          allowEmptyBody: true,
          verboseValidationErrors: true,
        },
        async ({ session, body }) => {
          let slug = slugify(body.name);
          if (!slug) return Response.json({ error: 'Invalid name' }, { status: 400 });
          // Ensure uniqueness.
          if (await prisma.community.findUnique({ where: { slug }, select: { id: true } })) {
            slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
          }

          const community = await prisma.community.create({
            data: {
              slug,
              name: body.name.trim(),
              description: body.description?.trim() || null,
              icon: body.icon || null,
              color: body.color || null,
              isPrivate: body.isPrivate ?? false,
              createdById: session.user.id,
              members: { create: { userId: session.user.id, role: 'ADMIN' } },
            },
          });
          return Response.json({ success: true, slug: community.slug }, { status: 201 });
        },
      ),
    },
  },
});
