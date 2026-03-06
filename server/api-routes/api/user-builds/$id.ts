import { createAPIFileRoute } from "@tanstack/react-start/api";
/**
 * Single Build API
 * GET /api/user-builds/[id] - Get a build by ID or slug
 * PATCH /api/user-builds/[id] - Update a build
 * DELETE /api/user-builds/[id] - Delete a build
 *
 * Supports both session auth and CLI token auth via X-RMHCode-Token header
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { updateBuildSchema, adminUpdateBuildSchema } from '@/lib/user-builds-schema';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getAuthenticatedUser } from '@/lib/rmhcode-auth';

type RouteParams = { params: Promise<{ id: string }> };

async function findBuild(idOrSlug: string) {
  // Try by ID first, then by slug
  let build = await prisma.userBuild.findUnique({
    where: { id: idOrSlug },
    include: {
      user: { select: userDisplaySelect },
      category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
      tags: { select: { name: true } },
      versions: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  if (!build) {
    build = await prisma.userBuild.findUnique({
      where: { slug: idOrSlug },
      include: {
        user: { select: userDisplaySelect },
        category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
        tags: { select: { name: true } },
        versions: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  }

  return build;
}

export const APIRoute = createAPIFileRoute("/api/user-builds/$id")({
  GET: async ({ request, params }) => {
  try {
    const { id } = params;

    let currentUserId: string | null = null;
    let isAdmin = false;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      currentUserId = session?.user?.id ?? null;
      isAdmin = !!(session?.user as any)?.isAdmin;
    } catch {
      // Not logged in
    }

    const build = await findBuild(id);

    if (!build) {
      return Response.json({ error: 'Build not found' }, { status: 404 });
    }

    // Check visibility
    const isOwner = currentUserId === build.userId || isAdmin;
    if (!isOwner) {
      if (build.visibility === 'PRIVATE') {
        return Response.json({ error: 'Build not found' }, { status: 404 });
      }
    }

    // Check if user liked this build
    let liked = false;
    if (currentUserId) {
      const like = await prisma.buildLike.findUnique({
        where: { buildId_userId: { buildId: build.id, userId: currentUserId } },
      });
      liked = !!like;
    }

    return Response.json({
      id: build.id,
      slug: build.slug,
      title: build.title,
      description: build.description,
      readme: build.readme,
      thumbnailUrl: build.thumbnailUrl,
      repoUrl: build.repoUrl,
      demoUrl: build.demoUrl,
      visibility: build.visibility,
      featured: build.featured,
      isCurated: build.isCurated,
      technologies: build.technologies,
      likeCount: build.likeCount,
      commentCount: build.commentCount,
      viewCount: build.viewCount,
      createdAt: build.createdAt.toISOString(),
      updatedAt: build.updatedAt.toISOString(),
      publishedAt: build.publishedAt?.toISOString() ?? null,
      user: resolveUser(build.user),
      category: build.category,
      tags: build.tags.map((t: { name: string }) => t.name),
      versions: build.versions.map((v: any) => ({
        id: v.id,
        version: v.version,
        changelog: v.changelog,
        commitHash: v.commitHash,
        createdAt: v.createdAt.toISOString(),
      })),
      liked,
      isOwner,
    });
  } catch (error) {
    console.error('Build fetch error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
  PATCH: async ({ request, params }) => {
  try {
    const { id } = params;

    // Check auth - support both session and CLI token
    let userId: string | null = null;

    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (session) {
      userId = session.user.id;
    } else {
      const user = await getAuthenticatedUser(request, null);
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 20 updates per hour
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
      prefix: 'build-update',
    });
    if (!allowed) {
      return Response.json(
        { error: 'Too many updates. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Find build
    const build = await findBuild(id);
    if (!build) {
      return Response.json({ error: 'Build not found' }, { status: 404 });
    }

    // Check ownership
    if (build.userId !== userId && !(session?.user as any)?.isAdmin) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Parse and validate - use admin schema if admin
    const isAdmin = !!(session?.user as any)?.isAdmin;
    const body = await request.json();
    const schema = isAdmin ? adminUpdateBuildSchema : updateBuildSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const { tags, ...updateData } = parsed.data;
    // Prepare update data
    const data: Record<string, unknown> = { ...updateData };

    // Handle admin-only fields
    if (isAdmin) {
      const adminData = parsed.data as any;
      if (adminData.isCurated !== undefined) data.isCurated = adminData.isCurated;
      if (adminData.featured !== undefined) data.featured = adminData.featured;
      if (adminData.userId !== undefined) data.userId = adminData.userId;
      if (adminData.position !== undefined) data.position = adminData.position;
    }

    // Clean up empty URLs
    if (data.repoUrl === '') data.repoUrl = null;
    if (data.demoUrl === '') data.demoUrl = null;
    if (data.thumbnailUrl === '') data.thumbnailUrl = null;

    // Update build and tags
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.userBuild.update({
        where: { id: build.id },
        data,
        include: {
          user: { select: userDisplaySelect },
          category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
        },
      });

      // Update tags if provided
      if (tags !== undefined) {
        await tx.buildTag.deleteMany({ where: { buildId: build.id } });
        if (tags.length > 0) {
          await tx.buildTag.createMany({
            data: tags.map((name: string) => ({
              buildId: build.id,
              name: name.toLowerCase(),
            })),
          });
        }
      }

      return result;
    });

    // Fetch updated tags
    const buildTags = await prisma.buildTag.findMany({
      where: { buildId: build.id },
      select: { name: true },
    });

    return Response.json({
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      description: updated.description,
      thumbnailUrl: updated.thumbnailUrl,
      repoUrl: updated.repoUrl,
      demoUrl: updated.demoUrl,
      visibility: updated.visibility,
      technologies: updated.technologies,
      createdAt: updated.createdAt.toISOString(),
      publishedAt: updated.publishedAt?.toISOString() ?? null,
      user: resolveUser(updated.user),
      category: updated.category,
      tags: buildTags.map((t) => t.name),
    });
  } catch (error) {
    console.error('Build update error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
  DELETE: async ({ request, params }) => {
  try {
    const { id } = params;

    // Check auth - support both session and CLI token
    let userId: string | null = null;

    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (session) {
      userId = session.user.id;
    } else {
      const user = await getAuthenticatedUser(request, null);
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find build
    const build = await findBuild(id);
    if (!build) {
      return Response.json({ error: 'Build not found' }, { status: 404 });
    }

    // Check ownership
    if (build.userId !== userId && !(session?.user as any)?.isAdmin) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete build (cascade deletes tags, likes, comments, views)
    await prisma.userBuild.delete({ where: { id: build.id } });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Build delete error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
});
