import { createFileRoute } from '@tanstack/react-router';
/**
 * Featured Builds API
 * GET /api/user-builds/featured - Get featured builds
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export const Route = createFileRoute('/api/user-builds/featured')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '6'), 20);

    // Get current user session (optional)
    let currentUserId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      currentUserId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const builds = await prisma.userBuild.findMany({
      where: {
        visibility: 'PUBLIC',
        featured: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      include: {
        user: { select: userDisplaySelect },
        category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
        tags: { select: { name: true } },
        ...(currentUserId
          ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
          : {}),
      },
    });

    const mappedBuilds = builds.map((build: any) => ({
      id: build.id,
      slug: build.slug,
      title: build.title,
      description: build.description,
      thumbnailUrl: build.thumbnailUrl,
      repoUrl: build.repoUrl,
      demoUrl: build.demoUrl,
      featured: build.featured,
      technologies: build.technologies,
      likeCount: build.likeCount,
      commentCount: build.commentCount,
      viewCount: build.viewCount,
      publishedAt: build.publishedAt?.toISOString() ?? null,
      user: resolveUser(build.user),
      category: build.category,
      tags: build.tags.map((t: { name: string }) => t.name),
      liked: currentUserId ? build.likes?.length > 0 : false,
    }));

    return Response.json({ builds: mappedBuilds });
  } catch (error) {
    console.error('Featured builds fetch error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
