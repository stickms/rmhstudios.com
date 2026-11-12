import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/communities.contract';
import { prisma } from '@/lib/prisma.server';
import { listCommunities } from '@/lib/communities.server';
import { createCommunityBody } from '@/lib/communities/communities-schema';

/**
 * GET  /api/communities — browse communities (most members first).
 * POST /api/communities — create one (creator becomes ADMIN member).
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const route = apiRoute('/api/communities', {
  GET: implement(C.listCommunitiesApi, { auth: 'optional' }, async ({ request, session }) => {
    const q = new URL(request.url).searchParams.get('q');
    const communities = await listCommunities({ userId: session?.user.id ?? null, q });
    return Response.json({ communities });
  }),
  POST: implement(
    C.createCommunityApi,
    {
      rateLimit: {
        limit: 5,
        windowMs: 60 * 60 * 1000,
        prefix: 'community-create',
        message: 'Too many communities created. Try later.',
      },
      body: createCommunityBody,
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
});
