import { createFileRoute } from '@tanstack/react-router';
/**
 * User Builds API
 * GET /api/user-builds - List builds with filters
 * POST /api/user-builds - Create a new build
 *
 * Supports both session auth and CLI token auth via X-RMHCode-Token header
 */

import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createBuildSchema } from '@/lib/user-builds-schema';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getAuthenticatedUser } from '@/lib/rmhcode-auth';

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
  
  const suffix = randomBytes(4).toString('hex');
  return `${base}-${suffix}`;
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 0;

  while (true) {
    const existing = await prisma.userBuild.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing || existing.id === excludeId) {
      return slug;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

export const Route = createFileRoute('/api/user-builds')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const category = searchParams.get('category');
    const technology = searchParams.get('technology');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') || 'recent';
    const userId = searchParams.get('userId');
    const curated = searchParams.get('curated') === 'true';

    // Get current user — session OR CLI token
    let currentUserId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      currentUserId = session?.user?.id ?? null;
    } catch {
      // Not logged in via session
    }

    // Fall back to CLI token auth
    if (!currentUserId) {
      const cliUser = await getAuthenticatedUser(request, null);
      if (cliUser) currentUserId = cliUser.id;
    }

    const where: Record<string, unknown> = {
      visibility: { in: ['PUBLIC', 'UNLISTED'] },
      isCurated: false,
    };

    if (curated) {
      where.featured = true;
    }

    // If fetching user's own builds, show all visibilities, but still hide curated if needed
    if (userId && userId === currentUserId) {
      delete where.visibility;
      where.userId = userId;
    } else if (userId) {
      where.userId = userId;
    }

    if (category) {
      where.categoryId = category;
    }

    if (technology) {
      where.technologies = {
        array_contains: [technology],
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (cursor) {
      const cursorBuild = await prisma.userBuild.findUnique({
        where: { id: cursor },
        select: { publishedAt: true, likeCount: true, viewCount: true },
      });
      if (cursorBuild) {
        if (sort === 'popular') {
          where.OR = [
            { likeCount: { lt: cursorBuild.likeCount } },
            { likeCount: cursorBuild.likeCount, id: { lt: cursor } },
          ];
        } else if (sort === 'views') {
          where.OR = [
            { viewCount: { lt: cursorBuild.viewCount } },
            { viewCount: cursorBuild.viewCount, id: { lt: cursor } },
          ];
        } else {
          where.publishedAt = { lt: cursorBuild.publishedAt };
        }
      }
    }

    // Determine order by
    let orderBy: Record<string, string>[] = [{ publishedAt: 'desc' }];
    if (sort === 'popular') {
      orderBy = [{ likeCount: 'desc' }, { id: 'desc' }];
    } else if (sort === 'views') {
      orderBy = [{ viewCount: 'desc' }, { id: 'desc' }];
    }

    const builds = await prisma.userBuild.findMany({
      where,
      orderBy,
      take: limit + 1,
      include: {
        user: { select: userDisplaySelect },
        category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
        tags: { select: { name: true } },
        ...(currentUserId
          ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
          : {}),
      },
    });

    const hasMore = builds.length > limit;
    const items = builds.slice(0, limit);

    const mappedItems = items.map((build: any) => ({
      id: build.id,
      slug: build.slug,
      title: build.title,
      description: build.description,
      thumbnailUrl: build.thumbnailUrl,
      repoUrl: build.repoUrl,
      demoUrl: build.demoUrl,
      visibility: build.visibility,
      featured: build.featured,
      technologies: build.technologies,
      likeCount: build.likeCount,
      commentCount: build.commentCount,
      viewCount: build.viewCount,
      createdAt: build.createdAt.toISOString(),
      publishedAt: build.publishedAt?.toISOString() ?? null,
      user: resolveUser(build.user),
      category: build.category,
      tags: build.tags.map((t: { name: string }) => t.name),
      liked: currentUserId ? build.likes?.length > 0 : false,
    }));

    return Response.json({
      items: mappedItems,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    });
  } catch (error) {
    console.error('User builds fetch error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
  POST: async ({ request }) => {
  try {
    // Check auth - support both session and CLI token
    let userId: string | null = null;

    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (session) {
      userId = session.user.id;
    } else {
      // Try CLI token
      const user = await getAuthenticatedUser(request, null);
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 5 builds per hour
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
      prefix: 'build-create',
    });
    if (!allowed) {
      return Response.json(
        { error: 'Too many builds created. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Parse and validate
    const body = await request.json();
    const parsed = createBuildSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      readme,
      repoUrl,
      demoUrl,
      thumbnailUrl,
      categoryId,
      technologies,
      tags,
      visibility,
    } = parsed.data;

    // Generate unique slug
    const baseSlug = generateSlug(title);
    const slug = await ensureUniqueSlug(baseSlug);

    // Create build with tags
    const build = await prisma.$transaction(async (tx) => {
      const created = await tx.userBuild.create({
        data: {
          userId,
          slug,
          title,
          description,
          readme: readme || null,
          repoUrl: repoUrl || null,
          demoUrl: demoUrl || null,
          thumbnailUrl: thumbnailUrl || null,
          categoryId: categoryId || null,
          technologies: technologies || [],
          visibility,
          publishedAt: new Date(),
        },
        include: {
          user: { select: userDisplaySelect },
          category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
        },
      });

      // Create tags
      if (tags.length > 0) {
        await tx.buildTag.createMany({
          data: tags.map((name) => ({
            buildId: created.id,
            name: name.toLowerCase(),
          })),
        });
      }

      return created;
    });

    // Fetch tags
    const buildTags = await prisma.buildTag.findMany({
      where: { buildId: build.id },
      select: { name: true },
    });

    return Response.json(
      {
        id: build.id,
        slug: build.slug,
        title: build.title,
        description: build.description,
        thumbnailUrl: build.thumbnailUrl,
        repoUrl: build.repoUrl,
        demoUrl: build.demoUrl,
        visibility: build.visibility,
        technologies: build.technologies,
        createdAt: build.createdAt.toISOString(),
        publishedAt: build.publishedAt?.toISOString() ?? null,
        user: resolveUser(build.user),
        category: build.category,
        tags: buildTags.map((t) => t.name),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Build create error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
