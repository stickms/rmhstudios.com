import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listCommunities } from '@/lib/communities.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const q = new URL(request.url).searchParams.get('q');
        const communities = await listCommunities({ userId: session?.user.id ?? null, q });
        return Response.json({ communities });
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 5, windowMs: 60 * 60 * 1000, prefix: 'community-create' });
          if (!allowed) return Response.json({ error: 'Too many communities created. Try later.' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }

          let slug = slugify(parsed.data.name);
          if (!slug) return Response.json({ error: 'Invalid name' }, { status: 400 });
          // Ensure uniqueness.
          if (await prisma.community.findUnique({ where: { slug }, select: { id: true } })) {
            slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
          }

          const community = await prisma.community.create({
            data: {
              slug,
              name: parsed.data.name.trim(),
              description: parsed.data.description?.trim() || null,
              icon: parsed.data.icon || null,
              color: parsed.data.color || null,
              isPrivate: parsed.data.isPrivate ?? false,
              createdById: session.user.id,
              members: { create: { userId: session.user.id, role: 'ADMIN' } },
            },
          });
          return Response.json({ success: true, slug: community.slug }, { status: 201 });
        } catch (error) {
          console.error('Create community error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
